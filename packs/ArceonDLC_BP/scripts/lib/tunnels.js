/*
 * Railway tunnels (hidden feature, like the bridges).
 *
 * Two designs, both sized to the track bed and the catenary:
 *   natm - a horseshoe (NATM) tunnel: vertical side walls up to the spring
 *          line, an elliptical crown, a two-layer stone lining (dressed
 *          andesite inside with ring joints every 10 blocks, rubble behind),
 *          an invert under the bed, raised cable-trough walkways each side,
 *          refuge niches every 30 blocks (alternating sides) and invisible
 *          light blocks along the walls; a masonry portal with a voussoir
 *          ring, a keystone and a cornice.
 *   box  - a cut-and-cover box: straight walls, a flat roof with haunches in
 *          the corners and cross beams every 6 blocks, a row of pillars
 *          between the two halves of an even number of tracks, walkways,
 *          ceiling light blocks; a flat concrete portal with a cornice band.
 *
 * Modes: 'auto' (터널 교차) builds the tunnel only where the ground covers the
 * crown, with a cutting (retaining walls, cleared corridor) where the ground
 * is above the track but too low for a tunnel; 'full' runs the tunnel the
 * whole way, like a bridge does.
 *
 * Catenary poles inside a tunnel lose what does not fit (posts, tops) and
 * hang from the roof on chains, keeping their wire anchors, so the wires run
 * on through.
 */
import { MASON, FOOT, BOXCAST, material } from './bridges.js';
import { ensureLoaded } from '../core/loader.js';
import { loadAll } from '../core/edit.js';

const LIGHT = 'light_block_13';
const INNER_NATM = '60%polished_andesite,30%andesite,10%stone';
const JOINT = 'stone_bricks';
const ROOF = '70%polished_andesite,30%andesite';

/** Interior size for a bed `half` blocks either side of the centre and a contact wire `wire` above the rails. */
export function tunnelSize(half, wireHeight = 5) {
    const hw = half + 2; // walkway each side
    const Hc = Math.max(wireHeight + 7, 11); // clear height on the centre line
    return { hw, Hc };
}

export const TUNNELS = [
    {
        id: 'natm', name: 'NATM 말굽형 터널 (돌 라이닝, 아치 포털)',
        shape(hw, Hc) {
            const ys = 5, Rv = Math.max(4, Hc - ys);
            const inside = (u, dy) => dy >= 0 && Math.abs(u) < hw && (dy <= ys || (u / hw) ** 2 + ((dy - ys) / Rv) ** 2 < 1);
            const within = (u, dy, t) => dy >= -1 - (t > 1 ? 1 : 0) && Math.abs(u) < hw + t && (dy <= ys || (u / (hw + t)) ** 2 + ((dy - ys) / (Rv + t)) ** 2 < 1);
            return { inside, within, top: ys + Rv + 2, ys };
        },
        cell(u, dy, s, sh, ctx) {
            const { hw, half, seg } = ctx;
            const au = Math.abs(u);
            if (sh.inside(u, dy)) {
                // refuge niches, alternating sides
                const n = Math.floor(s / 30);
                if (seg.from + 4 < s && s < seg.to - 4 && s % 30 < 2 && (n % 2 === 0) === (u < 0) && au >= hw - 1 && dy >= 1 && dy <= 3)
                    return dy === 3 ? LIGHT : null;
                // raised walkways with a cable trough
                if (au > half + 0.5 && dy === 0)
                    return 'polished_andesite';
                if (au > half + 0.5 && dy === 1)
                    return 'polished_andesite_slab';
                if (au >= hw - 1 && dy === 4 && s % 8 < 1)
                    return LIGHT;
                return null;
            }
            if (!sh.within(u, dy, 2))
                return undefined; // outside the tunnel
            const inner = sh.within(u, dy, 1);
            // niche recess in the lining
            const n = Math.floor(s / 30);
            if (inner && seg.from + 4 < s && s < seg.to - 4 && s % 30 < 2 && (n % 2 === 0) === (u < 0) && dy >= 1 && dy <= 3 && au < hw + 1)
                return null;
            if (dy <= -1)
                return MASON.b; // invert
            if (inner)
                return s % 10 < 1 ? JOINT : INNER_NATM;
            return MASON.b;
        },
        portal(u, dy, sh, ctx) {
            const { hw } = ctx;
            const au = Math.abs(u);
            const H = sh.top + 3;
            if (au >= hw + 6 || dy < -1 || dy > H)
                return undefined;
            if (sh.inside(u, dy))
                return undefined; // the opening
            if (dy === H)
                return au < hw + 6 ? 'stone_brick_slab' : undefined; // cornice
            if (dy === H - 1)
                return 'polished_andesite';
            // voussoirs around the opening, keystone at the crown
            if (sh.within(u, dy, 1) && dy > sh.ys)
                return au < 1 ? 'chiseled_stone_bricks' : 'stone_bricks';
            if (sh.within(u, dy, 1))
                return 'stone_bricks';
            if (dy === -1 || dy === 0)
                return FOOT.b; // plinth
            return MASON.b;
        },
    },
    {
        id: 'box', name: '개착식 박스 터널 (사각, 가운데 기둥 열)',
        shape(hw, Hc) {
            const Hb = Hc - 1;
            const haunch = (u, dy) => Math.abs(u) - (hw - 2) + (dy - (Hb - 2)) > 1;
            const inside = (u, dy) => dy >= 0 && Math.abs(u) < hw && dy < Hb && !haunch(u, dy);
            const within = (u, dy, t) => dy >= -1 - (t > 1 ? 1 : 0) && Math.abs(u) < hw + t && dy < Hb + t;
            return { inside, within, top: Hb + 2, Hb };
        },
        cell(u, dy, s, sh, ctx) {
            const { hw, half, pillars } = ctx;
            const au = Math.abs(u);
            if (sh.inside(u, dy)) {
                // pillars between the two halves of the tracks
                if (pillars && au < 0.5 && dy >= 1 && s % 6 < 1.5)
                    return BOXCAST.b;
                if (au > half + 0.5 && dy === 0)
                    return 'polished_andesite';
                if (au > half + 0.5 && dy === 1)
                    return 'polished_andesite_slab';
                // cross beams under the roof, lights beside them
                if (dy === sh.Hb - 1 && s % 6 < 1)
                    return 'andesite';
                if (dy === sh.Hb - 2 && Math.abs(au - hw / 2) < 0.6 && s % 8 < 1)
                    return LIGHT;
                return null;
            }
            if (!sh.within(u, dy, 2))
                return undefined;
            if (dy <= -1)
                return BOXCAST.b; // floor slab
            if (dy >= sh.Hb - 2 && au < hw)
                return dy >= sh.Hb ? BOXCAST.b : ROOF; // roof and haunches
            return BOXCAST.b;
        },
        portal(u, dy, sh, ctx) {
            const { hw } = ctx;
            const au = Math.abs(u);
            const H = sh.top + 2;
            if (au >= hw + 5 || dy < -1 || dy > H)
                return undefined;
            if (sh.inside(u, dy))
                return undefined;
            if (dy === H)
                return 'andesite_wall'; // parapet on the portal
            if (dy === H - 1)
                return 'polished_andesite_slab[top]';
            if (dy === sh.Hb || dy === sh.Hb + 1)
                return au < hw + 1 ? 'chiseled_stone_bricks' : 'polished_andesite'; // lintel band
            if (dy === -1 || dy === 0)
                return FOOT.b;
            return BOXCAST.b;
        },
    },
];
export const tunnelById = (id) => TUNNELS.find(t => t.id === id);

/** Is s inside one of the ranges [[from, to]...]? Returns the range. */
export const rangeAt = (ranges, s) => ranges.find(r => s >= r[0] && s <= r[1]) ?? null;

/**
 * Where the tunnel runs: 'full' the whole way; 'auto' where the ground over
 * the centre line covers the crown (with a block of cover), joined over short
 * dips and dropping short bits. Also returns the ground height per block for
 * the cuttings.
 */
export function* tunnelRanges(ctx, S, total, Hc, mode) {
    if (mode === 'full')
        return { ranges: [[0, total]], ground: null };
    const edit = ctx.edit, far = loadAll(ctx.player);
    const ground = [];
    let i = 0;
    for (let s = 0; s <= total; s++) {
        while (i + 1 < S.length && S[i].s < s)
            i++;
        const p = S[i], x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
        const release = far ? yield ensureLoaded(ctx.dim, { x: x - 1, y, z: z - 1 }, { x: x + 1, y, z: z + 1 }) : null;
        ground.push(edit.highest(x, z, y + 1, y + Hc + 48) - y);
        release?.();
        if (s % 32 === 31)
            yield;
    }
    const under = ground.map(g => g >= Hc + 2);
    // join over short dips, drop short bits
    const runs = [];
    for (let s = 0; s < under.length; s++)
        if (under[s] && (s === 0 || !under[s - 1])) {
            let e = s;
            while (e + 1 < under.length && under[e + 1])
                e++;
            runs.push([s, e]);
        }
    const joined = [];
    for (const r of runs) {
        const last = joined[joined.length - 1];
        if (last && r[0] - last[1] < 8)
            last[1] = r[1];
        else
            joined.push([...r]);
    }
    return { ranges: joined.filter(r => r[1] - r[0] >= 10), ground };
}

/**
 * Lay the tunnel lining and clear its inside (cells the track, poles and
 * wires will fill later are left to them). `road` is a road of tunnel width
 * around the centre line; cells keep their sideways offset and distance.
 * In 'auto' mode, a cutting where the ground stands over the track outside the
 * tunnels: the corridor cleared and retaining walls each side.
 */
export function* buildTunnel(ctx, T, road, ranges, ground, info, paint) {
    const { hw, Hc, half } = info;
    const sh = T.shape(hw, Hc);
    const cache = new Map();
    const put = (x, y, z, t) => {
        const k = `${x},${y},${z}`;
        if (t === null) {
            if (!paint.has(k))
                paint.set(k, null);
            return;
        }
        paint.set(k, material(cache, t).at({ x, y, z }));
    };
    const ctxT = { hw, half, pillars: info.pillars };
    let n = 0, cells = 0;
    for (const [key, c] of road.cells) {
        const [x, z] = key.split(',').map(Number);
        const u = c.uc, y0 = c.y;
        const seg = rangeAt(ranges, c.s);
        if (seg) {
            const fromEnd = Math.min(c.s - seg[0], seg[1] - c.s);
            for (let dy = -2; dy <= sh.top + 4; dy++) {
                let t;
                if (fromEnd < 2)
                    t = T.portal(u, dy, sh, ctxT);
                if (t === undefined)
                    t = T.cell(u, dy, c.s, sh, { ...ctxT, seg: { from: seg[0], to: seg[1] } });
                if (t === undefined)
                    continue;
                put(x, y0 + dy, z, t);
                cells++;
            }
        }
        else if (ground) {
            // a cutting: the ground over the track outside the tunnels
            const g = ground[Math.max(0, Math.min(ground.length - 1, Math.round(c.s)))];
            if (g >= 2) {
                const top = Math.min(g, 40);
                const au = Math.abs(u);
                for (let dy = 1; dy <= top; dy++) {
                    if (au < hw)
                        put(x, y0 + dy, z, null);
                    else if (au < hw + 1.5)
                        put(x, y0 + dy, z, dy === top ? 'stone_brick_slab' : MASON.b); // retaining wall
                }
            }
        }
        if (++n % 800 === 0)
            yield;
    }
    return cells;
}

/**
 * The pole as it hangs in the tunnel: only what fits inside (no posts, nothing
 * through the roof), held up by chains to the roof; the wire anchors stay.
 */
export function tunnelPole(pole, T, info) {
    const sh = T.shape(info.hw, info.Hc);
    const cells = new Map();
    const tops = new Map();
    for (const [k, p] of pole.cells) {
        const [dx, dy, dz] = k.split(',').map(Number);
        if (!sh.inside(dz, dy) || dy < 3)
            continue;
        cells.set(k, p);
        const c = dx + ',' + dz;
        if (!tops.has(c) || tops.get(c) < dy)
            tops.set(c, dy);
    }
    // chains from the roof: over every 4th column and the outermost ones
    const chain = pole.chain;
    const ceil = (u) => {
        let y = 0;
        while (sh.inside(u, y + 1))
            y++;
        return y;
    };
    const outer = Math.max(0, ...[...tops.keys()].map(q => Math.abs(+q.split(',')[1])));
    for (const [c, dy] of tops) {
        const [dx, dz] = c.split(',').map(Number);
        if (!chain || (Math.abs(dz) % 4 !== 0 && Math.abs(dz) !== outer))
            continue;
        for (let y = dy + 1; y <= ceil(dz); y++)
            if (!cells.has(`${dx},${y},${dz}`))
                cells.set(`${dx},${y},${dz}`, chain);
    }
    // only the wires that run inside the tunnel
    const keep = pole.buttons.map(d => sh.inside(d[2], d[1]));
    return { ...pole, cells, buttons: pole.buttons.filter((_, j) => keep[j]), styles: pole.styles?.filter((_, j) => keep[j]) };
}
