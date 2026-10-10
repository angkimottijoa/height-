"""Which blocks get an independent counterpart, and how each one is built.

Every block is described by a Spec. Its custom states mirror Bedrock's own
vanilla states (prefixed "vyt:"), so turning a vanilla block into its
counterpart and back is a straight copy. The look of each state combination
is taken from the Java Edition model that GeyserMC maps that Bedrock state
to, which is the same thing the Bedrock client draws.

The existing families keep the state names and value lists they shipped
with, so blocks already placed in worlds keep their state.
"""
import itertools
import json
from dataclasses import dataclass, field

COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
          'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry',
         'pale_oak', 'bamboo']

TORCH_FACINGS = ['unknown', 'west', 'east', 'north', 'south', 'top']
LEVER_DIRECTIONS = ['down_east_west', 'east', 'west', 'south', 'north',
                    'up_north_south', 'up_east_west', 'down_north_south']
FACE_DIRS = ['down', 'up', 'north', 'south', 'west', 'east']
STAIR_FACINGS = ['east', 'west', 'south', 'north']
STAIR_SHAPES = ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']
DIRS4 = ['north', 'south', 'east', 'west']


@dataclass
class Spec:
    id: str                      # 'ds_oak_fence' (namespace vyt: added later)
    vanilla: str                 # bedrock id without namespace
    family: str
    states: list                 # [(name, [values...])], first value = default
    java_of: object              # assign -> [(java_blockstate, props)] or None
    keep_state: bool = False     # pick-block keeps the state (existing blocks)
    multi_block: bool = False    # two parts stacked up (doors, tall plants)
    collision: str = 'model'     # 'none' | 'model' | 'fence' | 'wall' | 'pane'
    part_filter: object = None   # (assign, part) -> bool
    light: object = 0            # int or assign -> int
    tint: dict = field(default_factory=dict)   # java texture -> tint method
    render: str = None           # force a render method
    labels: dict = field(default_factory=dict)  # state -> {value: label}
    hardness: float = 0.0
    resistance: float = 0.0
    flammable: bool = False
    item_name: str = ''          # korean display name
    extra_states: list = field(default_factory=list)  # trait states used in conditions
    convert: dict = field(default_factory=dict)  # bedrock state -> vyt state (copy)
    texture_overrides: dict = field(default_factory=dict)
    note: str = ''

    @property
    def full_id(self):
        return 'vyt:' + self.id

    def combos(self):
        names = [n for n, _ in self.states] + [n for n, _ in self.extra_states]
        vals = [v for _, v in self.states] + [v for _, v in self.extra_states]
        for c in itertools.product(*vals):
            yield dict(zip(names, c))


# --------------------------------------------------------------------------
# Geyser: bedrock state <-> java state
# --------------------------------------------------------------------------
class Geyser:
    def __init__(self, path):
        with open(path) as f:
            self.by_java = json.load(f)
        self.by_bedrock = {}
        for jname, entries in self.by_java.items():
            for e in entries:
                self.by_bedrock.setdefault(e['bedrock'], []).append((jname, e))

    def java_for(self, bedrock, states, prefer=None):
        """First java (blockstate, props) whose bedrock form matches `states`."""
        best = None
        for jname, e in self.by_bedrock.get(bedrock, []):
            if prefer and jname not in prefer:
                continue
            st = e['state']
            if all(st.get(k) == v for k, v in states.items() if k in st):
                return jname, e['java']
            if best is None:
                best = (jname, e['java'])
        return None

    def bedrock_values(self, bedrock):
        out = {}
        for _, e in self.by_bedrock.get(bedrock, []):
            for k, v in e['state'].items():
                out.setdefault(k, set()).add(v)
        return out


def _java_name_for(geyser, bedrock):
    names = {j for j, _ in geyser.by_bedrock.get(bedrock, [])}
    return names


# --------------------------------------------------------------------------
# existing families (state layout frozen)
# --------------------------------------------------------------------------
def _side_states(values):
    return [('vyt:' + d, values) for d in DIRS4] + [('vyt:post', [1, 0])]


def _bool(v):
    return 'true' if v else 'false'


def existing_specs(geyser, java_ok):
    """The 229 blocks shipped before, plus their family settings."""
    import re
    from_js = EXISTING_IDS
    specs = []
    for vanilla, family in from_js:
        jname = JAVA_NAME.get(vanilla, vanilla)
        if vanilla.startswith('hard_'):
            jname = vanilla[5:]
        if family == 'fence':
            def jo(a, j=jname):
                return [(j, {d: _bool(a['vyt:' + d]) for d in DIRS4})]
            spec = Spec('ds_' + vanilla, vanilla, family, _side_states([0, 1]), jo,
                        collision='fence', part_filter=_post_filter)
        elif family == 'wall':
            def jo(a, j=jname):
                p = {d: ['none', 'low', 'tall'][a['vyt:' + d]] for d in DIRS4}
                p['up'] = _bool(a['vyt:post'])
                p['waterlogged'] = 'false'
                return [(j, p)]
            spec = Spec('ds_' + vanilla, vanilla, family, _side_states([0, 1, 2]), jo,
                        collision='wall')
            spec.labels = {'vyt:' + d: {0: 'none', 1: 'short', 2: 'tall'} for d in DIRS4}
        elif family in ('pane', 'bars'):
            def jo(a, j=jname):
                p = {d: _bool(a['vyt:' + d]) for d in DIRS4}
                p['waterlogged'] = 'false'
                return [(j, p)]
            spec = Spec('ds_' + vanilla, vanilla, family, _side_states([0, 1]), jo,
                        collision='pane', part_filter=_post_filter)
        elif family == 'stairs':
            def jo(a, j=jname):
                return [(j, {'facing': STAIR_FACINGS[a['vyt:facing']],
                             'half': ['bottom', 'top'][a['vyt:half']],
                             'shape': STAIR_SHAPES[a['vyt:shape']],
                             'waterlogged': 'false'})]
            spec = Spec('ds_' + vanilla, vanilla, family,
                        [('vyt:facing', [0, 1, 2, 3]), ('vyt:half', [0, 1]),
                         ('vyt:shape', [0, 1, 2, 3, 4])], jo, collision='model')
        elif family == 'plant':
            def jo(a, v=vanilla):
                return [_geyser_java(geyser, v, {})]
            spec = Spec('ds_' + vanilla, vanilla, family, [], jo, collision='none')
        elif family == 'torch':
            def jo(a, v=vanilla):
                f = TORCH_FACINGS[a['vyt:facing']]
                if f == 'unknown':
                    f = 'top'
                return [_geyser_java(geyser, v, {'torch_facing_direction': f})]
            spec = Spec('ds_' + vanilla, vanilla, family, [('vyt:facing', [0, 1, 2, 3, 4, 5])], jo,
                        collision='none')
        elif family == 'lever':
            def jo(a, v=vanilla):
                return [_geyser_java(geyser, v, {'lever_direction': LEVER_DIRECTIONS[a['vyt:dir']],
                                                 'open_bit': bool(a['vyt:open'])})]
            spec = Spec('ds_' + vanilla, vanilla, family,
                        [('vyt:dir', list(range(8))), ('vyt:open', [0, 1])], jo, collision='none')
        elif family == 'button':
            def jo(a, v=vanilla):
                return [_geyser_java(geyser, v, {'facing_direction': a['vyt:facing'],
                                                 'button_pressed_bit': bool(a['vyt:pressed'])})]
            spec = Spec('ds_' + vanilla, vanilla, family,
                        [('vyt:facing', [0, 1, 2, 3, 4, 5]), ('vyt:pressed', [0, 1])], jo,
                        collision='none')
        elif family == 'pressure_plate':
            def jo(a, v=vanilla):
                return [_geyser_java(geyser, v, {'redstone_signal': 15 if a['vyt:pressed'] else 0})]
            spec = Spec('ds_' + vanilla, vanilla, family, [('vyt:pressed', [0, 1])], jo,
                        collision='none')
        elif family == 'end_rod':
            def jo(a, v=vanilla):
                return [_geyser_java(geyser, v, {'facing_direction': a['vyt:facing']})]
            spec = Spec('ds_' + vanilla, vanilla, family,
                        [('vyt:facing', [0, 1, 2, 3, 4, 5]), ('vyt:lit', [1, 0]),
                         ('vyt:color', list(range(16)))], jo, collision='model')
        else:
            raise ValueError(family)
        spec.keep_state = True
        spec.java_name = jname
        if vanilla in LIGHT:
            spec.light = LIGHT[vanilla]
        if family == 'end_rod':
            spec.light = lambda a: 14 if a['vyt:lit'] else 0
            spec.material_perms = _end_rod_materials
        if family in ('lever', 'button'):
            spec.redstone = True
            spec.components = {'vyt:' + family: {}}
        specs.append(spec)
    return specs


END_ROD_DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
                'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']


def _end_rod_materials(a, base):
    key = 'ds_end_rod_' + END_ROD_DYES[a['vyt:color']]
    return {k: dict(v, texture=key) for k, v in base.items()}




def _post_filter(assign, part):
    """The `vyt:post` switch hides the centre post of fences, panes, bars."""
    if assign.get('vyt:post', 1):
        return True
    name = part.model.rsplit('/', 1)[-1]
    return not (name.endswith('_post') or name.endswith('_post_ends') or 'noside' in name)


def _geyser_java(geyser, bedrock, states):
    r = geyser.java_for(bedrock, states)
    if r is None:
        raise KeyError(f'no java form of {bedrock} {states}')
    return r


# Bedrock ids whose Java blockstate has another name.
JAVA_NAME = {
    'deadbush': 'dead_bush',
    'end_brick_stairs': 'end_stone_brick_stairs',
    'normal_stone_stairs': 'stone_stairs',
    'stone_stairs': 'cobblestone_stairs',
    'prismarine_bricks_stairs': 'prismarine_brick_stairs',
    'wooden_button': 'oak_button',
    'wooden_pressure_plate': 'oak_pressure_plate',
    'unlit_redstone_torch': 'redstone_torch',
    'reeds': 'sugar_cane',
    'waterlily': 'lily_pad',
    'small_dripleaf_block': 'small_dripleaf',
    'beetroot': 'beetroots',
}

EXISTING_IDS = []   # filled by build.py from the shipped table

# --------------------------------------------------------------------------
# new blocks: everything else that pops off when its support goes
# --------------------------------------------------------------------------
NEW_SIMPLE = (
    # wall / ceiling attached
    ['ladder', 'tripwire_hook', 'vine', 'glow_lichen', 'sculk_vein', 'resin_clump',
     'lantern', 'soul_lantern', 'amethyst_cluster', 'large_amethyst_bud',
     'medium_amethyst_bud', 'small_amethyst_bud', 'shelf_mushroom']
    + [p + c + 'copper_lantern' for p in ('', 'waxed_') for c in ('', 'exposed_', 'weathered_', 'oxidized_')]
    + [k + '_coral_wall_fan' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
    + ['dead_' + k + '_coral_wall_fan' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
    # floor plants
    + ['crimson_fungus', 'warped_fungus', 'azalea', 'flowering_azalea', 'spore_blossom',
       'pale_hanging_moss', 'mangrove_propagule', 'pointed_dripstone', 'sulfur_spike',
       'sea_pickle', 'waterlily', 'reeds', 'sweet_berry_bush', 'nether_wart', 'wheat',
       'carrots', 'potatoes', 'beetroot', 'torchflower_crop', 'pink_petals', 'wildflowers',
       'leaf_litter', 'big_dripleaf', 'twisting_vines', 'weeping_vines', 'cave_vines',
       'poplar_sapling', 'moss_carpet', 'pale_moss_carpet']
    + [c + '_carpet' for c in COLORS]
    + [k + '_coral' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
    + ['dead_' + k + '_coral' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
    + [k + '_coral_fan' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
    + ['dead_' + k + '_coral_fan' for k in ('tube', 'brain', 'bubble', 'fire', 'horn')]
)
NEW_DOUBLE = ['sunflower', 'lilac', 'rose_bush', 'peony', 'tall_grass', 'large_fern',
              'pitcher_plant', 'small_dripleaf_block']

# Biome tints, per java texture (only applied if the bedrock texture is grey).
TINTS = {
    'grass': ['short_grass', 'tall_grass_top', 'tall_grass_bottom', 'fern', 'large_fern_top',
              'large_fern_bottom', 'bush', 'sugar_cane', 'pink_petals_stem', 'wildflowers_stem',
              'potted_fern'],
    'default_foliage': ['vine'],
    'dry_foliage': ['leaf_litter'],
}
STATIC_TINT = {'lily_pad': '#208030'}

# Bit order of bedrock's multi-face mask (from the GeyserMC table).
# A custom state may hold at most 16 values, so the 64-value mask is split
# into one on/off state per face.
BITMASKS = {'multi_face_direction_bits': ['down', 'up', 'south', 'west', 'north', 'east']}

# Vines whose tip and body are separate java blocks but one bedrock block.
VINE_BODY = {
    'twisting_vines': ('twisting_vines', 'twisting_vines_plant'),
    'weeping_vines': ('weeping_vines', 'weeping_vines_plant'),
}

LIGHT = {
    'lantern': 15, 'soul_lantern': 10, 'glow_lichen': 7, 'amethyst_cluster': 5,
    'large_amethyst_bud': 4, 'medium_amethyst_bud': 2, 'small_amethyst_bud': 1,
    'torch': 14, 'soul_torch': 10, 'redstone_torch': 7, 'unlit_redstone_torch': 0,
    'copper_torch': 14, 'end_rod': 14, 'firefly_bush': 2,
}
for _p in ('', 'waxed_'):
    for _c in ('', 'exposed_', 'weathered_', 'oxidized_'):
        LIGHT[_p + _c + 'copper_lantern'] = 15

NO_COLLISION_NEW = {
    'tripwire_hook', 'vine', 'glow_lichen', 'sculk_vein', 'resin_clump', 'crimson_fungus',
    'warped_fungus', 'spore_blossom', 'pale_hanging_moss', 'mangrove_propagule', 'reeds',
    'sweet_berry_bush', 'nether_wart', 'wheat', 'carrots', 'potatoes', 'beetroot',
    'torchflower_crop', 'pink_petals', 'wildflowers', 'leaf_litter', 'twisting_vines',
    'weeping_vines', 'cave_vines', 'poplar_sapling', 'sunflower', 'lilac', 'rose_bush',
    'peony', 'tall_grass', 'large_fern', 'pitcher_plant', 'small_dripleaf_block',
    'shelf_mushroom',
}


def _visual_states(geyser, java, bedrock, prefer=None, double=False):
    """Bedrock states of `bedrock` that change the java model."""
    vals = geyser.bedrock_values(bedrock)
    entries = [e for j, e in geyser.by_bedrock.get(bedrock, []) if not prefer or j in prefer]
    keep = []
    for name, vs in sorted(vals.items()):
        if name == 'upper_block_bit' and double:
            continue
        # does any pair of entries differing only in `name` differ in model?
        groups = {}
        for (j, e) in [(j, e) for j, e in geyser.by_bedrock.get(bedrock, []) if not prefer or j in prefer]:
            key = tuple(sorted((k, v) for k, v in e['state'].items() if k != name))
            try:
                parts = tuple(java.parts(j, e['java']))
            except KeyError:
                continue
            groups.setdefault(key, set()).add(parts)
        if any(len(g) > 1 for g in groups.values()):
            if all(isinstance(x, bool) for x in vs):
                keep.append((name, [0, 1], 'bool'))
            else:
                keep.append((name, sorted(vs, key=lambda x: (str(type(x)), x)), 'same'))
    return keep


def new_specs(geyser, java, defaults=None):
    defaults = defaults or {}
    specs = []
    for vanilla in NEW_SIMPLE + NEW_DOUBLE:
        double = vanilla in NEW_DOUBLE
        prefer = None
        body = None
        if vanilla in VINE_BODY:
            body = VINE_BODY[vanilla]
            prefer = (body[0],)
        if vanilla == 'cave_vines':
            prefer = ('cave_vines',)
        states = _visual_states(geyser, java, vanilla, prefer, double)
        # default value first: use the geyser default (first java state)
        # put the vanilla default first (that is what /give places)
        jdef = defaults.get(JAVA_NAME.get(vanilla, vanilla))
        bdef = {}
        if jdef:
            for jn, e in geyser.by_bedrock.get(vanilla, []):
                if all(e['java'].get(k) == v for k, v in jdef.items() if k in e['java']):
                    bdef = e['state']
                    break
        states = [(n, sorted(vs, key=lambda x, d=(int(bdef[n]) if k == 'bool' and n in bdef else bdef.get(n)): x != d), k)
                  for n, vs, k in states]
        vstates = []
        convert = {}
        for name, vs, kind in states:
            if name in BITMASKS:
                faces = BITMASKS[name]
                for f in faces:
                    vstates.append(('vyt:' + f, [0, 1]))
                convert[name] = [['vyt:' + f for f in faces], 'bits']
                continue
            vstates.append(('vyt:' + name, vs))
            convert[name] = ['vyt:' + name, kind]

        def jo(a, v=vanilla, body=body, double=double, kinds={n: k for n, _, k in states}):
            bstates = {}
            for n, k in kinds.items():
                if n in BITMASKS:
                    bstates[n] = sum(1 << i for i, f in enumerate(BITMASKS[n]) if a['vyt:' + f])
                else:
                    bstates[n] = bool(a['vyt:' + n]) if k == 'bool' else a['vyt:' + n]
            if double:
                bstates['upper_block_bit'] = bool(a['minecraft:multi_block_part'])
            pref = None
            if body is not None:
                pref = (body[1],) if a.get('vyt:body') else (body[0],)
            if v == 'cave_vines':
                pref = ('cave_vines_plant',) if a.get('vyt:body') else ('cave_vines',)
                bstates = {}
                jn, jp = geyser.java_for('cave_vines', {}, pref)
                jp = dict(jp)
                jp['berries'] = _bool(a.get('vyt:berries'))
                return [(jn, jp)]
            r = geyser.java_for(v, bstates, pref)
            return [r] if r else None

        spec = Spec('ds_' + vanilla, vanilla, 'attached', vstates, jo, convert=convert)
        if body is not None or vanilla == 'cave_vines':
            spec.states.append(('vyt:body', [0, 1]))
            spec.labels['vyt:body'] = {0: 'tip', 1: 'body'}
        if vanilla == 'cave_vines':
            spec.states.append(('vyt:berries', [0, 1]))
            spec.labels['vyt:berries'] = {0: 'none', 1: 'berries'}
            spec.light = lambda a: 14 if a.get('vyt:berries') else 0
        if double:
            spec.multi_block = True
            spec.extra_states = [('minecraft:multi_block_part', [0, 1])]
        spec.collision = 'none' if vanilla in NO_COLLISION_NEW else 'model'
        if vanilla == 'sea_pickle':
            spec.light = lambda a: 0 if a.get('vyt:dead_bit') else 6 + 3 * a.get('vyt:cluster_count', 0)
        elif vanilla in LIGHT:
            spec.light = LIGHT[vanilla]
        spec.java_name = JAVA_NAME.get(vanilla, vanilla)
        specs.append(spec)
    return specs
