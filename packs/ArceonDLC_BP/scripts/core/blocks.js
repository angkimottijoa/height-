/*
 * Blocks, patterns and masks.
 *
 * A pattern string is what the forms take in the "블록 ID / 패턴" field:
 *
 *   stone                         one block (minecraft: is optional)
 *   oak_slab[top]                 slab half shorthand ([top] / [bottom] / [double])
 *   oak_stairs[weirdo_direction=2,upside_down_bit=true]   block states
 *   50%stone,30%andesite,cobblestone   weighted random mix (no % = 1 share)
 *   #type[oak]  #cc[lime]  #invert  #blend  #dp[0..5]
 *   #turb[scale][pattern][seed]  #elec[..]  #arcvor[..]  #frac[..]  #cell[scale][pattern][jitter][seed]
 *
 * A mask string selects which blocks a tool may touch:
 *
 *   stone,dirt   !air   #existing   #solid
 *   #arcangle[min][max][range]  #prox[mask][d]  #prox3D[mask][d]
 *   #above[mask][d]  #below[mask][d]  y[min][max]  #type[oak]  #cc[red]
 *   #ambient[min]  #ygradient[min][max]
 *   #noise[seed][zoom][coverage]  #turbulence[zoom][coverage]  #electric[..]
 *   #crack[zoom][coverage][jitter]  #cell[..]  #voronoi[zoom][jitter]  #fractal[zoom][coverage]
 *   several masks with a space between them must all match.
 */
import { BlockPermutation, BlockTypes } from '@minecraft/server';
import { FAMILIES } from './families.js';
import { Noise } from './noise.js';

// --------------------------------------------------------------------------
// ids
// --------------------------------------------------------------------------
/** Java names people are likely to type, mapped to the Bedrock id. */
const ALIASES = {
    bricks: 'brick_block', brick: 'brick_block', end_stone_bricks: 'end_bricks', cobblestone_stairs: 'stone_stairs',
    nether_bricks: 'nether_brick', red_nether_bricks: 'red_nether_brick', quartz: 'quartz_block', purpur: 'purpur_block',
    oak_fence_gate: 'fence_gate', oak_trapdoor: 'trapdoor', oak_door: 'wooden_door', oak_button: 'wooden_button',
    oak_pressure_plate: 'wooden_pressure_plate', snow_block: 'snow', grass: 'grass_block', water_source: 'water',
    cobble: 'cobblestone', stone_brick: 'stone_bricks', stonebrick: 'stone_bricks', sugar_cane: 'reeds',
    end_stone_brick_stairs: 'end_brick_stairs', prismarine_brick_stairs: 'prismarine_bricks_stairs',
    terracotta: 'hardened_clay', slime: 'slime', smooth_stone_slab: 'smooth_stone_slab',
};

export function normId(s) {
    s = String(s).trim().toLowerCase().replace(/\s+/g, '_');
    if (!s)
        return s;
    if (!s.includes(':'))
        s = 'minecraft:' + s;
    return s;
}

export function blockExists(id) {
    try {
        return !!BlockTypes.get(id);
    }
    catch (e) {
        return false;
    }
}

/** Resolve a typed name to an existing Bedrock block id, or null. */
export function resolveId(name) {
    const id = normId(name);
    if (blockExists(id))
        return id;
    const short = id.replace(/^minecraft:/, '');
    if (ALIASES[short] && blockExists('minecraft:' + ALIASES[short]))
        return 'minecraft:' + ALIASES[short];
    return null;
}

const permCache = new Map();
/** BlockPermutation.resolve with a cache. Throws a readable error. */
export function perm(id, states) {
    const k = states ? id + JSON.stringify(states) : id;
    let p = permCache.get(k);
    if (p)
        return p;
    try {
        p = BlockPermutation.resolve(id, states ?? {});
    }
    catch (e) {
        throw new Error(`블록 "${id.replace('minecraft:', '')}"${states ? ' ' + JSON.stringify(states) : ''}을(를) 만들 수 없습니다`);
    }
    if (permCache.size > 4000)
        permCache.clear();
    permCache.set(k, p);
    return p;
}

export const AIR = () => perm('minecraft:air');
export const short = (id) => String(id).replace(/^minecraft:/, '');

const NOT_SOLID = /(^|:)(air|cave_air|void_air|light_block.*|water|flowing_water|lava|flowing_lava|short_grass|tall_grass|fern|large_fern|deadbush|.*_sapling|.*vine.*|.*torch.*|.*_carpet|snow_layer|.*flower.*|poppy|dandelion|.*tulip|azure_bluet|oxeye_daisy|allium|blue_orchid|lily_of_the_valley|cornflower|wither_rose|.*_mushroom$|.*button|.*pressure_plate|lever|ladder|rail|.*_rail|redstone_wire|tripwire.*|.*_sign|.*_hanging_sign|seagrass|kelp.*|.*_coral_fan|.*_coral|sugar_cane|reeds|sweet_berry_bush|.*_roots|.*_fungus|nether_sprouts|glow_lichen|sculk_vein|structure_void|fire|soul_fire|cobweb|bush|firefly_bush|leaf_litter|wildflowers|.*_petals|short_dry_grass|tall_dry_grass|resin_clump|pale_hanging_moss|hanging_roots|spore_blossom|small_dripleaf_block|big_dripleaf|.*_banner|.*_head|.*_skull|scaffolding)$/;

export function isAirId(id) {
    return id === 'minecraft:air' || id === 'minecraft:cave_air' || id === 'minecraft:void_air' || id === undefined;
}
export function isLiquidId(id) {
    return /(^|:)(flowing_)?(water|lava)$/.test(id);
}
/** Blocks you cannot walk through (roughly Java's "movement blocker"). */
export function isSolidId(id) {
    return !!id && !NOT_SOLID.test(id);
}

// --------------------------------------------------------------------------
// block spec:  id[state=value,...]
// --------------------------------------------------------------------------
function parseValue(v) {
    v = v.trim().replace(/^["']|["']$/g, '');
    if (v === 'true')
        return true;
    if (v === 'false')
        return false;
    if (/^-?\d+$/.test(v))
        return Number(v);
    return v;
}

/** One block with optional states, e.g. "oak_slab[top]". Returns a BlockPermutation. */
export function parseBlock(spec) {
    spec = spec.trim();
    const m = /^([^\[\]]+)(?:\[(.*)\])?$/.exec(spec);
    if (!m)
        throw new Error(`블록 형식이 잘못됨: ${spec}`);
    const id = resolveId(m[1]);
    if (!id)
        throw new Error(`없는 블록: ${m[1].trim()}`);
    let states = undefined;
    let half = null;
    if (m[2] !== undefined && m[2].trim() !== '') {
        for (const part of m[2].split(',')) {
            const eq = part.indexOf('=');
            if (eq < 0) {
                const w = part.trim().toLowerCase();
                if (w === 'top' || w === 'bottom' || w === 'double') {
                    half = w;
                    continue;
                }
                if (/^\d+$/.test(w) && /snow_layer$/.test(id)) {
                    states = { ...(states ?? {}), height: Math.max(0, Math.min(7, Number(w) - 1)) };
                    continue;
                }
                throw new Error(`상태 형식이 잘못됨: ${part}`);
            }
            states = states ?? {};
            states[part.slice(0, eq).trim()] = parseValue(part.slice(eq + 1));
        }
    }
    if (half) {
        const set = slabSet(id);
        if (!set)
            throw new Error(`${short(id)}은(는) 반블록이 아닙니다`);
        return half === 'double' ? set.double : half === 'top' ? set.top : set.bottom;
    }
    return perm(id, states);
}

/** Text form of a permutation, so it can go back into a text field. */
export function permToString(p) {
    let states = {};
    try {
        states = p.getAllStates();
    }
    catch (e) { }
    const parts = Object.entries(states).map(([k, v]) => `${k}=${typeof v === 'string' ? v : v}`);
    return short(p.type.id) + (parts.length ? `[${parts.join(',')}]` : '');
}

// --------------------------------------------------------------------------
// slabs, snow, liquids
// --------------------------------------------------------------------------
const SLAB_OF_DOUBLE = new Map();
const DOUBLE_OF_SLAB = new Map();
for (const fam of Object.values(FAMILIES.types)) {
    if (fam.forms.slab && fam.forms.double_slab) {
        DOUBLE_OF_SLAB.set('minecraft:' + fam.forms.slab, 'minecraft:' + fam.forms.double_slab);
        SLAB_OF_DOUBLE.set('minecraft:' + fam.forms.double_slab, 'minecraft:' + fam.forms.slab);
    }
}

export function isSlabId(id) {
    return /_slab$/.test(id) && !/double/.test(id);
}

/** {bottom, top, double} permutations for a slab id (or its double), or null. */
export function slabSet(id) {
    if (SLAB_OF_DOUBLE.has(id))
        id = SLAB_OF_DOUBLE.get(id);
    if (!isSlabId(id) || !blockExists(id))
        return null;
    let dbl = DOUBLE_OF_SLAB.get(id);
    if (!dbl) {
        for (const c of [id.replace(/_slab$/, '_double_slab'), id.replace(/(\w+)_slab$/, 'double_$1_slab')])
            if (blockExists(c)) {
                dbl = c;
                break;
            }
    }
    try {
        return {
            bottom: perm(id, { 'minecraft:vertical_half': 'bottom' }),
            top: perm(id, { 'minecraft:vertical_half': 'top' }),
            double: dbl ? perm(dbl) : perm(id, { 'minecraft:vertical_half': 'bottom' }),
        };
    }
    catch (e) {
        return null;
    }
}

/** Snow layer with n eighths (1..8). 8 is a full snow layer block (height 7). */
export function snowLayer(n) {
    n = Math.max(1, Math.min(8, Math.round(n)));
    return perm('minecraft:snow_layer', { height: n - 1 });
}

/** Liquid with a level 0 (source) .. 7 (thinnest). */
export function liquid(type, level = 0) {
    return perm('minecraft:' + type, { liquid_depth: Math.max(0, Math.min(15, level)) });
}

/**
 * Half-block map used by every "slab pattern" tool (Arceon's SlabPosition
 * map): sample points mark the lower or upper half of their block, a block
 * with both halves becomes a double slab.
 */
export class SlabMap {
    constructor() {
        this.map = new Map();
    }
    _put(x, y, z, half) {
        const k = x + ',' + y + ',' + z;
        const cur = this.map.get(k);
        if (cur === undefined)
            this.map.set(k, half);
        else if (cur !== half && cur !== 'full')
            this.map.set(k, 'full');
    }
    /** Mark the half of the block this float point falls in. */
    addPoint(p) {
        const fy = p.y < 0 ? Math.abs(p.y) % 1 < 0.5 : p.y % 1 >= 0.5;
        this._put(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), fy ? 'top' : 'bottom');
    }
    full(x, y, z) {
        this.map.set(x + ',' + y + ',' + z, 'full');
    }
    bottom(x, y, z) {
        this._put(x, y, z, 'bottom');
    }
    top(x, y, z) {
        this._put(x, y, z, 'top');
    }
    get size() {
        return this.map.size;
    }
    /** Write into an edit session with a slab set from slabSet(). */
    write(edit, set) {
        for (const [k, h] of this.map) {
            const [x, y, z] = k.split(',').map(Number);
            edit.set({ x, y, z }, h === 'full' ? set.double : h === 'top' ? set.top : set.bottom);
        }
    }
}

// --------------------------------------------------------------------------
// families: Type Replace / Color Replace
// --------------------------------------------------------------------------
const TYPE_OF = new Map(); // id -> {family, form}
for (const [name, fam] of Object.entries(FAMILIES.types))
    for (const [form, id] of Object.entries(fam.forms))
        if (!TYPE_OF.has('minecraft:' + id))
            TYPE_OF.set('minecraft:' + id, { family: name, form });
const COLOR_OF = new Map();
for (const [color, forms] of Object.entries(FAMILIES.colors))
    for (const [form, id] of Object.entries(forms))
        COLOR_OF.set('minecraft:' + id, { color, form });

/** Find a block family by the name a player types ("oak", "cobble", "stone_bricks"...). */
export function findFamily(name) {
    const n = String(name).trim().toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');
    if (FAMILIES.types[n])
        return n;
    for (const [k, fam] of Object.entries(FAMILIES.types))
        if (fam.aliases.includes(n) || Object.values(fam.forms).includes(n))
            return k;
    return null;
}
export const familyOf = (id) => TYPE_OF.get(id) ?? null;
export const familyForms = (name) => FAMILIES.types[name]?.forms ?? null;
export const FAMILY_NAMES = Object.keys(FAMILIES.types);

export function findColor(name) {
    const n = String(name).trim().toLowerCase().replace(/\s+/g, '_');
    if (n === 'silver')
        return 'light_gray';
    return FAMILIES.colors[n] ? n : null;
}
export const colorOf = (id) => COLOR_OF.get(id) ?? null;
export const COLOR_NAMES = Object.keys(FAMILIES.colors);

/** Copy every state the target type also has. */
export function carryStates(from, toId) {
    let states = {};
    try {
        states = from.getAllStates();
    }
    catch (e) { }
    let base;
    try {
        base = BlockPermutation.resolve(toId);
    }
    catch (e) {
        return null;
    }
    let out = base;
    for (const [k, v] of Object.entries(states)) {
        try {
            out = out.withState(k, v);
        }
        catch (e) { }
    }
    return out;
}

/** The same shape of block in another family; null if that family lacks the form. */
export function swapFamily(p, toFamily) {
    const info = familyOf(p.type.id);
    if (!info)
        return null;
    const id = FAMILIES.types[toFamily]?.forms[info.form];
    if (!id)
        return null;
    return carryStates(p, 'minecraft:' + id);
}
export function swapColor(p, toColor) {
    const info = colorOf(p.type.id);
    if (!info)
        return null;
    const id = FAMILIES.colors[toColor]?.[info.form];
    if (!id)
        return null;
    return carryStates(p, 'minecraft:' + id);
}

// --------------------------------------------------------------------------
// splitting "a,b[c,d],#x[1][2]" at top-level commas / spaces
// --------------------------------------------------------------------------
export function splitTop(s, sep = ',') {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '[')
            depth++;
        if (ch === ']')
            depth--;
        if (ch === sep && depth === 0) {
            out.push(cur);
            cur = '';
        }
        else
            cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim()).filter(x => x !== '');
}
/** "#name[a][b][c]" -> {name, args:[a,b,c]} */
function special(s) {
    const m = /^#?([A-Za-z0-9_]+)((?:\[.*\])*)$/.exec(s);
    if (!m)
        return null;
    const args = [];
    let depth = 0, cur = '';
    for (const ch of m[2]) {
        if (ch === '[') {
            if (depth++ > 0)
                cur += ch;
        }
        else if (ch === ']') {
            if (--depth > 0)
                cur += ch;
            else {
                args.push(cur);
                cur = '';
            }
        }
        else
            cur += ch;
    }
    return { name: m[1].toLowerCase(), args };
}
const num = (v, d) => (v === undefined || v === '' || isNaN(parseFloat(v))) ? d : parseFloat(v);
const pct = (v, d) => (v === undefined || v === '') ? d : parseFloat(String(v).replace('%', '')) / 100;

// --------------------------------------------------------------------------
// patterns
// --------------------------------------------------------------------------
function hash3(x, y, z, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 974634771);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
const DP = ['sunflower', 'lilac', 'tall_grass', 'large_fern', 'rose_bush', 'peony'];

/**
 * Parse a pattern. The result has:
 *   at(pos, edit)       BlockPermutation to place at pos
 *   place(edit, pos)    set it (double plants also set the upper half)
 *   first               a representative permutation
 *   slabs               {bottom, top, double} when the pattern is one slab block
 *   snow                true for snow_layer, liquid 'water' | 'lava' | null
 */
export function parsePattern(str) {
    str = String(str ?? '').trim();
    if (!str)
        throw new Error('블록/패턴이 비어 있습니다');
    const parts = splitTop(str, ',');
    const entries = parts.map(part => {
        let weight = 1;
        const m = /^(\d+(?:\.\d+)?)%(.*)$/.exec(part);
        if (m) {
            weight = parseFloat(m[1]);
            part = m[2];
        }
        return { weight, gen: patternPart(part.trim()) };
    });
    const total = entries.reduce((a, e) => a + e.weight, 0);
    const seed = Math.floor(Math.random() * 1e9);
    const one = entries.length === 1 ? entries[0].gen : null;
    const pat = {
        source: str,
        at(pos, edit) {
            if (one)
                return one.at(pos, edit);
            let r = hash3(pos.x, pos.y, pos.z, seed) * total;
            for (const e of entries) {
                r -= e.weight;
                if (r < 0)
                    return e.gen.at(pos, edit);
            }
            return entries[entries.length - 1].gen.at(pos, edit);
        },
        place(edit, pos) {
            const p = this.at(pos, edit);
            if (!p)
                return;
            edit.set(pos, p);
            if (p.type.id.endsWith('double_plant') || (/^minecraft:(sunflower|lilac|tall_grass|large_fern|rose_bush|peony)$/.test(p.type.id))) {
                try {
                    edit.set({ x: pos.x, y: pos.y + 1, z: pos.z }, p.withState('upper_block_bit', true));
                }
                catch (e) { }
            }
        },
        first: entries[0].gen.first,
        slabs: null,
        snow: false,
        liquid: null,
    };
    if (one && one.first) {
        const id = one.first.type.id;
        if (isSlabId(id) || SLAB_OF_DOUBLE.has(id))
            pat.slabs = slabSet(id);
        pat.snow = id === 'minecraft:snow_layer';
        pat.liquid = /water$/.test(id) ? 'water' : /lava$/.test(id) ? 'lava' : null;
    }
    return pat;
}

function patternPart(s) {
    if (!s.startsWith('#')) {
        const p = parseBlock(s);
        return { at: () => p, first: p };
    }
    const sp = special(s);
    if (!sp)
        throw new Error(`패턴 형식이 잘못됨: ${s}`);
    const { name, args } = sp;
    switch (name) {
        case 'type':
        case 'tr': {
            const fam = findFamily(args[0] ?? '');
            if (!fam)
                throw new Error(`블록 종류를 모름: ${args[0]}`);
            const block = perm('minecraft:' + FAMILIES.types[fam].forms.block);
            return {
                first: block,
                at(pos, edit) {
                    const cur = edit.get(pos);
                    return (cur && swapFamily(cur, fam)) ?? block;
                },
            };
        }
        case 'cc':
        case 'color': {
            const c = findColor(args[0] ?? '');
            if (!c)
                throw new Error(`색 이름을 모름: ${args[0]}`);
            const wool = perm('minecraft:' + FAMILIES.colors[c].wool);
            return {
                first: wool,
                at(pos, edit) {
                    const cur = edit.get(pos);
                    return (cur && swapColor(cur, c)) ?? wool;
                },
            };
        }
        case 'invert':
            return {
                first: AIR(),
                at(pos, edit) {
                    const cur = edit.get(pos);
                    return cur ? invert(cur) : AIR();
                },
            };
        case 'blend': {
            const mask = args[0] ? parseMask(args[0]) : null;
            return {
                first: AIR(),
                at(pos, edit) {
                    const count = new Map();
                    let best = null, bestN = 0;
                    for (let dx = -1; dx <= 1; dx++)
                        for (let dy = -1; dy <= 1; dy++)
                            for (let dz = -1; dz <= 1; dz++) {
                                const q = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
                                const p = edit.get(q);
                                if (!p || isAirId(p.type.id) || (mask && !mask.test(q, edit)))
                                    continue;
                                const n = (count.get(p) ?? 0) + 1;
                                count.set(p, n);
                                if (n > bestN) {
                                    bestN = n;
                                    best = p;
                                }
                            }
                    return best ?? edit.get(pos) ?? AIR();
                },
            };
        }
        case 'dp': {
            const kind = DP[Math.max(0, Math.min(5, Math.floor(num(args[0], 0))))];
            let p;
            try {
                p = perm('minecraft:' + kind, { upper_block_bit: false });
            }
            catch (e) {
                p = perm('minecraft:double_plant', { double_plant_type: kind === 'tall_grass' ? 'grass' : kind === 'large_fern' ? 'fern' : kind === 'lilac' ? 'syringa' : kind === 'rose_bush' ? 'rose' : kind === 'peony' ? 'paeonia' : 'sunflower', upper_block_bit: false });
            }
            return { first: p, at: () => p };
        }
        case 'turbulence':
        case 'turb':
        case 'electric':
        case 'elec':
        case 'fractal':
        case 'frac':
        case 'arcvor':
        case 'voronoi':
        case 'vor':
        case 'cell': {
            const scale = Math.max(0.01, num(args[0], 10));
            const list = splitTop(args[1] ?? '', ',').map(x => parseBlock(x));
            if (!list.length)
                throw new Error(`${name}: 블록 목록이 필요합니다 (예: #${name}[10][red_wool,blue_wool])`);
            const isCell = name === 'cell';
            const jitter = isCell ? pct(args[2], 0.5) : 0.9;
            const seed = Math.floor(num(isCell ? args[3] : args[2], Math.random() * 1e6));
            const n = new Noise(seed);
            const f = 1 / scale;
            let fn;
            if (name.startsWith('turb'))
                fn = (x, z, y) => Math.abs(n.fractal('simplex', x * f, z * f + y * f * 0.37, { octaves: 4 })) * 2 - 1;
            else if (name.startsWith('elec'))
                fn = (x, z, y) => n.fractal('value', x * f, z * f + y * f * 0.37, { octaves: 3, type: 'ridged' });
            else if (name.startsWith('frac'))
                fn = (x, z, y) => n.fractal('simplex', x * f, z * f + y * f * 0.37, { octaves: 4 });
            else if (isCell)
                fn = (x, z, y) => n.cellular(x * f, z * f + y * f * 0.37, { ret: 'cellvalue', jitter });
            else
                fn = (x, z, y) => n.cellular(x * f, z * f + y * f * 0.37, { ret: 'cellvalue', jitter: 0.9 });
            return {
                first: list[0],
                at(pos) {
                    const v = (fn(pos.x, pos.z, pos.y) + 1) / 2;
                    return list[Math.max(0, Math.min(list.length - 1, Math.floor(v * list.length)))];
                },
            };
        }
    }
    throw new Error(`모르는 패턴: #${name}`);
}

/** Flip a block upside down (stairs, slabs, trapdoors). */
export function invert(p) {
    let s = {};
    try {
        s = p.getAllStates();
    }
    catch (e) {
        return p;
    }
    const out = {};
    if ('upside_down_bit' in s)
        out.upside_down_bit = !s.upside_down_bit;
    if ('minecraft:vertical_half' in s)
        out['minecraft:vertical_half'] = s['minecraft:vertical_half'] === 'top' ? 'bottom' : 'top';
    if ('hanging' in s)
        out.hanging = !s.hanging;
    if ('attachment' in s && (s.attachment === 'floor' || s.attachment === 'ceiling'))
        out.attachment = s.attachment === 'floor' ? 'ceiling' : 'floor';
    try {
        return BlockPermutation.resolve(p.type.id, { ...s, ...out });
    }
    catch (e) {
        return p;
    }
}

// --------------------------------------------------------------------------
// masks
// --------------------------------------------------------------------------
/** Parse a mask. mask.test(pos, edit) -> boolean. Empty string -> null (everything). */
export function parseMask(str) {
    str = String(str ?? '').trim();
    if (!str)
        return null;
    const all = splitTop(str, ' ').map(maskTerm);
    if (all.length === 1)
        return all[0];
    return { test: (pos, edit) => all.every(m => m.test(pos, edit)) };
}

function maskTerm(s) {
    if (s.startsWith('!')) {
        const m = maskTerm(s.slice(1));
        return { test: (p, e) => !m.test(p, e) };
    }
    if (!s.startsWith('#') && !/^y\[/i.test(s)) {
        const list = splitTop(s, ',').map(b => {
            if (/\[/.test(b))
                return { exact: parseBlock(b) };
            const id = resolveId(b);
            if (!id)
                throw new Error(`없는 블록: ${b}`);
            return { id };
        });
        return {
            test(p, e) {
                const cur = e.get(p);
                const id = cur?.type.id ?? 'minecraft:air';
                return list.some(x => x.exact ? cur === x.exact || (cur && cur.matches(x.exact.type.id, x.exact.getAllStates())) : x.id === id);
            },
        };
    }
    const sp = special(s);
    if (!sp)
        throw new Error(`마스크 형식이 잘못됨: ${s}`);
    const { name, args } = sp;
    const idAt = (e, p) => e.get(p)?.type.id ?? 'minecraft:air';
    switch (name) {
        case 'existing':
            return { test: (p, e) => !isAirId(idAt(e, p)) };
        case 'solid':
            return { test: (p, e) => isSolidId(idAt(e, p)) };
        case 'air':
            return { test: (p, e) => isAirId(idAt(e, p)) };
        case 'y': {
            const lo = num(args[0], -64), hi = num(args[1], 320);
            return { test: p => p.y >= lo && p.y <= hi };
        }
        case 'type':
        case 'tr': {
            const fam = findFamily(args[0] ?? '');
            if (!fam)
                throw new Error(`블록 종류를 모름: ${args[0]}`);
            return { test: (p, e) => familyOf(idAt(e, p))?.family === fam };
        }
        case 'cc':
        case 'color': {
            const c = findColor(args[0] ?? '');
            if (!c)
                throw new Error(`색 이름을 모름: ${args[0]}`);
            return { test: (p, e) => colorOf(idAt(e, p))?.color === c };
        }
        case 'arcangle': {
            const lo = num(args[0], 0), hi = num(args[1], 90), r = Math.max(1, Math.min(2, Math.round(num(args[2], 1))));
            return { test: (p, e) => { const a = surfaceAngle(e, p, r); return a >= lo && a <= hi; } };
        }
        case 'prox':
        case 'prox3d': {
            const inner = parseMask(args[0] ?? '#existing');
            const d = Math.max(1, Math.round(num(args[1], 3)));
            const three = name === 'prox3d';
            return {
                test(p, e) {
                    if (!three) {
                        for (let dy = -d; dy <= d; dy++)
                            if (inner.test({ x: p.x, y: p.y + dy, z: p.z }, e))
                                return true;
                        return false;
                    }
                    for (let dx = -d; dx <= d; dx++)
                        for (let dy = -d; dy <= d; dy++)
                            for (let dz = -d; dz <= d; dz++)
                                if (dx * dx + dy * dy + dz * dz <= d * d && inner.test({ x: p.x + dx, y: p.y + dy, z: p.z + dz }, e))
                                    return true;
                    return false;
                },
            };
        }
        case 'above':
        case 'below': {
            const inner = parseMask(args[0] ?? '#existing');
            const d = Math.max(1, Math.round(num(args[1], 5)));
            const dir = name === 'above' ? -1 : 1;
            return {
                test(p, e) {
                    for (let i = 1; i <= d; i++)
                        if (inner.test({ x: p.x, y: p.y + dir * i, z: p.z }, e))
                            return true;
                    return false;
                },
            };
        }
        case 'ambient': {
            const min = num(args[0], 2);
            return {
                test(p, e) {
                    let n = 0;
                    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
                        if (isAirId(idAt(e, { x: p.x + dx, y: p.y + dy, z: p.z + dz })))
                            n++;
                    return n >= min;
                },
            };
        }
        case 'ygradient': {
            const lo = num(args[0], 0), hi = num(args[1], 10);
            return {
                test(p) {
                    if (p.y <= lo)
                        return true;
                    if (p.y >= hi)
                        return false;
                    return hash3(p.x, p.y, p.z, 99) > (p.y - lo) / (hi - lo);
                },
            };
        }
        case 'noise': {
            const n = new Noise(Math.floor(num(args[0], 1)));
            const zoom = Math.max(0.01, num(args[1], 20));
            const cov = pct(args[2], 0.5);
            return { test: p => (n.simplex3(p.x / zoom, p.y / zoom, p.z / zoom) + 1) / 2 < cov };
        }
        case 'turbulence':
        case 'turb':
        case 'electric':
        case 'elec':
        case 'fractal':
        case 'frac':
        case 'crack':
        case 'cell':
        case 'voronoi':
        case 'vor': {
            const zoom = Math.max(0.01, num(args[0], 1)) * 20;
            const n = new Noise(Math.floor(Math.random() * 1e6));
            const f = 1 / zoom;
            if (name === 'voronoi' || name === 'vor') {
                const jitter = pct(args[1], 0.5);
                // borders between cells
                return { test: p => n.cellular(p.x * f, p.z * f + p.y * f * 0.37, { ret: 'distance2sub', jitter: jitter * 2 }) < -0.8 };
            }
            const cov = pct(args[1], 0.5);
            if (name === 'crack') {
                const jitter = pct(args[2], 0.7);
                return { test: p => (n.cellular(p.x * f, p.z * f + p.y * f * 0.37, { ret: 'distance2sub', jitter: jitter * 1.4 }) + 1) / 2 < cov * 0.3 };
            }
            if (name === 'cell') {
                const jitter = pct(args[2], 0.7);
                return { test: p => (n.cellular(p.x * f, p.z * f + p.y * f * 0.37, { ret: 'cellvalue', jitter: jitter * 1.4 }) + 1) / 2 < cov };
            }
            let fn;
            if (name.startsWith('turb'))
                fn = (x, y, z) => Math.abs(n.fractal('simplex', x * f, z * f + y * f * 0.37, { octaves: 4 }));
            else if (name.startsWith('elec'))
                fn = (x, y, z) => (n.fractal('value', x * f, z * f + y * f * 0.37, { octaves: 3, type: 'ridged' }) + 1) / 2;
            else
                fn = (x, y, z) => (n.fractal('simplex', x * f, z * f + y * f * 0.37, { octaves: 4 }) + 1) / 2;
            return { test: p => fn(p.x, p.y, p.z) < cov };
        }
    }
    throw new Error(`모르는 마스크: #${name}`);
}

/**
 * Surface slope at a block in degrees (0 = flat ground, 90 = wall), from the
 * height differences of the surrounding columns.
 */
export function surfaceAngle(edit, p, r = 1) {
    const h = (x, z) => {
        for (let dy = r + 2; dy >= -(r + 2); dy--)
            if (isSolidId(edit.get({ x, y: p.y + dy, z })?.type.id))
                return p.y + dy;
        return p.y - (r + 3);
    };
    const dx = (h(p.x + r, p.z) - h(p.x - r, p.z)) / (2 * r);
    const dz = (h(p.x, p.z + r) - h(p.x, p.z - r)) / (2 * r);
    return Math.atan(Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI;
}
