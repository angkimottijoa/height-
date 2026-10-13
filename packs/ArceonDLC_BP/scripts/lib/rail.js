/*
 * Railway building blocks: track tiles swept along a curve, catenary poles
 * stood along it and the wires (buttons) strung between them.
 *
 * Track tile: `w` columns across (left to right of the travel direction),
 * `l` blocks along (repeats), `h` layers (k = 0 is the bottom), `anchor` =
 * the layer that sits at the height of the curve points, `dirAng` = the
 * direction the tile was made facing. Cells hold a source {at(pos), key}
 * (a block or a random mix) or null (air).
 *
 * Sweeping: plain columns are filled by area (each cell knows its sideways
 * offset and distance along the curve); columns that run unchanged along
 * the whole tile and differ from their neighbours (rails) are traced on
 * their own, one block wide at any angle. Directional blocks (anvil rails,
 * stairs, slabs...) turn with the track, to the nearest 90°.
 *
 * Poles: a saved asset (its origin = the ground block at the track centre,
 * saved looking along the track) is stood every `interval` blocks, turned
 * to the track: exactly (each block pushed forward with half-way points to
 * its neighbours, so parts stay joined and thin parts stay thin) or by 90° steps.
 * Buttons inside the pole are wire anchors; each anchor is joined to the
 * same anchor on the next pole by a sagging line of buttons.
 */
import { world } from '@minecraft/server';
import { isAirId, parseBlock, parsePattern, permToString } from '../core/blocks.js';
import { apply, matrix, turnStates } from '../core/turn.js';
import { layout } from '../tools/lanes.js';
import { listAssets, PREFIX } from '../tools/assets.js';

/** Compass angle of a direction, clockwise from north (north 0, east 90). */
export const ang = (x, z) => Math.atan2(x, -z) * 180 / Math.PI;
export const DIR_ANG = { north: 0, east: 90, south: 180, west: 270 };
const snap90 = (a) => ((Math.round(a / 90) * 90) % 360 + 360) % 360;
const mod = (a, b) => ((a % b) + b) % b;

const fixed = (perm) => perm && { at: () => perm, key: permToString(perm) };
const mixed = (pattern) => ({ at: (pos) => pattern.at(pos, null), key: pattern.source });

// ----------------------------------------------------------------- tiles
export const TOP_MIX = '60%andesite_slab,20%normal_stone_slab,15%cobblestone_slab,5%tuff_slab';

/**
 * The built-in track (as in the photos): a gravel bed, on it a layer of
 * mixed stone slabs, mud brick sleepers and two anvil rails per track.
 */
export function builtinTile(v) {
    const ballast = mixed(parsePattern(v.ballast || 'gravel'));
    const top = String(v.top ?? TOP_MIX).trim() ? mixed(parsePattern(v.top ?? TOP_MIX)) : null;
    const sleeper = mixed(parsePattern(v.sleeper || 'mud_bricks'));
    let railPerm = parseBlock(v.rail || 'anvil');
    // anvils lie along their facing: make the rail run along the tile (south)
    try {
        if ('minecraft:cardinal_direction' in railPerm.getAllStates())
            railPerm = railPerm.withState('minecraft:cardinal_direction', 'south');
    }
    catch (e) { }
    const rail = fixed(railPerm);
    const tracks = Math.max(1, Math.floor(v.tracks ?? 2));
    const gauge = Math.max(1, Math.floor(v.gauge ?? 2)), stub = Math.max(0, Math.floor(v.stub ?? 1));
    const margin = Math.max(0, Math.floor(v.margin ?? 1)), between = Math.max(0, Math.floor(v.between ?? 1));
    const on = Math.max(1, Math.floor(v.sleeperOn ?? 1)), off = Math.max(0, Math.floor(v.sleeperOff ?? 1));
    // column kinds across: 'b' ballast only, 's' sleeper, 'r' rail
    const cols = [], mids = [];
    for (let t = 0; t < tracks; t++) {
        if (t > 0)
            for (let i = 0; i < between; i++)
                cols.push('b');
        for (let i = 0; i < margin; i++)
            cols.push('b');
        for (let i = 0; i < stub; i++)
            cols.push('s');
        const r0 = cols.length;
        cols.push('r');
        for (let i = 0; i < gauge; i++)
            cols.push('s');
        cols.push('r');
        mids.push((r0 + cols.length - 1) / 2);
        for (let i = 0; i < stub; i++)
            cols.push('s');
        for (let i = 0; i < margin; i++)
            cols.push('b');
    }
    const w = cols.length, l = on + off;
    // the rails are the lines (traced one block wide); under them, the sleeper beside
    const lines = new Map();
    cols.forEach((k, c) => k === 'r' && lines.set('1,' + c, cols[c - 1] === 's' || c + 1 >= w ? c - 1 : c + 1));
    return {
        w, l, h: 2, anchor: 0, dirAng: 180, lines,
        // track centres, sideways from the curve (as lanes.js lays columns)
        centres: mids.map(c => -w / 2 + c + 0.5 + (w % 2 === 0 ? 0.5 : 0)),
        cell(k, c, j) {
            if (k === 0)
                return ballast;
            const kind = cols[c];
            if (kind === 'r')
                return rail;
            if (kind === 's' && j < on)
                return sleeper;
            return top;
        },
        describe: `${tracks === 1 ? '단선' : `${tracks}선`}, 폭 ${w}칸`,
    };
}

/** A tile from a saved track preset (lib/track_presets.js format). */
export function presetTile(p) {
    const perms = p.palette.map(t => fixed(parseBlock(t)));
    return {
        w: p.w, l: p.l, h: p.h, anchor: p.anchor ?? 0, dirAng: ang(p.dir[0], p.dir[1]),
        cell(k, c, j) {
            const i = p.cells[(k * p.w + c) * p.l + j];
            return i >= 0 ? perms[i] : null;
        },
        describe: `폭 ${p.w}칸 × ${p.h}층`,
    };
}

/** Which (layer, column) pairs are lines (rails), and a background column for each. */
function analyse(tile) {
    const same = (k, c) => {
        if (c < 0 || c >= tile.w)
            return null;
        const first = tile.cell(k, c, 0);
        if (!first)
            return null;
        for (let j = 1; j < tile.l; j++)
            if (tile.cell(k, c, j)?.key !== first.key)
                return null;
        return first.key;
    };
    const lines = new Map(); // "k,c" -> background column
    for (let k = 0; k < tile.h; k++)
        for (let c = 0; c < tile.w; c++) {
            const key = same(k, c);
            if (!key || same(k, c - 1) === key || same(k, c + 1) === key)
                continue;
            // a continuous column alone in its layer: a rail. Under it, use a neighbour.
            const left = c - 1 >= 0 ? c - 1 : null, right = c + 1 < tile.w ? c + 1 : null;
            lines.set(k + ',' + c, left ?? right ?? c);
        }
    return lines;
}

// ----------------------------------------------------------------- sweep
/**
 * Lay a tile along the curve. Returns the road layout (for poles) and
 * writes into `paint` ("x,y,z" -> perm, null = air).
 */
export function* sweep(ctx, v, tile, paint) {
    const road = yield* layout(ctx, v, tile.w);
    const { uOf, trace } = road;
    const lines = tile.lines ?? analyse(tile);
    const turned = new Map();
    const turn = (perm, tx, tz) => {
        const d = snap90(ang(tx, tz) - tile.dirAng);
        if (!d || !perm)
            return perm;
        const k = permToString(perm) + '@' + d;
        let out = turned.get(k);
        if (!out) {
            out = turnStates(perm, matrix(d, 0, 0));
            turned.set(k, out);
        }
        return out;
    };
    const clearAir = v.clearAir !== false;
    const put = (x, y, z, src, tx, tz) => {
        const key = x + ',' + y + ',' + z;
        if (!src) {
            if (clearAir && !paint.has(key))
                paint.set(key, null);
            return;
        }
        paint.set(key, turn(src.at({ x, y, z }), tx, tz));
    };
    let n = 0;
    for (const [key, c] of road.cells) {
        if (c.uc < uOf(0) - 0.5 || c.uc >= uOf(tile.w - 1) + 0.5)
            continue;
        const [x, z] = key.split(',').map(Number);
        const col = Math.max(0, Math.min(tile.w - 1, Math.round(c.uc - uOf(0))));
        const j = mod(Math.floor(c.s), tile.l);
        for (let k = 0; k < tile.h; k++) {
            const bg = lines.get(k + ',' + col);
            put(x, c.y + k - tile.anchor, z, tile.cell(k, bg ?? col, j), c.tx, c.tz);
        }
        if (v.down) {
            const bottom = tile.cell(0, col, j);
            if (bottom) {
                const floor = ctx.edit.highest(x, z, ctx.edit.minY, c.y - tile.anchor - 1);
                for (let y = c.y - tile.anchor - 1; y > floor; y--)
                    put(x, y, z, bottom, c.tx, c.tz);
            }
        }
        if (++n % 1500 === 0)
            yield;
    }
    // rails, one block wide
    for (const kc of lines.keys()) {
        const [k, col] = kc.split(',').map(Number);
        const src = tile.cell(k, col, 0);
        for (const c of trace(uOf(col)))
            put(c.x, c.y + k - tile.anchor, c.z, src, c.tx, c.tz);
        yield;
    }
    return road;
}

// ----------------------------------------------------------------- poles
/** A saved asset in memory: cells relative to its origin, its facing, its buttons. */
export function loadPole(name) {
    const meta = listAssets().find(a => a.name === name);
    const st = world.structureManager.get(PREFIX + name);
    if (!meta || !st)
        throw new Error(`전신주 에셋을 찾을 수 없습니다: ${name}`);
    const o = meta.origin, size = st.size;
    const cells = new Map(), buttons = [];
    for (let x = 0; x < size.x; x++)
        for (let y = 0; y < size.y; y++)
            for (let z = 0; z < size.z; z++) {
                let p;
                try {
                    p = st.getBlockPermutation({ x, y, z });
                }
                catch (e) { }
                if (!p || isAirId(p.type.id) || p.type.id === 'minecraft:structure_void')
                    continue;
                const d = [x - o.x, y - o.y, z - o.z];
                cells.set(d.join(','), p);
                if (/_button$/.test(p.type.id))
                    buttons.push(d);
            }
    // a stable order, so anchor i on one pole meets anchor i on the next
    buttons.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return { cells, buttons, dirAng: DIR_ANG[meta.dir] ?? 0, name };
}

/**
 * The built-in catenary gantry (after the user's own build): two wall posts
 * just outside the track bed, a truss beam (slab chords with zig-zag slab
 * braces and a lamp in the middle), insulators hanging over each track
 * (contact wires) and arms with insulators at the post tops (feeder wires).
 * Made facing north, x = across (right of travel), so it fits any track:
 * `centres` = the track centres, `width` = the track bed width.
 */
export function builtinPole(centres = [-4.5, 4.5], width = 17) {
    const cells = new Map(), anchors = [];
    const B = (t) => parseBlock(t);
    const m = {
        foot: B('cobbled_deepslate_wall[wall_post_bit=true]'),
        post: B('andesite_wall[wall_post_bit=true]'),
        ring: B('mossy_cobblestone_wall[wall_post_bit=true]'),
        collar: B('polished_deepslate_wall[wall_post_bit=true]'),
        head: B('diorite_wall[wall_post_bit=true]'),
        joint: B('andesite'),
        low: B('andesite_slab[bottom]'),
        high: B('andesite_slab[top]'),
        bracket: B('polished_deepslate_slab[bottom]'),
        lamp: B('lantern'),
        insulator: B('cobbled_deepslate_wall[wall_post_bit=true]'),
        rodUp: B('end_rod[facing_direction=1]'),
        rodWest: B('end_rod[facing_direction=4]'),
        rodEast: B('end_rod[facing_direction=5]'),
    };
    const set = (x, y, perm) => cells.set(`${x},${y},0`, perm);
    const P = Math.ceil(width / 2) + 2;
    for (const side of [-1, 1]) {
        const x = side * P, out = x + side, inn = x - side;
        set(x, 0, m.foot);
        for (let y = 1; y <= 7; y++)
            set(x, y, y === 2 ? m.ring : m.post);
        set(x, 8, m.collar);
        set(x, 9, m.joint);
        set(x, 10, m.post);
        set(x, 11, m.joint);
        set(x, 12, m.head);
        set(x, 13, m.head);
        set(x, 14, m.lamp);
        // brackets and feeder arms either side of the post top
        for (const a of [out, inn]) {
            set(a, 11, m.bracket);
            set(a, 12, (a - x) * side > 0 ? (side < 0 ? m.rodWest : m.rodEast) : (side < 0 ? m.rodEast : m.rodWest));
            set(a, 14, m.rodUp);
            anchors.push([a, 12, 0]);
        }
    }
    // the truss: bottom chord (top slabs), top chord (bottom slabs), braces between
    for (let x = -P + 1; x < P; x++)
        set(x, 9, m.high);
    for (let x = -P + 2; x <= P - 2; x++)
        set(x, 11, m.low);
    const braces = [[-2, -1]];
    for (let a = -(P - 2); a + 1 < -2; a += 2)
        braces.push([a, a + 1]);
    for (const [hi, lo] of braces) {
        set(hi, 10, m.high);
        set(lo, 10, m.low);
        set(-hi, 10, m.high);
        set(-lo, 10, m.low);
    }
    set(0, 10, m.lamp);
    // over each track: two insulators, the contact wires under them
    for (const u of centres)
        for (const x of [Math.round(u - 1.5), Math.round(u + 1.5)]) {
            if (Math.abs(x) >= P)
                continue;
            set(x, 8, m.insulator);
            anchors.push([x, 7, 0]);
        }
    anchors.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return { cells, buttons: anchors, dirAng: 0, name: '기본 전신주' };
}

/**
 * Stand poles along the road every `interval` blocks from `offset`.
 * Returns [{at: {x,y,z}, m}] (m = the matrix used for its wire anchors).
 */
export function* standPoles(road, pole, v, paint) {
    const S = road.samples;
    const interval = Math.max(2, Math.floor(v.poleEvery ?? 20));
    const out = [];
    let next = Math.max(0, Math.floor(v.poleStart ?? 0)), i = 0;
    const turned = new Map();
    for (const p of S) {
        if (p.s + 1e-6 < next)
            continue;
        next += interval;
        const at = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
        const delta = ang(p.tx, p.tz) - pole.dirAng;
        const m90 = matrix(snap90(delta), 0, 0).map(r => r.map(Math.round));
        const turnState = (perm) => {
            const k = permToString(perm) + '@' + snap90(delta);
            let o = turned.get(k);
            if (!o)
                turned.set(k, o = turnStates(perm, m90));
            return o;
        };
        // right angles turn exactly by 90° steps (no half-way points needed)
        const square = Math.abs(delta - Math.round(delta / 90) * 90) < 0.5;
        if (v.poleAngle === '90' || square) {
            for (const [k, perm] of pole.cells) {
                const d = apply(m90, k.split(',').map(Number)).map(Math.round);
                paint.set(`${at.x + d[0]},${at.y + d[1]},${at.z + d[2]}`, turnState(perm));
            }
            out.push({ at, m: m90 });
        }
        else {
            // exact angle: push every source block forward, plus half-way points
            // towards the pole blocks next to it, so parts stay joined when turned
            // (no gaps) and one-block-thin parts stay thin
            const m = matrix(delta, 0, 0);
            const has = (x, y, z) => pole.cells.has(x + ',' + y + ',' + z);
            const own = new Set();
            for (const [k, perm] of pole.cells) {
                const [dx, dy, dz] = k.split(',').map(Number);
                const out2 = turnState(perm);
                const xs = [0], zs = [0];
                if (has(dx + 1, dy, dz))
                    xs.push(0.5);
                if (has(dx - 1, dy, dz))
                    xs.push(-0.5);
                if (has(dx, dy, dz + 1))
                    zs.push(0.5);
                if (has(dx, dy, dz - 1))
                    zs.push(-0.5);
                for (const sx of xs)
                    for (const sz of zs) {
                        if (sx && sz && !has(dx + Math.sign(sx), dy, dz + Math.sign(sz)))
                            continue;
                        const q = apply(m, [dx + sx, dy, dz + sz]);
                        const key = `${at.x + Math.round(q[0])},${at.y + dy},${at.z + Math.round(q[2])}`;
                        // a block's own spot wins over a neighbour's half-way fill
                        if (!sx && !sz)
                            own.add(key);
                        else if (own.has(key))
                            continue;
                        paint.set(key, out2);
                    }
            }
            out.push({ at, m });
        }
        if (++i % 4 === 0)
            yield;
    }
    return out;
}

/** World position of anchor `d` on a stood pole (block centre). */
const anchor = (pole, d) => {
    const q = apply(pole.m, d);
    return { x: pole.at.x + q[0] + 0.5, y: pole.at.y + q[1] + 0.5, z: pole.at.z + q[2] + 0.5 };
};

/** Lay buttons every `gap` blocks along a sagging line from a to b. */
function wire(a, b, gap, sag, perm, paint) {
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.round(L / gap));
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
        const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        if (!paint.get(key))
            paint.set(key, perm);
    }
}

/** A button lying flat (as wire), whatever button block was chosen. */
export function wirePerm(text) {
    let p = parseBlock(text || 'polished_blackstone_button');
    try {
        if ('facing_direction' in p.getAllStates())
            p = p.withState('facing_direction', 1);
    }
    catch (e) { }
    return p;
}

/** Wires between neighbouring poles, anchor to anchor. */
export function* stringWires(poles, pole, v, paint) {
    const perm = wirePerm(v.wireBlock);
    const gap = Math.max(1, Math.floor(v.wireGap ?? 2)), sag = Math.max(0, Number(v.sag ?? 1));
    let n = 0;
    for (let i = 0; i + 1 < poles.length; i++) {
        for (const d of pole.buttons)
            wire(anchor(poles[i], d), anchor(poles[i + 1], d), gap, sag, perm, paint);
        if (++n % 8 === 0)
            yield;
    }
    return pole.buttons.length;
}

/** Wires without poles: straight along the curve at "sideways:height" offsets. */
export function* freeWires(road, v, paint) {
    const perm = wirePerm(v.wireBlock);
    const gap = Math.max(1, Math.floor(v.wireGap ?? 2));
    const spots = String(v.wireAt ?? '').split(/[,\s]+/).filter(Boolean).map(t => t.split(':').map(Number)).filter(a => a.length === 2 && a.every(Number.isFinite));
    for (const [u, hgt] of spots) {
        road.trace(u).forEach((c, i) => {
            if (i % gap === 0)
                paint.set(`${c.x},${c.y + hgt},${c.z}`, perm);
        });
        yield;
    }
    return spots.length;
}
