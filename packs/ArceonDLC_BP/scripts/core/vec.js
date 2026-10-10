/*
 * Small vector helpers. Vectors are plain {x, y, z} objects.
 */
export const v = (x, y, z) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => {
    const l = len(a);
    return l === 0 ? { x: 0, y: 0, z: 0 } : mul(a, 1 / l);
};
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
export const floor = (a) => ({ x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
export const rad = (deg) => deg / 180 * Math.PI;
export const key = (x, y, z) => x + ',' + y + ',' + z;
export const unkey = (k) => {
    const [x, y, z] = k.split(',').map(Number);
    return { x, y, z };
};
/**
 * Points along a straight line, 5 per block (Arceon's line sampling).
 */
export function line(a, b) {
    const out = [];
    const n = Math.floor(dist(a, b) * 5);
    for (let i = 0; i < n; i++)
        out.push({ x: a.x + i * (b.x - a.x) / n, y: a.y + i * (b.y - a.y) / n, z: a.z + i * (b.z - a.z) / n });
    out.push(b);
    return out;
}
/**
 * `count` evenly spaced points from a to b, both ends included.
 */
export function lineN(a, b, count) {
    const out = [];
    const n = count - 1;
    for (let i = 0; i < n; i++)
        out.push({ x: a.x + i * (b.x - a.x) / n, y: a.y + i * (b.y - a.y) / n, z: a.z + i * (b.z - a.z) / n });
    out.push(b);
    return out;
}
/**
 * Integer positions of a ball of diameter `d` around `c`.
 */
export function ball(c, d) {
    const out = [];
    const r = d / 2;
    for (let x = c.x - r; x <= c.x + r; x++)
        for (let y = c.y - r; y <= c.y + r; y++)
            for (let z = c.z - r; z <= c.z + r; z++)
                if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 < r * r)
                    out.push({ x, y, z });
    return out;
}
/**
 * Rodrigues rotation of `p` around unit axis `k` by `deg` degrees.
 */
export function rotateAround(p, k, deg) {
    const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
    return add(add(mul(p, c), mul(cross(k, p), s)), mul(k, dot(k, p) * (1 - c)));
}
