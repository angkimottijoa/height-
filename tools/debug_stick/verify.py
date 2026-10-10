"""Cross-checks every generated block: Java render vs Bedrock render.

    python3 -m debug_stick.verify --ref <ref> [--sheet out.png]
"""
import argparse
import json
import os
import random

import numpy as np
from PIL import Image

from . import build
from .preview import render_java, render_bedrock


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('--only', default=None)
    ap.add_argument('--dump', default=None)
    args = ap.parse_args()
    b = build.Builder(args.ref)
    specs = build.all_specs(b)
    tt = json.load(open(os.path.join(build.RP, 'textures', 'terrain_texture.json')))['texture_data']
    atlas = {k: (v['textures'] if isinstance(v['textures'], str) else v['textures']['path']) for k, v in tt.items()}

    def load(rel):
        if rel.startswith('textures/blocks/ds_end_rod'):
            return np.asarray(Image.open(os.path.join(build.RP, rel + '.png')).convert('RGBA'))
        return b.ti.bedrock_image(rel)

    rng = random.Random(1)
    bad = 0
    checked = 0
    for s in specs:
        if args.only and args.only not in s.id:
            continue
        b.generate(s)
        idx = list(range(len(s.combos_list)))
        if len(idx) > 24:
            idx = [0] + rng.sample(idx[1:], 23)
        for i in idx:
            a = s.combos_list[i]
            parts = s.parts_of[i]
            ja = np.asarray(render_java(b.java, b.ti, parts).render())
            geo_name = s.id
            comps = s.block_json['minecraft:block']['components']
            # permutation geometry: pick the file the permutation selects
            gid = comps['minecraft:geometry'] if isinstance(comps['minecraft:geometry'], str) else comps['minecraft:geometry']['identifier']
            for p in s.block_json['minecraft:block'].get('permutations', []):
                from .preview import eval_condition
                if 'minecraft:geometry' in p['components'] and eval_condition(p['condition'], a):
                    gid = p['components']['minecraft:geometry']
            geo = next(g for g in s.geo_files.values() if g['minecraft:geometry'][0]['description']['identifier'] == gid)
            ba = np.asarray(render_bedrock(geo, s.block_json, a, atlas, load).render())
            # silhouettes must match; colours legitimately differ where the
            # bedrock block applies uvlock, biome tint or end rod dye
            diff = float(np.mean((ja[..., 3] > 0) != (ba[..., 3] > 0))) * 100
            checked += 1
            if diff > 0.3:
                bad += 1
                print(f'DIFF {s.id} {a} {diff:.2f}')
                if args.dump:
                    os.makedirs(args.dump, exist_ok=True)
                    Image.fromarray(np.concatenate([ja, ba], axis=1)).save(
                        os.path.join(args.dump, f'{s.id}_{i}.png'))
    print(f'checked {checked} states, {bad} differ')


if __name__ == '__main__':
    main()
