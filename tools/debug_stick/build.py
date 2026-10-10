"""Generates the Debug Stick add-on's independent blocks.

    python3 -m debug_stick.build --ref <dir with the reference data>

Reference data (not committed, see docs/DEBUG_STICK.md):
    <ref>/bs        Mojang/bedrock-samples (vanilla RP + metadata), 1.26.50
    <ref>/java      Java assets (assets/minecraft/{models,blockstates,textures})
    <ref>/mcd       PrismarineJS/minecraft-data (hardness, light)
The GeyserMC state table lives in tools/debug_stick/data (MIT, GeyserMC).
"""
import argparse
import json
import os
import re
import shutil
from collections import OrderedDict

import numpy as np

from . import jsonc
from .catalog import (Spec, Geyser, existing_specs, new_specs, EXISTING_IDS, TINTS,
                      STATIC_TINT, JAVA_NAME, COLORS, DIRS4)
from .conditions import minimize
from .geo import part_to_bones, part_boxes, box_to_bedrock
from .javamodel import JavaAssets
from .textures import TextureIndex

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BP = os.path.join(REPO, 'packs', 'DebugStickBP')
RP = os.path.join(REPO, 'packs', 'DebugStickRP')

FORMAT = '1.26.40'
GEO_FORMAT = '1.21.0'

WOODY = ('oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry',
         'pale_oak', 'bamboo', 'wooden')


class Problem(Exception):
    pass


# --------------------------------------------------------------------------
def load_minecraft_data(path):
    with open(path) as f:
        return {b['name']: b for b in json.load(f)}


def tex_alpha_kind(arr):
    a = arr[..., 3]
    semi = np.count_nonzero((a > 16) & (a < 240))
    if semi > a.size * 0.02:
        return 'blend'
    if np.count_nonzero(a < 128):
        return 'alpha_test'
    return 'opaque'


def atlas_key(rel):
    return 'vyt_ds_' + rel.split('/', 2)[-1].replace('/', '_')


class Builder:
    def __init__(self, ref):
        self.ti = TextureIndex(os.path.join(ref, 'bs/resource_pack'), os.path.join(ref, 'java/assets/minecraft'))
        self.java = JavaAssets(os.path.join(ref, 'java/assets/minecraft'))
        self.geyser = Geyser(os.path.join(HERE, 'data', 'geyser_states.json'))
        summary = json.load(open(os.path.join(ref, 'mcm/26.2-summary/blocks/data.json')))
        self.java_defaults = {k: v[1] for k, v in summary.items()}
        self.mcd = load_minecraft_data(os.path.join(ref, 'mcd/data/pc/26.1/blocks.json'))
        mb = json.load(open(os.path.join(ref, 'bs/metadata/vanilladata_modules/mojang-blocks.json')))
        self.serial = {b['name'][10:]: b.get('serialization_id', '') for b in mb['data_items']}
        self.bedrock_blocks = set(self.serial)
        self.vblocks = jsonc.load(os.path.join(ref, 'bs/resource_pack/blocks.json'))
        self.lang = {}
        for code in ('en_US', 'ko_KR'):
            d = {}
            with open(os.path.join(ref, f'bs/resource_pack/texts/{code}.lang'), encoding='utf-8') as f:
                for line in f:
                    line = line.split('\t#')[0].rstrip('\n')
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        d[k.strip()] = v.strip()
            self.lang[code] = d
        self._closed = {}
        self.atlas = OrderedDict()     # our atlas key -> texture entry
        self.flipbooks = OrderedDict()  # our atlas key -> flipbook entry
        self.problems = []
        self.ti.overrides.update({
            # Bedrock's sandstone side is *_normal; *_bottom only looks similar
            'sandstone': 'textures/blocks/sandstone_normal',
            'red_sandstone': 'textures/blocks/red_sandstone_normal',
            'glass_pane_top': 'textures/blocks/glass_pane_top',
            **{f'{c}_stained_glass_pane_top': f'textures/blocks/glass_pane_top_{"silver" if c == "light_gray" else c}' for c in COLORS},
        })

    # ------------------------------------------------------------ helpers
    CLOSED_FAMILIES = ('fence', 'wall', 'pane', 'bars')

    def model_for(self, spec, ref):
        from .javamodel import closed
        m = self.java.model(ref)
        if spec.family in self.CLOSED_FAMILIES:
            key = ('closed', ref)
            if key not in self._closed:
                self._closed[key] = closed(m)
            return self._closed[key]
        return m

    def texture_for(self, spec, java_tex):
        name = java_tex.replace('minecraft:', '').replace('block/', '')
        rel = spec.texture_overrides.get(name) or self.ti.resolve(java_tex)
        if rel is None or not self.ti.exists(rel):
            raise Problem(f'{spec.id}: no bedrock texture for java {java_tex}')
        if self.ti.is_animated(rel) and rel not in self.ti.flipbooks:
            raise Problem(f'{spec.id}: texture {rel} is animated without a flipbook')
        return rel

    def register_texture(self, rel, tint_color=None):
        key = atlas_key(rel) + ('_t' + tint_color.lstrip('#') if tint_color else '')
        if key not in self.atlas:
            entry = {'textures': rel} if not tint_color else {'textures': {'path': rel, 'tint_color': tint_color}}
            self.atlas[key] = entry
            if rel in self.ti.flipbooks:
                fb = dict(self.ti.flipbooks[rel])
                fb['atlas_tile'] = key
                fb.pop('atlas_index', None)
                self.flipbooks[key] = fb
        return key

    def display_name(self, spec, code):
        sid = self.serial.get(spec.vanilla, '')
        base = self.lang[code].get(sid + '.name') if sid else None
        if not base:
            base = spec.vanilla.replace('_', ' ')
        return base + (' (독립형)' if code == 'ko_KR' else ' (Independent)')

    # ------------------------------------------------------------ one block
    def generate(self, spec):
        combos = list(spec.combos())
        domains = list(spec.states) + list(spec.extra_states)
        names = [n for n, _ in domains]

        parts_of = []
        for a in combos:
            jl = spec.java_of(a)
            if not jl:
                parts_of.append(None)
                continue
            parts = []
            for jname, props in jl:
                for p in self.java.parts(jname, props):
                    if spec.part_filter is None or spec.part_filter(a, p):
                        if p not in parts:
                            parts.append(p)
            parts_of.append(parts)
        # unreachable combos fall back to the default combo's look
        default_parts = parts_of[0]
        if default_parts is None:
            default_parts = next((p for p in parts_of if p), None)
            if default_parts is None:
                raise Problem(f'{spec.id}: no java model for any state')
        parts_of = [p if p is not None else default_parts for p in parts_of]

        unique = []
        for parts in parts_of:
            for p in parts:
                if p not in unique:
                    unique.append(p)

        # ---- textures / materials
        materials = OrderedDict()   # java tex -> instance name
        mat_info = {}
        kinds = set()
        for p in unique:
            model = self.model_for(spec, p.model)
            for e in model['elements']:
                for face in e.get('faces', {}).values():
                    t = face['texture']
                    if t is None:
                        raise Problem(f'{spec.id}: unresolved texture in {p.model}')
                    if t not in materials:
                        materials[t] = 'm' + str(len(materials))
                        mat_info[t] = {'shade': True, 'tint': False, 'ao': model['ambientocclusion']}
                    # unshaded, or shaded as if facing up (newer java plants)
                    if e.get('shade') is False or e.get('shade_direction_override') == 'up':
                        mat_info[t]['shade'] = False
                    if 'tintindex' in face:
                        mat_info[t]['tint'] = True
                    if not model['ambientocclusion']:
                        mat_info[t]['ao'] = False
        instances = OrderedDict()
        for t, inst in materials.items():
            rel = self.texture_for(spec, t)
            kinds.add(tex_alpha_kind(self.ti.raw_image(rel)))
            tname = t.replace('minecraft:', '').replace('block/', '')
            tint = None
            static = None
            if mat_info[t]['tint']:
                grey = self.ti.is_grey(self.ti.bedrock_image(rel))
                if grey:
                    for method, texs in TINTS.items():
                        if tname in texs:
                            tint = method
                    if tname in STATIC_TINT or spec.java_name in STATIC_TINT:
                        static = STATIC_TINT.get(tname) or STATIC_TINT.get(spec.java_name)
                    if tint is None and static is None:
                        self.problems.append(f'{spec.id}: grey tinted texture {tname} has no tint rule')
            key = self.register_texture(rel, static)
            inst_def = {'texture': key}
            if tint:
                inst_def['tint_method'] = tint
            inst_def['face_dimming'] = mat_info[t]['shade']
            inst_def['ambient_occlusion'] = 1.0 if (mat_info[t]['ao'] and mat_info[t]['shade']) else 0.0
            instances[inst] = inst_def
        render = spec.render or ('blend' if 'blend' in kinds else 'alpha_test' if 'alpha_test' in kinds else 'opaque')
        for d in instances.values():
            d['render_method'] = render
        first = next(iter(instances.values()))
        mat_component = {'*': dict(first)}
        mat_component.update(instances)

        def material_of(face):
            return materials.get(face['texture'])

        # ---- geometry
        geo_id = 'geometry.vyt.' + spec.id
        bones = []
        visibility = {}
        part_bones = {}
        for i, p in enumerate(unique):
            model = self.model_for(spec, p.model)
            bs = part_to_bones(f'p{i}', p, model, material_of)
            bones.extend(bs)
            part_bones[p] = [b['name'] for b in bs]
        for p in unique:
            true_set = {tuple(a[n] for n in names) for a, parts in zip(combos, parts_of) if p in parts}
            cond = minimize(true_set, domains)
            if cond != '1':
                for bn in part_bones[p]:
                    visibility[bn] = cond
        use_permutation_geometry = len(visibility) > 64
        geo = {
            'format_version': GEO_FORMAT,
            'minecraft:geometry': [{
                'description': {'identifier': geo_id, 'texture_width': 16, 'texture_height': 16,
                                'visible_bounds_width': 3, 'visible_bounds_height': 3,
                                'visible_bounds_offset': [0, 0.5, 0]},
                'bones': bones,
            }],
        }
        geo_files = {spec.id: geo}

        # ---- shapes, per combo
        def boxes_for(parts):
            out = []
            for p in parts:
                out.extend(part_boxes(p, self.model_for(spec, p.model)))
            return out

        coll_of, sel_of = [], []
        for a, parts in zip(combos, parts_of):
            bx = boxes_for(parts)
            coll_of.append(self.collision(spec, a, bx))
            sel_of.append(self.selection(bx))

        light_of = [spec.light(a) if callable(spec.light) else spec.light for a in combos]

        # ---- block json
        comps = OrderedDict()
        if use_permutation_geometry:
            comps['minecraft:geometry'] = geo_id + '.c0'
        else:
            g = {'identifier': geo_id}
            if visibility:
                g['bone_visibility'] = visibility
            comps['minecraft:geometry'] = g
        comps['minecraft:material_instances'] = mat_component
        comps['minecraft:collision_box'] = coll_of[0]
        comps['minecraft:selection_box'] = sel_of[0]
        hard, res = self.hardness(spec)
        comps['minecraft:destructible_by_mining'] = {'seconds_to_destroy': hard}
        comps['minecraft:destructible_by_explosion'] = {'explosion_resistance': res}
        comps['minecraft:light_dampening'] = 0
        if any(light_of):
            comps['minecraft:light_emission'] = light_of[0]
        if self.is_flammable(spec):
            comps['minecraft:flammable'] = {'catch_chance_modifier': 5, 'destroy_chance_modifier': 20}
        if spec.multi_block:
            comps['minecraft:movable'] = {'movement_type': 'popped'}
        if spec.keep_state:
            comps['vyt:keep_state'] = {}
        for k, v in getattr(spec, 'components', {}).items():
            comps[k] = v
        producer_of = None
        if getattr(spec, 'redstone', None):
            producer_of = [self.producer(spec, a) for a in combos]
            comps['minecraft:redstone_producer'] = producer_of[0]
        perms = []

        def partition(values, make):
            groups = OrderedDict()
            for a, v in zip(combos, values):
                k = json.dumps(v, sort_keys=True)
                groups.setdefault(k, (v, set()))[1].add(tuple(a[n] for n in names))
            base = json.dumps(values[0], sort_keys=True)
            for k, (v, pts) in groups.items():
                if k == base:
                    continue
                cond = minimize(pts, domains)
                perms.append({'condition': cond, 'components': make(v)})

        partition(coll_of, lambda v: {'minecraft:collision_box': v})
        partition(sel_of, lambda v: {'minecraft:selection_box': v})
        if any(light_of):
            partition(light_of, lambda v: {'minecraft:light_emission': v})
        if producer_of:
            partition(producer_of, lambda v: {'minecraft:redstone_producer': v})
        extra_perm = getattr(spec, 'material_perms', None)
        if extra_perm:
            mats = [extra_perm(a, mat_component) for a in combos]
            partition(mats, lambda v: {'minecraft:material_instances': v})

        if use_permutation_geometry:
            # one geometry per distinct part set
            sets = OrderedDict()
            for a, parts in zip(combos, parts_of):
                k = tuple(unique.index(p) for p in parts)
                sets.setdefault(k, set()).add(tuple(a[n] for n in names))
            geo_files = {}
            for idx, (k, pts) in enumerate(sets.items()):
                gid = f'{geo_id}.c{idx}'
                gb = []
                for i in k:
                    p = unique[i]
                    gb.extend(part_to_bones(f'p{i}', p, self.model_for(spec, p.model), material_of))
                geo_files[f'{spec.id}.c{idx}'] = {
                    'format_version': GEO_FORMAT,
                    'minecraft:geometry': [{'description': {
                        'identifier': gid, 'texture_width': 16, 'texture_height': 16,
                        'visible_bounds_width': 3, 'visible_bounds_height': 3,
                        'visible_bounds_offset': [0, 0.5, 0]}, 'bones': gb}]}
                if idx:
                    perms.append({'condition': minimize(pts, domains),
                                  'components': {'minecraft:geometry': gid}})

        desc = OrderedDict([('identifier', spec.full_id)])
        if spec.states:
            desc['states'] = OrderedDict((n, list(v)) for n, v in spec.states)
        if spec.multi_block:
            desc['traits'] = {'minecraft:multi_block': {
                'enabled_states': ['minecraft:multi_block_part'], 'direction': 'up', 'parts': 2}}
        if getattr(spec, 'door', False):
            desc['traits']['minecraft:placement_direction'] = {
                'enabled_states': ['minecraft:cardinal_direction']}
        block = {'format_version': FORMAT, 'minecraft:block': OrderedDict([
            ('description', desc), ('components', comps)])}
        if perms:
            block['minecraft:block']['permutations'] = perms
        spec.block_json = block
        spec.geo_files = geo_files
        spec.render_method = render
        spec.parts_of = parts_of
        spec.combos_list = combos
        return spec

    _ATTACHED = {'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east'}

    def producer(self, spec, a):
        """Redstone output, like vanilla: 15 on every side while powered,
        and strong power into the block the lever/button is mounted on."""
        jname, props = spec.java_of(a)[0]
        if props.get('powered') != 'true':
            return {'power': 0}
        face = props.get('face')
        if face == 'floor':
            strong = 'down'
        elif face == 'ceiling':
            strong = 'up'
        else:
            strong = self._ATTACHED[props['facing']]
        return {'power': 15, 'strongly_powered_face': strong}

    # ------------------------------------------------------------ shapes
    @staticmethod
    def _thicken(box):
        (x1, y1, z1), (x2, y2, z2) = box
        lo, hi = [x1, y1, z1], [x2, y2, z2]
        for i in range(3):
            if hi[i] - lo[i] < 1:
                if lo[i] >= 15:
                    lo[i] = 15
                    hi[i] = 16
                else:
                    hi[i] = lo[i] + 1
        return tuple(lo), tuple(hi)

    @staticmethod
    def _clamp(box, ymax):
        (x1, y1, z1), (x2, y2, z2) = box
        c = lambda v, lo, hi: max(lo, min(hi, v))
        return ((c(x1, 0, 16), c(y1, 0, ymax), c(z1, 0, 16)),
                (c(x2, 0, 16), c(y2, 0, ymax), c(z2, 0, 16)))

    def collision(self, spec, a, boxes):
        kind = spec.collision
        if kind == 'none':
            return False
        if kind == 'fence':
            out = [((6, 0, 6), (10, 24, 10))]
            arms = {'north': ((6, 0, 0), (10, 24, 6)), 'south': ((6, 0, 10), (10, 24, 16)),
                    'west': ((0, 0, 6), (6, 24, 10)), 'east': ((10, 0, 6), (16, 24, 10))}
            out += [arms[d] for d in DIRS4 if a['vyt:' + d]]
        elif kind == 'wall':
            out = [((4, 0, 4), (12, 24, 12))] if a['vyt:post'] else []
            arms = {'north': ((5, 0, 0), (11, 24, 5)), 'south': ((5, 0, 11), (11, 24, 16)),
                    'west': ((0, 0, 5), (5, 24, 11)), 'east': ((11, 0, 5), (16, 24, 11))}
            out += [arms[d] for d in DIRS4 if a['vyt:' + d]]
            if not out:
                out = [((4, 0, 4), (12, 24, 12))]
        elif kind == 'pane':
            out = [((7, 0, 7), (9, 16, 9))]
            arms = {'north': ((7, 0, 0), (9, 16, 7)), 'south': ((7, 0, 9), (9, 16, 16)),
                    'west': ((0, 0, 7), (7, 16, 9)), 'east': ((9, 0, 7), (16, 16, 9))}
            out += [arms[d] for d in DIRS4 if a['vyt:' + d]]
        else:
            out = [self._thicken(self._clamp(b, 24)) for b in boxes]
            out = [b for b in out if all(b[1][i] > b[0][i] for i in range(3))]
            uniq = []
            for b in out:
                if b not in uniq:
                    uniq.append(b)
            out = uniq
            if len(out) > 16:
                lo = tuple(min(b[0][i] for b in out) for i in range(3))
                hi = tuple(max(b[1][i] for b in out) for i in range(3))
                out = [(lo, hi)]
            if not out:
                return False
        return [box_to_bedrock(b) for b in out]

    def selection(self, boxes):
        if not boxes:
            return box_to_bedrock(((0, 0, 0), (16, 16, 16)))
        lo = tuple(min(b[0][i] for b in boxes) for i in range(3))
        hi = tuple(max(b[1][i] for b in boxes) for i in range(3))
        return box_to_bedrock(self._thicken(self._clamp((lo, hi), 16)))

    def hardness(self, spec):
        b = self.mcd.get(spec.java_name) or self.mcd.get(JAVA_NAME.get(spec.vanilla, spec.vanilla))
        if b is None:
            return 0.0, 0.0
        return float(b['hardness'] or 0), float(b['resistance'] or 0)

    def is_flammable(self, spec):
        v = spec.vanilla
        if any(x in v for x in ('crimson', 'warped', 'stone', 'blackstone', 'nether')):
            return False
        if spec.family in ('fence', 'stairs', 'button', 'pressure_plate') and any(v.startswith(w) for w in WOODY):
            return True
        return spec.family in ('plant',) or v in ('vine', 'leaf_litter', 'azalea', 'flowering_azalea',
                                                   'tall_grass', 'large_fern', 'sunflower', 'lilac',
                                                   'rose_bush', 'peony', 'sweet_berry_bush',
                                                   'pink_petals', 'wildflowers', 'moss_carpet',
                                                   'pale_moss_carpet', 'pale_hanging_moss') or v.endswith('_carpet')


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------
def all_specs(b):
    with open(os.path.join(HERE, 'data', 'existing_blocks.json')) as f:
        EXISTING_IDS[:] = [tuple(x) for x in json.load(f)]
    specs = existing_specs(b.geyser, b.java.has_blockstate)
    specs += new_specs(b.geyser, b.java, b.java_defaults)
    from .iron_door import iron_door_spec
    specs.append(iron_door_spec(b.geyser))
    return specs


def js_value(v):
    return json.dumps(v)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    args = ap.parse_args()
    b = Builder(args.ref)
    specs = all_specs(b)
    done, failed = [], []
    for s in specs:
        try:
            b.generate(s)
            done.append(s)
        except (Problem, KeyError) as e:
            failed.append((s.id, str(e)))
    for sid, msg in failed:
        print('SKIP', sid, '-', msg)
    for p in b.problems:
        print('WARN', p)

    # clean generated output
    for d in (os.path.join(BP, 'blocks'), os.path.join(RP, 'models', 'blocks')):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    for s in done:
        write_json(os.path.join(BP, 'blocks', s.id + '.json'), s.block_json)
        for name, geo in s.geo_files.items():
            write_json(os.path.join(RP, 'models', 'blocks', name + '.geo.json'), geo)

    # resource pack: atlas, sounds, names
    tt_path = os.path.join(RP, 'textures', 'terrain_texture.json')
    tt = json.load(open(tt_path))
    data = OrderedDict((k, v) for k, v in tt['texture_data'].items() if k.startswith('ds_end_rod_'))
    data.update(b.atlas)
    tt['texture_data'] = data
    write_json(tt_path, tt)
    write_json(os.path.join(RP, 'textures', 'flipbook_textures.json'), list(b.flipbooks.values()))

    sounds = OrderedDict([('format_version', '1.21.40')])
    for s in done:
        v = b.vblocks.get(s.vanilla)
        if isinstance(v, dict) and v.get('sound'):
            sounds[s.full_id] = {'sound': v['sound']}
    write_json(os.path.join(RP, 'blocks.json'), sounds)

    for code, head in (('en_US', ['pack.name=Debug Stick', 'pack.description=Java Debug Stick ported to Bedrock, by vytdev']),
                       ('ko_KR', ['pack.name=디버그 스틱', 'pack.description=자바 에디션의 디버그 스틱을 베드락으로 이식, 제작자 vytdev'])):
        lines = head + ['']
        for s in done:
            lines.append(f'tile.{s.full_id}.name={b.display_name(s, code)}')
        with open(os.path.join(RP, 'texts', code + '.lang'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')

    write_tables(b, done)
    write_block_ids(b, done)
    print(f'generated {len(done)} blocks, {len(failed)} skipped, {len(b.atlas)} textures')


def write_tables(b, done):
    """scripts/blocks-generated.js: everything the scripts need per block."""
    blocks = OrderedDict()
    for s in done:
        e = OrderedDict()
        e['vanilla'] = 'minecraft:' + s.vanilla
        e['family'] = s.family
        e['states'] = [[n, list(v)] for n, v in s.states]
        if s.labels:
            e['labels'] = {k: {str(kk): vv for kk, vv in v.items()} for k, v in s.labels.items()}
        if s.keep_state:
            e['keep'] = True
        if s.multi_block:
            e['multi'] = True
        if s.convert:
            e['convert'] = s.convert
        blocks[s.full_id] = e
    lines = [
        '/*!',
        ' * Debug Stick -- A Bedrock port of the debug stick tool from Java Edition.',
        ' * Copyright (c) 2023-2026 Vincent Yanzee J. Tan <https://vytdev.github.io>',
        ' *',
        ' * This project is licensed under the MIT License.',
        ' * This software is provided "as is" without warranty of any kind.',
        ' * See LICENSE for the full terms.',
        ' */',
        '/*',
        ' * GENERATED by tools/debug_stick/build.py -- do not edit by hand.',
        ' */',
        "export const PREFIX = 'vyt:ds_';",
        'export const TORCH_FACINGS = ' + json.dumps(['unknown', 'west', 'east', 'north', 'south', 'top']) + ';',
        'export const LEVER_DIRECTIONS = ' + json.dumps(['down_east_west', 'east', 'west', 'south', 'north', 'up_north_south', 'up_east_west', 'down_north_south']) + ';',
        'export const FACE_DIRS = ' + json.dumps(['down', 'up', 'north', 'south', 'west', 'east']) + ';',
        'export const STAIR_FACINGS = ' + json.dumps(['east', 'west', 'south', 'north']) + ';',
        'export const STAIR_SHAPES = ' + json.dumps(['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']) + ';',
        '/**',
        ' * Independent block id -> description.',
        ' */',
        'export const BLOCKS = ' + json.dumps(blocks, ensure_ascii=False, separators=(',', ':')) + ';',
        '/**',
        ' * Vanilla block id -> independent block id.',
        ' */',
        'export const FROM_VANILLA = {};',
        'for (const [id, b] of Object.entries(BLOCKS)) FROM_VANILLA[b.vanilla] = id;',
        "FROM_VANILLA['minecraft:cave_vines_body_with_berries'] = 'vyt:ds_cave_vines';",
        "FROM_VANILLA['minecraft:cave_vines_head_with_berries'] = 'vyt:ds_cave_vines';",
        '',
    ]
    with open(os.path.join(BP, 'scripts', 'blocks-generated.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def write_block_ids(b, done):
    fam_title = OrderedDict()
    for s in done:
        fam_title.setdefault(s.family, []).append(s)
    out = ['Independent blocks -- /give ids', '',
           'These blocks are not in the creative menu. Get them by hitting the',
           'matching vanilla block with the Debug Stick, or with:',
           '    /give @s <id>', '']
    for fam, ss in fam_title.items():
        out.append(f'--- {fam} ({len(ss)}) ---')
        for s in ss:
            out.append(f'  {s.full_id:<44} (from minecraft:{s.vanilla})')
        out.append('')
    with open(os.path.join(BP, 'BLOCK_IDS.txt'), 'w') as f:
        f.write('\n'.join(out))


if __name__ == '__main__':
    main()
