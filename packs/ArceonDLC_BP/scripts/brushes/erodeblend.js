/*
 * Erode-blend brush (Arceon /arcbrush erodeblend = FAWE erode, one pass,
 * then a blend ball). Erode: a solid block with >= erodeFaces open
 * neighbours becomes the most common open neighbour. Fill: an open block
 * with >= fillFaces solid neighbours becomes the most common solid one.
 * Blend: each solid block takes the most common block of its 3x3x3.
 * The buffers are indexed like Arceon's clipboards, so the erode/fill
 * sphere sits one block towards -x -y -z of the blend ball, as in Arceon.
 */
import { isSolidId, permToString } from '../core/blocks.js';

const TYPES = {
    fill: [5, 2],
    smooth: [3, 3],
    lift: [6, 1],
    melt: [2, 5],
    clear: [1, 6],
};
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

// Java compares interned block states; Bedrock permutations are separate objects
const keys = new WeakMap();
function stateKey(p) {
    let k = keys.get(p);
    if (k === undefined) {
        k = permToString(p);
        keys.set(p, k);
    }
    return k;
}
const same = (a, b) => a === b || (!!a && !!b && stateKey(a) === stateKey(b));

export default {
    id: 'erodeblend',
    name: '지형 다듬기 브러시',
    desc: '지형을 깎거나 메운 뒤 주변 블록과 자연스럽게 섞습니다.',
    icon: 'textures/blocks/coarse_dirt',
    fields: [
        { key: 'size', type: 'slider', label: '크기 (반지름)', default: 5, min: 1, max: 20 },
        {
            key: 'type', type: 'dropdown', label: '종류', default: 'smooth', options: [
                { value: 'fill', label: '메우기 (Fill)' },
                { value: 'smooth', label: '다듬기 (Smooth)' },
                { value: 'lift', label: '들어올리기 (Lift)' },
                { value: 'melt', label: '녹이기 (Melt)' },
                { value: 'clear', label: '걷어내기 (Clear)' },
            ],
        },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const size = Number(v.size) || 5;
        const [erodeFaces, fillFaces] = TYPES[v.type] ?? TYPES.melt;
        const r = Math.trunc(size);
        const r2 = Math.trunc(size * size);
        const rm2 = Math.trunc((size - 1) * (size - 1));
        const W = 2 * r + 3; // clipboard: center - r - 1 .. center + r + 1
        const N = W * W * W;
        const idx = (x, y, z) => (x * W + y) * W + z;
        const orig = new Array(N).fill(null);
        // world (hit - r + i) goes to index i, like Arceon's copy loop
        let ops = 0;
        for (let i = 0; i <= 2 * r; i++)
            for (let j = 0; j <= 2 * r; j++)
                for (let k = 0; k <= 2 * r; k++) {
                    orig[idx(i, j, k)] = edit.get({ x: hit.x - r + i, y: hit.y - r + j, z: hit.z - r + k });
                    if (++ops % 4000 === 0)
                        yield;
                }
        const solid = (p) => !!p && isSolidId(p.type.id);
        const tid = (p) => (p ? p.type.id : '');
        let a = orig.slice(); // buffer1
        let b = orig.slice(); // buffer2
        // erosion: read a, write b; then fill: read b, write a
        const pass = function* (src, dst, faces, wantSolid, strictly) {
            const R = r - 1;
            for (let dx = -R, i = 0; dx <= R; dx++, i++)
                for (let dy = -R, j = 0; dy <= R; dy++, j++)
                    for (let dz = -R, k = 0; dz <= R; dz++, k++) {
                        if (++ops % 4000 === 0)
                            yield;
                        const at = idx(i, k, j);
                        dst[at] = src[at];
                        const cur = src[at];
                        if (dx * dx + dy * dy + dz * dz >= rm2 || !cur || solid(cur) === wantSolid)
                            continue;
                        const counts = new Map();
                        let best = cur, bestN = 1, total = 0;
                        for (const [fx, fy, fz] of FACES) {
                            const x = i + fx, y = k + fy, z = j + fz;
                            if (x < 0 || y < 0 || z < 0 || x >= W || y >= W || z >= W)
                                continue;
                            const nb = src[idx(x, y, z)];
                            if (!nb || solid(nb) !== wantSolid)
                                continue;
                            total++;
                            const c = (counts.get(tid(nb)) ?? 0) + 1;
                            counts.set(tid(nb), c);
                            if (strictly ? c > bestN : c >= bestN) {
                                bestN = c;
                                best = nb;
                            }
                        }
                        if (total >= faces)
                            dst[at] = best;
                    }
        };
        // erode: solid blocks look at open neighbours (count must beat 1)
        yield* pass(a, b, erodeFaces, false, true);
        // fill: open blocks look at solid neighbours (count >= 1)
        yield* pass(b, a, fillFaces, true, false);
        // blend ball: read a, write b
        for (let dx = -r, i = 0; dx <= r; dx++, i++)
            for (let dy = -r, j = 0; dy <= r; dy++, j++)
                for (let dz = -r, k = 0; dz <= r; dz++, k++) {
                    if (++ops % 4000 === 0)
                        yield;
                    const at = idx(i, k, j);
                    b[at] = a[at];
                    const cur = a[at];
                    if (dx * dx + dy * dy + dz * dz >= r2 || !solid(cur))
                        continue;
                    const counts = new Map();
                    let best = cur, bestN = 1, tie = false;
                    for (let ox = -1; ox <= 1; ox++)
                        for (let oz = -1; oz <= 1; oz++)
                            for (let oy = -1; oy <= 1; oy++) {
                                const nb = a[idx(i + ox, k + oy, j + oz)];
                                const key = tid(nb);
                                const c = (counts.get(key) ?? 0) + 1;
                                counts.set(key, c);
                                if (c > bestN) {
                                    bestN = c;
                                    best = nb;
                                    tie = false;
                                }
                                else if (c === bestN)
                                    tie = true;
                            }
                    if (!tie && best && !same(best, cur))
                        b[at] = best;
                }
        // write back what changed
        for (let i = 0; i < W; i++)
            for (let j = 0; j < W; j++)
                for (let k = 0; k < W; k++) {
                    const at = idx(i, j, k);
                    const p = b[at];
                    if (p && !same(p, orig[at]))
                        edit.set({ x: hit.x - r + i, y: hit.y - r + j, z: hit.z - r + k }, p);
                    if (++ops % 4000 === 0)
                        yield;
                }
    },
};
