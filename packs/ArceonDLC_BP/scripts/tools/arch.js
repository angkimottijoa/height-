/*
 * Arch (Arceon //arch <block> <width> [height] [pillarSize] [amount] [archHeight] -l -d -p).
 *
 * Walks the curve through the wand points (10 samples per block). Along
 * the way it alternates pillars (full height) and arch openings whose
 * underside follows a parabola taking archHeight % of the height. Each
 * sample draws a cross line of the width, hanging down from the curve.
 */
import {
    TOO_CLOSE, blockLine, bkey, crossEnds, curve, curvePoints, placeKeys, placeSlabs, slabSet, upperHalf, SlabMap,
} from '../lib/curve_common.js';
import { dist, line } from '../core/vec.js';

export default {
    id: 'arch',
    name: '아치',
    desc: '찍은 점들을 따라 기둥과 아치가 이어진 다리/수도교 모양을 만듭니다.',
    icon: 'textures/blocks/stonebrick',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone_bricks' },
        { key: 'width', type: 'number', label: '폭', default: 5, min: 1, max: 200 },
        { key: 'height', type: 'number', label: '높이', default: 20, min: 1, max: 300 },
        { key: 'pillar', type: 'number', label: '기둥 크기', default: 5, min: 0, max: 200 },
        { key: 'amount', type: 'slider', label: '아치 개수', default: 1, min: 1, max: 50 },
        { key: 'archHeight', type: 'slider', label: '아치 높이 (높이의 %)', default: 75, min: 0, max: 100 },
        { key: 'level', type: 'toggle', label: '아치 높이를 모두 같게 (-l)', default: false },
        { key: 'down', type: 'toggle', label: '기둥을 땅까지 내리기 (-d)', default: false },
        { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const edit = ctx.edit;
        const width = Number(v.width);
        const height = Number(v.height);
        const pillar = Number(v.pillar);
        const amount = Math.max(1, Math.floor(Number(v.amount) || 1));
        const archPct = Number(v.archHeight);
        const pts = curvePoints(ctx, { straight: !!v.straight });
        const { path, length } = curve(pts);
        const n = length * 10;
        // first pass: sampled length and lowest point
        let total = 0, minY = 2147483647, prev = null;
        for (let i = 0; i < n; i++) {
            const p = path.frac(i / n);
            if (prev)
                total += dist(prev, p);
            if (p.y < minY)
                minY = p.y;
            prev = p;
        }
        if (!(total > 5))
            throw new Error(TOO_CLOSE);
        const slabs = pattern.slabs;
        const keys = new Set();
        const sm = new SlabMap();
        let walked = 0;
        prev = null;
        let ops = 0;
        const h1 = height - 1;
        const step = 1 / amount;
        const open = (total - pillar * amount) / total / amount;
        const half = (step - open) / 2; // pillar half, as a fraction of one arch
        for (let i = 0; i < n; i++) {
            const p = path.frac(i / n);
            if (prev)
                walked += dist(prev, p);
            prev = p;
            const q = path.frac((i + 1e-4) / n);
            const [a, b] = crossEnds(p, q, width);
            const f = walked / total;
            const which = Math.floor(f * amount);
            const local = (f - which * step) / step;
            let depth;
            let isPillar = false;
            if (!(local <= half * amount) && !(local >= 1 - half * amount))
                depth = Math.pow((local - half * amount) / ((step - half * 2) * amount) - 0.5, 2) * 4 * h1 * (archPct / 100);
            else
                depth = h1;
            depth += 1;
            if (depth !== height)
                depth += height * ((100 - archPct) / 100) - 1;
            else
                isPillar = true;
            if (v.level)
                depth += p.y - minY;
            for (const c of line(a, b)) {
                if (!slabs) {
                    if (v.down && isPillar) {
                        keys.add(bkey(c));
                        const top = edit.highest(Math.floor(c.x), Math.floor(c.z), edit.minY, Math.floor(c.y) - 2);
                        for (let y = c.y - 1; y > top; y--)
                            keys.add(Math.floor(c.x) + ',' + Math.floor(y) + ',' + Math.floor(c.z));
                    }
                    else {
                        blockLine(c, { x: c.x, y: c.y - depth, z: c.z }, keys);
                    }
                }
                else if (v.down && isPillar) {
                    slabSet(sm, c, upperHalf(p.y) ? 'full' : 'bottom');
                    const top = edit.highest(Math.floor(c.x), Math.floor(c.z), edit.minY, Math.floor(c.y) - 2);
                    let y = c.y;
                    do {
                        y -= 1;
                        sm.map.set(bkey({ x: c.x, y, z: c.z }), 'full');
                    } while (y > top);
                }
                else {
                    for (const s of line(c, { x: c.x, y: c.y - depth, z: c.z }))
                        sm.addPoint(s);
                }
                if (++ops % 2000 === 0)
                    yield;
            }
        }
        if (slabs)
            yield* placeSlabs(edit, sm, slabs);
        else
            yield* placeKeys(edit, pattern, keys);
        return `아치 ${amount}개`;
    },
};
