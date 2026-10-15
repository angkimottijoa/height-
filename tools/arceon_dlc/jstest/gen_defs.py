"""Block state table for the mock @minecraft/server (defs.json, not committed).

    python3 gen_defs.py <bedrock-samples>/metadata/vanilladata_modules/mojang-blocks.json defs.json
"""
import json
import sys

d = json.load(open(sys.argv[1]))
props = {p['name']: [v['value'] for v in p['values']] for p in d['block_properties']}
FIRST = {'minecraft:vertical_half': 'bottom', 'upper_block_bit': False}
out = {}
for b in d['data_items']:
    st = {}
    for p in b.get('properties', []):
        vals = props.get(p['name'], [0])
        if p['name'] in FIRST and FIRST[p['name']] in vals:
            vals = [FIRST[p['name']]] + [v for v in vals if v != FIRST[p['name']]]
        st[p['name']] = vals
    out[b['name']] = st
# the Debug Stick pack's own blocks (vyt:ds_*), so tests can use them too
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
for f in glob.glob(os.path.join(here, '../../../packs/DebugStickBP/blocks/*.json')):
    desc = json.load(open(f))['minecraft:block']['description']
    st = dict(desc.get('states', {}))
    for t, cfg in desc.get('traits', {}).items():
        for name in cfg.get('enabled_states', []):
            st.setdefault(name, {'minecraft:cardinal_direction': ['south', 'west', 'north', 'east'], 'minecraft:facing_direction': ['down', 'up', 'north', 'south', 'west', 'east'], 'minecraft:block_face': ['down', 'up', 'north', 'south', 'west', 'east'], 'minecraft:multi_block_part': [0, 1]}.get(name, [0]))
    out[desc['identifier']] = st
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), 'blocks')
