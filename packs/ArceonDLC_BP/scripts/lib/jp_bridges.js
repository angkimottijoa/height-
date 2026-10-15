/*
 * Japanese city plate girder bridges (as over the streets at Shinjuku):
 * a deep painted girder whose outer face carries straight on up as the
 * railing — posts every 4 blocks standing proud of the web, a mid rail and
 * a handrail — with rivet rows on the web, signal cable boxes (light blue,
 * wooden lids) sitting in the railing now and then, girders under every rail,
 * cross beams and lower bracing. Two of them:
 *   jpplate - on the steel bents of the Yamanote plate girder bridge.
 *   jpwall  - on concrete abutment walls across the whole width (the street
 *             passes between two walls): light concrete with panel joints, a
 *             stepped bridge seat with pads under every girder and a cornice.
 * They join the railway's BRIDGES list (hidden like the rest).
 */
import { BRIDGES, FOOT, bolt, mix, OUT_F, top } from './bridges.js';

const WALL = mix([
    [50, 'light_gray_concrete', 'andesite_slab', 'andesite_stairs'],
    [30, 'polished_andesite', 'polished_andesite_slab', 'polished_andesite_stairs'],
    [20, 'andesite', 'andesite_slab', 'andesite_stairs'],
]);

/** The girder + railing section shared by both. */
function section(u, dy, j, g) {
    const e = g.e(u), sd = g.sd(u), P = g.paint;
    const box = j % 16 === 8 || j % 16 === 9; // a signal cable box in the railing
    if (e < 0) {
        // posts standing proud of the web, rivet rows between them
        if (j % 4 === 0 && dy >= -5 && dy <= 2)
            return P.main;
        if ((dy === -2 || dy === -5) && j % 2 === 1)
            return bolt(OUT_F(sd));
        if (box && (dy === 1 || dy === 2))
            return 'light_blue_concrete';
        return null;
    }
    if (e === 0) {
        if (dy === -6)
            return P.slab; // bottom flange
        if (dy >= -5 && dy <= 0)
            return P.main; // the web, on up as the railing's base
        if (box)
            return dy === 1 || dy === 2 ? 'light_blue_concrete' : dy === 3 ? 'spruce_slab' : null;
        if (dy === 1)
            return P.bars; // between the rails
        if (dy === 2)
            return P.slab; // mid rail
        if (dy === 3)
            return j % 4 === 0 ? P.slab : null; // post caps (the handrail rides on the posts)
        return null;
    }
    if (e === 1) {
        if (dy === 0 || dy === -1)
            return P.main; // walkway edge
        if (dy === -2)
            return top(P.slab); // top flange inside
        if (dy === 2)
            return box ? 'spruce_slab' : null;
        return null;
    }
    if (dy === -1)
        return P.main; // deck plate
    if (dy >= 0)
        return null;
    for (const r of g.rails) {
        const d = u - r;
        if (d === 0)
            return dy >= -5 ? P.main : P.slab; // girder under each rail
        if (Math.abs(d) === 1 && dy === -6)
            return P.slab;
        if (Math.abs(d) === 1 && dy === -5 && j % 2 === 0)
            return bolt(d < 0 ? 4 : 5);
    }
    if (j % 6 === 3 && (dy === -2 || dy === -3))
        return P.main; // cross beams
    if (j % 6 === 0 && dy === -6)
        return P.bars; // lower bracing
    return null;
}

const plate = BRIDGES.find(b => b.id === 'plate');

const JP = [
    {
        id: 'jpplate', name: '일본식 판형교 (난간이 붙은 깊은 거더 + 강재 교각, 신주쿠 양식)', group: 'jp',
        l: 16, span: 20, widen: 0, dyMin: -6, dyMax: 3, steel: true, fillFrom: 2, lift: false,
        section,
        pier: (g, ground) => plate.pier(g, ground),
    },
    {
        id: 'jpwall', name: '일본식 판형교 + 콘크리트 교대 벽 (거리 위, 벽 사이로 길)', group: 'jp',
        l: 16, span: 18, widen: 0, dyMin: -6, dyMax: 3, steel: true, fillFrom: 2, lift: false,
        section,
        pier(g, ground) {
            const out = [];
            for (let u = g.uL; u <= g.uR; u++) {
                const girder = g.rails.includes(u) || u === g.uL + 0 || u === g.uR;
                const edge = u === g.uL || u === g.uR;
                // the bridge seat: pads under the girders, a step down to the face
                for (let a = -2; a <= 1; a++)
                    out.push([u, -7, a, girder && a >= -1 && a <= 0 ? 'polished_blackstone' : WALL.b]);
                out.push([u, -7, 2, WALL.slab(true)]); // cornice
                out.push([u, -7, -3, WALL.slab(true)]);
                for (let dy = -8; dy > ground; dy--)
                    for (let a = -2; a <= 1; a++) {
                        const face = a === -2 || a === 1;
                        // panel joints every 4 across, and a horizontal line every 5
                        const joint = face && ((u - g.uL) % 4 === 0 || (dy - ground) % 5 === 0);
                        out.push([u, dy, a, edge && face ? 'polished_andesite' : joint ? 'andesite' : WALL.b]);
                    }
                for (let a = -3; a <= 2; a++)
                    out.push([u, ground, a, FOOT.b]);
            }
            return out;
        },
    },
];
for (const d of JP)
    if (!BRIDGES.some(b => b.id === d.id))
        BRIDGES.push(d);
export default JP;
