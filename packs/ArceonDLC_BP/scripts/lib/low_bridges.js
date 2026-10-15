/*
 * Low railway bridges (저상 교량): for a railway that crosses a road with
 * little room under it, the way city lines go over streets — a thin deck,
 * low railings instead of tall parapets, hazard stripes (yellow and black)
 * where vehicles pass, and short spans. Three designs:
 *   lowslab - a thin RC slab bridge: three-block deck with soffit ribs, a
 *             fascia beam with a striped lower edge, a kerb and a steel
 *             railing; slender rectangular columns under a thin cap, striped
 *             at the bottom.
 *   lowsteel - shallow steel girders under each rail with cross beams, a
 *             riveted edge girder, a bar railing; steel bents with striped
 *             column feet.
 *   rahmen  - a rigid frame (라멘교) as at an underpass: a thin deck cast with
 *             wall piers across the whole width, haunched where they meet,
 *             the wall ends and the fascia striped, a low wall + railing.
 * They join the railway's BRIDGES list (hidden like the rest).
 */
import { BRIDGES, BOXCAST, FOOT, top, bolt, stair, OUT_F } from './bridges.js';

const YEL = 'yellow_concrete', BLK = 'black_concrete';
/** Diagonal hazard stripes along a face (two blocks each). */
const stripe = (a, b) => (((a + b) % 4) + 4) % 4 < 2 ? YEL : BLK;
const RAIL_POST = 'andesite_wall';

const LOW = [
    {
        id: 'lowslab', name: '저상 RC 슬래브교 (낮은 고가, 얇은 바닥 + 철제 난간)', group: 'low',
        l: 8, span: 14, widen: 0, dyMin: -3, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u);
            if (e < 0)
                return null;
            if (e === 0) {
                if (dy === -3)
                    return stripe(j, dy); // striped lower edge of the fascia (clearance mark)
                if (dy === -2 || dy === -1)
                    return BOXCAST.b; // fascia beam
                if (dy === 0)
                    return 'polished_andesite'; // kerb
                if (dy === 1 || dy === 2)
                    return j % 3 === 0 ? RAIL_POST : 'iron_bars'; // low railing
                return null;
            }
            if (e === 1)
                return dy >= -3 && dy <= 0 ? BOXCAST.b : null; // edge beam
            if (dy === -1 || dy === -2)
                return BOXCAST.b; // deck slab
            if (dy === -3)
                return e <= 3 || j % 4 === 0 ? BOXCAST.b : null; // edge beams and soffit ribs
            return null;
        },
        pier(g, ground) {
            const out = [];
            // a thin cap under the deck
            for (let u = g.uL + 2; u <= g.uR - 2; u++)
                for (let a = -1; a <= 1; a++)
                    out.push([u, -4, a, Math.abs(a) === 1 ? top('andesite_slab') : BOXCAST.b]);
            // slender columns, no more than 10 apart
            const n = Math.max(2, Math.ceil((g.uR - g.uL - 6) / 10) + 1);
            for (let k = 0; k < n; k++) {
                const cu = Math.round(g.uL + 3 + k * (g.uR - g.uL - 6) / (n - 1));
                for (let dy = -5; dy > ground; dy--)
                    for (const du of [0, 1])
                        for (const a of [0, 1])
                            out.push([cu + du, dy, a, dy <= ground + 4 ? stripe(du + a, dy) : BOXCAST.b]);
                for (let du = -1; du <= 2; du++)
                    for (let a = -1; a <= 2; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
            }
            return out;
        },
    },
    {
        id: 'lowsteel', name: '저상 강판형교 (얕은 강거더 + 철제 난간)', group: 'low',
        l: 6, span: 12, widen: 0, dyMin: -3, dyMax: 2, fillFrom: 2, lift: false, steel: true,
        section(u, dy, j, g) {
            const e = g.e(u), sd = g.sd(u), P = g.paint;
            if (e < 0)
                return dy === -2 && j % 2 === 0 ? bolt(OUT_F(sd)) : null; // rivets on the edge girder
            if (e === 0) {
                if (dy === -1 || dy === -2)
                    return P.main; // edge girder
                if (dy === -3)
                    return P.slab; // its bottom flange
                if (dy === 0)
                    return P.slab; // kerb plate
                if (dy === 1 || dy === 2)
                    return j % 3 === 0 ? P.post : P.bars; // railing
                return null;
            }
            if (e === 1)
                return dy === -1 || dy === 0 ? P.main : dy === -2 ? top(P.slab) : null;
            if (dy === -1)
                return P.main; // deck plate
            if (g.rails.includes(u))
                return dy === -2 ? P.main : dy === -3 ? P.slab : null; // a shallow girder under each rail
            if (j % 6 === 3 && dy === -2)
                return P.main; // cross beams
            return null;
        },
        pier(g, ground) {
            const out = [], P = g.paint;
            for (let u = g.uL + 1; u <= g.uR - 1; u++)
                for (let a = -1; a <= 1; a++)
                    out.push([u, -4, a, g.rails.includes(u) && a === 0 ? P.shoe : P.main]); // cross beam on shoes
            const cols = [g.uL + 3, g.uR - 3];
            if (g.Bh >= 14)
                cols.push(g.c0r);
            for (const cu of cols) {
                for (let dy = -5; dy > ground; dy--)
                    for (let du = -1; du <= 1; du++)
                        for (let a = -1; a <= 1; a++) {
                            if (Math.abs(du) === 1 && Math.abs(a) === 1)
                                continue; // a cross-shaped (H) section
                            out.push([cu + du, dy, a, dy <= ground + 3 ? stripe(du + a, dy) : P.main]);
                        }
                for (let du = -2; du <= 2; du++)
                    for (let a = -2; a <= 2; a++)
                        out.push([cu + du, ground, a, FOOT.b]);
            }
            return out;
        },
    },
    {
        id: 'rahmen', name: '라멘교 (지하차도형, 바닥과 벽 일체 + 낮은 벽 난간)', group: 'low',
        l: 8, span: 16, widen: 0, dyMin: -2, dyMax: 2, fillFrom: 2, lift: false,
        section(u, dy, j, g) {
            const e = g.e(u);
            if (e < 0)
                return null;
            if (e === 0) {
                if (dy === -2)
                    return stripe(j, dy); // striped fascia over the road
                if (dy === -1 || dy === 0)
                    return BOXCAST.b; // fascia, low wall
                if (dy === 1)
                    return j % 4 === 0 ? RAIL_POST : 'iron_bars'; // railing on the wall
                if (dy === 2)
                    return j % 4 === 0 ? 'polished_andesite_slab' : null;
                return null;
            }
            return dy === -1 || dy === -2 || (e === 1 && dy === 0) ? BOXCAST.b : null; // deck slab
        },
        pier(g, ground) {
            const out = [];
            // a wall across the whole width, cast with the deck: haunched at the top
            for (let u = g.uL + 1; u <= g.uR - 1; u++) {
                const end = u === g.uL + 1 || u === g.uR - 1;
                for (let dy = -3; dy > ground; dy--)
                    for (const a of [-1, 0])
                        out.push([u, dy, a, end && dy <= ground + 5 ? stripe(a, dy) : BOXCAST.b]);
                out.push([u, -3, 1, stair('andesite_stairs', 2, true)]); // haunches
                out.push([u, -3, -2, stair('andesite_stairs', 3, true)]);
                for (const a of [-2, -1, 0, 1])
                    out.push([u, ground, a, FOOT.b]);
            }
            return out;
        },
    },
];
for (const d of LOW)
    if (!BRIDGES.some(b => b.id === d.id))
        BRIDGES.push(d);
export default LOW;
