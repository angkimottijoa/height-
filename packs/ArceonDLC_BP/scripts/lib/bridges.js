/*
 * Bridges under the railway: 4 steel and 5 concrete designs.
 *
 * A design is a cross section (what sits at sideways offset u, height dy and
 * position j along the span) swept under the track, plus a pier stood at
 * every span end down to the ground. Everything is made facing north: +u =
 * right of travel (east), j counts along the travel direction (north),
 * dy = 0 is the ballast level (the curve points).
 *
 * Trusses are straight: each span is laid on the chord between its two
 * piers, so a curved line becomes a chain of straight trusses turning at the
 * piers, as real ones do (design.straight).
 *
 * Details are drawn with small blocks the way builders do: bolts are buttons
 * on the steel faces, stiffeners are plates and slabs, the joints between
 * concrete segments are chains on the faces, railings are bars. Stone work is
 * never one flat block: it is a weathered mix of stone, stone bricks, tuff,
 * andesite, cracked and mossy bricks (mossier near the ground).
 * After the sweep (polish): thin parts joined only at corners on a diagonal
 * are closed up, bars and walls are connected to their neighbours, and a
 * bolt that lost its plate turns to one beside it.
 */
import { parseBlock, parsePattern } from '../core/blocks.js';

// ------------------------------------------------------------ block helpers
const ST = (id, st) => id + '[' + Object.entries(st).map(([k, v]) => `${k}=${v}`).join(',') + ']';
const top = (id) => id + '[top]';
const bolt = (f) => ST('polished_blackstone_button', { facing_direction: f });
const stair = (id, w, up = false) => ST(id, { weirdo_direction: w, upside_down_bit: up });
const rod = (id, f) => ST(id, { facing_direction: f });
// weirdo_direction: east 0, west 1, south 2, north 3. facing_direction: down 0, up 1, north 2, south 3, west 4, east 5
const OUT_W = (sd) => sd < 0 ? 1 : 0, IN_W = (sd) => sd < 0 ? 0 : 1, OUT_F = (sd) => sd < 0 ? 4 : 5;
const CHAIN = 'iron_chain';
export { ST, top, bolt, stair, OUT_W, IN_W, OUT_F, CHAIN, mix };

// ------------------------------------------------------------ stone mixes
/**
 * A material as a weighted mix: [weight, block, slab, stairs] rows.
 * .b = the block mix, .slab(top?) = slabs, .st(weirdo, upside) = stairs.
 */
function mix(rows) {
    const join = (f) => rows.map(r => `${r[0]}%${f(r)}`).join(',');
    return {
        b: join(r => r[1]),
        slab: (high = false) => join(r => high ? top(r[2]) : r[2]),
        st: (w, up = false) => join(r => stair(r[3], w, up)),
    };
}
/** Weathered masonry for piers and abutments. */
export const MASON = mix([
    [34, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [18, 'stone_bricks', 'stone_brick_slab', 'stone_brick_stairs'],
    [12, 'tuff', 'tuff_slab', 'tuff_stairs'],
    [12, 'andesite', 'andesite_slab', 'andesite_stairs'],
    [8, 'cracked_stone_bricks', 'stone_brick_slab', 'stone_brick_stairs'],
    [8, 'mossy_stone_bricks', 'mossy_stone_brick_slab', 'mossy_stone_brick_stairs'],
    [8, 'tuff_bricks', 'tuff_brick_slab', 'tuff_brick_stairs'],
]);
/** Footings, wet and mossy where they meet the ground. */
export const FOOT = mix([
    [25, 'mossy_cobblestone', 'mossy_cobblestone_slab', 'mossy_cobblestone_stairs'],
    [25, 'mossy_stone_bricks', 'mossy_stone_brick_slab', 'mossy_stone_brick_stairs'],
    [20, 'cobblestone', 'cobblestone_slab', 'stone_stairs'],
    [15, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [15, 'tuff', 'tuff_slab', 'tuff_stairs'],
]);
/** Rough stone and andesite (the beam bridge). */
export const ROUGH = mix([
    [55, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [45, 'andesite', 'andesite_slab', 'andesite_stairs'],
]);
/** Off-white weathered faces (the viaduct). */
export const WHITE = mix([
    [55, 'white_concrete', 'white_concrete_slab', 'white_concrete_stairs'],
    [25, 'calcite', 'polished_diorite_slab', 'polished_diorite_stairs'],
    [20, 'polished_diorite', 'polished_diorite_slab', 'polished_diorite_stairs'],
]);
/** Cast work: smooth stone with stone and andesite patches. */
export const CAST = mix([
    [45, 'smooth_stone', 'smooth_stone_slab', 'normal_stone_stairs'],
    [30, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [15, 'andesite', 'andesite_slab', 'andesite_stairs'],
    [10, 'tuff', 'tuff_slab', 'tuff_stairs'],
]);

/** Box girders: rough andesite with stone and tuff, no smooth stone. */
export const BOXCAST = mix([
    [55, 'andesite', 'andesite_slab', 'andesite_stairs'],
    [25, 'stone', 'normal_stone_slab', 'normal_stone_stairs'],
    [12, 'tuff', 'tuff_slab', 'tuff_stairs'],
    [8, 'cobblestone', 'cobblestone_slab', 'stone_stairs'],
]);

// ------------------------------------------------------------ steel paints
/** Steel colours: the copper ages, or painted grey. */
export const STEEL = {
    weathered: { name: '녹색 도장 (풍화 구리)', pre: 'weathered_' },
    oxidized: { name: '청록 도장 (녹슨 구리)', pre: 'oxidized_' },
    exposed: { name: '갈색 (산화 구리)', pre: 'exposed_' },
    grey: { name: '회색 도장', grey: true },
};
export function steelPaint(id) {
    const s = STEEL[id] ?? STEEL.weathered;
    if (s.grey)
        return {
            main: 'polished_andesite', slab: 'polished_andesite_slab', stairs: 'polished_andesite_stairs',
            bars: 'iron_bars', grate: 'iron_bars', post: 'andesite_wall', trap: 'iron_trapdoor', shoe: 'polished_tuff',
            chis: 'polished_tuff', stiff: () => 'andesite_wall',
        };
    const p = s.pre;
    return {
        main: p + 'cut_copper', slab: p + 'cut_copper_slab', stairs: p + 'cut_copper_stairs', bars: p + 'copper_bars',
        grate: p + 'copper_grate', post: p + 'copper_bars', trap: p + 'copper_trapdoor', shoe: p + 'chiseled_copper', chis: p + 'chiseled_copper',
        stiff: (f) => rod(p + 'lightning_rod', f),
    };
}

// ------------------------------------------------------------ trusses
/**
 * A through truss span L long, panels P, 15 high (room for the catenary):
 *  warren: inclined end posts, diagonals alternating, verticals at the
 *          middle panel points, top chord over the inner panels;
 *  square: rectangular, every panel a square with both diagonals (X),
 *          verticals at every panel point, top chord end to end.
 * Diagonals get stair fillets, panel points gusset plates and bolt groups;
 * portal struts with knee braces and X bracing run overhead.
 */
function truss(kind, L, P) {
    const H = 15;
    const verticals = kind === 'warren' ? [P, 2 * P, 3 * P] : Array.from({ length: L / P + 1 }, (_, i) => i * P);
    const lowNodes = kind === 'warren' ? [0, 2 * P, 4 * P] : verticals, topNodes = kind === 'warren' ? [P, 3 * P] : verticals;
    const near = (jj, list) => list.some(n => Math.abs(jj - n) <= 1);
    const topFrom = kind === 'warren' ? P : 0, topTo = kind === 'warren' ? L - P : L;
    return (u, dy, j, g) => {
        const e = g.e(u), sd = g.sd(u), Pt = g.paint;
        const jj = Math.min(L, Math.max(0, j));
        const topChord = jj >= topFrom && jj <= topTo;
        if (e < 0) {
            if (dy === 0 && jj % 2 === 0 || dy === H && topChord && jj % 2 === 1)
                return bolt(OUT_F(sd));
            if (near(jj, lowNodes) && dy >= 1 && dy <= 2 || near(jj, topNodes) && topChord && dy >= H - 2 && dy <= H - 1)
                return bolt(OUT_F(sd)); // bolt groups on the gusset plates
            return null;
        }
        if (e === 0) {
            if (dy === -1)
                return top(Pt.slab); // inspection walkway outside the truss
            if (dy === 0)
                return jj % 4 === 0 ? Pt.main : Pt.bars;
            return null;
        }
        if (e === 1) {
            if (dy === -1 || dy === 0)
                return Pt.main; // bottom chord
            if (dy === H)
                return topChord ? Pt.main : null;
            if (dy === H + 1)
                return topChord ? Pt.slab : null;
            if (dy < 1 || dy > H - 1)
                return null;
            if (near(jj, lowNodes) && dy <= 2 || topChord && near(jj, topNodes) && dy >= H - 2)
                return Pt.chis; // gusset plates
            if (verticals.includes(jj))
                return Pt.main; // verticals (the catenary hangs from them)
            if (kind === 'warren') {
                const k = Math.floor(jj / P), t = jj % P, up = k % 2 === 0;
                if (up ? dy === t + 1 : dy === P - t)
                    return Pt.main;
                if (up ? (t >= 1 && dy === t) : (t <= P - 2 && dy === P - 1 - t))
                    return stair(Pt.stairs, up ? 2 : 3, true);
                return null;
            }
            const t = jj % P;
            if (dy === t || dy === P - t)
                return Pt.main; // the X in every square
            if (t >= 2 && dy === t - 1 || t <= P - 2 && dy === P - 1 - t)
                return stair(Pt.stairs, dy === t - 1 ? 2 : 3, true);
            return null;
        }
        const inside = u > g.uL + 1 && u < g.uR - 1;
        const strut = verticals.includes(jj) || (kind === 'square' && (jj === 0 || jj === L));
        if (topChord && inside) {
            if (e === 2 && dy === H && strut)
                return stair(Pt.stairs, IN_W(sd), true); // knee braces
            if (dy === H + 1) {
                if (strut)
                    return Pt.slab; // top struts
                const f = (u - g.uL - 1) / (g.uR - g.uL - 2);
                const prev = Math.max(topFrom, ...verticals.filter(v => v <= jj)), next = Math.min(topTo, ...verticals.filter(v => v > jj));
                const q = (jj - prev) / Math.max(1, next - prev), tol = 1 / (g.uR - g.uL - 2);
                if (Math.abs(f - q) <= tol || Math.abs(1 - f - q) <= tol)
                    return Pt.bars; // X bracing overhead
            }
        }
        if (dy === -1 || dy === 0)
            return Pt.main; // deck plate; at ballast level too, the sleepers lie on it
        if (dy === -2) {
            if (jj % Math.max(3, Math.round(P / 2)) === 0)
                return Pt.main; // floor beams
            if (g.rails.includes(u))
                return top(Pt.slab); // stringers
        }
        return null;
    };
}
/**
 * The Warren truss as first designed (4 panels of 14 per 56-block span):
 * inclined end posts, top chord over the middle panels, diagonals with stair
 * fillets, slender bar verticals, gusset plates with bolt groups at every
 * panel point, portal struts with knee braces and X bracing overhead (above
 * the catenary), floor beams and stringers under the open steel deck.
 * Each span is straight; j counts along it (0..56).
 */
function warren(u, dy, j, g) {
    const e = g.e(u), sd = g.sd(u), P = g.paint;
    const jj = Math.min(56, Math.max(0, j)), k = Math.min(3, Math.floor(jj / 14)), t = jj - k * 14;
    const node = (n) => Math.abs(jj - n) <= 1;
    const topNode = node(14) || node(42), lowNode = node(0) || node(28) || node(56);
    const topChord = jj >= 14 && jj <= 42;
    if (e < 0) {
        if (dy === 0 && Math.round(jj) % 2 === 0 || dy === 15 && topChord && Math.round(jj) % 2 === 1)
            return bolt(OUT_F(sd));
        if (lowNode && dy >= 1 && dy <= 2 || topNode && dy >= 13 && dy <= 14)
            return bolt(OUT_F(sd)); // bolt groups on the gussets
        return null;
    }
    if (e === 0) {
        if (dy === -1)
            return top(P.slab); // inspection walkway outside the truss
        if (dy === 0)
            return Math.round(jj) % 4 === 0 ? P.main : P.bars;
        return null;
    }
    if (e === 1) {
        if (dy === -1 || dy === 0)
            return P.main; // bottom chord
        if (dy === 15)
            return topChord ? P.main : null;
        if (dy === 16)
            return topChord ? P.slab : null;
        if (dy < 1 || dy > 14)
            return null;
        if (lowNode && dy <= 2 || topNode && dy >= 13)
            return P.chis; // gusset plates
        const up = k % 2 === 0;
        if (up ? dy === t + 1 : dy === 14 - t)
            return P.main;
        if (up ? (t >= 1 && dy === t) : (t <= 12 && dy === 13 - t))
            return stair(P.stairs, up ? 2 : 3, true);
        if (jj === 14 || jj === 28 || jj === 42)
            return P.bars; // verticals
        return null;
    }
    const inside = u > g.uL + 1 && u < g.uR - 1;
    if (topChord && inside) {
        // portal struts with knee braces, X bracing between them
        if (e === 2 && dy === 15 && (jj === 14 || jj === 42))
            return stair(P.stairs, IN_W(sd), true);
        if (dy === 16) {
            if (jj === 14 || jj === 28 || jj === 42)
                return P.slab;
            const f = (u - g.uL - 1) / (g.uR - g.uL - 2), q = ((jj - 14) % 14) / 14;
            const tol = 1 / (g.uR - g.uL - 2);
            if (Math.abs(f - q) <= tol || Math.abs(1 - f - q) <= tol)
                return P.bars;
        }
    }
    if (dy === -1 || dy === 0)
        return P.main; // deck plate; the sleepers lie on it (open deck)
    if (dy === -2) {
        if (jj % 7 === 0)
            return P.main; // floor beams
        if (g.rails.includes(u))
            return top(P.slab); // stringers
    }
    return null;
}
/** A cutwater pier in masonry under a truss: cap, bearing shoes, rounded noses. */
function trussPier(g, ground) {
    const out = [], half = Math.ceil(g.Bh) - 1, P = g.paint;
    for (let u = -half - 1; u <= half + 1; u++)
        for (let a = -2; a <= 2; a++)
            out.push([g.c0r + u, -3, a, MASON.b]);
    for (let u = -half - 1; u <= half + 1; u++) {
        out.push([g.c0r + u, -4, 2, MASON.slab(true)]);
        out.push([g.c0r + u, -4, -2, MASON.slab(true)]);
    }
    for (const uu of [g.uL + 1, g.uR - 1])
        for (let a = -1; a <= 1; a++) {
            out.push([uu, -2, a, P.shoe]); // bearing shoes under the trusses
            out.push([uu + (uu < g.c0 ? -1 : 1), -2, a, bolt(uu < g.c0 ? 4 : 5)]);
        }
    column(out, g, ground, -4, half - 1, 1, MASON.b, () => null);
    for (let dy = -4; dy > ground; dy--)
        for (const s of [-1, 1]) {
            out.push([g.c0r + s * half, dy, 0, MASON.b]); // rounded noses
            out.push([g.c0r + s * half, dy, 1, MASON.st(2)]);
            out.push([g.c0r + s * half, dy, -1, MASON.st(3)]);
        }
    footing(out, g, ground, half + 2, 3);
    return out;
}

// ------------------------------------------------------------ designs
/**
 * Each design: id, name, group, l (repeat length), span (pier spacing; fixed:
 * spans follow the design), straight (spans laid as straight chords), widen
 * (extra deck each side), dy range, section(u, dy, j, g) -> block text | null,
 * pier(g, groundDy) -> [[u, dy, a, text]], poleAt (catenary on the truss
 * verticals: positions within a span).
 */
export const BRIDGES = [
    // ---------------------------------------------------------- steel 1
    // Deck plate girders as on the Yamanote line (Ueno, Akihabara): a deep
    // outer girder each side with a stiffener plate every 6 blocks between
    // the walkway brackets and two rivet rows, a grated walkway on triangular
    // brackets outside it with a cable trough and the low grating parapet,
    // girders under every rail, floor beams and cross frames, and steel bents
    // (columns + cross beam on bearing shoes) as piers.
    {
        id: 'plate', name: '강판형교 (상로 플레이트 거더, 야마노테선 고가 양식)', group: 'steel',
        l: 12, span: 18, widen: 0, dyMin: -7, dyMax: 4, steel: true, fillFrom: 3, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            const OUT = OUT_W(sd), IN = IN_W(sd);
            // the parapet as on the Yamanote line, kept low (no ballast on the deck):
            // two courses of grating with bolt heads, chains hung along the top
            // course, a hopper coping and an iron bar fence on it
            if (e < 0) {
                if (dy === -1)
                    return j % 2 === 1 ? bolt(OUT_F(sd)) : null; // rivets on the edge channel
                if (dy === 0)
                    return bolt(OUT_F(sd)); // bolt heads on the grating
                if (dy === 1)
                    return CHAIN; // chains hung from the coping
                return null;
            }
            if (e === 0) {
                if (dy === -1)
                    return P.main; // edge channel
                if (dy === -2)
                    return top(P.slab);
                if (dy === 0 || dy === 1)
                    return P.grate; // grating panels
                if (dy === 2)
                    return ST('hopper', { facing_direction: 0, toggle_bit: false }); // coping
                if (dy === 3)
                    return 'iron_bars'; // fence
                return null;
            }
            if (e === 1 || e === 2) {
                if (dy === -1)
                    return P.main;
                if (dy === 0)
                    return e === 1 ? P.grate : P.main; // walkway grating level with the ballast, cable trough
                if (dy === 1 && e === 2)
                    return ST(P.trap, { direction: 0, open_bit: false, upside_down_bit: false }); // cable trough lid
                // triangular walkway brackets on the girder, every 6
                if (j % 6 === 0) {
                    if (dy === -2)
                        return e === 2 ? P.main : stair(P.stairs, IN, true);
                    if (dy === -3 && e === 2)
                        return stair(P.stairs, IN, true);
                }
                if (e === 2) {
                    if (dy === -7)
                        return P.slab; // outer bottom flange
                    if (j % 6 === 3 && dy >= -6 && dy <= -3)
                        return P.main; // web stiffener plate, between the brackets
                    if ((dy === -3 || dy === -6) && j % 2 === 0 && j % 6 !== 0)
                        return bolt(OUT_F(sd)); // flange rivet rows along the web
                }
                return null;
            }
            if (e === 3)
                return dy <= -1 ? P.main : null; // outer girder web
            if (e === 4) {
                if (dy === 0)
                    return P.slab; // ballast curb
                if (dy === -1)
                    return P.main;
                if (dy === -7)
                    return P.slab;
                if (j % 6 === 3 && dy >= -6 && dy <= -3)
                    return P.main; // stiffener plate
                if (dy === -2)
                    return top(P.slab);
                return null;
            }
            if (dy === 0)
                // steel under the sleepers, open grating between and beside the tracks
                return g.rails.some(r => Math.abs(u - r) <= 2) ? P.main : P.grate;
            if (dy > 0)
                return null;
            if (dy === -1)
                return P.main; // deck plate
            // girders under every rail
            for (const r of g.rails) {
                const d = u - r;
                if (d === 0)
                    return P.main;
                if (Math.abs(d) === 1) {
                    if (dy === -2)
                        return top(P.slab);
                    if (dy === -7)
                        return P.slab;
                    if (j % 6 === 3 && dy >= -6 && dy <= -3)
                        return P.main; // stiffener plate
                    if (dy === -6 && j % 2 === 1)
                        return bolt(d < 0 ? 4 : 5);
                }
            }
            // floor beams, cross frames and the lower lateral struts
            if (j % 6 === 3) {
                if (dy === -2)
                    return P.main;
                if (dy === -5)
                    return P.bars;
                if (dy === -3)
                    return stair(P.stairs, sd < 0 ? 0 : 1, true);
            }
            if (j % 6 === 0 && dy === -7)
                return P.bars;
            return null;
        },
        pier(g, ground) {
            const out = [], P = g.paint;
            // two columns, as the old bents have (a third only under a very wide deck)
            const cols = [g.uL + 3, g.uR - 3];
            if (g.Bh >= 17)
                cols.push(g.c0r);
            // the cross beam: a box girder with bearing shoes under every girder
            const girders = [g.uL + 3, g.uR - 3, ...g.rails];
            for (let u = g.uL + 2; u <= g.uR - 2; u++)
                for (let a = -1; a <= 1; a++) {
                    out.push([u, -8, a, girders.includes(u) && a === 0 ? P.shoe : P.main]);
                    out.push([u, -9, a, P.main]);
                }
            for (let u = g.uL + 2; u <= g.uR - 2; u++) {
                for (const a of [-2, 2]) {
                    out.push([u, -9, a, top(P.slab)]); // bottom flange lips
                    if ((u - g.uL) % 2 === 1)
                        out.push([u, -8, a, bolt(a > 0 ? 2 : 3)]);
                }
            }
            for (const u of girders)
                for (const a of [-2, 2])
                    out.push([u, -8, a, P.chis]); // bearing stiffeners over the shoes
            // the arched soffit of the bent, as on the old Tokyo viaducts: between two
            // columns the cross beam curves down into them (deep at the columns,
            // flat in the middle), and the ends taper off as brackets past them;
            // stairs smooth every step, rivets along the curve
            const sorted = [...cols].sort((p, q) => p - q);
            const depth = new Map();
            const deepen = (u, d) => depth.set(u, Math.max(depth.get(u) ?? 0, d));
            for (let k = 0; k + 1 < sorted.length; k++) {
                const c1 = sorted[k] + 2, c2 = sorted[k + 1] - 2, mid = (c1 + c2) / 2, half = Math.max(1, (c2 - c1) / 2);
                for (let u = c1; u <= c2; u++)
                    deepen(u, Math.round(Math.min(4, half / 2) * ((u - mid) / half) ** 2));
            }
            for (const [from, to, step] of [[sorted[0] - 2, g.uL + 2, -1], [sorted[sorted.length - 1] + 2, g.uR - 2, 1]])
                for (let u = from, d = 2; step < 0 ? u >= to : u <= to; u += step, d--)
                    deepen(u, Math.max(0, d));
            for (const [u, d] of depth) {
                const next = (du) => depth.get(u + du) ?? 0;
                for (let k = 1; k <= d; k++)
                    for (let a = -1; a <= 1; a++) {
                        // the lowest block of a step that falls toward a neighbour: a stair
                        let t = P.main;
                        if (k === d && next(1) > d && next(-1) < d)
                            t = stair(P.stairs, 0, true);
                        else if (k === d && next(-1) > d && next(1) < d)
                            t = stair(P.stairs, 1, true);
                        out.push([u, -9 - k, a, t]);
                    }
                if (d >= 1 && (u - g.uL) % 2 === 0)
                    for (const a of [-2, 2])
                        out.push([u, -10, a, bolt(a > 0 ? 2 : 3)]); // rivets along the haunch
            }
            // columns: 3x3 steel boxes with a flared capital under the cross beam,
            // a bolted splice band halfway and a chiseled collar over the base,
            // on a base plate over a stepped stone plinth (plain faces, no rods)
            const splice = Math.round((-10 + ground) / 2);
            for (const cu of cols) {
                for (let dy = -10; dy > ground + 2; dy--)
                    for (let du = -2; du <= 2; du++)
                        for (let a = -2; a <= 2; a++) {
                            const ad = Math.abs(du), aa = Math.abs(a);
                            const face = ad === 2 && aa === 0 || aa === 2 && ad === 0;
                            if (ad <= 1 && aa <= 1)
                                // built-up box: plain faces, trimmed corners, bands at the splice and the foot
                                out.push([cu + du, dy, a, dy === splice || dy === ground + 3 || (ad === 1 && aa === 1) ? P.chis : P.main]);
                            else if (dy === -10 && ad + aa < 4)
                                // the capital: upside-down stairs flaring out to the cross beam
                                out.push([cu + du, dy, a, ad === 2 ? stair(P.stairs, du < 0 ? 0 : 1, true) : stair(P.stairs, a > 0 ? 2 : 3, true)]);
                            else if (face && dy === splice)
                                out.push([cu + du, dy, a, P.slab]); // splice cover plate
                            else if ((ad === 2 && aa === 1 || aa === 2 && ad === 1) && dy === splice - 1)
                                out.push([cu + du, dy, a, bolt(ad === 2 ? (du < 0 ? 4 : 5) : (a < 0 ? 3 : 2))]); // splice bolts
                        }
                // knee braces into the cross beam
                for (const s of [-1, 1]) {
                    if (cu + s * 3 > g.uL + 2 && cu + s * 3 < g.uR - 2) {
                        out.push([cu + s * 3, -10, 0, top(P.slab)]);
                        out.push([cu + s * 3, -10, 1, top(P.slab)]);
                        out.push([cu + s * 3, -10, -1, top(P.slab)]);
                    }
                }
                // base plate with anchor bolts, stepped plinth, footing
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++) {
                        const corner = Math.abs(du) === 2 && Math.abs(a) === 2;
                        out.push([cu + du, ground + 2, a, corner ? bolt(1) : P.slab]);
                        out.push([cu + du, ground + 1, a, MASON.b]);
                    }
                for (let k = -2; k <= 2; k++) {
                    out.push([cu - 3, ground + 1, k, MASON.st(0)]);
                    out.push([cu + 3, ground + 1, k, MASON.st(1)]);
                    out.push([cu + k, ground + 1, 3, MASON.st(2)]);
                    out.push([cu + k, ground + 1, -3, MASON.st(3)]);
                }
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
            }
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- steel 2
    {
        id: 'truss', name: '하로 워렌 트러스교 (삼각형, 경간 56칸, 경간마다 직선)', group: 'steel',
        l: 56, span: 56, fixed: true, straight: true, widen: 2, dyMin: -2, dyMax: 17, steel: true, openDeck: true,
        poleAt: [14, 42], wholePoles: true,
        section: warren,
        lamps: (u, dy, j, g, e) => e === 2 && dy === 14 && (j === 14 || j === 42) ? 'light_block_12' : e === 0 && dy === 1 && j % 14 === 7 ? 'light_block_13' : e === 0 && dy >= 1 ? null : undefined,
        pier: trussPier,
    },
    // ---------------------------------------------------------- steel 3
    {
        id: 'truss3', name: '하로 사각 트러스교 (정사각형 3칸, 경간 45칸, 경간마다 직선)', group: 'steel',
        l: 45, span: 45, fixed: true, straight: true, widen: 2, dyMin: -2, dyMax: 17, steel: true, openDeck: true,
        poleAt: [0, 15, 30], trussPlanes: true,
        lamps: (u, dy, j, g, e) => e === 2 && dy === 14 && j % 15 === 0 ? 'light_block_12' : e === 0 && dy === 1 && j % 15 === 7 ? 'light_block_13' : e === 0 && dy >= 1 ? null : undefined,
        section: truss('square', 45, 15),
        pier: trussPier,
    },
    // ---------------------------------------------------------- steel 4
    // A continuous steel box girder: leaning webs (stair fillets at every
    // step), a bottom flange with longitudinal stiffeners and cross ribs
    // underneath, cantilever brackets every 6, a stiffener rib along the webs,
    // bolted field splices every 24, drain pipes, a parapet with railing; on
    // two masonry columns under the webs with a cap beam and bearing shoes.
    {
        id: 'steelbox', name: '강상자형교 (스틸 박스 거더, 두 기둥 교각)', group: 'steel',
        l: 24, span: 24, widen: 0, dyMin: -8, dyMax: 1, steel: true,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            const we = (d) => 4 + Math.floor((-2 - d) / 2); // the webs lean in
            const splice = [23, 0, 1].includes(j % 24);
            if (e < 0)
                return dy === 0 && j % 2 === 0 ? bolt(OUT_F(sd)) : null;
            if (e === 0) {
                if (dy === -1 || dy === 0)
                    return P.main; // parapet
                if (dy === 1)
                    return j % 3 === 0 ? P.slab : P.bars;
                return null;
            }
            if (dy === -1)
                return P.main;
            if (dy >= 0)
                return null;
            if (dy === -8) {
                // under the bottom flange: stiffeners along, ribs across
                if (e < we(-6))
                    return null;
                if (j % 6 === 0)
                    return top(P.slab);
                return (e - we(-6)) % 4 === 1 ? top(P.slab) : null;
            }
            if (dy === -7)
                return e >= we(-6) ? P.main : e === we(-6) - 1 ? top(P.slab) : null; // bottom flange
            const w = we(dy);
            if (e === w)
                return splice ? P.chis : P.main;
            if (e > w)
                return j % 12 === 6 && dy >= -6 ? P.main : null; // diaphragms inside
            if (e === w - 1) {
                if (we(dy + 1) < w)
                    return stair(P.stairs, IN_W(sd), true); // fillet at the lean
                if (splice && (dy === -3 || dy === -5))
                    return bolt(OUT_F(sd));
                if (dy === -5)
                    return top(P.slab); // horizontal stiffener rib
            }
            if (j % 6 === 0) {
                if (dy === -2 && e < w)
                    return e === w - 1 ? P.main : top(P.slab); // cantilever brackets
                if (dy === -3 && e === we(-2) - 1)
                    return stair(P.stairs, IN_W(sd), true);
            }
            if (e === 1 && dy >= -4 && j % 16 === 8)
                return P.stiff(0); // drain pipes
            return null;
        },
        pier(g, ground) {
            const out = [], P = g.paint;
            const lo = g.uL + 6, hi = g.uR - 6;
            // cap beam: masonry with stair ends, bearing shoes under the webs
            for (let u = lo - 1; u <= hi + 1; u++)
                for (let a = -1; a <= 1; a++) {
                    const shoe = (u === lo || u === hi) && a === 0;
                    out.push([u, -9, a, shoe ? P.shoe : MASON.b]);
                    out.push([u, -10, a, u === lo - 1 || u === hi + 1 ? MASON.st(u < g.c0 ? 0 : 1, true) : MASON.b]);
                }
            for (let u = lo - 1; u <= hi + 1; u++)
                for (const a of [-2, 2])
                    out.push([u, -9, a, MASON.slab(true)]);
            // two columns under the webs, chamfered with walls, a plinth each
            for (const cu of [lo + 1, hi - 1]) {
                for (let dy = -11; dy > ground + 1; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -1; a <= 1; a++)
                            out.push([cu + du, dy, a, Math.abs(du) === 1 && Math.abs(a) === 1 ? 'stone_brick_wall' : MASON.b]);
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, ground + 1, a, Math.abs(du) === 2 || Math.abs(a) === 2 ? FOOT.slab() : FOOT.b]);
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
            }
            // a tie beam between the columns near the ground
            for (let u = lo + 2; u <= hi - 2; u++)
                out.push([u, ground + 2, 0, MASON.slab()]);
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 1
    // Precast I-girders in rough stone and andesite: flanges, bulbs,
    // diaphragms, New Jersey barriers, drip edges, deck joints; a hammerhead
    // pier with a stepped (stair) taper and bearing pads.
    {
        id: 'psci', name: 'PSC I형 빔교 (돌·거친 안산암)', group: 'concrete', fillFrom: 2,
        l: 10, span: 22, widen: 0, dyMin: -6, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), M = ROUGH;
            if (e < 0)
                return (dy === -1 || dy === -2) && j % 10 === 0 ? CHAIN : dy === -2 && j % 10 === 5 ? rod('lightning_rod', 0) : null;
            if (e === 0) {
                if (dy === -1 || dy === 0)
                    return M.b;
                if (dy === 1)
                    return M.slab();
                if (dy === -2)
                    return M.slab(true); // drip edge
                return null;
            }
            if (e === 1 && dy === 0)
                return M.st(OUT_W(sd)); // New Jersey barrier face
            if (dy === -1)
                return M.b;
            if (dy >= 0)
                return null;
            const gs = g.girders(3);
            for (const r of gs) {
                const d = u - r;
                if (d === 0 && dy >= -5)
                    return M.b;
                if (Math.abs(d) === 1) {
                    if (dy === -2)
                        return M.slab(true); // top flange
                    if (dy === -5)
                        return M.slab(); // bottom bulb
                    if (dy === -4)
                        return M.st(d < 0 ? 0 : 1, false); // bulb taper
                }
            }
            if (j % 10 === 0 && dy >= -4 && u > gs[0] && u < gs[gs.length - 1])
                return M.b; // diaphragms
            return null;
        },
        pier(g, ground) {
            const out = [];
            let w = Math.floor(g.Bh) - 2;
            for (let t = 0, dy = -6; w >= 2; t++, dy--, w -= 2)
                for (let u = -w; u <= w; u++)
                    for (let a = -1; a <= 1; a++) {
                        const uu = g.c0r + u;
                        let b = MASON.b;
                        if (t === 0 && g.girders(3).includes(uu) && a === 0)
                            b = 'polished_tuff'; // bearing pads
                        else if (t > 0 && Math.abs(u) === w)
                            b = MASON.st(u < 0 ? 0 : 1, true);
                        out.push([uu, dy, a, b]);
                    }
            const capBottom = -6 - Math.ceil((Math.floor(g.Bh) - 3) / 2);
            column(out, g, ground, capBottom, 1, 1, MASON.b, (u, dy, a) => Math.abs(u) === 2 && Math.abs(a) === 2 ? null : (Math.abs(u) === 2 || Math.abs(a) === 2) && dy % 4 === 0 ? MASON.slab(true) : null);
            footing(out, g, ground, 4, 3);
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 2
    // The railway viaduct of the photo: weathered white faces with a green
    // band, a chain at every segment joint, a stepped stone soffit with ribs
    // along and beams across, on portal piers (green-banded columns, beam).
    {
        id: 'viaduct', name: '철도 고가 박스교 (흰 면 + 녹색 띠, 사진 양식)', group: 'concrete',
        l: 8, span: 16, widen: 0, dyMin: -8, dyMax: 2,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u);
            if (e < 0)
                return dy <= 1 && dy >= -6 && j % 4 === 0 ? CHAIN : null; // segment joints
            if (e === 0) {
                if (dy >= -6 && dy <= 1)
                    return dy === -3 || dy === -4 ? 'weathered_copper' : WHITE.b;
                if (dy === 2)
                    return WHITE.slab();
                return null;
            }
            if (dy === -1)
                return BOXCAST.b;
            if (dy === -7)
                return e === 1 ? MASON.slab(true) : MASON.b;
            if (dy === -6 && e === 1)
                return MASON.st(OUT_W(sd), true);
            if (dy === -8 && e >= 2)
                return j % 8 === 0 || (e - 2) % 4 === 0 ? MASON.slab(true) : null; // soffit ribs
            return null;
        },
        pier(g, ground) {
            const out = [], half = Math.floor(g.Bh) - 3;
            for (let u = -half - 1; u <= half + 1; u++)
                for (let a = -1; a <= 1; a++) {
                    out.push([g.c0r + u, -9, a, MASON.b]);
                    out.push([g.c0r + u, -10, a, Math.abs(u) > half - 2 ? MASON.b : (Math.abs(u) === half - 2 ? MASON.st(u < 0 ? 1 : 0, true) : null)]);
                }
            for (const s of [-1, 1]) {
                for (let dy = -11; dy > ground; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -1; a <= 1; a++)
                            out.push([g.c0r + s * half + du, dy, a, dy >= -13 ? 'oxidized_cut_copper' : WHITE.b]);
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([g.c0r + s * half + du, ground, a, FOOT.b]);
            }
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- concrete 3
    {
        id: 'arch', name: '석조 아치교 (오픈 스팬드럴)', group: 'concrete',
        l: 24, span: 24, fixed: true, widen: 0, dyMin: -14, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), M = MASON;
            if (e < 0)
                return null;
            if (e === 0) {
                if (dy === 0)
                    return j % 3 === 0 ? M.b : 'stone_brick_wall';
                if (dy === 1)
                    return M.slab();
                if (dy === -1)
                    return M.b;
                if (dy === -2)
                    return M.slab(true); // cornice
                return null;
            }
            if (dy === -1 || dy === -2)
                return e <= 3 || dy === -1 ? M.b : CAST.b;
            const rib = e >= 1 && e <= 3;
            const l = 24, R = 10, x = (j + 0.5 - l / 2) / (l / 2);
            const yc = -3 - R * (1 - Math.sqrt(Math.max(0, 1 - x * x)));
            const inRing = (y) => y <= yc + 0.5 && y >= yc - 1.5;
            if (rib) {
                const lo = inRing(dy + 0.25), hi = inRing(dy + 0.75);
                if (lo && hi)
                    return M.b;
                if (hi)
                    return M.slab(true);
                if (lo)
                    return M.slab();
                if (e === 2 && j % 4 === 2 && dy > yc && dy <= -3)
                    return M.b; // spandrel columns
            }
            if (dy === -3 && (e === 2 || j % 4 === 2))
                return M.b;
            if (!rib && j % 6 === 3 && dy >= Math.floor(yc) - 1 && dy <= Math.floor(yc))
                return M.b; // ties between the ribs
            return null;
        },
        pier(g, ground) {
            const out = [], spring = -13;
            for (let u = g.uL + 1; u <= g.uR - 1; u++) {
                const rib = g.e(u) <= 3;
                for (let a = -1; a <= 1; a++)
                    for (let dy = rib ? -3 : spring; dy > ground; dy--)
                        out.push([u, dy, a, dy === spring + 1 && !rib ? null : MASON.b]);
                for (const a of [-2, 2]) {
                    out.push([u, spring, a, MASON.st(a > 0 ? 3 : 2, true)]); // impost
                    for (let dy = spring - 1; dy > ground; dy--)
                        out.push([u, dy, a, MASON.b]);
                }
            }
            for (const s of [-1, 1])
                for (let dy = spring; dy > ground; dy--) {
                    const u = s < 0 ? g.uL : g.uR;
                    out.push([u, dy, 0, MASON.b]);
                    out.push([u, dy, 1, MASON.st(2)]);
                    out.push([u, dy, -1, MASON.st(3)]);
                }
            footing(out, g, ground, Math.ceil(g.Bh) + 1, 4);
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- concrete 4
    {
        id: 'slab', name: '슬래브교 (원형 기둥 열)', group: 'concrete',
        l: 8, span: 14, widen: 0, dyMin: -3, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u);
            if (e < 0)
                return (dy === -1 || dy === -2) && j % 8 === 0 ? CHAIN : null;
            if (e === 0) {
                if (dy === 0 || dy === -1)
                    return CAST.b;
                if (dy === 1)
                    return 'iron_bars';
                return null;
            }
            if (dy === -1)
                return CAST.b;
            if (dy === -2)
                return e <= 1 ? CAST.slab(true) : CAST.b;
            if (dy === -3)
                return e >= 4 ? ((e - 4) % 3 === 2 ? CAST.slab(true) : CAST.b) : null; // ribbed soffit
            return null;
        },
        pier(g, ground) {
            const out = [], half = Math.floor(g.Bh) - 3;
            const n = Math.max(2, Math.round(half * 2 / Math.max(3, g.colGap ?? 6)) + 1);
            for (let i = 0; i < n; i++) {
                const cu = g.c0r + Math.round(-half + i * (2 * half) / (n - 1));
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, -4, a, Math.abs(du) === 2 || Math.abs(a) === 2 ? MASON.slab(true) : MASON.b]); // column head
                for (let dy = -5; dy > ground; dy--)
                    for (let du = -2; du <= 2; du++)
                        for (let a = -2; a <= 2; a++) {
                            const r = du * du + a * a;
                            if (r <= 2)
                                out.push([cu + du, dy, a, MASON.b]);
                            else if (r <= 4.5)
                                out.push([cu + du, dy, a, 'stone_brick_wall']); // rounded skin
                        }
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
            }
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 5
    {
        id: 'segment', name: 'PSC 세그먼트 박스교 (마디마다 체인 이음)', group: 'concrete',
        l: 3, span: 30, widen: 0, dyMin: -8, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), M = BOXCAST;
            const we = (d) => 4 + Math.floor((-2 - d) / 3);
            if (e < 0)
                return dy === -2 && j % 9 === 4 ? rod('lightning_rod', 0) : null; // drain spouts
            if (e === 0) {
                if (dy === -1)
                    return M.b;
                if (dy === -2)
                    return M.slab(true);
                if (dy === 0)
                    return M.b;
                if (dy === 1)
                    return j % 3 === 0 ? M.slab() : 'iron_bars';
                return null;
            }
            if (dy === -1)
                return M.b;
            if (dy >= 0)
                return null;
            if (dy === -8)
                return e >= we(-6) && j % 3 === 0 ? M.slab(true) : null; // ribs at the segment joints
            if (dy === -7)
                return e >= we(-6) ? M.b : null;
            const w = we(dy);
            if (e === w)
                return M.b;
            if (e === w - 1) {
                if (we(dy + 1) < w)
                    return M.st(IN_W(sd), true);
                if (j % 3 === 0)
                    return CHAIN; // segment joints on the webs
            }
            if (dy === -2 && e < w)
                return M.slab(true); // cantilever soffit
            return null;
        },
        pier(g, ground) {
            const out = [];
            const lo = g.uL + 6, hi = g.uR - 6;
            for (let u = lo - 1; u <= hi + 1; u++)
                for (let a = -2; a <= 2; a++)
                    out.push([u, -9, a, u === lo - 1 || u === hi + 1 ? MASON.st(u < g.c0 ? 0 : 1, true) : MASON.b]);
            for (let dy = -10; dy > ground; dy--)
                for (let u = lo + 1; u <= hi - 1; u++)
                    for (let a = -1; a <= 1; a++) {
                        const corner = (u === lo + 1 || u === hi - 1) && Math.abs(a) === 1;
                        out.push([u, dy, a, corner ? CHAIN : MASON.b]);
                    }
            footing(out, g, ground, Math.ceil(g.Bh) - 4, 3);
            return out;
        },
    },
];

// ------------------------------------------------------------ pier parts
/** A rectangular column from dy `from` down to the ground (centre g.c0r, ±hu across, ±ha along). */
function column(out, g, ground, from, hu, ha, block, skin) {
    for (let dy = from; dy > ground; dy--)
        for (let u = -hu - 1; u <= hu + 1; u++)
            for (let a = -ha - 1; a <= ha + 1; a++) {
                const inside = Math.abs(u) <= hu && Math.abs(a) <= ha;
                const b = inside ? block : skin(u, dy, a);
                if (b)
                    out.push([g.c0r + u, dy, a, b]);
            }
}
/** A round column (radius r) from dy `from` down to the ground. */
function round(out, g, ground, from, r, block) {
    const n = Math.ceil(r);
    for (let dy = from; dy > ground; dy--)
        for (let u = -n; u <= n; u++)
            for (let a = -n; a <= n; a++)
                if (u * u + a * a <= r * r)
                    out.push([g.c0r + u, dy, a, block]);
}
/** A footing on the ground: mossy masonry with a stepped (slab) top (±hu across, ±ha along). */
function footing(out, g, ground, hu, ha) {
    for (let u = -hu; u <= hu; u++)
        for (let a = -ha; a <= ha; a++) {
            out.push([g.c0r + u, ground, a, FOOT.b]);
            if (Math.abs(u) === hu || Math.abs(a) === ha)
                continue;
            out.push([g.c0r + u, ground + 1, a, Math.abs(u) === hu - 1 || Math.abs(a) === ha - 1 ? FOOT.slab() : FOOT.b]);
        }
}

// ------------------------------------------------------------ building it
export const bridgeById = (id) => BRIDGES.find(b => b.id === id);

/**
 * The deck geometry from the track: its rails, bed and (gantry) post positions.
 * The deck reaches 2 past the posts (more with `widen`); one more column each
 * side carries hanging details (chains, brackets, bolts).
 */
export function geometry(d, track, opts = {}) {
    const R = [...track.rails].sort((a, b) => a - b);
    const L = Math.min(R[0] - 5, Math.floor(track.bed[0]) - 3), Rt = Math.max(R[R.length - 1] + 5, Math.ceil(track.bed[1]) + 3);
    // `tight` (a road): the deck just two past the bed for the barrier, no room for poles
    const uL = (opts.tight ? Math.floor(track.bed[0]) - 2 : Math.min(Math.floor(track.bed[0]) - 2, L - 2)) - d.widen;
    const uR = (opts.tight ? Math.ceil(track.bed[1]) + 2 : Math.max(Math.ceil(track.bed[1]) + 2, Rt + 2)) + d.widen;
    const c0 = (uL + uR) / 2;
    const g = {
        uL, uR, c0, c0r: Math.round(c0 - 1e-9), Bh: (uR - uL) / 2, rails: R, bed: track.bed,
        e: (u) => Math.min(u - uL, uR - u),
        sd: (u) => u < c0 ? -1 : 1,
        a: (u) => Math.abs(u - c0),
        paint: steelPaint(opts.paint ?? d.paint ?? 'weathered'),
        colGap: opts.colGap,
        // the track bed's own ballast and slab top, to carry it out to the parapets
        fill: { ballast: opts.ballast || 'gravel', top: opts.top ?? '', from: d.fillFrom ?? 1, bedE: Math.floor(track.bed[0]) - uL },
        girders(step) {
            const n = Math.max(2, Math.floor((uR - uL - 4) / step) + 1);
            return Array.from({ length: n }, (_, i) => Math.round(uL + 2 + i * (uR - uL - 4) / (n - 1)));
        },
    };
    return g;
}

/**
 * Block text -> something with at(pos): a single block, or a weighted mix
 * ("60%stone,40%tuff") that varies with the position.
 */
export function material(cache, t) {
    let m = cache.get(t);
    if (m === undefined) {
        if (/%|,/.test(t.replace(/\[[^\]]*\]/g, ''))) {
            const pat = parsePattern(t);
            m = { at: (pos) => pat.at(pos, null), key: t };
        }
        else {
            const p = parseBlock(t);
            m = { at: () => p, key: t };
        }
        cache.set(t, m);
    }
    return m;
}

// ------------------------------------------------------------ lights
const PROP = /button|chain|lightning_rod|lantern|light_block|torch/;
/**
 * Lighting with invisible light blocks (빛 블록) only, in cells the design
 * leaves empty: over the parapet (or the walkway railing) every 12 blocks,
 * under the deck on the centre line every 6, along the walkway, and in the
 * trusses under the portals. Nothing shows; the bridge is just lit at night.
 * A design can add its own spots (d.lamps).
 */
function lamp(d, g, u, e, dy, j, at) {
    const own = d.lamps?.(u, dy, j, g, e);
    if (own !== undefined)
        return own;
    const below = at(dy - 1), above = at(dy + 1);
    // over the parapet top
    if (e === 0 && dy >= 0 && j % 12 === 0 && below && !PROP.test(below) && !above)
        return 'light_block_14';
    // under the deck on the centre line
    if (u === g.c0r && dy <= -2 && above && !PROP.test(above) && !/bars/.test(above)) {
        if (j % 6 === 0 && !at(dy - 1))
            return 'light_block_12';
    }
    // along the walkway / parapet foot
    if (e === 1 && dy === (d.openDeck ? 1 : 2) && j % 12 === 6 && below && !PROP.test(below))
        return 'light_block_10';
    return null;
}

/** How much higher the parapets stand than in the drawn sections. */
const RAISE = 1;

/** The deck as a tile for rail.js sweep (no traced lines: every column is laid by area). */
export function bridgeTile(d, g) {
    const w = g.uR - g.uL + 3; // with the detail column each side
    const uOf = (c) => g.uL - 1 + c;
    const h = d.dyMax - d.dyMin + 1, anchor = -d.dyMin;
    const cache = new Map();
    return {
        w, l: d.l, h: h + RAISE + 1, anchor, dirAng: 0, lines: new Map(), // a row over the parapets for lamps
        cell(k, c, j) {
            const u = uOf(c), dy = k - anchor, f = g.fill, e = g.e(u);
            // no ballast on a bridge: the deck itself comes up to the sleepers, from the
            // parapet / walkway to the far one (sleepers and rails lie on it)
            if (!d.openDeck && e >= f.from && dy === 0) {
                const t = d.section(u, 0, j, g) ?? d.section(u, -1, j, g);
                return t ? material(cache, t) : null;
            }
            if (!d.openDeck && e >= f.from && e < f.bedE && dy === 1)
                return null;
            // parapets stand a block higher than the track bed (the rails sit lower
            // than the guard walls): the edge zone is drawn one up on its deck edge
            const at = (y) => {
                const lifted = d.lift !== false && !d.openDeck && e < f.from && y >= 0;
                return d.section(u, lifted ? Math.max(-1, y - RAISE) : y, j, g);
            };
            const t = at(dy) ?? lamp(d, g, u, e, dy, j, at);
            return t ? material(cache, t) : null;
        },
        describe: d.name,
        material: (t) => material(cache, t),
    };
}

/**
 * The underside of the deck at each u: the lowest row the deck covers along
 * most of its length (a sparse rib row below it does not count).
 */
function deckBottom(d, g) {
    if (g._bottom)
        return g._bottom;
    const out = new Map(), hollow = [];
    const cover = (u, dy) => {
        let n = 0;
        for (let j = 0; j < d.l; j++)
            if (d.section(u, dy, j, g))
                n++;
        return n / d.l;
    };
    for (let u = g.uL - 1; u <= g.uR + 1; u++) {
        const rows = [];
        for (let dy = d.dyMin; dy < 0; dy++)
            rows.push([dy, cover(u, dy)]);
        const full = rows.filter(r => r[1] >= 0.6).map(r => r[0]);
        if (!full.length)
            continue;
        out.set(u, full[0]);
        // inside a box girder: open rows between its bottom and top slabs
        const lo = full[0], hi = full[full.length - 1];
        for (const [dy, c] of rows)
            if (dy > lo && dy < hi && c < 0.4)
                hollow.push([u, dy, d.section(u, lo, 0, g) ?? d.section(u, lo, 1, g)]);
    }
    g._bottom = out;
    g._hollow = hollow;
    return out;
}
/**
 * Close the gap between a pier's top and the deck: where the top of a pier
 * column stops 1-4 blocks under the deck's underside, carry its top block up
 * to meet it (no slit of sky between cap and deck). `end`: the pier at
 * either end of the bridge, where the deck only covers its middle row.
 */
function closeUp(d, g, cells, end = false) {
    const bottom = deckBottom(d, g);
    const top = new Map();
    for (const c of cells)
        if (c[3]) {
            const k = c[0] + ',' + c[2];
            if (!top.has(k) || top.get(k)[1] < c[1])
                top.set(k, c);
        }
    const out = [...cells];
    // a diaphragm closes a box girder over every pier (and at its ends)
    for (const [u, dy, t] of g._hollow)
        if (t && !/button|chain|rod|bars|lantern|light/.test(t))
            for (const a of end ? [0] : [-1, 0, 1])
                out.push([u, dy, a, t]);
    for (const [u, dy, a, t] of top.values()) {
        const b = bottom.get(u);
        // at the bridge's ends only under the deck's last block (nothing sticks out past it)
        if (b === undefined || b - dy < 2 || b - dy > 5 || (end ? a !== 0 : Math.abs(a) > 1) || /button|chain|rod|bars|slab|stairs|lantern|light/.test(t))
            continue;
        for (let y = dy + 1; y < b; y++)
            out.push([u, y, a, t]);
    }
    return out;
}

/**
 * The end of the deck, closed: the deck's silhouette under the track bed at
 * the first and last block, filled with its own main material, so a bridge
 * that stops (on the ground or at the last pier) shows a clean end plate
 * instead of a cut through its beams.
 */
export function endPiece(d, g, tile) {
    const cells = new Map();
    const detail = /button|chain|rod|bars|light|lantern|stairs|trapdoor|hopper/;
    for (let u = g.uL - 1; u <= g.uR + 1; u++)
        for (let dy = d.dyMin; dy < 0; dy++) {
            const seen = new Map();
            for (let j = 0; j < d.l; j++) {
                const t = d.section(u, dy, j, g);
                if (t && !detail.test(t))
                    seen.set(t, (seen.get(t) ?? 0) + 1);
            }
            if (!seen.size)
                continue;
            const t = [...seen].sort((p, q) => q[1] - p[1])[0][0];
            const p = tile.material(t).at({ x: u, y: dy, z: 0 });
            if (p)
                cells.set(`${u},${dy},0`, p);
        }
    return { cells, buttons: [], dirAng: 0 };
}

/**
 * The pier at one spot, as a pole-like piece (cells "dx,dy,dz" facing north).
 * `seed` shifts the stone mixes so no two piers are laid alike.
 */
export function pierPiece(d, g, groundDy, tile, seed = 0, end = false) {
    const cells = new Map();
    for (const [u, dy, a, t] of closeUp(d, g, d.pier(g, groundDy), end)) {
        if (!t)
            continue;
        const p = tile.material(t).at({ x: u + seed * 97, y: dy, z: a + seed * 61 });
        if (p)
            cells.set(`${u},${dy},${-a}`, p);
    }
    return { cells, buttons: [], dirAng: 0 };
}

// ------------------------------------------------------------ polish
const DIRS = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const FACE = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const ATTACHED = /button|chain|lightning_rod|lantern|torch/;
const NOT_SOLID = /air|slab|stairs|button|chain|lightning_rod|trapdoor|lantern|bars|_wall|fence|gate|carpet|rail|skull|grindstone|hopper|anvil|pane|torch/;
const isBars = (p) => p && 'minecraft:connection_north' in safeStates(p);
const isWall = (p) => p && 'wall_connection_type_north' in safeStates(p);
const solid = (p) => p && !NOT_SOLID.test(p.type.id);
function safeStates(p) {
    try {
        return p.getAllStates();
    }
    catch (e) {
        return {};
    }
}

/**
 * Tidy the bridge after the sweep and the piers:
 *  - on diagonals a one-block part comes out joined only at corners: fill one
 *    side of every such corner so faces stay closed and bars can join;
 *  - bars and walls connect to their neighbours (bars, walls, full blocks);
 *  - a bolt (button) whose plate is not behind it turns to a plate beside it,
 *    or goes.
 */
export function* polish(paint) {
    const get = (x, y, z) => paint.get(`${x},${y},${z}`);
    let n = 0;
    for (const [k, p] of [...paint]) {
        if (!p || ATTACHED.test(p.type.id))
            continue;
        const [x, y, z] = k.split(',').map(Number);
        for (const [dx, dz] of [[1, 1], [1, -1]]) {
            const q = get(x + dx, y, z + dz);
            if (!q || q.type.id !== p.type.id)
                continue;
            const a = get(x + dx, y, z), b = get(x, y, z + dz);
            if (a?.type.id === p.type.id || b?.type.id === p.type.id)
                continue;
            if (!a && !b)
                paint.set(`${x + dx},${y},${z}`, p);
            else if (isBars(p) || isWall(p)) {
                // a railing running past the bed's slabs: the railing wins the corner
                if (!a || /_slab$/.test(a.type.id))
                    paint.set(`${x + dx},${y},${z}`, p);
                else if (!b || /_slab$/.test(b.type.id))
                    paint.set(`${x},${y},${z + dz}`, p);
            }
        }
        if (++n % 4000 === 0)
            yield;
    }
    for (const [k, p] of paint) {
        if (!p)
            continue;
        const bars = isBars(p), wall = !bars && isWall(p);
        if (!bars && !wall)
            continue;
        const [x, y, z] = k.split(',').map(Number);
        const st = {};
        const link = {};
        for (const [d, [dx, dz]] of Object.entries(DIRS)) {
            const q = get(x + dx, y, z + dz);
            link[d] = !!q && (isBars(q) || isWall(q) || solid(q) || /lightning_rod/.test(q.type.id));
        }
        if (bars)
            for (const d of Object.keys(DIRS))
                st['minecraft:connection_' + d] = link[d];
        else {
            const above = get(x, y + 1, z);
            for (const d of Object.keys(DIRS))
                st['wall_connection_type_' + d] = link[d] ? (above && solid(above) ? 'tall' : 'short') : 'none';
            const straight = (link.north && link.south && !link.east && !link.west) || (link.east && link.west && !link.north && !link.south);
            st.wall_post_bit = !straight || !!(above && isWall(above));
        }
        try {
            let q = p;
            for (const [s, v] of Object.entries(st))
                q = q.withState(s, v);
            paint.set(k, q);
        }
        catch (e) { }
        if (++n % 4000 === 0)
            yield;
    }
    for (const [k, p] of [...paint]) {
        if (!p || !p.type.id.endsWith('_button'))
            continue;
        const [x, y, z] = k.split(',').map(Number);
        const f = safeStates(p).facing_direction;
        const back = FACE[f];
        if (back && solid(get(x - back[0], y - back[1], z - back[2])))
            continue;
        let fixed = false;
        for (const g of [2, 3, 4, 5]) {
            const b = FACE[g];
            if (solid(get(x - b[0], y - b[1], z - b[2]))) {
                paint.set(k, p.withState('facing_direction', g));
                fixed = true;
                break;
            }
        }
        if (!fixed)
            paint.delete(k);
    }
}
