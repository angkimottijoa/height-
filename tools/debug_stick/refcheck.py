"""Every reference a block makes must resolve inside the add-on or vanilla.

    python3 -m debug_stick.refcheck <bedrock-samples>/resource_pack
"""
import glob
import json
import os
import re
import sys

from . import build


def main(vanilla_rp):
    rp, bp = build.RP, build.BP
    atlas = json.load(open(os.path.join(rp, 'textures/terrain_texture.json')))['texture_data']
    geos = {}
    for f in glob.glob(os.path.join(rp, 'models/blocks/*.geo.json')):
        for g in json.load(open(f))['minecraft:geometry']:
            geos[g['description']['identifier']] = g
    errors = []

    def tex_exists(path):
        return any(os.path.exists(os.path.join(base, path + ext))
                   for base in (rp, vanilla_rp) for ext in ('.png', '.tga'))

    for k, v in atlas.items():
        p = v['textures'] if isinstance(v['textures'], str) else v['textures']['path']
        if not tex_exists(p):
            errors.append(f'atlas {k}: missing file {p}')
    for fb in json.load(open(os.path.join(rp, 'textures/flipbook_textures.json'))):
        if fb['atlas_tile'] not in atlas:
            errors.append(f"flipbook for unknown tile {fb['atlas_tile']}")
    lang = open(os.path.join(rp, 'texts/ko_KR.lang'), encoding='utf-8').read()
    for f in sorted(glob.glob(os.path.join(bp, 'blocks/*.json'))):
        blk = json.load(open(f))['minecraft:block']
        bid = blk['description']['identifier']
        comp_sets = [blk['components']] + [p['components'] for p in blk.get('permutations', [])]
        mats_all = set()
        for c in comp_sets:
            for m in c.get('minecraft:material_instances', {}).values():
                if m['texture'] not in atlas:
                    errors.append(f'{bid}: texture key {m["texture"]} not in atlas')
            mats_all |= set(c.get('minecraft:material_instances', {}))
        for c in comp_sets:
            g = c.get('minecraft:geometry')
            if g is None:
                continue
            gid = g if isinstance(g, str) else g['identifier']
            if gid not in geos:
                errors.append(f'{bid}: geometry {gid} missing')
                continue
            names = {b['name'] for b in geos[gid]['bones']}
            vis = {} if isinstance(g, str) else g.get('bone_visibility', {})
            if len(vis) > 64:
                errors.append(f'{bid}: {len(vis)} bone_visibility entries')
            for bn in vis:
                if bn not in names:
                    errors.append(f'{bid}: bone {bn} missing in {gid}')
            for b in geos[gid]['bones']:
                for cube in b.get('cubes', []):
                    for face in cube['uv'].values():
                        mi = face.get('material_instance', '*')
                        if mi not in mats_all:
                            errors.append(f'{bid}: material instance {mi} undefined')
        for c in comp_sets:
            cb = c.get('minecraft:collision_box')
            if isinstance(cb, list):
                if len(cb) > 16:
                    errors.append(f'{bid}: {len(cb)} collision boxes')
                for box in cb:
                    o, s = box['origin'], box['size']
                    if not (o[0] >= -8 and o[2] >= -8 and o[1] >= 0 and o[0] + s[0] <= 8
                            and o[2] + s[2] <= 8 and o[1] + s[1] <= 24):
                        errors.append(f'{bid}: collision box out of bounds {box}')
            sb = c.get('minecraft:selection_box')
            if isinstance(sb, dict):
                o, s = sb['origin'], sb['size']
                if not (o[0] >= -8 and o[2] >= -8 and o[1] >= 0 and o[0] + s[0] <= 8
                        and o[2] + s[2] <= 8 and o[1] + s[1] <= 16):
                    errors.append(f'{bid}: selection box out of bounds {sb}')
        if f'tile.{bid}.name=' not in lang:
            errors.append(f'{bid}: no name')
        for p in blk.get('permutations', []):
            if not re.fullmatch(r"[\w\s'():=!&|.\-]+", p['condition']):
                errors.append(f'{bid}: odd condition {p["condition"][:80]}')
    for e in errors:
        print(e)
    print(f'{len(errors)} reference problems')


if __name__ == '__main__':
    main(sys.argv[1])
