/*
 * FastNoise (Jordan Peck, Java version) 2D, as bundled in Arceon (h/a.java)
 * and configured by its Terragen. core/noise.js is a look-alike; Terragen
 * needs the real thing: the simplex skew constants (F2 0.5, G2 0.25),
 * the integer hashes, the 0.45-jittered cell table, the unnormalised
 * RigidMulti sum and the cell-value / noise-lookup cellular returns all
 * shape the terrain (heights are (noise + 1) * height / 2).
 */
const GRAD_2D = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [0, 1], [1, 0]];
// CELL_2D: 256 offsets (x, y), straight from FastNoise
const CELL_2D = [
    -0.43135393, 0.12819435, -0.17333168, 0.41527838, -0.28219575, -0.35052183, -0.28064737, 0.35176277,
    0.3125509, -0.3237467, 0.33830184, -0.29673535, -0.4393982, -0.09710417, -0.44604436, -0.05953503,
    -0.30222303, 0.3334085, -0.21268106, -0.39656875, -0.29911566, 0.33619907, 0.22933237, 0.38717782,
    0.44754392, -0.046951506, 0.1777518, 0.41340572, 0.16885225, -0.4171198, -0.097659715, 0.43927506,
    0.084501885, 0.44199485, -0.40987605, -0.18574613, 0.34765857, -0.2857158, -0.335067, -0.30038327,
    0.229819, -0.38688916, -0.010699241, 0.4498728, -0.44601414, -0.059761196, 0.3650294, 0.26316068,
    -0.34947944, 0.28348568, -0.41227207, 0.18036559, -0.26732782, 0.36198872, 0.32212403, -0.31422302,
    0.2880446, -0.34573156, 0.38921708, -0.22585405, 0.4492085, -0.026678115, -0.44977248, 0.014307996,
    0.12781754, -0.43146574, -0.035721004, 0.44858, -0.4297407, -0.13350253, -0.32178178, 0.3145735,
    -0.3057159, 0.33020872, -0.414504, 0.17517549, -0.373814, 0.25052565, 0.22368914, -0.39046532,
    0.0029677756, -0.4499902, 0.17471284, -0.4146992, -0.44237724, -0.08247648, -0.2763961, -0.35511294,
    -0.4019386, -0.20234962, 0.3871414, -0.22939382, -0.43000874, 0.1326367, -0.030375743, -0.44897363,
    -0.34861815, 0.28454417, 0.045535173, -0.44769025, -0.037580293, 0.44842806, 0.3266409, 0.309525,
    0.065400176, -0.4452222, 0.03409026, 0.44870687, -0.44491938, 0.06742967, -0.4255936, -0.14618507,
    0.4499173, 0.008627303, 0.052426063, 0.44693568, -0.4495305, -0.020550266, -0.12047757, 0.43357256,
    -0.3419864, -0.2924813, 0.386532, 0.23041917, 0.045060977, -0.4477382, -0.06283466, 0.4455915,
    0.39326003, -0.21873853, 0.44722617, -0.04988731, 0.3753571, -0.24820767, -0.2736623, 0.35722396,
    0.17004615, 0.4166345, 0.41026923, 0.18487608, 0.3232272, -0.31308815, -0.28823102, -0.34557614,
    0.20509727, 0.4005435, 0.4414086, -0.08751257, -0.16847004, 0.4172743, -0.0039780326, 0.4499824,
    -0.20551336, 0.4003302, -0.006095675, -0.4499587, -0.11962281, -0.43380916, 0.39015284, -0.2242337,
    0.017235318, 0.4496698, -0.30150703, 0.33405614, -0.015142624, -0.44974515, -0.4142574, -0.1757578,
    -0.19163772, -0.40715474, 0.37492487, 0.24886008, -0.22377743, 0.39041474, -0.41663432, -0.17004661,
    0.36191717, 0.2674247, 0.18911268, -0.4083337, -0.3127425, 0.3235616, -0.3281808, 0.30789182,
    -0.22948067, 0.38708994, -0.34452662, 0.28948474, -0.41670954, -0.16986217, -0.2578903, -0.36877173,
    -0.3612038, 0.26838747, 0.22679965, 0.38866684, 0.20715706, 0.3994821, 0.083551764, -0.44217542,
    -0.43122333, 0.12863296, 0.32570556, 0.3105091, 0.1777011, -0.41342753, -0.44518253, 0.0656698,
    0.39551434, 0.21463552, -0.4264614, 0.14363383, -0.37937996, -0.24201414, 0.04617599, -0.4476246,
    -0.37140542, -0.25408268, 0.25635704, -0.36983925, 0.03476646, 0.44865498, -0.30654544, 0.32943875,
    -0.22569798, 0.38930762, 0.41164485, -0.18179253, -0.29077458, -0.3434387, 0.28422785, -0.3488761,
    0.31145895, -0.32479736, 0.44641557, -0.05668443, -0.3037334, -0.33203316, 0.4079607, 0.18991591,
    -0.3486949, -0.2844501, 0.32648215, 0.30969244, 0.32111424, 0.3152549, 0.011833827, 0.44984436,
    0.43338442, 0.1211526, 0.31186685, 0.32440573, -0.27275348, 0.35791835, -0.42222863, -0.15563737,
    -0.10097001, -0.438526, -0.2741171, -0.35687506, -0.14651251, 0.425481, 0.2302279, -0.38664597,
    -0.36994356, 0.25620648, 0.10570035, -0.4374099, -0.26467136, 0.36393553, 0.3521828, 0.2801201,
    -0.18641879, -0.40957054, 0.1994493, -0.40338564, 0.3937065, 0.21793391, -0.32261583, 0.31371805,
    0.37962353, 0.2416319, 0.1482922, 0.424864, -0.4074004, 0.19111493, 0.4212853, 0.15817298,
    -0.26212972, 0.36577043, -0.2536987, -0.37166783, -0.21002364, 0.3979825, 0.36241525, 0.2667493,
    -0.36450386, -0.26388812, 0.23184867, 0.38567626, -0.3260457, 0.3101519, -0.21300453, -0.3963951,
    0.3814999, -0.23865843, -0.34297732, 0.29131868, -0.43558657, 0.11297941, -0.21046796, 0.3977477,
    0.33483645, -0.30064023, 0.34304687, 0.29123673, -0.22918367, -0.38726586, 0.25477073, -0.3709338,
    0.42361748, -0.1518164, -0.15387742, 0.4228732, -0.44074494, 0.09079596, -0.06805276, -0.4448245,
    0.44535172, -0.06451237, 0.25624645, -0.36991587, 0.32781982, -0.30827612, -0.41227743, -0.18035334,
    0.3354091, -0.30000123, 0.44663286, -0.054946158, -0.16089533, 0.42025313, -0.09463955, 0.43993562,
    -0.026376883, -0.4492263, 0.44710281, -0.050981198, -0.4365671, 0.10912917, -0.39598587, 0.21376434,
    -0.42400482, -0.15073125, -0.38827947, 0.22746222, -0.42836526, -0.13785212, 0.3303888, 0.30552125,
    0.3321435, -0.30361274, -0.41302106, -0.17864382, 0.084030606, -0.44208467, -0.38228828, 0.23739347,
    -0.37123957, -0.25432497, 0.4472364, -0.049795635, -0.44665912, 0.054732345, 0.048627254, -0.44736493,
    -0.42031014, -0.16074637, 0.22053608, 0.3922548, -0.36249006, 0.2666476, -0.40360868, -0.19899757,
    0.21527278, 0.39516786, -0.43593928, -0.11161062, 0.4178354, 0.1670735, 0.20076302, 0.40273342,
    -0.07278067, -0.4440754, 0.36447486, -0.26392817, -0.43174517, 0.12687041, -0.29743645, 0.33768559,
    -0.2998672, 0.3355289, -0.26736742, 0.3619595, 0.28084233, 0.35160714, 0.34989464, 0.28297302,
    -0.22296856, 0.39087725, 0.33058232, 0.30531186, -0.24366812, -0.37831977, -0.034027766, 0.4487116,
    -0.31935883, 0.31703302, 0.44546336, -0.063737005, 0.44835043, 0.03849544, -0.44273585, -0.08052933,
    0.054522987, 0.44668472, -0.28125608, 0.35127628, 0.12666969, 0.43180412, -0.37359813, 0.25084746,
    0.29597083, -0.3389709, -0.37143773, 0.25403547, -0.4044671, -0.19724695, 0.16361657, -0.41920117,
    0.32891855, -0.30710354, -0.2494825, -0.374511, 0.032831334, 0.44880074, -0.16630606, -0.41814148,
    -0.10683318, 0.43713462, 0.0644026, -0.4453676, -0.4483231, 0.03881238, -0.42137775, -0.15792651,
    0.05097921, -0.44710302, 0.20505841, -0.40056342, 0.41780984, -0.16713744, -0.35651895, -0.27458012,
    0.44783983, 0.04403978, -0.33999997, -0.2947881, 0.3767122, 0.24614613, -0.31389344, 0.32244518,
    -0.14620018, -0.42558843, 0.39702904, -0.21182053, 0.44591492, -0.0604969, -0.41048893, -0.18438771,
    0.1475104, -0.4251361, 0.0925803, 0.44037357, -0.15896647, -0.42098653, 0.2482445, 0.37533274,
    0.43836242, -0.10167786, 0.06242803, 0.44564867, 0.2846591, -0.3485243, -0.34420276, -0.28986976,
    0.11981889, -0.43375504, -0.2435907, 0.37836963, 0.2958191, -0.3391033, -0.1164008, 0.43468478,
    0.12740372, -0.4315881, 0.3680473, 0.2589231, 0.2451437, 0.3773653, -0.43145096, 0.12786736,];

const fastFloor = (f) => (f >= 0 ? Math.trunc(f) : Math.trunc(f) - 1);
const fastRound = (f) => (f >= 0 ? Math.trunc(f + 0.5) : Math.trunc(f - 0.5));
const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const hermite = (t) => t * t * (3 - 2 * t);

function hash2D(seed, x, y) {
    let h = seed ^ Math.imul(1619, x) ^ Math.imul(31337, y);
    h = Math.imul(Math.imul(Math.imul(h, h), h), 60493);
    return (h >> 13) ^ h;
}
function valCoord2D(seed, x, y) {
    const n = seed ^ Math.imul(1619, x) ^ Math.imul(31337, y);
    return Math.imul(Math.imul(Math.imul(n, n), n), 60493) / 2147483648;
}
function gradCoord2D(seed, x, y, xd, yd) {
    const g = GRAD_2D[hash2D(seed, x, y) & 7];
    return xd * g[0] + yd * g[1];
}

function singleSimplex(seed, x, y) {
    let t = (x + y) * 0.5;
    const i = fastFloor(x + t), j = fastFloor(y + t);
    t = (i + j) * 0.25;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + 0.25, y1 = y0 - j1 + 0.25;
    const x2 = x0 - 1 + 0.5, y2 = y0 - 1 + 0.5;
    let n0 = 0, n1 = 0, n2 = 0;
    t = 0.5 - x0 * x0 - y0 * y0;
    if (t >= 0) {
        t *= t;
        n0 = t * t * gradCoord2D(seed, i, j, x0, y0);
    }
    t = 0.5 - x1 * x1 - y1 * y1;
    if (t >= 0) {
        t *= t;
        n1 = t * t * gradCoord2D(seed, i + i1, j + j1, x1, y1);
    }
    t = 0.5 - x2 * x2 - y2 * y2;
    if (t >= 0) {
        t *= t;
        n2 = t * t * gradCoord2D(seed, i + 1, j + 1, x2, y2);
    }
    return 50 * (n0 + n1 + n2);
}

/** FastNoise instance (2D only). Defaults match FastNoise. */
export class FastNoise {
    constructor(seed = 1337) {
        this.seed = seed | 0;
        this.frequency = 0.01;
        this.interp = 'quintic'; // linear | hermite | quintic
        this.type = 'simplex'; // value | valueFractal | simplex | simplexFractal | cellular
        this.octaves = 3;
        this.lacunarity = 2;
        this.gain = 0.5;
        this.fractalType = 'fbm'; // fbm | billow | rigid
        this.distance = 'euclidean'; // euclidean | manhattan | natural
        this.ret = 'cellValue'; // cellValue | noiseLookup | distance | distance2 | distance2Add | distance2Sub | distance2Mul | distance2Div
        this.lookup = null;
        this.calcBounding();
    }
    setOctaves(n) {
        this.octaves = n;
        this.calcBounding();
    }
    calcBounding() {
        let amp = this.gain, ampFractal = 1;
        for (let i = 1; i < this.octaves; i++) {
            ampFractal += amp;
            amp *= this.gain;
        }
        this.bounding = 1 / ampFractal;
    }
    singleValue(seed, x, y) {
        const x0 = fastFloor(x), y0 = fastFloor(y);
        let xs = x - x0, ys = y - y0;
        if (this.interp === 'quintic') {
            xs = quintic(xs);
            ys = quintic(ys);
        }
        else if (this.interp === 'hermite') {
            xs = hermite(xs);
            ys = hermite(ys);
        }
        const xf0 = valCoord2D(seed, x0, y0) + xs * (valCoord2D(seed, x0 + 1, y0) - valCoord2D(seed, x0, y0));
        const xf1 = valCoord2D(seed, x0, y0 + 1) + xs * (valCoord2D(seed, x0 + 1, y0 + 1) - valCoord2D(seed, x0, y0 + 1));
        return xf0 + ys * (xf1 - xf0);
    }
    fractal(single, x, y) {
        let seed = this.seed;
        let amp = 1;
        switch (this.fractalType) {
            case 'fbm': {
                let sum = single(seed, x, y);
                for (let i = 1; i < this.octaves; i++) {
                    x *= this.lacunarity;
                    y *= this.lacunarity;
                    amp *= this.gain;
                    sum += single(++seed, x, y) * amp;
                }
                return sum * this.bounding;
            }
            case 'billow': {
                let sum = Math.abs(single(seed, x, y)) * 2 - 1;
                for (let i = 1; i < this.octaves; i++) {
                    x *= this.lacunarity;
                    y *= this.lacunarity;
                    amp *= this.gain;
                    sum += (Math.abs(single(++seed, x, y)) * 2 - 1) * amp;
                }
                return sum * this.bounding;
            }
            case 'rigid': {
                // FastNoise does not scale the RigidMulti sum
                let sum = 1 - Math.abs(single(seed, x, y));
                for (let i = 1; i < this.octaves; i++) {
                    x *= this.lacunarity;
                    y *= this.lacunarity;
                    amp *= this.gain;
                    sum -= (1 - Math.abs(single(++seed, x, y))) * amp;
                }
                return sum;
            }
        }
        return 0;
    }
    dist(dx, dy) {
        if (this.distance === 'manhattan')
            return Math.abs(dx) + Math.abs(dy);
        if (this.distance === 'natural')
            return Math.abs(dx) + Math.abs(dy) + dx * dx + dy * dy;
        return dx * dx + dy * dy;
    }
    cellular(x, y) {
        const xr = fastRound(x), yr = fastRound(y);
        if (this.ret === 'cellValue' || this.ret === 'noiseLookup' || this.ret === 'distance') {
            let best = 999999, cx = 0, cy = 0;
            for (let xi = xr - 1; xi <= xr + 1; xi++)
                for (let yi = yr - 1; yi <= yr + 1; yi++) {
                    const c = (hash2D(this.seed, xi, yi) & 255) * 2;
                    const d = this.dist(xi - x + CELL_2D[c], yi - y + CELL_2D[c + 1]);
                    if (d < best) {
                        best = d;
                        cx = xi;
                        cy = yi;
                    }
                }
            if (this.ret === 'cellValue')
                return valCoord2D(0, cx, cy); // seed 0, as in FastNoise
            if (this.ret === 'noiseLookup') {
                const c = (hash2D(this.seed, cx, cy) & 255) * 2;
                return this.lookup ? this.lookup.get(cx + CELL_2D[c], cy + CELL_2D[c + 1]) : 0;
            }
            return best - 1;
        }
        let d0 = 999999, d1 = 999999;
        for (let xi = xr - 1; xi <= xr + 1; xi++)
            for (let yi = yr - 1; yi <= yr + 1; yi++) {
                const c = (hash2D(this.seed, xi, yi) & 255) * 2;
                const d = this.dist(xi - x + CELL_2D[c], yi - y + CELL_2D[c + 1]);
                d1 = Math.max(Math.min(d1, d), d0);
                d0 = Math.min(d0, d);
            }
        switch (this.ret) {
            case 'distance2': return d1 - 1;
            case 'distance2Add': return d1 + d0 - 1;
            case 'distance2Sub': return d1 - d0 - 1;
            case 'distance2Mul': return d1 * d0 - 1;
            case 'distance2Div': return d0 / d1 - 1;
        }
        return 0;
    }
    /** FastNoise.GetNoise(x, y). */
    get(x, y) {
        x *= this.frequency;
        y *= this.frequency;
        switch (this.type) {
            case 'value': return this.singleValue(this.seed, x, y);
            case 'valueFractal': return this.fractal((s, a, b) => this.singleValue(s, a, b), x, y);
            case 'simplex': return singleSimplex(this.seed, x, y);
            case 'simplexFractal': return this.fractal(singleSimplex, x, y);
            case 'cellular': return this.cellular(x, y);
        }
        return 0;
    }
}

/** Terragen noise types (Arceon TerrainGenHandler$NoiseType, minus INVALID). */
export const TG_TYPES = ['simplex', 'fractal', 'billowy', 'ridged', 'turbulence', 'electric', 'euclidean', 'manhattan', 'natural', 'poly'];

/**
 * The FastNoise set up exactly like Arceon's Terragen:
 *   base frequency 0.01 / zoom, fractals 4 octaves (8 with -n; electric 3/5),
 *   cellular 0.1 / zoom looking up a 0.05 / zoom simplex (cell value with -r),
 *   poly = natural distance2 at 0.03 / zoom.
 * Turbulence sets FastNoise's unused "s" field, so it is plain FBM like fractal.
 */
export function terragenNoise(type, seed, zoom, { more = false, randomCells = false } = {}) {
    const n = new FastNoise(seed);
    n.frequency = 0.01 / zoom;
    const look = new FastNoise(seed);
    look.frequency = 0.05 / zoom;
    look.type = 'simplex';
    switch (type) {
        case 'simplex':
            n.type = 'simplex';
            break;
        case 'fractal':
        case 'turbulence':
        case 'billowy':
        case 'ridged':
            n.type = 'simplexFractal';
            n.fractalType = type === 'billowy' ? 'billow' : type === 'ridged' ? 'rigid' : 'fbm';
            n.setOctaves(more ? 8 : 4);
            break;
        case 'electric':
            n.type = 'valueFractal';
            n.fractalType = 'rigid';
            n.setOctaves(more ? 5 : 3);
            break;
        case 'euclidean':
        case 'manhattan':
        case 'natural':
            n.type = 'cellular';
            n.distance = type;
            if (randomCells)
                n.ret = 'cellValue';
            else {
                n.ret = 'noiseLookup';
                n.lookup = look;
            }
            n.frequency = 0.1 / zoom;
            break;
        case 'poly':
            n.type = 'cellular';
            n.distance = 'natural';
            n.ret = 'distance2';
            n.frequency = 0.03 / zoom;
            break;
        default:
            return null;
    }
    return n;
}
