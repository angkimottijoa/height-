/*
 * Flat fill (면 채우기): the straight-faced counterpart of the curved fill.
 *
 *   faces  every frame is a closed outline filled as a flat face
 *          (works with a single frame)
 *   strip  neighbouring frames are joined by flat quads (two triangles
 *          each); optionally the first and last frame are capped
 *
 * Faces are triangulated by ear clipping on the frame's best-fit plane,
 * so concave outlines fill correctly. Triangles are filled by sampling
 * at a third of a block, which leaves no holes on slanted faces.
 */
import { SlabMap } from '../core/blocks.js';
import { add, dist, line, mul, sub } from '../core/vec.js';
import { resample } from '../core/spline.js';

/** Newell normal of a polygon. */
function normal(pts) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        nx += (a.y - b.y) * (a.z + b.z);
        ny += (a.z - b.z) * (a.x + b.x);
        nz += (a.x - b.x) * (a.y + b.y);
    }
    return { x: nx, y: ny, z: nz };
}

/** Triangles (index triples) of a simple polygon, by ear clipping. */
export function triangulate(pts) {
    if (pts.length < 3)
        return [];
    const n = normal(pts);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ax + ay + az < 1e-9)
        return [];
    // project onto the plane of the two smaller axes, keeping orientation
    let P;
    if (ax >= ay && ax >= az)
        P = pts.map(p => [p.y, p.z]), P.sign = Math.sign(n.x);
    else if (ay >= az)
        P = pts.map(p => [p.z, p.x]), P.sign = Math.sign(n.y);
    else
        P = pts.map(p => [p.x, p.y]), P.sign = Math.sign(n.z);
    const sign = P.sign || 1;
    const cross = (o, a, b) => ((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])) * sign;
    const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    const idx = pts.map((_, i) => i);
    const out = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
        let cut = false;
        for (let i = 0; i < idx.length; i++) {
            const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
            const a = P[i0], b = P[i1], c = P[i2];
            if (cross(a, b, c) <= 1e-9)
                continue;
            let ear = true;
            for (const j of idx)
                if (j !== i0 && j !== i1 && j !== i2 && inside(P[j], a, b, c)) {
                    ear = false;
                    break;
                }
            if (!ear)
                continue;
            out.push([i0, i1, i2]);
            idx.splice(i, 1);
            cut = true;
            break;
        }
        if (!cut)
            break; // self-intersecting outline: fan the rest
    }
    if (idx.length === 3)
        out.push([idx[0], idx[1], idx[2]]);
    else
        for (let i = 1; i < idx.length - 1; i++)
            out.push([idx[0], idx[i], idx[i + 1]]);
    return out;
}

/** Sample points covering a triangle (about 3 per block). */
export function* triangle(a, b, c) {
    const n = Math.max(1, Math.ceil(Math.max(dist(a, b), dist(b, c), dist(c, a)) * 3));
    const ab = sub(b, a), ac = sub(c, a);
    for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++)
            yield add(a, add(mul(ab, i / n), mul(ac, j / n)));
}

export default {
    id: 'surface',
    name: '면 채우기',
    desc: '프레임을 평평한 면으로 채웁니다. 프레임 1개면 그 도형을 채우고, 여러 개면 프레임 사이를 평면으로 잇습니다.',
    icon: 'textures/blocks/glass',
    needs: 'frames',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        {
            key: 'mode', type: 'dropdown', label: '채우는 방식', default: 'auto', options: [
                { value: 'auto', label: '자동 (프레임 1개 = 도형 채우기, 여러 개 = 사이 잇기)' },
                { value: 'faces', label: '프레임마다 도형 안을 채우기' },
                { value: 'strip', label: '프레임과 프레임 사이를 평면으로 잇기' },
            ],
        },
        { key: 'caps', type: 'toggle', label: '사이 잇기: 처음·마지막 프레임 안도 막기', default: false },
        { key: 'closed', type: 'toggle', label: '사이 잇기: 프레임의 끝 점과 첫 점도 잇기 (통 모양)', default: false },
        { key: 'outline', type: 'toggle', label: '테두리 선만 그리기', default: false },
    ],
    *run(ctx, v) {
        const frames = ctx.frames.filter(f => f.length).map(f => f.map(p => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 })));
        if (!frames.length)
            throw new Error('프레임이 없습니다');
        const pattern = ctx.pattern('block');
        const map = pattern.slabs ? new SlabMap() : null;
        const edit = ctx.edit;
        const seen = new Set();
        let n = 0;
        const put = (p) => {
            if (map) {
                map.addPoint(p);
                return;
            }
            const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
            const k = x + ',' + y + ',' + z;
            if (seen.has(k))
                return;
            seen.add(k);
            pattern.place(edit, { x, y, z });
        };
        const seg = (a, b) => {
            for (const p of line(a, b))
                put(p);
        };
        const fillPoly = function* (pts) {
            if (pts.length === 1)
                return put(pts[0]);
            for (let i = 0; i < pts.length; i++)
                seg(pts[i], pts[(i + 1) % pts.length]);
            if (v.outline || pts.length < 3)
                return;
            for (const [i, j, k] of triangulate(pts))
                for (const p of triangle(pts[i], pts[j], pts[k])) {
                    put(p);
                    if (++n % 3000 === 0)
                        yield;
                }
        };
        const mode = v.mode === 'auto' ? (frames.length === 1 ? 'faces' : 'strip') : v.mode;
        if (mode === 'faces' || frames.length === 1) {
            for (const f of frames)
                yield* fillPoly(f);
        }
        else {
            const width = Math.max(2, ...frames.map(f => f.length));
            const rs = frames.map(f => resample(f, width, false));
            const quad = function* (a, b, c, d) {
                if (v.outline) {
                    seg(a, b);
                    seg(a, d);
                    return;
                }
                for (const p of triangle(a, b, c))
                    put(p);
                for (const p of triangle(a, c, d))
                    put(p);
                if (++n % 20 === 0)
                    yield;
            };
            for (let i = 0; i < rs.length - 1; i++) {
                const A = rs[i], B = rs[i + 1];
                for (let j = 0; j < width - 1; j++)
                    yield* quad(A[j], A[j + 1], B[j + 1], B[j]);
                if (v.closed && width > 2)
                    yield* quad(A[width - 1], A[0], B[0], B[width - 1]);
                if (v.outline)
                    for (let j = 0; j < width - 1; j++)
                        seg(B[j], B[j + 1]);
            }
            if (v.caps) {
                yield* fillPoly(frames[0]);
                yield* fillPoly(frames[frames.length - 1]);
            }
        }
        if (map)
            map.write(edit, pattern.slabs);
        return `프레임 ${frames.length}개`;
    },
};
