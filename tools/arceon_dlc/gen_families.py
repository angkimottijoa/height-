"""Block families for Type Replace / Color Replace, from the real Bedrock
block list (bedrock-samples metadata/vanilladata_modules/mojang-blocks.json).

Bedrock names its variants irregularly (oak gate is `fence_gate`, cobblestone
stairs are `stone_stairs`...), so every guess is checked against the list
and only ids that exist are written out.
"""
import json
import sys

FORMS = ['block', 'chiseled', 'cracked', 'stairs', 'slab', 'double_slab', 'wall', 'fence', 'fence_gate',
         'button', 'pressure_plate', 'trapdoor', 'door']

WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry',
         'pale_oak', 'bamboo', 'crimson', 'warped', 'poplar']
# (family, block id, stem used for stairs/slab/wall, extra aliases)
STONES = [
    ('stone', 'stone', 'normal_stone', ['smooth']),
    ('cobblestone', 'cobblestone', 'cobblestone', ['cobble']),
    ('mossy_cobblestone', 'mossy_cobblestone', 'mossy_cobblestone', ['mossycobble']),
    ('stone_bricks', 'stone_bricks', 'stone_brick', ['stonebrick', 'stonebricks']),
    ('mossy_stone_bricks', 'mossy_stone_bricks', 'mossy_stone_brick', ['mossystonebrick']),
    ('smooth_stone', 'smooth_stone', 'smooth_stone', []),
    ('sandstone', 'sandstone', 'sandstone', []),
    ('cut_sandstone', 'cut_sandstone', 'cut_sandstone', []),
    ('smooth_sandstone', 'smooth_sandstone', 'smooth_sandstone', []),
    ('red_sandstone', 'red_sandstone', 'red_sandstone', []),
    ('cut_red_sandstone', 'cut_red_sandstone', 'cut_red_sandstone', []),
    ('smooth_red_sandstone', 'smooth_red_sandstone', 'smooth_red_sandstone', []),
    ('granite', 'granite', 'granite', []),
    ('diorite', 'diorite', 'diorite', []),
    ('andesite', 'andesite', 'andesite', []),
    ('polished_granite', 'polished_granite', 'polished_granite', []),
    ('polished_diorite', 'polished_diorite', 'polished_diorite', []),
    ('polished_andesite', 'polished_andesite', 'polished_andesite', []),
    ('brick', 'brick_block', 'brick', ['bricks']),
    ('nether_brick', 'nether_brick', 'nether_brick', ['netherbrick']),
    ('red_nether_brick', 'red_nether_brick', 'red_nether_brick', []),
    ('quartz', 'quartz_block', 'quartz', []),
    ('smooth_quartz', 'smooth_quartz', 'smooth_quartz', []),
    ('purpur', 'purpur_block', 'purpur', []),
    ('prismarine', 'prismarine', 'prismarine', []),
    ('prismarine_bricks', 'prismarine_bricks', 'prismarine_bricks', ['prismarinebrick']),
    ('dark_prismarine', 'dark_prismarine', 'dark_prismarine', []),
    ('blackstone', 'blackstone', 'blackstone', []),
    ('polished_blackstone', 'polished_blackstone', 'polished_blackstone', []),
    ('polished_blackstone_bricks', 'polished_blackstone_bricks', 'polished_blackstone_brick', ['blackstonebricks']),
    ('end_stone_bricks', 'end_bricks', 'end_brick', ['endbricks', 'end_stone_brick']),
    ('cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', []),
    ('polished_deepslate', 'polished_deepslate', 'polished_deepslate', []),
    ('deepslate_bricks', 'deepslate_bricks', 'deepslate_brick', []),
    ('deepslate_tiles', 'deepslate_tiles', 'deepslate_tile', []),
    ('mud_bricks', 'mud_bricks', 'mud_brick', []),
    ('tuff', 'tuff', 'tuff', []),
    ('polished_tuff', 'polished_tuff', 'polished_tuff', []),
    ('tuff_bricks', 'tuff_bricks', 'tuff_brick', []),
    ('resin_bricks', 'resin_bricks', 'resin_brick', []),
    ('bamboo_mosaic', 'bamboo_mosaic', 'bamboo_mosaic', []),
    ('cinnabar', 'cinnabar', 'cinnabar', []),
    ('polished_cinnabar', 'polished_cinnabar', 'polished_cinnabar', []),
    ('cinnabar_bricks', 'cinnabar_bricks', 'cinnabar_brick', []),
    ('sulfur', 'sulfur', 'sulfur', []),
    ('polished_sulfur', 'polished_sulfur', 'polished_sulfur', []),
    ('sulfur_bricks', 'sulfur_bricks', 'sulfur_brick', []),
]
for p in ('', 'exposed_', 'weathered_', 'oxidized_'):
    for w in ('', 'waxed_'):
        n = w + p + 'cut_copper'
        STONES.append((n, n, n, []))
    for w in ('', 'waxed_'):
        n = w + p + 'copper'
        if p == '':
            STONES.append((w + 'copper_block_family', w + 'copper_block', w + 'copper', []))

CHISELED = {
    ('stone_bricks', 'chiseled'): ['chiseled_stone_bricks'],
    ('quartz', 'chiseled'): ['chiseled_quartz_block'],
    ('nether_brick', 'chiseled'): ['chiseled_nether_bricks'],
    ('nether_brick', 'cracked'): ['cracked_nether_bricks'],
    ('cobbled_deepslate', 'chiseled'): ['chiseled_deepslate'],
    ('polished_blackstone', 'chiseled'): ['chiseled_polished_blackstone'],
    ('polished_blackstone_bricks', 'cracked'): ['cracked_polished_blackstone_bricks'],
}

COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
          'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
COLOR_FORMS = {
    'wool': '{c}_wool', 'carpet': '{c}_carpet', 'concrete': '{c}_concrete',
    'concrete_powder': '{c}_concrete_powder', 'stained_glass': '{c}_stained_glass',
    'stained_glass_pane': '{c}_stained_glass_pane', 'terracotta': '{c}_terracotta',
    'glazed_terracotta': '{c}_glazed_terracotta', 'shulker_box': '{c}_shulker_box',
    'candle': '{c}_candle', 'candle_cake': '{c}_candle_cake',
    'hard_stained_glass': 'hard_{c}_stained_glass', 'hard_stained_glass_pane': 'hard_{c}_stained_glass_pane',
}


def main(path, out):
    ids = {b['name'][10:] for b in json.load(open(path))['data_items']}
    fams = {}

    def pick(*cands):
        for c in cands:
            if c in ids:
                return c
        return None

    for w in WOODS:
        planks = pick(f'{w}_planks', w if w in ('bamboo',) else None)
        f = {
            'block': planks,
            'stairs': pick(f'{w}_stairs'),
            'slab': pick(f'{w}_slab'),
            'double_slab': pick(f'{w}_double_slab'),
            'fence': pick(f'{w}_fence'),
            'fence_gate': pick(f'{w}_fence_gate') if w != 'oak' else pick('fence_gate'),
            'button': pick(f'{w}_button') if w != 'oak' else pick('wooden_button'),
            'pressure_plate': pick(f'{w}_pressure_plate') if w != 'oak' else pick('wooden_pressure_plate'),
            'trapdoor': pick(f'{w}_trapdoor') if w != 'oak' else pick('trapdoor'),
            'door': pick(f'{w}_door') if w != 'oak' else pick('wooden_door'),
            'shelf': pick(f'{w}_shelf'),
        }
        fams[w] = {'forms': {k: v for k, v in f.items() if v}, 'aliases': [w, f'{w}_planks', w.replace('_', '')]}
    for name, block, stem, aliases in STONES:
        f = {
            'block': pick(block),
            'stairs': pick(f'{stem}_stairs'),
            'slab': pick(f'{stem}_slab'),
            'double_slab': pick(f'{stem}_double_slab'),
            'wall': pick(f'{stem}_wall'),
            'button': pick(f'{stem}_button'),
            'pressure_plate': pick(f'{stem}_pressure_plate'),
        }
        if name == 'cobblestone':
            f['stairs'] = pick('stone_stairs')
        if name == 'prismarine_bricks':
            f['slab'] = pick('prismarine_brick_slab')
            f['double_slab'] = pick('prismarine_brick_double_slab')
        if name == 'end_stone_bricks':
            f['slab'] = pick('end_stone_brick_slab')
            f['double_slab'] = pick('end_stone_brick_double_slab')
            f['wall'] = pick('end_stone_brick_wall')
        if name.endswith('cut_copper'):
            pre = name[:-len('cut_copper')]
            f['double_slab'] = pick(pre + 'double_cut_copper_slab')
        for extra in ('chiseled', 'cracked'):
            c = pick(*CHISELED.get((name, extra), [f'{extra}_{block}']))
            if c:
                f[extra] = c
        if name == 'stone':
            f['button'] = pick('stone_button')
            f['pressure_plate'] = pick('stone_pressure_plate')
        if name == 'polished_blackstone':
            f['button'] = pick('polished_blackstone_button')
        f = {k: v for k, v in f.items() if v}
        if 'block' not in f:
            continue
        fams[name] = {'forms': f, 'aliases': sorted({name, block, name.replace('_', ''), *aliases})}
    colors = {}
    for c in COLORS:
        name = 'silver' if c == 'light_gray' else c
        f = {}
        for form, tpl in COLOR_FORMS.items():
            cid = pick(tpl.format(c=c), tpl.format(c=name))
            if form == 'glazed_terracotta' and c == 'light_gray':
                cid = pick('silver_glazed_terracotta', cid)
            if cid:
                f[form] = cid
        colors[c] = f
    data = {'types': fams, 'colors': colors}
    with open(out, 'w') as fh:
        fh.write('// GENERATED by tools/arceon_dlc/gen_families.py -- do not edit by hand.\n')
        fh.write('export const FAMILIES = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    total = sum(len(v['forms']) for v in fams.values())
    print(len(fams), 'type families,', total, 'blocks;', sum(len(v) for v in colors.values()), 'colour blocks')
    for k, v in fams.items():
        print(' ', k, v['forms'])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
