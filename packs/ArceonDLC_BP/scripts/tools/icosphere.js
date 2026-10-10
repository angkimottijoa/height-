/*
 * Icosphere (Arceon //icosphere): an icosahedron around the player's
 * block, optionally subdivided (0..5 times, new vertices pushed out to the
 * sphere). Faces are filled with lines swept across each triangle; -l only
 * draws the edges.
 */

/** Arceon's icosphere mesh: {verts: [[x,y,z]], faces: [[a,b,c]]}. */
export function icosphere(subdivide, radius = 1.2) {
    const phi = (1 + Math.sqrt(5)) * 0.5;
    const t = 1 / phi;
    // the 12 base vertices are not normalised (length ~1.176), as in Arceon
    const verts = [
        [-t, 1, 0], [t, 1, 0], [-t, -1, 0], [t, -1, 0],
        [0, -t, 1], [0, t, 1], [0, -t, -1], [0, t, -1],
        [1, 0, -t], [1, 0, t], [-1, 0, -t], [-1, 0, t],
    ];
    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const cache = new Map();
    const middle = (a, b) => {
        const k = a < b ? a + ',' + b : b + ',' + a;
        if (cache.has(k))
            return cache.get(k);
        const p = verts[a], q = verts[b];
        const m = [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5, (p[2] + q[2]) * 0.5];
        const l = Math.hypot(m[0], m[1], m[2]);
        verts.push(m.map(c => c / l * radius));
        cache.set(k, verts.length - 1);
        return verts.length - 1;
    };
    for (let s = 0; s < subdivide; s++) {
        const next = [];
        for (const [a, b, c] of faces) {
            const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
            next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = next;
    }
    return { verts, faces };
}

/** Arceon l.a(a, b, n): n points from a to b, both ends included. */
function* points(a, b, n) {
    n--;
    for (let i = 0; i < n; i++)
        yield { x: a.x + i * (b.x - a.x) / n, y: a.y + i * (b.y - a.y) / n, z: a.z + i * (b.z - a.z) / n };
    yield b;
}

export default {
    id: 'icosphere',
    name: '다면체 구 (아이코스피어)',
    desc: '내 위치를 중심으로 삼각형 면이 이어진 각진 구를 만듭니다.',
    icon: 'textures/blocks/amethyst_block',
    needs: 'none',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'size', type: 'number', label: '크기', default: 20, min: 5, max: 10000 },
        { key: 'subdivide', type: 'slider', label: '면 쪼개기 횟수 (클수록 둥글게)', default: 0, min: 0, max: 5 },
        { key: 'outline', type: 'toggle', label: '모서리 선만 (-l)', default: false },
    ],
    *run(ctx, v) {
        let size = Number(v.size) || 5;
        size = Math.max(5, Math.min(10000, size)) / 1.2;
        const sub = Math.max(0, Math.min(5, Math.floor(Number(v.subdivide) || 0)));
        const pattern = ctx.pattern('block');
        const edit = ctx.edit;
        const c = {
            x: Math.floor(ctx.location.x) + 0.5,
            y: Math.floor(ctx.location.y) + 0.5,
            z: Math.floor(ctx.location.z) + 0.5,
        };
        const { verts, faces } = icosphere(sub);
        const r = size / 2;
        const P = (i) => ({ x: c.x + verts[i][0] * r, y: c.y + verts[i][1] * r, z: c.z + verts[i][2] * r });
        const done = new Set();
        let ops = 0;
        const put = (p) => {
            const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
            const k = x + ',' + y + ',' + z;
            if (done.has(k))
                return;
            done.add(k);
            pattern.place(edit, { x, y, z });
        };
        for (const f of faces) {
            const a = P(f[0]), b = P(f[1]), cc = P(f[2]);
            const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 5) + 1;
            if (!v.outline) {
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                for (let i = 0; i < n; i++) {
                    for (const p of points({ x: b.x + i * dx / n, y: b.y + i * dy / n, z: b.z + i * dz / n }, cc, n))
                        put(p);
                    if (++ops % 20 === 0)
                        yield;
                }
            }
            else {
                for (const p of points(a, b, n))
                    put(p);
                for (const p of points(b, cc, n))
                    put(p);
                for (const p of points(cc, a, n))
                    put(p);
                yield;
            }
        }
        return `면 ${faces.length}개`;
    },
};
