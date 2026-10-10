/*
 * Road (Arceon //road <block> <width> [height] -n -d -p).
 *
 * Samples the curve through the wand points 3 times per block and draws a
 * cross line of the road width at each sample, extruded down by the height
 * (or, with -d, down to the ground). A single slab block gives half-block
 * detail.
 */
import {
    TOO_CLOSE, blockLine, bkey, crossEnds, curve, curvePoints, noiseXZ, placeKeys, placeSlabs,
    randomNoise, slabSet, SlabMap,
} from '../lib/curve_common.js';
import { line } from '../core/vec.js';

export default {
    id: 'road',
    name: '도로',
    desc: '찍은 점들을 따라 곡선 도로를 깝니다. 반블록을 쓰면 반 칸 단위로 다듬어집니다.',
    icon: 'textures/blocks/gravel',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'width', type: 'number', label: '폭', default: 7, min: 1, max: 200 },
        { key: 'height', type: 'number', label: '높이', default: 3, min: 0, max: 100 },
        { key: 'noise', type: 'toggle', label: '모양을 울퉁불퉁하게 (-n)', default: false },
        { key: 'down', type: 'toggle', label: '아래로 땅까지 쌓기 (-d)', default: false },
        { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const edit = ctx.edit;
        const width = Number(v.width);
        let height = Number(v.height) - 0.5;
        if (height < 0)
            height = 0;
        const pts = curvePoints(ctx, { straight: !!v.straight });
        const { path, length } = curve(pts);
        if (length <= 5)
            throw new Error(TOO_CLOSE);
        const slabs = pattern.slabs;
        const keys = new Set();
        const sm = new SlabMap();
        const n = length * 3;
        const nx = randomNoise(), nz = randomNoise();
        const amp = 5 * (7 / width);
        let ops = 0;
        for (let i = 0; i < n; i++) {
            let p = path.frac(i / n);
            let q = path.frac((i + 1e-4) / n);
            if (v.noise) {
                p = noiseXZ(nx, nz, p, amp);
                q = noiseXZ(nx, nz, q, amp);
            }
            const [a, b] = crossEnds(p, q, width);
            for (const c of line(a, b)) {
                if (!slabs) {
                    if (v.down) {
                        const top = edit.highest(Math.floor(c.x), Math.floor(c.z), edit.minY, Math.floor(c.y) - 2);
                        for (let y = c.y - 1; y > top; y--)
                            keys.add(Math.floor(c.x) + ',' + Math.floor(y) + ',' + Math.floor(c.z));
                    }
                    else {
                        blockLine(c, { x: c.x, y: c.y - height, z: c.z }, keys);
                    }
                }
                else if (!v.down) {
                    for (const s of line(c, { x: c.x, y: c.y - height, z: c.z }))
                        sm.addPoint(s);
                }
                else {
                    slabSet(sm, c, c.y % 1 >= 0.5 ? 'full' : 'bottom');
                    const top = edit.highest(Math.floor(c.x), Math.floor(c.z), edit.minY, Math.floor(c.y) - 2);
                    let y = c.y;
                    do {
                        y -= 1;
                        sm.map.set(bkey({ x: c.x, y, z: c.z }), 'full');
                    } while (y > top);
                }
                if (++ops % 2000 === 0)
                    yield;
            }
        }
        if (slabs)
            yield* placeSlabs(edit, sm, slabs);
        else
            yield* placeKeys(edit, pattern, keys);
    },
};
