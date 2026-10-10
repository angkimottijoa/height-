/*
 * Block families for Type Replace (Arceon TypeReplaceHandler + TypeReplace),
 * built on core/families.js and extended with what Arceon or Bedrock adds:
 *   - Arceon's IRON family (iron bars = fence, heavy plate, iron trapdoor/chain)
 *   - copper trapdoors / chiseled / bars / chains / doors, and waxed <-> unwaxed
 *     twins (Arceon matches both, see `twin`)
 *   - logs, wood, stripped logs/wood and leaves for every wood type
 *   - Arceon's aliases (oakplanks, cobble, nether, 5:1, 98 ...)
 * All ids are real Bedrock 1.26.50 ids (checked in jstest/replace_test.mjs).
 *
 * Also the colour names (Korean) for Color Replace and a check for blocks
 * whose contents would be lost by swapping their type.
 */
import { FAMILIES } from '../core/families.js';
import { findFamily } from '../core/blocks.js';

/** name -> {forms: {form: id without 'minecraft:'}, aliases: [], twin?} */
export const TYPES = {};
for (const [name, fam] of Object.entries(FAMILIES.types))
    TYPES[name] = { forms: { ...fam.forms }, aliases: [...fam.aliases] };

// --- wood: logs, wood, stripped, leaves -------------------------------------
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'poplar'];
for (const w of WOODS) {
    const f = TYPES[w]?.forms;
    if (!f)
        continue;
    Object.assign(f, {
        log: `${w}_log`, wood: `${w}_wood`, stripped_log: `stripped_${w}_log`, stripped_wood: `stripped_${w}_wood`,
    });
    if (w !== 'poplar') // poplar leaves come in three colours
        f.leaves = `${w}_leaves`;
}
for (const w of ['crimson', 'warped']) {
    Object.assign(TYPES[w].forms, {
        log: `${w}_stem`, wood: `${w}_hyphae`, stripped_log: `stripped_${w}_stem`, stripped_wood: `stripped_${w}_hyphae`,
    });
}
Object.assign(TYPES.bamboo.forms, { log: 'bamboo_block', stripped_log: 'stripped_bamboo_block' });

// --- Arceon's IRON family ----------------------------------------------------
TYPES.iron = {
    forms: {
        block: 'iron_block', pressure_plate: 'heavy_weighted_pressure_plate', fence: 'iron_bars',
        trapdoor: 'iron_trapdoor', door: 'iron_door', chain: 'iron_chain',
    },
    aliases: ['iron', 'irontrapdoor', 'iron_trapdoor', 'iron_block', '167'],
};

// --- copper: trapdoor, chiseled, bars (fence), chain, door; waxed twins --------
for (const stage of ['', 'exposed_', 'weathered_', 'oxidized_']) {
    for (const wax of ['', 'waxed_']) {
        const fam = TYPES[`${wax}${stage}cut_copper`];
        if (!fam)
            continue;
        Object.assign(fam.forms, {
            trapdoor: `${wax}${stage}copper_trapdoor`, chiseled: `${wax}${stage}chiseled_copper`,
            fence: `${wax}${stage}copper_bars`, chain: `${wax}${stage}copper_chain`, door: `${wax}${stage}copper_door`,
        });
        fam.twin = wax ? `${stage}cut_copper` : `waxed_${stage}cut_copper`;
    }
}

// --- Arceon's aliases ---------------------------------------------------------
const ALIASES = {
    oak: ['oakplanks', '5', '5:0'], spruce: ['spruceplanks', '5:1'], birch: ['birchplanks', '5:2'], jungle: ['jungleplanks', '5:3'],
    acacia: ['acaciaplanks', '5:4'], dark_oak: ['darkoak_planks', 'darkoakplanks', '5:5'], mangrove: ['mangroveplanks', '5:6'],
    cherry: ['cherryplanks', '5:7'], bamboo: ['bambooplanks', '5:8'], bamboo_mosaic: ['mosaicbamboo', '5:9'],
    pale_oak: ['paleoak', 'pale_planks', 'paleplanks', 'paleoakplanks'], crimson: ['crimsonplanks'], warped: ['warpedplanks'],
    stone: ['1'], smooth_stone: ['43:8'], granite: ['1:1'], polished_granite: ['1:2'], diorite: ['1:3'], polished_diorite: ['1:4'],
    andesite: ['1:5'], polished_andesite: ['1:6'], cobblestone: ['4'], mossy_cobblestone: ['mossy_cobble', 'mossy', '48'],
    mossy_stone_bricks: ['mossy_stonebrick', '98:1'], sandstone: ['sand', '24'], cut_sandstone: ['24:2'], brick: ['45'],
    red_sandstone: ['redsand', 'rsand', '179'], stone_bricks: ['98'], nether_brick: ['nether', 'netherbricks', 'nether_bricks', '112'],
    red_nether_brick: ['red_netherbrick', 'rednether', 'red_nether', 'red_netherbricks', 'rednetherbricks', 'red_nether_bricks', '215'],
    quartz: ['155'], purpur: ['201'], prismarine: ['168'], prismarine_bricks: ['prismarine_brick', '168:1'], dark_prismarine: ['168:2'],
    polished_blackstone_bricks: ['blackstone_bricks', 'blackstone_brick', 'blackstonebrick'],
    deepslate_bricks: ['deepslate_brick', 'deepslate'], cut_copper: ['copper'], exposed_cut_copper: ['exposedcopper'],
    weathered_cut_copper: ['weatheredcopper'], oxidized_cut_copper: ['oxidizedcopper'], mud_bricks: ['mud'],
    resin_bricks: ['resin', 'resinbrick', 'resin_brick'], tuff_bricks: ['tuffbricks'],
};
for (const [name, list] of Object.entries(ALIASES))
    if (TYPES[name])
        TYPES[name].aliases.push(...list);

// --- lookups --------------------------------------------------------------------
const FORM_OF = new Map(); // full id -> {family, form}
for (const [name, fam] of Object.entries(TYPES))
    for (const [form, id] of Object.entries(fam.forms))
        if (!FORM_OF.has('minecraft:' + id))
            FORM_OF.set('minecraft:' + id, { family: name, form });

/** Family name for what a player typed ("oak", "cobble", "5:1", "oak_stairs"...), or null. */
export function findType(name) {
    const n = String(name ?? '').trim().toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');
    if (!n)
        return null;
    if (TYPES[n])
        return n;
    for (const [k, fam] of Object.entries(TYPES))
        if (fam.aliases.includes(n))
            return k;
    const core = findFamily(n);
    if (core)
        return core;
    for (const [k, fam] of Object.entries(TYPES))
        if (Object.values(fam.forms).includes(n))
            return k;
    return null;
}

/** {family, form} of a block id ('minecraft:oak_stairs'), or null. */
export const typeOf = (id) => FORM_OF.get(id) ?? null;

// --------------------------------------------------------------------------
// colours
// --------------------------------------------------------------------------
export const COLORS_KO = {
    white: '하얀색', orange: '주황색', magenta: '자홍색', light_blue: '하늘색', yellow: '노란색', lime: '연두색',
    pink: '분홍색', gray: '회색', light_gray: '회백색', cyan: '청록색', purple: '보라색', blue: '파란색',
    brown: '갈색', green: '초록색', red: '빨간색', black: '검은색',
};

/** True when the block holds items (shulker box, shelf...) that a type swap would destroy. */
export function hasItems(dim, p) {
    try {
        const c = dim.getBlock(p)?.getComponent('minecraft:inventory')?.container;
        return !!c && c.emptySlotsCount < c.size;
    }
    catch (e) {
        return false;
    }
}
