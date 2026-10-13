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
import { isAirId, parseBlock, parsePattern, perm, permToString } from '../core/blocks.js';

import { apply, matrix, turnStates } from '../core/turn.js';
import { layout } from '../tools/lanes.js';
import { listAssets, PREFIX } from '../tools/assets.js';
import { POLES } from './pole_data.js';

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
 * The built-in track (as in the user's own): a gravel bed, on it a layer of
 * mixed stone slabs, mud brick sleepers ending in stairs (high side towards
 * the rail) and two anvil rails per track. Sleepers are not part of the
 * repeating tile: each one is drawn as its own one-block line square to the
 * track (see sweep), so they stay tidy on diagonals and curves.
 */
export function builtinTile(v) {
    const ballast = mixed(parsePattern(v.ballast || 'gravel'));
    const top = String(v.top ?? TOP_MIX).trim() ? mixed(parsePattern(v.top ?? TOP_MIX)) : null;
    const sleeper = mixed(parsePattern(v.sleeper || 'mud_bricks'));
    const endText = String(v.sleeperEnd ?? 'mud_brick_stairs').trim();
    const end = endText ? parseBlock(endText) : null;
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
    const uOf = (c) => -w / 2 + c + 0.5 + (w % 2 === 0 ? 0.5 : 0); // as lanes.js lays columns
    // the rails are the lines (traced one block wide); under them, the slabs beside
    const lines = new Map();
    cols.forEach((k, c) => k === 'r' && lines.set('1,' + c, cols[c - 1] === 's' || c + 1 >= w ? c - 1 : c + 1));
    // each track's sleeper runs from its first to its last sleeper column
    const spans = [];
    for (let c = 0; c < w; c++)
        if (cols[c] !== 'b' && (c === 0 || cols[c - 1] === 'b')) {
            let e = c;
            while (e + 1 < w && cols[e + 1] !== 'b')
                e++;
            spans.push([uOf(c), uOf(e)]);
        }
    return {
        w, l, h: 2, anchor: 0, dirAng: 180, lines,
        centres: mids.map(uOf),
        rails: cols.map((k, c) => k === 'r' ? uOf(c) : null).filter(u => u !== null),
        bed: [uOf(0), uOf(w - 1)],
        sleepers: { spans, on, l, block: sleeper, end: stub > 0 ? end : null },
        cell(k, c) {
            if (k === 0)
                return ballast;
            return cols[c] === 'r' ? rail : top;
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
    if (tile.sleepers)
        yield* sleepers(road, tile, paint);
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

/** Cells of a one-block line from (x0, z0) to (x1, z1), both ends included. */
function line(x0, z0, x1, z1) {
    const out = [];
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
    let err = dx - dz, x = x0, z = z0;
    for (;;) {
        out.push([x, z]);
        if (x === x1 && z === z1)
            return out;
        const e2 = 2 * err;
        if (e2 > -dz) {
            err -= dz;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            z += sz;
        }
    }
}

/** Stair facing (Bedrock weirdo_direction) climbing towards (dx, dz): east 0, west 1, south 2, north 3. */
const climb = (dx, dz) => Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
const stairTo = (perm, dx, dz) => {
    try {
        if ('weirdo_direction' in perm.getAllStates())
            return perm.withState('weirdo_direction', climb(dx, dz));
    }
    catch (e) { }
    return perm;
};

/**
 * Sleepers: one every `l` blocks along the curve, each a one-block line square
 * to the track at that point, ending in stairs that climb towards the rails.
 * The spacing is counted in grid steps (a diagonal step counts as one), so on
 * a 45° line the sleepers repeat exactly every `l` diagonal steps instead of
 * bunching up at 1, 2, 1, 2...
 */
function* sleepers(road, tile, paint) {
    const sl = tile.sleepers, S = road.samples;
    const ends = new Map();
    const draw = (p) => {
        const y = Math.floor(p.y) + 1 - tile.anchor;
        for (const [ua, ub] of sl.spans) {
            const cells = line(Math.floor(p.x + p.nx * ua), Math.floor(p.z + p.nz * ua), Math.floor(p.x + p.nx * ub), Math.floor(p.z + p.nz * ub));
            cells.forEach(([x, z], j) => {
                const key = `${x},${y},${z}`;
                if (sl.end && (j === 0 || j === cells.length - 1)) {
                    const k = j === 0 ? 1 : -1; // climbing inwards, towards the rails
                    const d = climb(p.nx * k, p.nz * k);
                    let e = ends.get(d);
                    if (!e)
                        ends.set(d, e = stairTo(sl.end, p.nx * k, p.nz * k));
                    paint.set(key, e);
                }
                else
                    paint.set(key, sl.block.at({ x, y, z }));
            });
        }
    };
    let grid = 0, next = 0, n = 0;
    for (let i = 0; i < S.length; i++) {
        const p = S[i];
        if (i > 0)
            grid += Math.max(Math.abs(p.tx), Math.abs(p.tz)) * (p.s - S[i - 1].s);
        // sleeper k covers grid steps [k*l, k*l + on): draw each of its steps once
        while (grid + 1e-6 >= next) {
            const step = next;
            next = Math.floor(step) + 1;
            if (((Math.floor(step) % sl.l) + sl.l) % sl.l < sl.on)
                draw(p);
        }
        if (++n % 300 === 0)
            yield;
    }
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
                    buttons.push(d.concat(p.getState('facing_direction') === 0 ? 'hang' : 'lie'));
            }
    // a stable order, so anchor i on one pole meets anchor i on the next
    buttons.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return { cells, buttons: buttons.map(b => b.slice(0, 3)), styles: buttons.map(b => b[3]), dirAng: DIR_ANG[meta.dir] ?? 0, name };
}

/**
 * The built-in poles, rebuilt from the rules of the user's own gantries for 1,
 * 2 and 3 tracks (lib/pole_data.js holds the originals; the tests check this
 * rebuilds them block for block):
 *   - posts 5 blocks outside the outermost rails (further if the bed is wider),
 *     a hopper foot, andesite wall with a tuff brick band, an anvil cap, a
 *     heavy core / trapdoor / fence gate / grindstone / skull head;
 *   - a two-layer truss: slabs with stairs every 6 blocks, counted from the
 *     left post;
 *   - over every rail an anvil with a hopper under it (contact wire), iron
 *     trapdoors between the outer rails;
 *   - wire ends: under every hopper (hanging) and on the heavy cores (lying).
 * So any number of tracks, any gauge or spacing, gets a gantry built the same
 * way. Built with the track running east (+x): cells "along,up,sideways".
 * kind 'post' = the user's single post (feeder wires only) on both sides.
 */
const POLE_BLOCKS = {
    footL: ['hopper', { facing_direction: 3, toggle_bit: false }],
    footR: ['hopper', { facing_direction: 2, toggle_bit: false }],
    post: ['andesite_wall', { wall_post_bit: true }],
    band: ['tuff_brick_wall', { wall_post_bit: true }],
    cap: ['anvil', { 'minecraft:cardinal_direction': 'east' }],
    railCap: ['anvil', { 'minecraft:cardinal_direction': 'north' }],
    hanger: ['hopper', { facing_direction: 0, toggle_bit: false }],
    deck: ['iron_trapdoor', { direction: 1, open_bit: false, upside_down_bit: true }],
    slabLow: ['andesite_slab', { 'minecraft:vertical_half': 'bottom' }],
    slabHigh: ['andesite_slab', { 'minecraft:vertical_half': 'top' }],
    stairUpL: ['andesite_stairs', { upside_down_bit: false, weirdo_direction: 2 }],
    stairUpR: ['andesite_stairs', { upside_down_bit: false, weirdo_direction: 3 }],
    stairDnL: ['andesite_stairs', { upside_down_bit: true, weirdo_direction: 2 }],
    stairDnR: ['andesite_stairs', { upside_down_bit: true, weirdo_direction: 3 }],
    armL: ['hopper', { facing_direction: 3, toggle_bit: false }],
    armR: ['hopper', { facing_direction: 2, toggle_bit: false }],
    core: ['heavy_core', {}],
    head: ['diorite_wall', { wall_post_bit: true }],
    lid: ['iron_trapdoor', { direction: 3, open_bit: false, upside_down_bit: false }],
    gateL: ['pale_oak_fence_gate', { in_wall_bit: false, 'minecraft:cardinal_direction': 'south', open_bit: true }],
    gateR: ['pale_oak_fence_gate', { in_wall_bit: false, 'minecraft:cardinal_direction': 'north', open_bit: true }],
    grind: ['grindstone', { attachment: 'standing', direction: 1 }],
    skull: ['wither_skeleton_skull', { facing_direction: 1 }],
};
const WALL_NONE = { wall_connection_type_east: 'none', wall_connection_type_north: 'none', wall_connection_type_south: 'none', wall_connection_type_west: 'none' };
const poleBlock = (k) => {
    const [id, st] = POLE_BLOCKS[k];
    return perm('minecraft:' + id, id.endsWith('_wall') ? { ...WALL_NONE, ...st } : st);
};

/**
 * rails: sideways offsets of every rail (from the built-in track); bed: [left,
 * right] edge of the track bed.
 */
export function builtinPole(kind = 'gantry', rails = [-6, -3, 3, 6], bed = [-8, 8]) {
    const R = [...rails].sort((a, b) => a - b);
    const L = Math.min(R[0] - 5, Math.floor(bed[0]) - 3), Rt = Math.max(R[R.length - 1] + 5, Math.ceil(bed[1]) + 3);
    const cells = new Map(), buttons = [], styles = [];
    const set = (z, y, k) => cells.set(`0,${y},${z}`, poleBlock(k));
    const wire = (z, y, style) => {
        buttons.push([0, y, z]);
        styles.push(style);
    };
    const post = (z, right) => {
        set(z, 0, right ? 'footR' : 'footL');
        for (let y = 1; y <= 8; y++)
            set(z, y, y === 3 ? 'band' : 'post');
        if (kind !== 'post')
            set(z, 9, 'cap');
        set(z, 12, 'post');
        set(z, 13, 'head');
        set(z, 14, 'grind');
        set(z, 15, 'skull');
        for (const [d, side] of [[-1, 'L'], [1, 'R']]) {
            set(z + d, 12, 'core');
            set(z + d, 13, 'lid');
            set(z + d, 14, d < 0 ? 'gateL' : 'gateR');
            wire(z + d, 12, 'lie');
        }
    };
    if (kind === 'post') {
        // the user's single post (mystructure:야) as built, where the gantry posts would stand
        const data = POLES.post, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const pal = data.palette.map(q => perm(q.name, q.states));
        for (const at of [L, Rt]) {
            data.rows.forEach((row, y) => [...row].forEach((c, z) => {
                if (c !== '.')
                    cells.set(`0,${y},${at + z - data.centre}`, pal[chars.indexOf(c)]);
            }));
            for (const [u, y, style] of data.anchors)
                wire(at + u, y, style);
        }
        return { cells, buttons, styles, dirAng: 90, name: '기둥만' };
    }
    post(L, false);
    post(Rt, true);
    // the truss: the post ends, then slabs with stairs every 6 blocks from the left post
    for (const [z, right] of [[L, false], [Rt, true]]) {
        set(z - 1, 10, 'slabLow');
        set(z + 1, 10, 'slabLow');
        set(z, 10, right ? 'stairUpR' : 'stairUpL');
        set(z - 1, 11, 'armL');
        set(z, 11, right ? 'stairDnR' : 'stairDnL');
        set(z + 1, 11, 'armR');
    }
    for (let z = L + 2; z <= Rt - 2; z++) {
        const k = (z - L - 2) % 6;
        set(z, 11, k === 2 ? 'stairDnR' : k === 4 ? 'stairDnL' : 'slabHigh');
        set(z, 10, k === 1 ? 'stairUpL' : k === 5 ? 'stairUpR' : 'slabLow');
    }
    // the deck: trapdoors between the outer rails, an anvil and a hanger over every rail
    for (let z = R[0] - 1; z <= R[R.length - 1] + 1; z++)
        set(z, 9, 'deck');
    for (const z of R) {
        set(z, 9, 'railCap');
        set(z, 8, 'hanger');
        wire(z, 7, 'hang');
    }
    return { cells, buttons, styles, dirAng: 90, name: '기본 전신주' };
}

/**
 * Where along the curve the poles stand (distances from the start):
 *   every  - every `poleEvery` blocks from `poleStart`
 *   curve  - like every, but closer on curves: each gap shrinks (down to
 *            `poleMin`) until the straight wire between two poles strays at
 *            most `poleStray` blocks from the track centre
 *   count  - `poleCount` poles spread evenly from start to end
 *   list   - gaps typed in `poleList` ("20, 30" -> 20, 30, 20, 30 ...)
 * `poleEnd` adds one at the very end if the last gap left it bare.
 */
export function poleSpots(road, v) {
    const S = road.samples, total = road.total;
    const start = Math.max(0, Math.min(total, Number(v.poleStart ?? 0) || 0));
    const every = Math.max(2, Math.floor(v.poleEvery ?? 20));
    const mode = v.poleMode ?? 'every';
    const out = [];
    if (mode === 'count') {
        const n = Math.max(1, Math.floor(v.poleCount ?? 5));
        for (let k = 0; k < n; k++)
            out.push(n === 1 ? start : start + (total - start) * k / (n - 1));
        return out;
    }
    const gaps = mode === 'list'
        ? String(v.poleList ?? '').split(/[,\s]+/).map(Number).filter(g => g >= 2)
        : [every];
    if (!gaps.length)
        throw new Error('전신주 간격을 2 이상 숫자로 적어 주세요 (예: 20, 30)');
    const at = (s) => {
        let lo = 0, hi = S.length - 1;
        while (lo < hi) {
            const m = (lo + hi) >> 1;
            if (S[m].s < s)
                lo = m + 1;
            else
                hi = m;
        }
        return S[lo];
    };
    // how far the curve strays from the straight line between two spots
    const stray = (a, b) => {
        const p = at(a), q = at(b);
        const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
        let worst = 0;
        for (let s = a; s <= b; s += 0.5) {
            const c = at(s);
            worst = Math.max(worst, Math.abs((c.x - p.x) * dz - (c.z - p.z) * dx) / L);
        }
        return worst;
    };
    const min = Math.max(2, Math.floor(v.poleMin ?? 8)), maxStray = Math.max(0.2, Number(v.poleStray ?? 1));
    let s = start, k = 0;
    while (s <= total + 1e-6) {
        out.push(s);
        let g = gaps[k++ % gaps.length];
        if (mode === 'curve')
            while (g > min && s + g <= total && stray(s, s + g) > maxStray)
                g--;
        s += g;
    }
    if (v.poleEnd && total - out[out.length - 1] > 1)
        out.push(total);
    return out;
}

/**
 * Stand poles along the road every `interval` blocks from `offset`.
 * Returns [{at: {x,y,z}, m}] (m = the matrix used for its wire anchors).
 */
export function* standPoles(road, pole, v, paint) {
    const S = road.samples;
    const out = [];
    let i = 0, si = 0;
    const turned = new Map();
    for (const s of poleSpots(road, v)) {
        while (si + 1 < S.length && S[si].s + 1e-6 < s)
            si++;
        out.push(stamp(S[si], pole, v.poleAngle, paint, turned));
        if (++i % 4 === 0)
            yield;
    }
    return out;
}

/**
 * Put a pole-like piece (cells "dx,dy,dz" made facing pole.dirAng) at curve
 * sample p, turned to the track there: exactly (each block pushed forward with
 * half-way points to its neighbours, so parts stay joined and thin parts thin)
 * or by 90° steps (angle '90', or when the track is square anyway).
 * Returns {at, m}: where it stands and the turn used (for its wire anchors).
 */
export function stamp(p, pole, angle, paint, turned = new Map()) {
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
    const square = Math.abs(delta - Math.round(delta / 90) * 90) < 0.5;
    if (angle === '90' || square) {
        for (const [k, perm] of pole.cells) {
            const d = apply(m90, k.split(',').map(Number)).map(Math.round);
            paint.set(`${at.x + d[0]},${at.y + d[1]},${at.z + d[2]}`, turnState(perm));
        }
        return { at, m: m90 };
    }
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
    return { at, m };
}

/** World position of anchor `d` on a stood pole (block centre). */
const anchor = (pole, d) => {
    const q = apply(pole.m, d);
    return { x: pole.at.x + q[0] + 0.5, y: pole.at.y + q[1] + 0.5, z: pole.at.z + q[2] + 0.5 };
};

/**
 * Lay buttons every `gap` blocks along a sagging line from a to b. 'hang'
 * buttons hang from the block above, 'lie' ones lie on the block below; with
 * `support`, an invisible barrier is put there so they never drop.
 */
function wire(a, b, gap, sag, w, paint) {
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.round(L / gap));
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = Math.floor(a.x + (b.x - a.x) * t), z = Math.floor(a.z + (b.z - a.z) * t);
        const y = Math.floor(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
        const key = `${x},${y},${z}`;
        if (paint.get(key))
            continue;
        paint.set(key, w.perm);
        const sk = `${x},${y + w.up},${z}`;
        if (w.support && !paint.get(sk))
            paint.set(sk, w.support);
    }
}

/** A button as wire, whatever button block was chosen: hanging (facing down) or lying flat. */
export function wirePerm(text, style = 'lie') {
    let p = parseBlock(text || 'polished_blackstone_button');
    try {
        if ('facing_direction' in p.getAllStates())
            p = p.withState('facing_direction', style === 'hang' ? 0 : 1);
    }
    catch (e) { }
    return p;
}
const wireStyle = (v, style) => ({
    perm: wirePerm(v.wireBlock, style),
    up: style === 'hang' ? 1 : -1,
    support: v.wireSupport !== false ? perm('minecraft:barrier') : null,
});

/** Wires between neighbouring poles, anchor to anchor. */
export function* stringWires(poles, pole, v, paint) {
    const ws = { hang: wireStyle(v, 'hang'), lie: wireStyle(v, 'lie') };
    const gap = Math.max(1, Math.floor(v.wireGap ?? 2)), sag = Math.max(0, Number(v.sag ?? 1));
    let n = 0;
    for (let i = 0; i + 1 < poles.length; i++) {
        pole.buttons.forEach((d, j) => wire(anchor(poles[i], d), anchor(poles[i + 1], d), gap, sag, ws[pole.styles?.[j]] ?? ws.lie, paint));
        if (++n % 8 === 0)
            yield;
    }
    return pole.buttons.length;
}

/** Wires without poles: straight along the curve at "sideways:height" offsets. */
export function* freeWires(road, v, paint) {
    const w = wireStyle(v, 'lie');
    const gap = Math.max(1, Math.floor(v.wireGap ?? 2));
    const spots = String(v.wireAt ?? '').split(/[,\s]+/).filter(Boolean).map(t => t.split(':').map(Number)).filter(a => a.length === 2 && a.every(Number.isFinite));
    for (const [u, hgt] of spots) {
        road.trace(u).forEach((c, i) => {
            if (i % gap === 0) {
                paint.set(`${c.x},${c.y + hgt},${c.z}`, w.perm);
                if (w.support)
                    paint.set(`${c.x},${c.y + hgt - 1},${c.z}`, w.support);
            }
        });
        yield;
    }
    return spots.length;
}
