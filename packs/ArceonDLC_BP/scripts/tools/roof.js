/*
 * Roof (Arceon //roof <block> <width> [height] -n -d -b -h -p).
 *
 * Follows the curve through the wand points and draws a gable cross
 * section at every sample: the height rises linearly from both eaves to
 * the ridge in the middle. -b bevels (hips) both ends, -h keeps only the
 * roof surface, -d stacks it down to the ground (with -h only the eaves
 * and the two ends). A single slab block renders in half blocks.
 */
import {
    TOO_CLOSE, bkey, crossEnds, curve, curvePoints, noiseXZ, placeKeys, placeSlabs, randomNoise, SlabMap,
} from '../lib/curve_common.js';
import { dist, line, lineN } from '../core/vec.js';

export default {
    id: 'roof',
    name: '지붕',
    desc: '찍은 점들을 따라 박공(삼각) 지붕을 씌웁니다. 반블록이면 반 칸 단위로 매끄럽게 만듭니다.',
    icon: 'textures/blocks/planks_spruce',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'spruce_planks' },
        { key: 'width', type: 'number', label: '폭', default: 10, min: 1, max: 200 },
        { key: 'height', type: 'number', label: '높이', default: 3, min: 0, max: 200 },
        { key: 'noise', type: 'toggle', label: '모양을 울퉁불퉁하게 (-n)', default: false },
        { key: 'down', type: 'toggle', label: '아래로 땅까지 쌓기 (-d)', default: false },
        { key: 'bevel', type: 'toggle', label: '양 끝도 비스듬히 (모임지붕, -b)', default: false },
        { key: 'hollow', type: 'toggle', label: '속 비우기 (-h)', default: false },
        { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const edit = ctx.edit;
        const width = Number(v.width);
        const height = Number(v.height);
        const pts = curvePoints(ctx, { straight: !!v.straight });
        const slabs = pattern.slabs;
        // renderer: plain block set, or half-block map (DetailedRoofRenderer)
        const keys = new Set();
        const sm = new SlabMap();
        const addHalf = (k, half) => {
            const cur = sm.map.get(k);
            if (cur !== undefined && half !== 'full') {
                if (cur !== half && cur !== 'full')
                    sm.map.set(k, 'full');
            }
            else {
                sm.map.set(k, half);
            }
        };
        const addPoint = (p) => {
            if (slabs)
                addHalf(bkey(p), Math.abs(p.y) % 1 >= 0.5 ? 'top' : 'bottom');
            else
                keys.add(bkey(p));
        };
        const addFull = (p) => {
            if (slabs)
                addHalf(bkey(p), 'full');
            else
                keys.add(bkey(p));
        };
        let along = 5, across = 5, ridge = 0.15;
        if (v.hollow) {
            const k = height * (slabs ? 0.25 : 0.125);
            across = Math.max(5, Math.trunc(5 * k));
            ridge = 0.15 / across;
            if (v.bevel)
                along = Math.max(5, Math.trunc(5 * (k / 2)));
        }
        const { path, length } = curve(pts);
        if (length <= 5)
            throw new Error(TOO_CLOSE);
        const n = length * along;
        const skip = Math.trunc(n / (length * 5));
        const bevelLen = Math.trunc(width / 3 * along);
        const nx = randomNoise(), nz = randomNoise();
        const amp = 5 * (7 / width);
        let ops = 0;
        for (let i = 0; i < n; i++) {
            const end = i === 0 || i === n - 1;
            let shrink = 1;
            if (v.bevel) {
                if (i < bevelLen)
                    shrink = i / bevelLen;
                else if (i > n - bevelLen)
                    shrink = (n - i) / bevelLen;
                else if (skip > 1)
                    i += skip - 1;
            }
            let p = path.frac(i / n);
            let q = path.frac((i + 1e-4) / n);
            if (v.noise) {
                p = noiseXZ(nx, nz, p, amp);
                q = noiseXZ(nx, nz, q, amp);
            }
            const [L, R] = crossEnds(p, q, width);
            const span = dist(L, R);
            const half = span / 2;
            for (const s of lineN(L, R, Math.trunc(span * across))) {
                const d = dist(s, L);
                let h, eave;
                if (d > half - ridge && d < half + ridge) {
                    h = height;
                    eave = false;
                }
                else if (d > half) {
                    const rem = span - d;
                    h = height * (rem / half);
                    eave = rem <= ridge;
                }
                else {
                    h = height * (d / half);
                    eave = d <= ridge;
                }
                h = Math.min(shrink * height, h);
                const top = { x: s.x, y: s.y + h, z: s.z };
                let down = !!v.down;
                if (v.down && v.hollow)
                    down = end || eave;
                if (v.hollow && !down)
                    addPoint(top);
                else
                    for (const t of line(s, top))
                        addPoint(t);
                if (down) {
                    const ground = edit.highest(Math.floor(top.x), Math.floor(top.z), edit.minY, Math.trunc(top.y - 1 - 1 - h));
                    let y = s.y;
                    do {
                        y -= 1;
                        addFull({ x: s.x, y, z: s.z });
                    } while (y > ground);
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
