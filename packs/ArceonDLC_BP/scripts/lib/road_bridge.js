/*
 * Bridges under a road (차선 도로), designed for roads (not the railway's):
 *   girder - a highway PSC girder bridge: a row of slender I-girders (web +
 *            bulb, top flange haunch) under a thin deck slab with
 *            diaphragms every 10 blocks, a deck overhang with a drip edge,
 *            New Jersey barriers with a steel rail on top; on hammerhead
 *            (T) piers: one column flaring into a cap whose arms taper to
 *            the outer girders, bearing pads under every girder (two columns
 *            and a straight cap under a very wide road).
 *   box    - a box girder bridge: one box with inclined webs and a bottom
 *            slab, wide cantilevered deck with haunched undersides on both
 *            sides, the same barriers; on a rectangular column with a short
 *            cap (bearing pads under the webs), chamfered.
 * Concrete is a weathered mix (no flat single block). Piers go down to the
 * ground every span, the deck ends are closed, light blocks light it.
 */
import { bridgeTile, endPiece, FOOT, geometry, mix, OUT_W, pierPiece, polish } from './bridges.js';
import { stamp, sweep } from './rail.js';
import { roadFrom } from '../tools/lanes.js';
import { ensureLoaded } from '../core/loader.js';
import { loadAll } from '../core/edit.js';

/** Road concrete: grey, weathered. */
const CON = mix([
    [45, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [25, 'andesite', 'andesite_slab', 'andesite_stairs'],
    [20, 'polished_andesite', 'polished_andesite_slab', 'polished_andesite_stairs'],
    [10, 'light_gray_concrete', 'normal_stone_slab', 'normal_stone_stairs'],
]);
/** Barriers: smoother precast concrete. */
const BAR = mix([
    [70, 'polished_andesite', 'polished_andesite_slab', 'polished_andesite_stairs'],
    [30, 'andesite', 'andesite_slab', 'andesite_stairs'],
]);
const PAD = 'polished_blackstone'; // bearing pads

/** New Jersey barrier + rail on the deck edge (e 0..1), the fascia under it. */
function barrier(e, dy, sd) {
    if (e === 0) {
        if (dy === 0 || dy === 1)
            return BAR.b;
        if (dy === 2)
            return 'iron_bars'; // steel rail on top
        if (dy === -1)
            return CON.b; // fascia
        if (dy === -2)
            return CON.slab(true); // drip edge
        return null;
    }
    if (e === 1) {
        if (dy === 0)
            return BAR.st(OUT_W(sd)); // the sloped foot of the barrier
        return null;
    }
    return undefined;
}

const DESIGNS = [
    {
        id: 'girder', name: 'PSC 거더교 (I형 거더 여러 줄 + T형 교각)',
        l: 10, span: 30, widen: 0, dyMin: -6, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd);
            if (b !== undefined)
                return b;
            if (dy === -1)
                return CON.b; // deck slab
            if (dy >= 0)
                return null;
            const gs = g._girders ??= g.girders(4);
            const near = gs.find(x => Math.abs(u - x) <= 1);
            if (near !== undefined) {
                const d = u - near;
                if (d === 0)
                    return dy >= -4 ? CON.b : dy === -5 ? CON.b : null; // web, bulb
                if (dy === -2)
                    return CON.slab(true); // top flange haunch
                if (dy === -5)
                    return CON.slab(true); // bulb flanges
            }
            // diaphragms between the girders
            if (j % 10 === 0 && dy >= -4 && u > gs[0] && u < gs[gs.length - 1])
                return CON.b;
            return null;
        },
        pier(g, ground) {
            const out = [];
            const gs = g._girders ??= g.girders(4);
            const lo = gs[0] - 1, hi = gs[gs.length - 1] + 1;
            const wide = g.Bh >= 16;
            const cols = wide ? [Math.round(g.c0 - g.Bh / 2), Math.round(g.c0 + g.Bh / 2)] : [g.c0r];
            // the cap: deep over the column(s), its arms tapering to the outer girders
            const depthAt = (u) => {
                if (wide)
                    return 3;
                const d = Math.abs(u - g.c0) - 2;
                return d <= 0 ? 4 : Math.max(2, Math.round(4 - 2 * d / Math.max(1, (hi - lo) / 2 - 2)));
            };
            for (let u = lo; u <= hi; u++) {
                const dd = depthAt(u), dn = depthAt(u + (u < g.c0 ? -1 : 1));
                for (let k = 0; k < dd; k++)
                    for (let a = -2; a <= 2; a++) {
                        const y = -6 - k;
                        let t = CON.b;
                        if (k === 0 && gs.includes(u) && a === 0)
                            t = PAD;
                        else if (k === dd - 1 && dn < dd)
                            t = CON.st(u < g.c0 ? 0 : 1, true); // the tapering underside
                        else if (Math.abs(a) === 2 && k === dd - 1)
                            t = CON.slab(true); // chamfer along
                        out.push([u, y, a, t]);
                    }
            }
            // the column(s): round, flaring into the cap
            for (const cu of cols) {
                const capBottom = -6 - depthAt(cu);
                for (let dy = capBottom; dy > ground + 1; dy--) {
                    const flare = dy > capBottom - 3 ? (capBottom - dy === 0 ? 1.4 : capBottom - dy === 1 ? 0.8 : 0.3) : 0;
                    const r = 2.2 + flare;
                    for (let du = -4; du <= 4; du++)
                        for (let a = -4; a <= 4; a++)
                            if (du * du + a * a <= r * r)
                                out.push([cu + du, dy, a, CON.b]);
                }
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++) {
                        out.push([cu + du, ground, a, FOOT.b]);
                        if (du * du + a * a <= 7)
                            out.push([cu + du, ground + 1, a, Math.abs(du) === 3 || Math.abs(a) === 3 ? FOOT.slab() : CON.b]);
                    }
            }
            return out;
        },
    },
    {
        id: 'box', name: '박스 거더교 (경사 복부 박스 + 넓은 캔틸레버 + 사각 교각)',
        l: 12, span: 36, widen: 0, dyMin: -7, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd);
            if (b !== undefined)
                return b;
            if (dy === -1)
                return CON.b; // deck slab
            if (dy >= 0)
                return null;
            const x = Math.abs(u - g.c0);
            const bw = Math.max(3, Math.round(g.Bh * 0.33)); // half width of the box at the bottom
            const web = (y) => bw + Math.round((y + 7) * 2 / 5); // webs lean out going up (-7 .. -2)
            const w = web(dy);
            // cantilevers: a haunch thickening toward the webs
            if (x > w) {
                const reach = w + 3;
                if (dy === -2 && x <= reach)
                    return x === reach ? CON.st(sd < 0 ? 0 : 1, true) : CON.b;
                if (dy === -3 && x === w + 1)
                    return CON.st(sd < 0 ? 0 : 1, true);
                return null;
            }
            if (x === w || (x === w - 1 && dy === -2))
                return CON.b; // webs
            if (dy === -7 || dy === -2)
                return CON.b; // bottom slab, top haunch inside
            if (j % 12 === 0 && dy > -7)
                return CON.b; // diaphragms
            return null;
        },
        pier(g, ground) {
            const out = [];
            const bw = Math.max(3, Math.round(g.Bh * 0.33));
            const cu = g.c0r, hw = bw + 1, cw = Math.max(1, bw - 2);
            // the cap: under the box, bearing pads under the webs, chamfered ends
            for (let u = cu - hw; u <= cu + hw; u++)
                for (let a = -2; a <= 2; a++) {
                    const x = Math.abs(u - cu);
                    out.push([u, -8, a, x === bw && a === 0 ? PAD : CON.b]);
                    out.push([u, -9, a, x === hw ? CON.st(u < cu ? 0 : 1, true) : CON.b]);
                }
            // the column: rectangular, chamfered corners, a line at the cap
            for (let dy = -10; dy > ground + 1; dy--)
                for (let du = -cw; du <= cw; du++)
                    for (let a = -1; a <= 1; a++) {
                        const corner = Math.abs(du) === cw && Math.abs(a) === 1;
                        if (corner && cw > 1)
                            continue;
                        out.push([cu + du, dy, a, CON.b]);
                    }
            for (let du = -cw - 2; du <= cw + 2; du++)
                for (let a = -3; a <= 3; a++) {
                    out.push([cu + du, ground, a, FOOT.b]);
                    if (Math.abs(du) <= cw + 1 && Math.abs(a) <= 2)
                        out.push([cu + du, ground + 1, a, Math.abs(du) === cw + 1 || Math.abs(a) === 2 ? FOOT.slab() : CON.b]);
                }
            return out;
        },
    },
];

export const ROAD_BRIDGES = [
    { value: 'girder', label: 'PSC 거더교 (I형 거더 여러 줄 + T형 교각)' },
    { value: 'box', label: '박스 거더교 (경사 복부 박스 + 사각 교각)' },
];

/** Build the bridge for a laid-out road `road` W columns wide. Returns a description. */
export function* roadBridge(ctx, v, road, W) {
    const d = DESIGNS.find(x => x.id === v.bridge);
    if (!d)
        throw new Error('없는 교량 종류: ' + v.bridge);
    const lo = road.uOf(0) - 0.5, hi = road.uOf(W - 1) + 0.5;
    const g = geometry(d, { rails: [Math.round((lo + hi) / 2)], bed: [lo, hi] }, { tight: true });
    const bt = bridgeTile(d, g);
    const S = road.samples, total = road.total;
    const deck = yield* roadFrom(S, bt.w, total);
    const bp = new Map();
    yield* sweep(ctx, { clearAir: false, down: false }, bt, bp, deck);
    // piers every span (a short last span is stretched), one at each end
    const span = Math.floor(v.span) || d.span;
    const spots = [];
    for (let s = 0; s <= total + 1e-6; s += span)
        spots.push(s);
    const rest = total - spots[spots.length - 1];
    if (rest > 1) {
        if (rest < span / 2 && spots.length > 1)
            spots[spots.length - 1] = total;
        else
            spots.push(total);
    }
    const at = (s) => S.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b);
    const pierAt = spots.map(at);
    const edit = ctx.edit, far = loadAll(ctx.player), turned = new Map();
    let piers = 0;
    for (const p of pierAt) {
        const y = Math.floor(p.y);
        const release = far ? yield ensureLoaded(ctx.dim, { x: Math.floor(p.x) - 3, y, z: Math.floor(p.z) - 3 }, { x: Math.floor(p.x) + 3, y, z: Math.floor(p.z) + 3 }) : null;
        const ground = edit.highest(Math.floor(p.x), Math.floor(p.z), Math.max(edit.minY, y - 96), y + d.dyMin - 1);
        const gdy = Math.max(ground - y, d.dyMin - 96);
        release?.();
        if (gdy >= d.dyMin - 3)
            continue; // the deck is (nearly) on the ground here
        const end = p === pierAt[0] || p === pierAt[pierAt.length - 1];
        stamp(p, pierPiece(d, g, gdy, bt, piers + 1, end), '', bp, turned);
        if (++piers % 2 === 0)
            yield;
    }
    const cap = endPiece(d, g, bt);
    for (const p of [pierAt[0], pierAt[pierAt.length - 1]])
        stamp(p, cap, '', bp, turned);
    yield* polish(bp);
    let n = 0;
    for (const [k, perm] of bp) {
        if (!perm)
            continue;
        const [x, y, z] = k.split(',').map(Number);
        edit.set({ x, y, z }, perm);
        if (++n % 3000 === 0)
            yield;
    }
    return `${d.name.split(' (')[0]} (교각 ${piers}개, 경간 ${span}칸)`;
}
