/*
 * Dashes (Arceon //dashes <block> <dashLength> <gapLength> [width] -d -s -p).
 *
 * Walks the curve through the wand points (10 samples per block) and draws
 * cross lines only while inside a dash, giving a dashed line (road
 * markings, fences, stepping stones). -d puts a one-sample dot in every
 * gap, -s draws only the two edges of the width (a split line).
 */
import {
    TOO_CLOSE, bkey, crossEnds, curve, curvePoints, placeKeys, placeSlabs, SlabMap,
} from '../lib/curve_common.js';
import { dist, line } from '../core/vec.js';

export default {
    id: 'dashes',
    name: '점선',
    desc: '찍은 점들을 따라 일정 간격으로 끊어진 점선(차선, 징검다리 등)을 그립니다.',
    icon: 'textures/blocks/wool_colored_yellow',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'yellow_wool' },
        { key: 'dash', type: 'number', label: '칠할 길이', default: 3, min: 0, max: 200 },
        { key: 'gap', type: 'number', label: '띄울 길이', default: 3, min: 0, max: 200 },
        { key: 'width', type: 'number', label: '폭', default: 0, min: 0, max: 200 },
        { key: 'dots', type: 'toggle', label: '띄운 곳 가운데에 점 찍기 (-d)', default: false },
        { key: 'split', type: 'toggle', label: '양쪽 가장자리 두 줄로 (-s)', default: false },
        { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        let dash = Number(v.dash), gap = Number(v.gap), width = Number(v.width) || 0;
        if (gap > 0)
            gap += 0.95;
        if (v.dots) {
            if (dash < 0)
                dash = 0.95;
        }
        else if (--dash < 0) {
            dash = 0;
        }
        if (v.split)
            width += 0.5;
        const pts = curvePoints(ctx, { straight: !!v.straight });
        const { path, length } = curve(pts);
        if (length <= 5)
            throw new Error(TOO_CLOSE);
        const slabs = pattern.slabs;
        const keys = new Set();
        const sm = new SlabMap();
        const put = (p, half) => {
            const k = bkey(p);
            const cur = sm.map.get(k);
            if (cur === undefined)
                sm.map.set(k, half);
            else if (cur !== half && cur !== 'full')
                sm.map.set(k, 'full');
        };
        const n = length * 10;
        let prev = pts[0];
        let acc = 0, dotDone = false, ops = 0;
        for (let i = 0; i < n; i++) {
            const p = path.frac(i / n);
            const q = path.frac((i + 1e-4) / n);
            acc += dist(p, prev);
            let dot = false;
            if (!v.dots) {
                if (acc > dash + gap)
                    acc = 0;
            }
            else {
                if (acc > dash + gap && !dotDone) {
                    dot = true;
                    dotDone = true;
                }
                if (acc > dash + gap * 2) {
                    acc = 0;
                    dotDone = false;
                }
            }
            prev = p;
            if (!(acc <= dash || dot))
                continue;
            const [a, b] = crossEnds(p, q, width);
            if (!v.split) {
                for (const c of line(a, b)) {
                    if (!slabs)
                        keys.add(bkey(c));
                    else
                        put(c, c.y % 1 >= 0.5 ? 'top' : 'bottom');
                }
            }
            else if (!slabs) {
                keys.add(bkey(a));
                keys.add(bkey(b));
            }
            else {
                // Arceon decides by the first edge and copies it to the second
                const half = a.y % 1 >= 0.5 ? 'top' : 'bottom';
                const ka = bkey(a), cur = sm.map.get(ka);
                if (cur !== undefined) {
                    if (cur !== half && cur !== 'full') {
                        sm.map.set(ka, 'full');
                        sm.map.set(bkey(b), 'full');
                    }
                }
                else {
                    sm.map.set(ka, half);
                    sm.map.set(bkey(b), half);
                }
            }
            if (++ops % 2000 === 0)
                yield;
        }
        if (slabs)
            yield* placeSlabs(ctx.edit, sm, slabs);
        else
            yield* placeKeys(ctx.edit, pattern, keys);
    },
};
