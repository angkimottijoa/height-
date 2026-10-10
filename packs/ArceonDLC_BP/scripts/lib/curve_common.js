/*
 * Shared helpers for the curve tools (road, arch, spike, dashes, river, roof).
 *
 * Arceon builds every one of these on the smooth Bezier curve through the
 * wand points, samples it N times, and draws a cross line (width) at each
 * sample. Single slab patterns are drawn in half blocks (SlabMap).
 */
import { BezierPath, straighten } from '../core/spline.js';
import { Noise } from '../core/noise.js';
import { SlabMap } from '../core/blocks.js';

export const TOO_CLOSE = '점들을 서로 더 멀리 찍으세요 (경로 길이가 5블록 이하).';

/** Wand points as floats, +0.5 on x/z (and y when yOff is 0.5), optional -p midpoints. */
export function curvePoints(ctx, { yOff = 0, straight = false } = {}) {
    let pts = ctx.points.map(p => ({ x: p.x + 0.5, y: p.y + yOff, z: p.z + 0.5 }));
    if (straight)
        pts = straighten(pts);
    if (pts.length < 2)
        throw new Error('점이 2개 이상 필요합니다');
    return pts;
}

/** The curve, and Arceon's integer length a.a(points, world). */
export function curve(pts) {
    const path = new BezierPath(pts);
    return { path, length: Math.floor(path.length) };
}

/** Arceon's random OpenSimplex noise ("new o(random.nextInt(1000000))"). */
export const randomNoise = () => new Noise(Math.floor(Math.random() * 1000000));

/** Point + direction at sample i of n, like the a.a(i/n) / a.a((i+eps)/n) pair Arceon uses. */
export function sampleDir(path, i, n, eps = 1e-4) {
    const p = path.frac(i / n);
    const q = path.frac((i + eps) / n);
    return { p, q };
}

/**
 * The two ends of a cross line of width w at p, given the next point q
 * (normalised by the full 3D distance, exactly as Arceon does).
 * Returns [left, right] = [var25/var23, var24/var22].
 */
export function crossEnds(p, q, w) {
    let dx = p.x - q.x, dz = p.z - q.z;
    const d = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
    const inv = 1 / d;
    dx *= inv;
    dz *= inv;
    return [
        { x: p.x + dz * (w / 2), y: p.y, z: p.z - dx * (w / 2) },
        { x: p.x + dz * (-w / 2), y: p.y, z: p.z - dx * (-w / 2) },
    ];
}

/** Arceon's road/roof noise offset (x and z only, amplitude 5 * 7 / width). */
export function noiseXZ(nx, nz, p, amp) {
    return { x: p.x + nx.simplex(p.x / 20, p.z / 20) * amp, y: p.y, z: p.z + nz.simplex(p.x / 20, p.z / 20) * amp };
}

/** Upper half test used by road/arch/rope: y%1 >= .5, mirrored for negative y. */
export const upperHalf = (y) => (y < 0 ? Math.abs(y) % 1 < 0.5 : y % 1 >= 0.5);

/** l.e(a, b): the set of block positions along a straight line (5 samples / block). */
export function blockLine(a, b, out) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const n = Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz) * 5);
    if (n === 0)
        out.add(Math.floor(a.x) + ',' + Math.floor(a.y) + ',' + Math.floor(a.z));
    for (let i = 0; i < n; i++)
        out.add(Math.floor(a.x + i * dx / n) + ',' + Math.floor(a.y + i * dy / n) + ',' + Math.floor(a.z + i * dz / n));
    out.add(Math.floor(b.x) + ',' + Math.floor(b.y) + ',' + Math.floor(b.z));
}

export const bkey = (p) => Math.floor(p.x) + ',' + Math.floor(p.y) + ',' + Math.floor(p.z);

/** Slab map helpers on top of core SlabMap (map values 'bottom' | 'top' | 'full'). */
export function slabPut(sm, p, top) {
    if (top)
        sm.top(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    else
        sm.bottom(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
}
/** HashMap.put: overwrite whatever is there. */
export function slabSet(sm, p, half) {
    sm.map.set(bkey(p), half);
}
export { SlabMap };

/** Place a set of "x,y,z" keys with a pattern, yielding now and then. */
export function* placeKeys(edit, pattern, keys) {
    let n = 0;
    for (const k of keys) {
        const [x, y, z] = k.split(',').map(Number);
        pattern.place(edit, { x, y, z });
        if (++n % 3000 === 0)
            yield;
    }
}

/** Write a SlabMap, yielding now and then. */
export function* placeSlabs(edit, sm, slabs) {
    let n = 0;
    for (const [k, h] of sm.map) {
        const [x, y, z] = k.split(',').map(Number);
        edit.set({ x, y, z }, h === 'full' ? slabs.double : h === 'top' ? slabs.top : slabs.bottom);
        if (++n % 3000 === 0)
            yield;
    }
}
