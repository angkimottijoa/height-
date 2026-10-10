/*
 * Paths through a list of points.
 *
 * BezierPath is a smooth curve through every point: one cubic Bezier per
 * pair of points, with control points solved so the curve is continuous
 * in slope and curvature (the classic "smooth curve through points"
 * tridiagonal solve). Arceon draws all its curve tools on this curve.
 * LinePath joins the points with straight lines.
 *
 * Both are parameterised by segment: at(0) is the first point, at(1) the
 * second, at(n - 1) the last.
 */
import { dist } from './vec.js';

class Segment {
    constructor(a, b) {
        this.p0 = { ...a };
        this.p3 = { ...b };
        this.p1 = { x: 0, y: 0, z: 0 };
        this.p2 = { x: 0, y: 0, z: 0 };
        this.length = 0;
    }
    at(t) {
        const u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        return {
            x: a * this.p0.x + b * this.p1.x + c * this.p2.x + d * this.p3.x,
            y: a * this.p0.y + b * this.p1.y + c * this.p2.y + d * this.p3.y,
            z: a * this.p0.z + b * this.p1.z + c * this.p2.z + d * this.p3.z,
        };
    }
    measure() {
        let prev = this.p0, total = 0;
        for (let i = 1; i < 20; i++) {
            const p = this.at(i * 0.05);
            total += dist(p, prev);
            prev = p;
        }
        this.length = total;
    }
}

export class BezierPath {
    constructor(points) {
        if (points.length < 2)
            throw new Error('a path needs at least 2 points');
        this.points = points.map(p => ({ ...p }));
        const n = points.length - 1;
        const seg = [];
        for (let i = 0; i < n; i++)
            seg.push(new Segment(points[i], points[i + 1]));
        if (n === 1) {
            const m = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, z: (points[0].z + points[1].z) / 2 };
            seg[0].p1 = { ...m };
            seg[0].p2 = { ...m };
        }
        else {
            const A = new Array(n), B = new Array(n), C = new Array(n), R = new Array(n);
            A[0] = 0; B[0] = 2; C[0] = 1;
            R[0] = axes(i => points[0][i] + 2 * points[1][i]);
            for (let i = 1; i < n - 1; i++) {
                A[i] = 1; B[i] = 4; C[i] = 1;
                R[i] = axes(k => 4 * points[i][k] + 2 * points[i + 1][k]);
            }
            A[n - 1] = 2; B[n - 1] = 7; C[n - 1] = 0;
            R[n - 1] = axes(k => 8 * points[n - 1][k] + points[n][k]);
            for (let i = 1; i < n; i++) {
                const m = A[i] / B[i - 1];
                B[i] = B[i] - m * C[i - 1];
                R[i] = axes(k => R[i][k] - m * R[i - 1][k]);
            }
            const P1 = new Array(n);
            P1[n - 1] = axes(k => R[n - 1][k] / B[n - 1]);
            for (let i = n - 2; i >= 0; i--)
                P1[i] = axes(k => (R[i][k] - C[i] * P1[i + 1][k]) / B[i]);
            for (let i = 0; i < n; i++)
                seg[i].p1 = P1[i];
            for (let i = 0; i < n - 1; i++)
                seg[i].p2 = axes(k => 2 * points[i + 1][k] - P1[i + 1][k]);
            seg[n - 1].p2 = axes(k => 0.5 * (points[n][k] + P1[n - 1][k]));
        }
        // keep a flat path exactly flat (no float drift off the plane)
        for (const k of ['x', 'y', 'z']) {
            if (points.every(p => p[k] === points[0][k]))
                for (const s of seg) {
                    s.p0[k] = s.p1[k] = s.p2[k] = s.p3[k] = points[0][k];
                }
        }
        this.segments = seg;
        this.length = 0;
        for (const s of seg) {
            s.measure();
            this.length += s.length;
        }
    }
    get count() {
        return this.segments.length;
    }
    at(t) {
        if (t >= this.segments.length)
            return this.segments[this.segments.length - 1].at(1);
        if (t < 0)
            t = 0;
        const i = Math.floor(t);
        return this.segments[i].at(t - i);
    }
    /** Point at fraction f (0..1) of the whole path, by segment. */
    frac(f) {
        return this.at(f * this.segments.length);
    }
}

function axes(fn) {
    return { x: fn('x'), y: fn('y'), z: fn('z') };
}

export class LinePath {
    constructor(points) {
        this.points = points.map(p => ({ ...p }));
        this.length = 0;
        for (let i = 1; i < points.length; i++)
            this.length += dist(points[i], points[i - 1]);
    }
    get count() {
        return this.points.length - 1;
    }
    at(t) {
        const p = this.points;
        if (t <= 0)
            return { ...p[0] };
        if (t >= p.length - 1)
            return { ...p[p.length - 1] };
        const i = Math.floor(t), f = t - i;
        return { x: p[i].x + (p[i + 1].x - p[i].x) * f, y: p[i].y + (p[i + 1].y - p[i].y) * f, z: p[i].z + (p[i + 1].z - p[i].z) * f };
    }
    frac(f) {
        return this.at(f * (this.points.length - 1));
    }
}

/** Arceon's a.a(t, points): point at fraction t of a smooth curve. */
export const curveAt = (path, t) => path.frac(t);

/**
 * Resample a point list to `count` points along a curve (smooth) or
 * polyline (straight), the way loft frames are evened out.
 */
export function resample(points, count, smooth) {
    if (count === points.length || count === 0)
        return points.slice();
    if (points.length === 1)
        return Array.from({ length: count }, () => ({ ...points[0] }));
    const path = smooth ? new BezierPath(points) : new LinePath(points);
    const out = [];
    for (let i = 0; i <= count - 1; i++)
        out.push(path.at(path.count * i / (count - 1)));
    return out;
}

/**
 * "-p" straighter paths: add midpoints on long legs so the curve hugs the
 * straight line between the picked points.
 */
export function straighten(points) {
    const out = [];
    points.forEach((p, i) => {
        if (i > 0) {
            const q = points[i - 1];
            const d = dist(p, q);
            const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
            if (d > 50) {
                out.push({ x: (m.x + q.x) / 2, y: (m.y + q.y) / 2, z: (m.z + q.z) / 2 });
                out.push(m);
                out.push({ x: (p.x + m.x) / 2, y: (p.y + m.y) / 2, z: (p.z + m.z) / 2 });
            }
            else if (d > 10) {
                out.push(m);
            }
        }
        out.push({ ...p });
    });
    return out;
}
