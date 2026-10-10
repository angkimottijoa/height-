/*
 * Spike (Arceon //spike <block> <size1> <size2> [size3] -n -p).
 *
 * Sweeps a ball along the curve through the wand points (10 samples per
 * block); its diameter goes from size1 to size2 (or size1 -> size2 ->
 * size3 when size3 is not 0). -n wobbles the path in 3D, -p uses straight
 * lines between the points instead of the curve.
 */
import { TOO_CLOSE, curve, curvePoints, placeKeys, randomNoise } from '../lib/curve_common.js';
import { line } from '../core/vec.js';

export default {
    id: 'spike',
    name: '가시',
    desc: '찍은 점들을 따라 굵기가 변하는 가시/뿔/덩굴 모양을 만듭니다.',
    icon: 'textures/blocks/pointed_dripstone_up_tip',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'size1', type: 'number', label: '시작 굵기', default: 1, min: 0, max: 100 },
        { key: 'size2', type: 'number', label: '중간 또는 끝 굵기', default: 10, min: 0, max: 100 },
        { key: 'size3', type: 'number', label: '끝 굵기 (0 = 안 씀, 쓰면 위 칸은 중간 굵기)', default: 0, min: 0, max: 100 },
        { key: 'noise', type: 'toggle', label: '모양을 울퉁불퉁하게 (-n)', default: false },
        { key: 'straight', type: 'toggle', label: '곡선 대신 직선 (-p)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const s1 = Number(v.size1), s2 = Number(v.size2), s3 = Number(v.size3) || 0;
        const pts = curvePoints(ctx);
        const { path, length } = curve(pts);
        if (length <= 5)
            throw new Error(TOO_CLOSE);
        const n = length * 10;
        const nx = randomNoise(), nz = randomNoise(), ny = randomNoise();
        const wobble = (p) => v.noise ? {
            x: p.x + nx.simplex(p.x / 20, p.z / 20) * 5,
            y: p.y + ny.simplex(p.x / 20, p.z / 20) * 5,
            z: p.z + nz.simplex(p.x / 20, p.z / 20) * 5,
        } : p;
        const centers = [];
        if (!v.straight) {
            for (let i = 0; i < n; i++)
                centers.push(wobble(path.frac(i / n)));
        }
        else {
            for (let i = 0; i < pts.length - 1; i++)
                for (const p of line(pts[i], pts[i + 1]))
                    centers.push(wobble(p));
        }
        const keys = new Set();
        const m = centers.length;
        let ops = 0;
        for (let i = 0; i < m; i++) {
            const c = centers[i];
            let d;
            if (s3 === 0)
                d = s1 + (s2 - s1) * (i / m);
            else if (i < m / 2)
                d = s1 + (s2 - s1) * (i / (m / 2));
            else
                d = s2 + (s3 - s2) * ((i - m / 2) / (m / 2));
            // l.a(center, d): grid points offset from the center within d/2
            const r = d / 2, r2 = r * r;
            for (let x = c.x - r; x <= c.x + r; x++)
                for (let y = c.y - r; y <= c.y + r; y++)
                    for (let z = c.z - r; z <= c.z + r; z++) {
                        if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 < r2)
                            keys.add(Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z));
                        if (++ops % 20000 === 0)
                            yield;
                    }
        }
        yield* placeKeys(ctx.edit, pattern, keys);
    },
};
