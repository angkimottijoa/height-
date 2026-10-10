"""Preview sheet of chosen block states (bedrock geometry, rendered)."""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from . import build
from .preview import render_bedrock


def make_sheet(ref, picks, out, cols=6, size=150):
    b = build.Builder(ref)
    specs = {s.id: s for s in build.all_specs(b)}
    tt = json.load(open(os.path.join(build.RP, 'textures', 'terrain_texture.json')))['texture_data']
    atlas = {k: (v['textures'] if isinstance(v['textures'], str) else v['textures']['path']) for k, v in tt.items()}

    def load(rel):
        if rel.startswith('textures/blocks/ds_end_rod'):
            return np.asarray(Image.open(os.path.join(build.RP, rel + '.png')).convert('RGBA'))
        return b.ti.bedrock_image(rel)

    tiles = []
    for sid, state, label in picks:
        s = specs[sid]
        if not hasattr(s, 'block_json'):
            b.generate(s)
        a = dict(next(iter(s.combos())))
        a.update(state)
        comps = s.block_json['minecraft:block']['components']
        gid = comps['minecraft:geometry'] if isinstance(comps['minecraft:geometry'], str) else comps['minecraft:geometry']['identifier']
        from .preview import eval_condition
        for p in s.block_json['minecraft:block'].get('permutations', []):
            if 'minecraft:geometry' in p['components'] and eval_condition(p['condition'], a):
                gid = p['components']['minecraft:geometry']
        geo = next(g for g in s.geo_files.values() if g['minecraft:geometry'][0]['description']['identifier'] == gid)
        img = render_bedrock(geo, s.block_json, a, atlas, load).render(size)
        tile = Image.new('RGBA', (size, size + 28), (46, 50, 56, 255))
        tile.alpha_composite(img, (0, 0))
        d = ImageDraw.Draw(tile)
        d.text((4, size + 2), label[:26], fill=(230, 230, 230, 255))
        d.text((4, size + 14), sid[3:][:26], fill=(150, 160, 170, 255))
        tiles.append(tile)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * size, rows * (size + 28)), (30, 32, 36, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, ((i % cols) * size, (i // cols) * (size + 28)))
    sheet.save(out)
    return out
