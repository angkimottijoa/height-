/*
 * Bridges under a road (차선 도로), designed for roads (not the railway's).
 * Every one has New Jersey barriers with a steel rail (the arch keeps its
 * stone parapet), a cable tray under the deck edge with a junction box now
 * and then, and a drain pipe down a pier — the small services real viaducts
 * carry. Concrete is a weathered mix, never one flat block.
 *   girder  - PSC I-girders in a row under a thin deck, diaphragms; hammerhead
 *             (T) piers: a round column flaring (within the cap) into a cap
 *             whose arms taper to the outer girders, a pedestal under each.
 *   box     - one box girder, inclined webs, wide haunched cantilevers; a
 *             rectangular column with a short cap.
 *   fixco   - a Japanese expressway viaduct: deep girders close together, a
 *             pipe along the outer girder; two fluted square columns under a
 *             long segmented cap with a pedestal for every girder.
 *   steel_i - painted steel I-girders, bolted, with cross frames between them;
 *             a wall pier with rounded ends.
 *   portal  - the box girder on portal (rahmen) piers: two columns outside the
 *             box and a cross beam, haunched where they meet.
 *   slab    - a thick slab with chamfered edges on a row of round columns with
 *             small capitals (no cross beam), for ramps and low crossings.
 *   arch    - the open-spandrel stone arch.
 * Piers go down to the ground every span, the deck ends are closed, light
 * blocks light it.
 */
import { bridgeById, bridgeTile, endPiece, FOOT, geometry, IN_W, mix, OUT_W, pierPiece, polish, stair, top, bolt } from './bridges.js';
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
/** Barriers and newer piers: smoother, lighter concrete. */
const BAR = mix([
    [70, 'polished_andesite', 'polished_andesite_slab', 'polished_andesite_stairs'],
    [30, 'andesite', 'andesite_slab', 'andesite_stairs'],
]);
const LIGHT = mix([
    [60, 'polished_andesite', 'polished_andesite_slab', 'polished_andesite_stairs'],
    [25, 'andesite', 'andesite_slab', 'andesite_stairs'],
    [15, 'calcite', 'polished_diorite_slab', 'polished_diorite_stairs'],
]);
const PAD = 'polished_blackstone'; // bearing pads
const TRAY = 'polished_deepslate_slab[top]', BOX = 'polished_deepslate', PIPE = 'polished_deepslate_wall', DRAIN = 'iron_chain';

/** New Jersey barrier + rail on the deck edge, the fascia and the cable tray under it. */
function barrier(e, dy, sd, j) {
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
        if (dy === -1)
            return CON.b;
        if (dy === -2)
            return j % 16 === 8 ? BOX : TRAY; // cable tray, a junction box now and then
        return null;
    }
    return undefined;
}
/** A drain pipe from `from` down to just above the ground. */
function drain(out, u, a, from, ground) {
    for (let dy = from; dy > ground; dy--)
        out.push([u, dy, a, DRAIN]);
    out.push([u, ground + 1, a, 'andesite_wall']); // outlet
}
/** I-girders every `step` under the deck: web from -2 down to `bottom`, bulb with flanges, top haunch. */
function iGirder(u, dy, g, step, bottom, M = CON) {
    const gs = g['_g' + step] ??= g.girders(step);
    const near = gs.find(x => Math.abs(u - x) <= 1);
    if (near === undefined)
        return { gs, t: undefined };
    const d = u - near;
    if (d === 0)
        return { gs, t: dy >= bottom && dy <= -2 ? M.b : undefined };
    if (dy === -2)
        return { gs, t: M.slab(true) };
    if (dy === bottom)
        return { gs, t: M.slab(true) };
    return { gs, t: undefined };
}
/** The box girder section (shared by box and portal). */
function boxSection(u, dy, j, g) {
    const e = g.e(u), sd = g.sd(u);
    if (e < 0)
        return null;
    const b = barrier(e, dy, sd, j);
    if (b !== undefined)
        return b;
    if (dy === -1)
        return CON.b; // deck slab
    if (dy >= 0)
        return null;
    const x = Math.abs(u - g.c0);
    const bw = Math.max(3, Math.round(g.Bh * 0.33));
    const w = bw + Math.round((dy + 7) * 2 / 5); // webs lean out going up (-7 .. -2)
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
}
const boxBw = (g) => Math.max(3, Math.round(g.Bh * 0.33));

const ARCH = bridgeById('arch');

const DESIGNS = [
    {
        id: 'girder', name: 'PSC 거더교 (I형 거더 여러 줄 + T형 교각)',
        l: 10, span: 30, widen: 0, dyMin: -6, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd, j);
            if (b !== undefined)
                return b;
            if (dy === -1)
                return CON.b; // deck slab
            if (dy >= 0)
                return null;
            const { gs, t } = iGirder(u, dy, g, 4, -5);
            if (t !== undefined)
                return t;
            if (j % 10 === 0 && dy >= -4 && u > gs[0] && u < gs[gs.length - 1])
                return CON.b; // diaphragms
            return null;
        },
        pier(g, ground) {
            const out = [];
            const gs = g._g4 ??= g.girders(4);
            const lo = gs[0] - 1, hi = gs[gs.length - 1] + 1;
            const wide = g.Bh >= 16;
            const cols = wide ? [Math.round(g.c0 - g.Bh / 2), Math.round(g.c0 + g.Bh / 2)] : [g.c0r];
            const depthAt = (u) => {
                if (wide)
                    return 3;
                const d = Math.abs(u - g.c0) - 3;
                return d <= 0 ? 4 : Math.max(2, Math.round(4 - 2 * d / Math.max(1, (hi - lo) / 2 - 3)));
            };
            // the cap: deep over the column, its arms tapering to the outer girders;
            // a pedestal under every girder
            for (let u = lo; u <= hi; u++) {
                const dd = depthAt(u), dn = depthAt(u + (u < g.c0 ? -1 : 1));
                for (let k = 0; k < dd; k++)
                    for (let a = -2; a <= 2; a++) {
                        let t = CON.b;
                        if (k === 0 && gs.includes(u) && Math.abs(a) <= 1)
                            t = PAD;
                        else if (k === dd - 1 && dn < dd)
                            t = CON.st(u < g.c0 ? 0 : 1, true); // the tapering underside
                        else if (Math.abs(a) === 2 && k === dd - 1)
                            t = CON.slab(true); // chamfer along
                        out.push([u, -6 - k, a, t]);
                    }
            }
            // the column: round, flaring across the road into the cap (never past the cap's faces)
            for (const cu of cols) {
                const capBottom = -6 - depthAt(cu);
                for (let dy = capBottom; dy > ground + 1; dy--) {
                    const f = capBottom - dy < 3 ? 3 - (capBottom - dy) : 0;
                    for (let du = -2 - f; du <= 2 + f; du++)
                        for (let a = -2; a <= 2; a++) {
                            const round = du * du + a * a <= 4.9;
                            const flare = f > 0 && Math.abs(a) <= 1 + (f > 1 ? 1 : 0) && !(Math.abs(du) === 2 + f && Math.abs(a) === 2);
                            if (round || flare)
                                out.push([cu + du, dy, a, CON.b]);
                        }
                }
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++) {
                        out.push([cu + du, ground, a, FOOT.b]);
                        if (du * du + a * a <= 7)
                            out.push([cu + du, ground + 1, a, Math.abs(du) === 3 || Math.abs(a) === 3 ? FOOT.slab() : CON.b]);
                    }
            }
            drain(out, cols[0] + 1, 3, -2, ground + 1);
            return out;
        },
    },
    {
        id: 'box', name: '박스 거더교 (경사 복부 박스 + 사각 교각)',
        l: 12, span: 36, widen: 0, dyMin: -7, dyMax: 2, fillFrom: 2, lift: false,
        section: boxSection,
        pier(g, ground) {
            const out = [];
            const bw = boxBw(g), cu = g.c0r, hw = bw + 1, cw = Math.max(1, bw - 2);
            for (let u = cu - hw; u <= cu + hw; u++)
                for (let a = -2; a <= 2; a++) {
                    const x = Math.abs(u - cu);
                    out.push([u, -8, a, x === bw && Math.abs(a) <= 1 ? PAD : CON.b]);
                    out.push([u, -9, a, x === hw ? CON.st(u < cu ? 0 : 1, true) : CON.b]);
                }
            for (let dy = -10; dy > ground + 1; dy--)
                for (let du = -cw; du <= cw; du++)
                    for (let a = -1; a <= 1; a++) {
                        if (Math.abs(du) === cw && Math.abs(a) === 1 && cw > 1)
                            continue; // chamfered corners
                        out.push([cu + du, dy, a, CON.b]);
                    }
            for (let du = -cw - 2; du <= cw + 2; du++)
                for (let a = -3; a <= 3; a++) {
                    out.push([cu + du, ground, a, FOOT.b]);
                    if (Math.abs(du) <= cw + 1 && Math.abs(a) <= 2)
                        out.push([cu + du, ground + 1, a, Math.abs(du) === cw + 1 || Math.abs(a) === 2 ? FOOT.slab() : CON.b]);
                }
            drain(out, cu, 2, -10, ground + 1);
            return out;
        },
    },
    {
        id: 'fixco', name: '일본 고속도로 고가교 (촘촘한 거더 + 홈 파인 기둥 둘 + 긴 캡)',
        l: 8, span: 32, widen: 0, dyMin: -7, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd, j);
            if (b !== undefined)
                return b;
            if (dy === -1)
                return LIGHT.b; // deck slab
            if (dy >= 0)
                return null;
            const { gs, t } = iGirder(u, dy, g, 3, -6, LIGHT);
            // a service pipe along the outer girders, with a box now and then
            if ((u === gs[0] - 1 || u === gs[gs.length - 1] + 1) && dy === -4)
                return j % 16 === 0 ? BOX : PIPE;
            if (t !== undefined)
                return t;
            if (j % 8 === 0 && dy >= -5 && u > gs[0] && u < gs[gs.length - 1])
                return LIGHT.b; // diaphragms
            return null;
        },
        pier(g, ground) {
            const out = [];
            const gs = g._g3 ??= g.girders(3);
            const off = Math.max(3, Math.round(g.Bh * 0.42));
            const cols = [g.c0r - off, g.c0r + off];
            // the long cap: pedestals under the girders, a deeper middle row over
            // each column, panel joints on its faces
            for (let u = g.uL + 1; u <= g.uR - 1; u++) {
                const over = cols.some(c => Math.abs(u - c) <= 3);
                const deep = over ? 3 : 2;
                const end = u === g.uL + 1 || u === g.uR - 1;
                out.push([u, -7, 0, gs.includes(u) ? 'polished_andesite' : LIGHT.b]);
                for (const a of [-1, 1])
                    out.push([u, -7, a, gs.includes(u) ? 'polished_andesite' : null]);
                for (let k = 1; k <= deep; k++)
                    for (let a = -2; a <= 2; a++) {
                        const face = Math.abs(a) === 2;
                        let t = face && (u - g.uL) % 3 === 0 ? 'andesite' : LIGHT.b; // panel joints
                        if (end && k === deep)
                            t = LIGHT.slab(true);
                        out.push([u, -7 - k, a, t]);
                    }
            }
            // two square columns, fluted (a groove down the middle of each face)
            for (const cu of cols) {
                for (let dy = -11; dy > ground + 1; dy--)
                    for (let du = -2; du <= 2; du++)
                        for (let a = -2; a <= 2; a++) {
                            if (Math.abs(du) === 2 && Math.abs(a) === 2)
                                continue;
                            if ((Math.abs(du) === 2 && a === 0) || (Math.abs(a) === 2 && du === 0))
                                continue; // the grooves
                            out.push([cu + du, dy, a, LIGHT.b]);
                        }
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, ground + 1, a, LIGHT.b]);
            }
            drain(out, cols[0], 2, -10, ground + 1); // the drain runs down a groove
            return out;
        },
    },
    {
        id: 'steel_i', name: '강 I형 거더교 (도장 강거더 + 볼트 + 벽식 교각)',
        l: 8, span: 28, widen: 0, dyMin: -5, dyMax: 2, fillFrom: 2, lift: false, steel: true, paint: 'oxidized',
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd, j);
            if (b !== undefined)
                return b;
            if (dy === -1)
                return CON.b; // concrete deck slab
            if (dy >= 0)
                return null;
            const gs = g._g4 ??= g.girders(4);
            const near = gs.find(x => Math.abs(u - x) <= 1);
            if (near !== undefined) {
                const d = u - near;
                if (d === 0)
                    return P.main; // web
                if (dy === -2)
                    return top(P.slab); // top flange
                if (dy === -5)
                    return P.slab; // bottom flange
                if (dy === -3 && j % 4 === 2)
                    return bolt(d < 0 ? 4 : 5); // splice bolts
                return null;
            }
            // cross frames between the girders
            if (j % 8 === 4 && (dy === -3 || dy === -4) && u > gs[0] && u < gs[gs.length - 1])
                return P.bars;
            return null;
        },
        pier(g, ground) {
            const out = [];
            const gs = g._g4 ??= g.girders(4);
            const lo = gs[0] - 1, hi = gs[gs.length - 1] + 1;
            for (let u = lo; u <= hi; u++) {
                const end = u === lo || u === hi;
                out.push([u, -6, 0, gs.includes(u) ? PAD : CON.b]);
                for (const a of [-1, 1])
                    out.push([u, -6, a, end ? null : CON.b]);
                for (let dy = -7; dy > ground; dy--)
                    for (let a = -1; a <= 1; a++) {
                        if (end && a !== 0) {
                            out.push([u, dy, a, stair('andesite_stairs', a > 0 ? 2 : 3)]); // rounded ends
                            continue;
                        }
                        out.push([u, dy, a, (u - lo) % 4 === 0 && Math.abs(a) === 1 ? 'andesite' : CON.b]); // panel joints
                    }
            }
            for (let u = lo - 1; u <= hi + 1; u++)
                for (let a = -2; a <= 2; a++)
                    out.push([u, ground, a, FOOT.b]);
            drain(out, lo + 1, 2, -2, ground + 1);
            return out;
        },
    },
    {
        id: 'portal', name: '라멘 교각 박스교 (기둥 둘 + 가로보 문형 교각)',
        l: 12, span: 36, widen: 0, dyMin: -7, dyMax: 2, fillFrom: 2, lift: false,
        section: boxSection,
        pier(g, ground) {
            const out = [];
            const bw = boxBw(g), cu = g.c0r;
            const cols = [g.uL + 2, g.uR - 2];
            // the cross beam, pads under the webs
            for (let u = g.uL + 1; u <= g.uR - 1; u++)
                for (let a = -2; a <= 2; a++) {
                    const x = Math.abs(u - cu);
                    out.push([u, -8, a, x === bw && Math.abs(a) <= 1 ? PAD : CON.b]);
                    out.push([u, -9, a, CON.b]);
                    out.push([u, -10, a, Math.abs(a) === 2 ? CON.slab(true) : CON.b]);
                }
            for (const c of cols) {
                const inward = c < cu ? 1 : -1;
                for (let a = -2; a <= 2; a++) {
                    out.push([c + inward * 2, -11, a, CON.st(inward > 0 ? 1 : 0, true)]); // haunches
                    out.push([c + inward * 3, -11, a, null]);
                }
                for (let dy = -11; dy > ground; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -2; a <= 2; a++)
                            if (!(Math.abs(du) === 1 && Math.abs(a) === 2))
                                out.push([c + du, dy, a, CON.b]);
                for (let du = -2; du <= 2; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([c + du, ground, a, FOOT.b]);
            }
            drain(out, cols[0], 3, -8, ground + 1);
            return out;
        },
    },
    {
        id: 'slab', name: '슬래브교 (두꺼운 판 + 원형 기둥 열, 램프·낮은 곳)',
        l: 8, span: 16, widen: 0, dyMin: -3, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return null;
            const b = barrier(e, dy, sd, j);
            if (b !== undefined)
                return b;
            if (dy === -1 || dy === -2)
                return CON.b;
            if (dy === -3)
                return e === 2 ? CON.st(IN_W(sd), true) : e > 2 ? CON.b : null; // chamfered edges
            return null;
        },
        pier(g, ground) {
            const out = [];
            const n = Math.max(2, Math.round((g.uR - g.uL - 6) / 6) + 1);
            for (let k = 0; k < n; k++) {
                const cu = Math.round(g.uL + 3 + k * (g.uR - g.uL - 6) / (n - 1));
                for (let du = -1; du <= 1; du++)
                    for (let a = -1; a <= 1; a++)
                        out.push([cu + du, -4, a, du === 0 && a === 0 ? CON.b : CON.slab(true)]); // capital
                for (let dy = -5; dy > ground; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -1; a <= 1; a++)
                            if (du * du + a * a <= 1)
                                out.push([cu + du, dy, a, CON.b]);
                for (let du = -1; du <= 1; du++)
                    for (let a = -1; a <= 1; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
                if (k === 0)
                    drain(out, cu, 2, -4, ground + 1);
            }
            return out;
        },
    },
    { ...ARCH, id: 'arch', name: '석조 아치교 (오픈 스팬드럴)', group: undefined },
];

export const ROAD_BRIDGES = DESIGNS.map(d => ({ value: d.id, label: d.name }));

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
    const span = d.fixed ? d.span : (Math.floor(v.span) || d.span);
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
