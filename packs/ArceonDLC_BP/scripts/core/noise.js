/*
 * Seeded 2D/3D noise in the style of FastNoise, which Arceon uses for
 * Terragen, the noise masks/patterns and the "-n" wobble on curves.
 *
 *   new Noise(seed).simplex(x, z)                 -1..1
 *   noise.fractal('simplex', x, z, {octaves, type})  fbm | billow | ridged
 *   noise.value(x, z)                             -1..1
 *   noise.cellular(x, z, {distance, ret, jitter, lookup})
 */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F3 = 1 / 3, G3 = 1 / 6;
const GRAD3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Noise {
    constructor(seed = Math.floor(Math.random() * 1e9)) {
        this.seed = seed;
        const rnd = mulberry32(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++)
            p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++)
            this.perm[i] = p[i & 255];
        this.frequency = 1;
    }
    hash(x, y, z = 0) {
        const p = this.perm;
        return p[(p[(p[x & 255] + (y & 255)) & 511] + (z & 255)) & 511];
    }
    // ------------------------------------------------------------ simplex
    simplex(xin, yin) {
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s), j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - (i - t), y0 = yin - (j - t);
        const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const corner = (gx, gy, x, y) => {
            let tt = 0.5 - x * x - y * y;
            if (tt < 0)
                return 0;
            const g = GRAD2[this.hash(gx, gy) & 7];
            tt *= tt;
            return tt * tt * (g[0] * x + g[1] * y);
        };
        return 70 * (corner(i, j, x0, y0) + corner(i + i1, j + j1, x1, y1) + corner(i + 1, j + 1, x2, y2));
    }
    simplex3(xin, yin, zin) {
        const s = (xin + yin + zin) * F3;
        const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
        const t = (i + j + k) * G3;
        const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
            else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
        }
        else {
            if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
            else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
            else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        }
        const pts = [[0, 0, 0, x0, y0, z0], [i1, j1, k1, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3],
            [i2, j2, k2, x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3], [1, 1, 1, x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3]];
        let n = 0;
        for (const [a, b, c, x, y, z] of pts) {
            let tt = 0.6 - x * x - y * y - z * z;
            if (tt < 0)
                continue;
            const g = GRAD3[this.hash(i + a, j + b, k + c) % 12];
            tt *= tt;
            n += tt * tt * (g[0] * x + g[1] * y + g[2] * z);
        }
        return 32 * n;
    }
    // -------------------------------------------------------------- value
    value(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const v = (a, b) => this.hash(a, b, 7) / 127.5 - 1;
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        return a + (b - a) * sy;
    }
    // ------------------------------------------------------------ fractal
    fractal(base, x, y, { octaves = 4, type = 'fbm', lacunarity = 2, gain = 0.5 } = {}) {
        const fn = base === 'value' ? (a, b) => this.value(a, b) : (a, b) => this.simplex(a, b);
        let amp = 1, freq = 1, sum = 0, bound = 0;
        for (let o = 0; o < octaves; o++) {
            let n = fn(x * freq + o * 31.7, y * freq - o * 17.3);
            if (type === 'billow')
                n = Math.abs(n) * 2 - 1;
            else if (type === 'ridged')
                n = 1 - Math.abs(n);
            sum += n * amp;
            bound += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        if (type === 'ridged')
            return (sum / bound) * 2 - 1;
        return sum / bound;
    }
    // ----------------------------------------------------------- cellular
    cellPoint(cx, cy, jitter) {
        const h = this.hash(cx, cy, 13);
        const h2 = this.hash(cx + 101, cy - 57, 29);
        return [cx + 0.5 + (h / 255 - 0.5) * jitter, cy + 0.5 + (h2 / 255 - 0.5) * jitter, (this.hash(cx, cy, 211) / 127.5) - 1];
    }
    cellular(x, y, { distance = 'euclidean', ret = 'cellvalue', jitter = 0.9, lookup = null } = {}) {
        const xi = Math.floor(x), yi = Math.floor(y);
        let d1 = Infinity, d2 = Infinity, best = null;
        for (let i = -1; i <= 1; i++)
            for (let j = -1; j <= 1; j++) {
                const [px, py, val] = this.cellPoint(xi + i, yi + j, jitter);
                const dx = px - x, dy = py - y;
                let d;
                if (distance === 'manhattan')
                    d = Math.abs(dx) + Math.abs(dy);
                else if (distance === 'natural')
                    d = dx * dx + dy * dy + (Math.abs(dx) + Math.abs(dy));
                else
                    d = dx * dx + dy * dy;
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                    best = [px, py, val];
                }
                else if (d < d2) {
                    d2 = d;
                }
            }
        if (ret === 'cellvalue')
            return best[2];
        if (ret === 'lookup' && lookup)
            return lookup(best[0], best[1]);
        if (ret === 'distance')
            return Math.min(1, Math.sqrt(d1)) * 2 - 1;
        if (ret === 'distance2')
            return Math.min(1, Math.sqrt(d2)) * 2 - 1;
        if (ret === 'distance2sub')
            return Math.min(1, Math.sqrt(d2) - Math.sqrt(d1)) * 2 - 1;
        return best[2];
    }
}

/** Terragen noise types, mapped onto the generators above. */
export function terragenNoise(type, seed, zoom, { more = false, randomCells = false } = {}) {
    const n = new Noise(seed);
    const look = new Noise(seed + 1);
    // cell coordinates are world * (0.1 / zoom); the lookup runs at 0.05 / zoom
    const lookup = (x, y) => look.simplex(x * 0.5, y * 0.5);
    const f = 0.01 / zoom;
    switch (type) {
        case 'simplex': return (x, z) => n.simplex(x * f, z * f);
        case 'fractal': return (x, z) => n.fractal('simplex', x * f, z * f, { octaves: more ? 8 : 4, type: 'fbm' });
        case 'billowy': return (x, z) => n.fractal('simplex', x * f, z * f, { octaves: more ? 8 : 4, type: 'billow' });
        case 'ridged': return (x, z) => n.fractal('simplex', x * f, z * f, { octaves: more ? 8 : 4, type: 'ridged' });
        case 'turbulence': return (x, z) => Math.abs(n.fractal('simplex', x * f, z * f, { octaves: more ? 8 : 4, type: 'fbm' })) * 2 - 1;
        case 'electric': return (x, z) => n.fractal('value', x * f, z * f, { octaves: more ? 5 : 3, type: 'ridged' });
        case 'euclidean':
        case 'manhattan':
        case 'natural': {
            const cf = 0.1 / zoom;
            return (x, z) => n.cellular(x * cf, z * cf, { distance: type, ret: randomCells ? 'cellvalue' : 'lookup', lookup });
        }
        case 'poly': {
            const cf = 0.03 / zoom;
            return (x, z) => n.cellular(x * cf, z * cf, { distance: 'natural', ret: 'distance2' });
        }
    }
    return null;
}
export const TERRAGEN_TYPES = ['simplex', 'fractal', 'billowy', 'ridged', 'turbulence', 'electric', 'euclidean', 'manhattan', 'natural', 'poly'];
