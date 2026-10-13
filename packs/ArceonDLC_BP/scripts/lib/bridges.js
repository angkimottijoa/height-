/*
 * Bridges under the railway: 3 steel and 5 concrete designs.
 *
 * A design is a cross section (what sits at sideways offset u, height dy and
 * position j along a repeating length l) swept along the curve under the
 * track, plus a pier stood every span down to the ground. Everything is made
 * facing north: +u = right of travel (east), j counts along the travel
 * direction (north), dy = 0 is the ballast level (the curve points).
 *
 * Details are drawn with small blocks the way builders do: bolts are buttons
 * on the steel faces, stiffeners are lightning rods, the joints between
 * concrete segments are chains hanging on the faces, railings are bars.
 * After the sweep (polish): thin parts that came out joined only at corners
 * on a diagonal are closed up, bars and walls are connected to their
 * neighbours, and a bolt that lost its plate turns to one beside it.
 */
import { parseBlock } from '../core/blocks.js';

// ------------------------------------------------------------ block helpers
const ST = (id, st) => id + '[' + Object.entries(st).map(([k, v]) => `${k}=${v}`).join(',') + ']';
const top = (id) => id + '[top]';
const bolt = (f) => ST('polished_blackstone_button', { facing_direction: f });
const stair = (id, w, up = false) => ST(id, { weirdo_direction: w, upside_down_bit: up });
const rod = (id, f) => ST(id, { facing_direction: f });
// weirdo_direction: east 0, west 1, south 2, north 3. facing_direction: down 0, up 1, north 2, south 3, west 4, east 5
const OUT_W = (sd) => sd < 0 ? 1 : 0, IN_W = (sd) => sd < 0 ? 0 : 1, OUT_F = (sd) => sd < 0 ? 4 : 5;
const CHAIN = 'iron_chain';

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

// ------------------------------------------------------------ designs
/**
 * Each design: id, name, group, l (repeat length), span (pier spacing; fixed:
 * spans must be whole multiples of l), widen (extra deck each side), dy range,
 * section(u, dy, j, g) -> block text | null, pier(g, groundDy) -> [[u, dy, a, text]].
 */
export const BRIDGES = [
    // ---------------------------------------------------------- steel 1
    // Deck plate girders as on the Yamanote line (Ueno, Akihabara): a deep
    // outer girder each side with stiffeners every 2 blocks and rivet rows,
    // a grated walkway on triangular brackets outside it with a cable trough
    // and railing, girders under every rail, floor beams and cross frames,
    // and steel bents (columns + cross beam on bearing shoes) as piers.
    {
        id: 'plate', name: '강판형교 (상로 플레이트 거더, 야마노테선 고가 양식)', group: 'steel',
        l: 12, span: 18, widen: 0, dyMin: -7, dyMax: 1, steel: true,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            const OUT = OUT_W(sd), IN = IN_W(sd);
            if (e < 0)
                return dy === -1 && j % 2 === 1 ? bolt(OUT_F(sd)) : null; // rivets on the edge channel
            if (e === 0) {
                if (dy === -1)
                    return P.main; // edge channel
                if (dy === -2)
                    return top(P.slab);
                if (dy === 0)
                    return j % 3 === 0 ? P.main : P.bars; // railing posts and panels
                if (dy === 1)
                    return P.slab; // handrail
                return null;
            }
            if (e === 1 || e === 2) {
                if (dy === -1)
                    return P.grate; // walkway grating
                if (dy === 0 && e === 2)
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
                    if (dy >= -6 && dy <= -3 && j % 2 === 0)
                        return P.stiff(1); // stiffeners
                    if ((dy === -2 || dy === -6) && j % 2 === 1)
                        return bolt(OUT_F(sd)); // rivet rows
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
                if (dy >= -6 && dy <= -3 && j % 2 === 0)
                    return P.stiff(1);
                if (dy === -2)
                    return top(P.slab);
                return null;
            }
            if (dy >= 0)
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
                    if (dy >= -6 && dy <= -3 && j % 2 === 0)
                        return P.stiff(1);
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
            const cols = [g.uL + 3, g.uR - 3];
            if (g.Bh >= 11)
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
                out.push([u, -10, 0, girders.includes(u) ? null : null]);
            }
            for (const u of girders)
                for (const a of [-2, 2])
                    out.push([u, -8, a, P.stiff(1)]);
            // columns: 3x3 boxes with stiffener ribs, rivets and knee braces
            for (const cu of cols) {
                for (let dy = -10; dy > ground + 1; dy--)
                    for (let du = -2; du <= 2; du++)
                        for (let a = -2; a <= 2; a++) {
                            const ad = Math.abs(du), aa = Math.abs(a);
                            if (ad <= 1 && aa <= 1)
                                out.push([cu + du, dy, a, P.main]);
                            else if (ad === 2 && aa === 0 || aa === 2 && ad === 0)
                                out.push([cu + du, dy, a, P.stiff(1)]);
                            else if ((ad === 2 && aa === 1 || aa === 2 && ad === 1) && dy % 3 === 0)
                                out.push([cu + du, dy, a, bolt(ad === 2 ? (du < 0 ? 4 : 5) : (a < 0 ? 3 : 2))]);
                        }
                for (const s of [-1, 1]) {
                    if (cu + s * 2 > g.uL + 2 && cu + s * 2 < g.uR - 2) {
                        out.push([cu + s * 2, -10, 0, stair(P.stairs, s < 0 ? 0 : 1, true)]);
                        out.push([cu + s * 3, -10, 0, top(P.slab)]);
                    }
                }
                // base plate with anchor bolts on a concrete footing
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, ground + 1, a, Math.abs(du) === 2 && Math.abs(a) === 2 ? bolt(1) : P.slab]);
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, 'smooth_stone']);
            }
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- steel 2
    // Simple-span through Warren trusses, 4 panels of 14 per 56-block span:
    // inclined end posts, top chord over the middle panels, diagonals with
    // stair fillets, verticals, gusset plates with bolt groups at every panel
    // point, portal struts with knee braces and X bracing overhead (above the
    // catenary), floor beams and stringers under the deck.
    {
        id: 'truss', name: '하로 워렌 트러스교 (경간 56칸, 단순 트러스)', group: 'steel',
        l: 56, span: 56, fixed: true, widen: 2, dyMin: -2, dyMax: 17, steel: true,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            const jj = j % 56, k = Math.floor(jj / 14), t = jj % 14;
            const node = (n) => Math.abs(jj - n) <= 1 || (n === 0 && jj === 55);
            const topNode = node(14) || node(42), lowNode = node(0) || node(28);
            const topChord = jj >= 14 && jj <= 42;
            if (e < 0) {
                if (dy === 0 && j % 2 === 0 || dy === 15 && topChord && j % 2 === 1)
                    return bolt(OUT_F(sd));
                if (lowNode && dy >= 1 && dy <= 2 || topNode && dy >= 13 && dy <= 14)
                    return bolt(OUT_F(sd)); // bolt groups on the gussets
                return null;
            }
            if (e === 0) {
                if (dy === -1)
                    return top(P.slab);
                if (dy === 0)
                    return j % 4 === 0 ? P.main : P.bars;
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
            if (dy === -1)
                return P.main;
            if (dy === -2) {
                if (jj % 7 === 0)
                    return P.main; // floor beams
                if (g.rails.includes(u))
                    return top(P.slab); // stringers
            }
            return null;
        },
        pier(g, ground) {
            const out = [], half = Math.ceil(g.Bh) - 1, P = g.paint;
            for (let u = -half - 1; u <= half + 1; u++)
                for (let a = -2; a <= 2; a++)
                    out.push([g.c0r + u, -3, a, 'polished_andesite']);
            for (let u = -half - 1; u <= half + 1; u++) {
                out.push([g.c0r + u, -4, 2, top('polished_andesite_slab')]);
                out.push([g.c0r + u, -4, -2, top('polished_andesite_slab')]);
            }
            for (const uu of [g.uL + 1, g.uR - 1])
                for (let a = -1; a <= 1; a++) {
                    out.push([uu, -2, a, P.shoe]); // bearing shoes under the trusses
                    out.push([uu + (uu < g.c0 ? -1 : 1), -2, a, bolt(uu < g.c0 ? 4 : 5)]);
                }
            column(out, g, ground, -4, half - 1, 1, 'smooth_stone', () => null);
            for (let dy = -4; dy > ground; dy--)
                for (const s of [-1, 1]) {
                    out.push([g.c0r + s * half, dy, 0, 'smooth_stone']); // rounded noses
                    out.push([g.c0r + s * half, dy, 1, stair('stone_brick_stairs', 2)]);
                    out.push([g.c0r + s * half, dy, -1, stair('stone_brick_stairs', 3)]);
                }
            footing(out, g, ground, half + 2, 3, 'stone_bricks', 'stone_brick_slab');
            return out;
        },
    },
    // ---------------------------------------------------------- steel 3
    // A continuous steel box girder: leaning webs (stair fillets at every
    // step), a wide bottom flange with lips, cantilever brackets every 6,
    // a horizontal stiffener rib along the webs, bolted field splices every
    // 24 blocks, drain pipes, a parapet with railing; on round concrete
    // columns with a flared cap and bearing shoes.
    {
        id: 'steelbox', name: '강상자형교 (스틸 박스 거더, 연속교)', group: 'steel',
        l: 24, span: 24, widen: 0, dyMin: -7, dyMax: 1, steel: true,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            const we = (d) => 4 + Math.floor((-2 - d) / 2); // the webs lean in
            const splice = [23, 0, 1].includes(j % 24);
            if (e < 0)
                return dy === 0 && j % 2 === 0 ? bolt(OUT_F(sd)) : null;
            if (e === 0) {
                if (dy === -1)
                    return top(P.slab);
                if (dy === 0)
                    return P.main; // parapet
                if (dy === 1)
                    return j % 3 === 0 ? P.slab : P.bars;
                return null;
            }
            if (dy === -1)
                return P.main;
            if (dy >= 0)
                return null;
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
                    return P.stiff(2); // horizontal stiffener rib
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
            const out = [], P = g.paint, C = 'light_gray_concrete';
            const lo = g.uL + 5, hi = g.uR - 5;
            for (let u = lo; u <= hi; u++)
                for (let a = -2; a <= 2; a++)
                    out.push([u, -8, a, (u === lo + 1 || u === hi - 1) && Math.abs(a) <= 1 ? P.shoe : C]);
            for (let u = lo + 1; u <= hi - 1; u++)
                for (let a = -1; a <= 1; a++)
                    out.push([u, -9, a, u === lo + 1 || u === hi - 1 ? stair('light_gray_concrete_stairs', u < g.c0 ? 0 : 1, true) : C]);
            round(out, g, ground, -10, 2.6, C);
            footing(out, g, ground, 4, 4, 'smooth_stone', 'smooth_stone_slab');
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 1
    {
        id: 'psci', name: 'PSC I형 빔교 (프리캐스트 거더)', group: 'concrete',
        l: 10, span: 22, widen: 0, dyMin: -6, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), C = 'light_gray_concrete';
            if (e < 0)
                return (dy === -1 || dy === -2) && j % 10 === 0 ? CHAIN : null; // deck joints
            if (e === 0) {
                if (dy === -1 || dy === 0)
                    return C;
                if (dy === 1)
                    return 'light_gray_concrete_slab';
                if (dy === -2)
                    return top('light_gray_concrete_slab'); // drip edge
                return null;
            }
            if (e === 1 && dy === 0)
                return stair('light_gray_concrete_stairs', OUT_W(sd)); // New Jersey barrier face
            if (dy === -1)
                return C;
            if (dy >= 0)
                return null;
            const gs = g.girders(3);
            for (const r of gs) {
                const d = u - r;
                if (d === 0 && dy >= -5)
                    return dy === -5 ? C : C;
                if (Math.abs(d) === 1) {
                    if (dy === -2)
                        return top('light_gray_concrete_slab');
                    if (dy === -5)
                        return 'light_gray_concrete_slab'; // bottom bulb
                }
            }
            if (j % 10 === 0 && dy >= -4 && u > gs[0] && u < gs[gs.length - 1])
                return C; // diaphragms
            return null;
        },
        pier(g, ground) {
            const out = [], C = 'light_gray_concrete';
            let w = Math.floor(g.Bh) - 2;
            for (let t = 0, dy = -6; w >= 2; t++, dy--, w -= 2)
                for (let u = -w; u <= w; u++)
                    for (let a = -1; a <= 1; a++) {
                        const uu = g.c0r + u;
                        let b = C;
                        if (t === 0 && g.girders(3).includes(uu) && a === 0)
                            b = 'gray_concrete'; // bearing pads
                        else if (t > 0 && Math.abs(u) === w)
                            b = stair('light_gray_concrete_stairs', u < 0 ? 0 : 1, true);
                        out.push([uu, dy, a, b]);
                    }
            const capBottom = -6 - Math.ceil((Math.floor(g.Bh) - 3) / 2);
            column(out, g, ground, capBottom, 1, 1, C, () => null);
            for (const [cu, ca] of [[-2, -2], [2, -2], [-2, 2], [2, 2]])
                for (let dy = capBottom; dy > ground; dy--)
                    out.push([g.c0r + Math.sign(cu) * 1, dy, Math.sign(ca) * 2, ST('light_gray_concrete_stairs', { weirdo_direction: ca > 0 ? 3 : 2, upside_down_bit: false })]);
            footing(out, g, ground, 4, 3, 'smooth_stone', 'smooth_stone_slab');
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 2
    {
        id: 'viaduct', name: '철도 고가 박스교 (흰 콘크리트 + 녹색 띠, 사진 양식)', group: 'concrete',
        l: 4, span: 16, widen: 0, dyMin: -7, dyMax: 2,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), W = 'white_concrete';
            if (e < 0)
                return dy <= 1 && dy >= -6 && j % 4 === 0 ? CHAIN : null; // segment joints
            if (e === 0) {
                if (dy >= -6 && dy <= 1)
                    return dy === -3 || dy === -4 ? 'weathered_copper' : W;
                if (dy === 2)
                    return 'white_concrete_slab';
                return null;
            }
            if (dy === -1)
                return 'light_gray_concrete';
            if (dy === -7)
                return e === 1 ? top('smooth_stone_slab') : 'smooth_stone';
            if (dy === -6 && e === 1)
                return stair('stone_brick_stairs', OUT_W(sd), true);
            return null;
        },
        pier(g, ground) {
            const out = [], half = Math.floor(g.Bh) - 3;
            for (let u = -half - 1; u <= half + 1; u++)
                for (let a = -1; a <= 1; a++) {
                    out.push([g.c0r + u, -8, a, 'light_gray_concrete']);
                    out.push([g.c0r + u, -9, a, Math.abs(u) > half - 2 ? 'light_gray_concrete' : (Math.abs(u) === half - 2 ? stair('light_gray_concrete_stairs', u < 0 ? 1 : 0, true) : null)]);
                }
            for (const s of [-1, 1])
                for (let dy = -10; dy > ground; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -1; a <= 1; a++)
                            out.push([g.c0r + s * half + du, dy, a, dy >= -12 ? 'oxidized_cut_copper' : 'white_concrete']);
            for (const s of [-1, 1])
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([g.c0r + s * half + du, ground, a, 'smooth_stone']);
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- concrete 3
    {
        id: 'arch', name: '콘크리트 아치교 (오픈 스팬드럴)', group: 'concrete',
        l: 24, span: 24, fixed: true, widen: 0, dyMin: -14, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), C = 'light_gray_concrete';
            if (e < 0)
                return null;
            if (e === 0) {
                if (dy === 0)
                    return j % 3 === 0 ? 'smooth_stone' : 'stone_brick_wall';
                if (dy === 1)
                    return 'smooth_stone_slab';
                if (dy === -1)
                    return 'smooth_stone';
                if (dy === -2)
                    return top('smooth_stone_slab'); // cornice
                return null;
            }
            if (dy === -1 || dy === -2)
                return C;
            const rib = e >= 1 && e <= 3;
            // the arch ring: crown just under the deck, springing 11 below at the piers
            const l = 24, R = 10, x = (j + 0.5 - l / 2) / (l / 2);
            const yc = -3 - R * (1 - Math.sqrt(Math.max(0, 1 - x * x)));
            const inRing = (y) => y <= yc + 0.5 && y >= yc - 1.5;
            if (rib) {
                const lo = inRing(dy + 0.25), hi = inRing(dy + 0.75);
                if (lo && hi)
                    return C;
                if (hi)
                    return top('light_gray_concrete_slab');
                if (lo)
                    return 'light_gray_concrete_slab';
                // spandrel columns from the ring up to the deck
                if (e === 2 && j % 4 === 2 && dy > yc && dy <= -3)
                    return C;
            }
            if (dy === -3 && (e === 2 || j % 4 === 2))
                return C; // deck girders and cross beams
            if (!rib && j % 6 === 3 && dy >= Math.floor(yc) - 1 && dy <= Math.floor(yc))
                return C; // ties between the ribs
            return null;
        },
        pier(g, ground) {
            // a solid pier wall up to the deck between the ribs' springings, a moulded
            // impost at the springing, and a cutwater pier below
            const out = [], spring = -13, C = 'light_gray_concrete';
            for (let u = g.uL + 1; u <= g.uR - 1; u++) {
                const rib = g.e(u) <= 3;
                for (let a = -1; a <= 1; a++)
                    for (let dy = rib ? -3 : spring; dy > ground; dy--)
                        out.push([u, dy, a, dy === spring + 1 && !rib ? null : C]);
                for (const a of [-2, 2]) {
                    out.push([u, spring, a, stair('light_gray_concrete_stairs', a > 0 ? 3 : 2, true)]); // impost
                    for (let dy = spring - 1; dy > ground; dy--)
                        out.push([u, dy, a, 'smooth_stone']);
                }
            }
            for (const s of [-1, 1])
                for (let dy = spring; dy > ground; dy--) {
                    const u = s < 0 ? g.uL : g.uR;
                    out.push([u, dy, 0, 'smooth_stone']);
                    out.push([u, dy, 1, stair('stone_brick_stairs', 2)]);
                    out.push([u, dy, -1, stair('stone_brick_stairs', 3)]);
                }
            footing(out, g, ground, Math.ceil(g.Bh) + 1, 4, 'smooth_stone', 'smooth_stone_slab');
            return out.filter(c => c[3]);
        },
    },
    // ---------------------------------------------------------- concrete 4
    {
        id: 'slab', name: '콘크리트 슬래브교 (원형 기둥)', group: 'concrete',
        l: 8, span: 14, widen: 0, dyMin: -3, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), C = 'light_gray_concrete';
            if (e < 0)
                return (dy === -1 || dy === -2) && j % 8 === 0 ? CHAIN : null;
            if (e === 0) {
                if (dy === 0 || dy === -1)
                    return C;
                if (dy === 1)
                    return 'iron_bars';
                return null;
            }
            if (dy === -1)
                return C;
            if (dy === -2)
                return e <= 1 ? top('light_gray_concrete_slab') : C;
            if (dy === -3)
                return e >= 4 ? C : null;
            return null;
        },
        pier(g, ground) {
            const out = [], half = Math.floor(g.Bh) - 3;
            const n = Math.max(2, Math.round(half * 2 / 6) + 1);
            for (let i = 0; i < n; i++) {
                const cu = g.c0r + Math.round(-half + i * (2 * half) / (n - 1));
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, -4, a, 'light_gray_concrete']); // column head
                for (let dy = -5; dy > ground; dy--)
                    for (let du = -2; du <= 2; du++)
                        for (let a = -2; a <= 2; a++)
                            if (du * du + a * a <= 4.5)
                                out.push([cu + du, dy, a, du * du + a * a > 2 ? 'smooth_stone' : 'light_gray_concrete']);
                for (let du = -3; du <= 3; du++)
                    for (let a = -3; a <= 3; a++)
                        out.push([cu + du, ground, a, 'smooth_stone']);
            }
            return out;
        },
    },
    // ---------------------------------------------------------- concrete 5
    // A precast segmental box: segments 3 blocks long, every joint a chain
    // down the leaning web; cantilever soffit, parapet with railing, drain
    // spouts; on a tall wall pier with chained (chamfered) edges and a
    // flared head.
    {
        id: 'segment', name: 'PSC 세그먼트 박스교 (마디마다 체인 이음)', group: 'concrete',
        l: 3, span: 30, widen: 0, dyMin: -8, dyMax: 1,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), C = 'light_gray_concrete';
            const we = (d) => 4 + Math.floor((-2 - d) / 3);
            if (e < 0)
                return dy === -2 && j % 9 === 4 ? rod('lightning_rod', 0) : null; // drain spouts
            if (e === 0) {
                if (dy === -1)
                    return C;
                if (dy === -2)
                    return top('light_gray_concrete_slab');
                if (dy === 0)
                    return 'smooth_stone';
                if (dy === 1)
                    return j % 3 === 0 ? 'smooth_stone_slab' : 'iron_bars';
                return null;
            }
            if (dy === -1)
                return C;
            if (dy >= 0 || dy < -7)
                return null;
            if (dy === -7)
                return e >= we(-6) ? 'smooth_stone' : null;
            const w = we(dy);
            if (e === w)
                return 'smooth_stone';
            if (e === w - 1) {
                if (we(dy + 1) < w)
                    return stair('light_gray_concrete_stairs', IN_W(sd), true);
                if (j % 3 === 0)
                    return CHAIN; // segment joints on the webs
            }
            if (dy === -2 && e < w)
                return top('light_gray_concrete_slab'); // cantilever soffit
            return null;
        },
        pier(g, ground) {
            const out = [], C = 'light_gray_concrete';
            const lo = g.uL + 6, hi = g.uR - 6;
            for (let u = lo - 1; u <= hi + 1; u++)
                for (let a = -2; a <= 2; a++)
                    out.push([u, -8, a, u === lo - 1 || u === hi + 1 ? stair('light_gray_concrete_stairs', u < g.c0 ? 0 : 1, true) : C]);
            for (let dy = -9; dy > ground; dy--)
                for (let u = lo + 1; u <= hi - 1; u++)
                    for (let a = -1; a <= 1; a++) {
                        const corner = (u === lo + 1 || u === hi - 1) && Math.abs(a) === 1;
                        out.push([u, dy, a, corner ? CHAIN : C]); // chamfered, chained edges
                    }
            footing(out, g, ground, Math.ceil(g.Bh) - 4, 3, 'smooth_stone', 'smooth_stone_slab');
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
/** A footing on the ground: a slab-edged block (±hu across, ±ha along). */
function footing(out, g, ground, hu, ha, block, edge) {
    for (let u = -hu; u <= hu; u++)
        for (let a = -ha; a <= ha; a++) {
            out.push([g.c0r + u, ground, a, block]);
            if (Math.abs(u) === hu || Math.abs(a) === ha)
                continue;
            out.push([g.c0r + u, ground + 1, a, edge]);
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
    const uL = Math.min(Math.floor(track.bed[0]) - 2, L - 2) - d.widen, uR = Math.max(Math.ceil(track.bed[1]) + 2, Rt + 2) + d.widen;
    const c0 = (uL + uR) / 2;
    const g = {
        uL, uR, c0, c0r: Math.round(c0 - 1e-9), Bh: (uR - uL) / 2, rails: R, bed: track.bed,
        e: (u) => Math.min(u - uL, uR - u),
        sd: (u) => u < c0 ? -1 : 1,
        a: (u) => Math.abs(u - c0),
        paint: steelPaint(opts.paint ?? d.paint ?? 'weathered'),
        girders(step) {
            const n = Math.max(2, Math.floor((uR - uL - 4) / step) + 1);
            return Array.from({ length: n }, (_, i) => Math.round(uL + 2 + i * (uR - uL - 4) / (n - 1)));
        },
    };
    return g;
}

/** The deck as a tile for rail.js sweep (no traced lines: every column is laid by area). */
export function bridgeTile(d, g) {
    const w = g.uR - g.uL + 3; // with the detail column each side
    const uOf = (c) => g.uL - 1 + c;
    const h = d.dyMax - d.dyMin + 1, anchor = -d.dyMin;
    const cache = new Map();
    const perm = (t) => {
        if (!t)
            return null;
        let p = cache.get(t);
        if (p === undefined) {
            p = parseBlock(t);
            cache.set(t, p);
        }
        return p;
    };
    const src = new Map();
    return {
        w, l: d.l, h, anchor, dirAng: 0, lines: new Map(),
        cell(k, c, j) {
            const t = d.section(uOf(c), k - anchor, j, g);
            if (!t)
                return null;
            let s = src.get(t);
            if (!s) {
                const p = perm(t);
                src.set(t, s = { at: () => p, key: t });
            }
            return s;
        },
        describe: d.name,
        perm,
    };
}

/** The pier at one spot, as a pole-like piece (cells "dx,dy,dz" facing north). */
export function pierPiece(d, g, groundDy, perm) {
    const cells = new Map();
    for (const [u, dy, a, t] of d.pier(g, groundDy)) {
        const p = perm(t);
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
            if (q && q.type.id === p.type.id && !get(x + dx, y, z) && !get(x, y, z + dz))
                paint.set(`${x + dx},${y},${z}`, p);
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
