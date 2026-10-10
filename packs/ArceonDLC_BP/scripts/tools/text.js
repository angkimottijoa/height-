/*
 * Text (Arceon //text + //font): writes text as blocks on a wall two blocks
 * in front of the player, reading left to right as the player sees it.
 *
 * Arceon draws the string with java.awt at `size` px (x = 2, baseline at
 * size - 2) and turns every dark pixel into a block at
 * feet + (column, size - row, 2 forward). A slab pattern draws at twice the
 * size and turns each 2x2 pixel cell into a bottom, top or double slab.
 *
 * Bedrock cannot read TTF files, so the glyphs are pre-rasterized by
 * tools/arceon_dlc/gen_fonts.py into scripts/fonts/<font>.js (1-bit bitmaps,
 * 48 px em for Latin, 22 px for CJK/Hangul), loaded lazily and scaled here.
 * Characters a font lacks fall back to the 'unicode' font.
 */
import { runAsync } from '../core/edit.js';
import { save } from '../core/session.js';

export const FONTS = ['comicsans', 'georgia', 'impact', 'king', 'lobster', 'medieval', 'minecraft', 'papyrus', 'trebuchet', 'unicode', 'verdana'];
const FONT_LABELS = {
    comicsans: 'Comic Sans', georgia: 'Georgia', impact: 'Impact', king: 'King', lobster: 'Lobster', medieval: 'Medieval',
    minecraft: 'Minecraft', papyrus: 'Papyrus', trebuchet: 'Trebuchet', unicode: 'Unicode (한글·일본어·한자)', verdana: 'Verdana',
};

// --------------------------------------------------------------------------
// font modules
// --------------------------------------------------------------------------
// literal specifiers, one per font, so the module loader can resolve each
const FONT_FILES = {
    comicsans: () => import('../fonts/comicsans.js'),
    georgia: () => import('../fonts/georgia.js'),
    impact: () => import('../fonts/impact.js'),
    king: () => import('../fonts/king.js'),
    lobster: () => import('../fonts/lobster.js'),
    medieval: () => import('../fonts/medieval.js'),
    minecraft: () => import('../fonts/minecraft.js'),
    papyrus: () => import('../fonts/papyrus.js'),
    trebuchet: () => import('../fonts/trebuchet.js'),
    unicode: () => import('../fonts/unicode.js'),
    unicode_han: () => import('../fonts/unicode_han.js'),
    unicode_hangul: () => import('../fonts/unicode_hangul.js'),
    verdana: () => import('../fonts/verdana.js'),
};

const loaded = new Map(); // module name -> Map(codepoint -> {em, raw})

async function loadModule(name) {
    let m = loaded.get(name);
    if (m)
        return m;
    let mod;
    try {
        mod = (await FONT_FILES[name]()).default;
    }
    catch (e) {
        throw new Error(`글꼴 파일을 불러오지 못했습니다: ${name} (${e?.message ?? e})`);
    }
    m = new Map();
    for (const set of mod.sets)
        for (const [cp, raw] of Object.entries(set.glyphs))
            m.set(Number(cp), { em: set.em, raw });
    loaded.set(name, m);
    return m;
}

/** Which unicode module holds a code point. */
function unicodePart(cp) {
    if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F))
        return 'unicode_hangul';
    if (cp >= 0x4E00 && cp <= 0x9FFF)
        return 'unicode_han';
    return 'unicode';
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Map([...B64].map((c, i) => [c, i]));
function b64(s) {
    const out = new Uint8Array(Math.floor(s.replace(/=+$/, '').length * 3 / 4));
    let buf = 0, bits = 0, j = 0;
    for (const c of s) {
        const v = B64I.get(c);
        if (v === undefined)
            continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[j++] = (buf >> bits) & 0xff;
        }
    }
    return out;
}

function decode(g) {
    if (g.adv !== undefined)
        return g;
    const [adv, x, y, w, h, data] = g.raw.split(',');
    g.adv = +adv;
    g.x = +x;
    g.y = +y;
    g.w = +w;
    g.h = +h;
    g.bits = b64(data ?? '');
    delete g.raw;
    return g;
}

/** Glyph for a character in a font (falls back to 'unicode'), or null. */
async function glyph(font, cp) {
    const own = font === 'unicode' ? null : await loadModule(font);
    let g = own?.get(cp);
    if (!g)
        g = (await loadModule(unicodePart(cp))).get(cp);
    return g ? decode(g) : null;
}

/**
 * Rasterize text at an em of `px` pixels like java.awt drawString(text, 2, px - 2).
 * Returns {pixels: Set('x,y'), missing} with y counted down from the top
 * of the image (row 0) like a BufferedImage.
 */
export async function rasterize(text, font, px) {
    const pixels = new Set();
    let pen = 2, missing = 0;
    const base = px - 2;
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        const g = await glyph(font, cp);
        if (!g) {
            missing++;
            pen += Math.round(px / 2);
            continue;
        }
        const k = px / g.em;
        if (g.w && g.h) {
            const x0 = pen + g.x * k, y0 = base + g.y * k;
            const sub = k >= 1 ? 1 : Math.min(8, Math.ceil(1 / k));
            const bit = (sx, sy) => {
                if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h)
                    return 0;
                const i = sy * g.w + sx;
                return (g.bits[i >> 3] >> (7 - (i & 7))) & 1;
            };
            for (let ty = Math.floor(y0); ty < Math.ceil(y0 + g.h * k); ty++)
                for (let tx = Math.floor(x0); tx < Math.ceil(x0 + g.w * k); tx++) {
                    let on = 0;
                    for (let a = 0; a < sub; a++)
                        for (let b = 0; b < sub; b++)
                            on += bit(Math.floor((tx + (a + 0.5) / sub - x0) / k), Math.floor((ty + (b + 0.5) / sub - y0) / k));
                    // downscaled: a pixel is ink when enough of its area is
                    if (on / (sub * sub) >= (sub > 1 ? 0.3 : 0.5))
                        pixels.add(tx + ',' + ty);
                }
        }
        pen += Math.round(g.adv * k);
    }
    return { pixels, missing };
}

// --------------------------------------------------------------------------
// direction (WorldEdit getCardinalDirection: 8 sectors of 45 degrees)
// --------------------------------------------------------------------------
/** 'north' | 'east' | 'south' | 'west', or null when facing a diagonal. */
export function cardinal(yaw) {
    // Bedrock yaw: 0 south, 90 west, 180 north, -90 east (same as Java)
    const rot = (((yaw - 90) % 360) + 360) % 360;
    if (rot < 22.5 || rot >= 337.5)
        return 'west';
    if (rot >= 67.5 && rot < 112.5)
        return 'north';
    if (rot >= 157.5 && rot < 202.5)
        return 'east';
    if (rot >= 247.5 && rot < 292.5)
        return 'south';
    return null;
}

/** Image column / height above the feet -> world offset for a facing. */
function place(dir, col, up) {
    switch (dir) {
        case 'north': return { x: col, y: up, z: -2 };
        case 'east': return { x: 2, y: up, z: col };
        case 'west': return { x: -2, y: up, z: -col };
        default: return { x: -col, y: up, z: 2 };
    }
}

export default {
    id: 'text',
    name: '글자',
    desc: '바라보는 방향(동서남북) 2칸 앞 벽에 글자를 블록으로 씁니다. 반블록 패턴이면 반블록으로 다듬습니다.',
    icon: 'textures/blocks/bookshelf',
    needs: 'none',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone', placeholder: 'stone 또는 stone_brick_slab' },
        { key: 'size', type: 'number', label: '크기 (글꼴 픽셀 = 블록)', default: 20, min: 4, max: 200, int: true },
        { key: 'text', type: 'text', label: '글자', placeholder: '안녕하세요 / Hey', default: '' },
        { key: 'font', type: 'dropdown', label: '글꼴 (한글·일본어는 Unicode)', default: 'minecraft', options: FONTS.map(f => ({ value: f, label: FONT_LABELS[f] })) },
        { key: 'cycle', type: 'toggle', label: '쓸 때마다 다음 글꼴로 바꾸기 (-c)', default: false },
    ],
    // async: the font modules load with import(); the placing runs as a job
    async run(ctx, v) {
        const text = String(v.text ?? '');
        if (!text.trim())
            throw new Error('쓸 글자를 입력하세요');
        const size = Math.max(1, Math.round(Number(v.size) || 20));
        const dir = cardinal(ctx.rotation.y);
        if (!dir)
            throw new Error('정확히 동서남북 중 한 방향을 바라보세요 (대각선 방향은 안 됨)');
        const s = ctx.session;
        const font = FONTS.includes(v.font) ? v.font : (FONTS.includes(s.settings.font) ? s.settings.font : 'minecraft');
        s.settings.font = font;
        const pattern = ctx.pattern('block');
        const slabs = pattern.slabs;
        const raster = await rasterize(text, font, slabs ? size * 2 : size);
        return runAsync(write(ctx, v, { size, dir, font, pattern, slabs, raster }));
    },
};

function* write(ctx, v, { size, dir, font, pattern, slabs, raster }) {
    const s = ctx.session;
    const feet = { x: Math.floor(ctx.location.x), y: Math.floor(ctx.location.y), z: Math.floor(ctx.location.z) };
    const edit = ctx.edit;
    let n = 0;
    const put = (col, up, perm) => {
        const o = place(dir, col, up);
        const p = { x: feet.x + o.x, y: feet.y + o.y, z: feet.z + o.z };
        edit.set(p, perm ?? pattern.at(p, edit));
    };
    if (!slabs) {
        for (const k of raster.pixels) {
            const [x, y] = k.split(',').map(Number);
            put(x, size - y);
            if (++n % 3000 === 0)
                yield;
        }
    }
    else {
        const cells = new Set();
        for (const k of raster.pixels) {
            const [x, y] = k.split(',').map(Number);
            cells.add(Math.floor(x / 2) + ',' + Math.floor(y / 2));
        }
        const on = (x, y) => raster.pixels.has(x + ',' + y) ? 1 : 0;
        for (const k of cells) {
            const [cx, cy] = k.split(',').map(Number);
            const tl = on(cx * 2, cy * 2), tr = on(cx * 2 + 1, cy * 2), bl = on(cx * 2, cy * 2 + 1), br = on(cx * 2 + 1, cy * 2 + 1);
            let perm = slabs.double;
            if (tl + tr + bl + br < 3) {
                if (bl + br === 0)
                    perm = slabs.top;
                else if (tl + tr === 0)
                    perm = slabs.bottom;
            }
            put(cx, size - cy, perm);
            if (++n % 3000 === 0)
                yield;
        }
    }
    let extra = `글꼴 ${font}`;
    if (raster.missing)
        extra += `, 글꼴에 없는 글자 ${raster.missing}개는 건너뜀`;
    if (v.cycle) {
        const next = FONTS[(FONTS.indexOf(font) + 1) % FONTS.length];
        s.settings.font = next;
        // the form remembers the dropdown; point it at the next font too
        for (const f of Object.values(s.forms ?? {}))
            if (f && typeof f === 'object' && 'font' in f && 'cycle' in f)
                f.font = next;
        extra += ` → 다음 글꼴: ${next}`;
    }
    save(ctx.player);
    return extra;
}
