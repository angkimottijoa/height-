"""Extracts the java<->bedrock state table for the blocks we need.

    python3 -m debug_stick.geyser_extract <geyser blocks.nbt for java 26.1> <minecraft-data pc/26.1/blocks.json>

GeyserMC/mappings (MIT) lists, for every java block state id, the bedrock
block and states the Bedrock client draws for it. Java state ids follow the
block registry order and property cartesian product published by
minecraft-data for the same version.
"""
import itertools
import json
import os
import sys

import nbtlib

OUT = os.path.join(os.path.dirname(__file__), 'data', 'geyser_states.json')


def conv(v):
    if isinstance(v, nbtlib.String):
        return str(v)
    if isinstance(v, nbtlib.Byte):
        return bool(int(v))
    return int(v)


def main(nbt_path, mcd_path, wanted):
    table = nbtlib.load(nbt_path)['bedrock_mappings']
    blocks = json.load(open(mcd_path))
    out = {}
    for b in blocks:
        vals = []
        for s in b['states']:
            if s['type'] == 'bool':
                vals.append(['true', 'false'])
            else:
                vals.append(s.get('values') or [str(i) for i in range(s['num_values'])])
        names = [s['name'] for s in b['states']]
        combos = list(itertools.product(*vals)) if names else [()]
        assert len(combos) == b['maxStateId'] - b['minStateId'] + 1, b['name']
        for i, c in enumerate(combos):
            e = table[b['minStateId'] + i]
            bid = str(e['bedrock_identifier']) if 'bedrock_identifier' in e else b['name']
            bid = bid.replace('minecraft:', '')
            if bid not in wanted:
                continue
            out.setdefault(b['name'], []).append({
                'java': dict(zip(names, c)), 'bedrock': bid,
                'state': {k: conv(v) for k, v in e.get('state', {}).items()}})
    # Blocks newer than java 26.1: same shapes as an older relative.
    for src, dst in (('pointed_dripstone', 'sulfur_spike'), ('oak_sapling', 'poplar_sapling')):
        out[dst] = [dict(e, bedrock=dst) for e in out[src]]
    out['shelf_mushroom'] = [
        {'java': {'age': str(age), 'facing': f}, 'bedrock': 'shelf_mushroom',
         'state': {'growth': age, 'minecraft:cardinal_direction': f}}
        for age in (0, 1) for f in ('north', 'south', 'west', 'east')]
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True)
    print('wrote', OUT, len(out), 'java blocks')


if __name__ == '__main__':
    wanted = set(json.load(open(os.path.join(os.path.dirname(__file__), 'data', 'wanted_bedrock.json'))))
    main(sys.argv[1], sys.argv[2], wanted)
