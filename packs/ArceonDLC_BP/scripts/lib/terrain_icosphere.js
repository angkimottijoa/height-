/*
 * Arceon's rough icosphere (h/j.java) used by the boulder brush: a randomly
 * stretched icosahedron, turned by a random angle and subdivided `quality`
 * times with jittered midpoints.
 *   const s = icosphere(3)  ->  { verts: [[x,y,z]...], tris: [[a,b,c]...] }
 */
export function icosphere(quality, radius = 1.2, rough = true) {
    const verts = [];
    const tris = [];
    const edges = new Map();
    const t = 1 / ((1 + Math.sqrt(5)) * 0.5);
    const r = () => Math.random() / 2 + 0.75;
    const addVert = (x, y, z, ang) => {
        if (ang === 0)
            verts.push([x, y, z]);
        else
            verts.push([x * Math.cos(ang) - z * Math.sin(ang), y, z * Math.cos(ang) + x * Math.sin(ang)]);
        return verts.length - 1;
    };
    const base = [[-t, 1, 0], [t, 1, 0], [-t, -1, 0], [t, -1, 0], [0, -t, 1], [0, t, 1], [0, -t, -1], [0, t, -1],
        [1, 0, -t], [1, 0, t], [-1, 0, -t], [-1, 0, t]];
    if (rough) {
        const ang = Math.random() * 2 * Math.PI;
        for (const [x, y, z] of base)
            addVert(x * r(), y * r(), z * r(), ang);
    }
    else {
        for (const [x, y, z] of base)
            addVert(x, y, z, 0);
    }
    for (const f of [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
        tris.push(f);
    const q2 = quality * quality;
    // Java: 1 - 1 / (2 + q²) / 2 is integer maths, so the jitter is 1 + rand / (2 + q²)
    const jitter = () => Math.random() / (2 + q2) + 1;
    const middle = (a, b) => {
        const k = a < b ? a + ',' + b : b + ',' + a;
        const hit = edges.get(k);
        if (hit !== undefined)
            return hit;
        const p = verts[a], q = verts[b];
        let m = [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5, (p[2] + q[2]) * 0.5];
        const lm = Math.hypot(m[0], m[1], m[2]);
        if (rough) {
            const s = (Math.hypot(p[0], p[1], p[2]) + Math.hypot(q[0], q[1], q[2])) / 2 / lm;
            m = [m[0] * jitter() * s, m[1] * jitter() * s, m[2] * jitter() * s];
        }
        else {
            m = [m[0] / lm * radius, m[1] / lm * radius, m[2] / lm * radius];
        }
        verts.push(m);
        edges.set(k, verts.length - 1);
        return verts.length - 1;
    };
    for (let i = 0; i < quality; i++) {
        const old = tris.splice(0);
        for (const [a, b, c] of old) {
            const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
            tris.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
    }
    return { verts, tris };
}
