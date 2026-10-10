"""Runs the real conversion script (Node + a mock API) over every vanilla
state of every supported block and checks the result looks the same.

    python3 -m debug_stick.jscheck --ref <ref>
"""
import argparse
import itertools
import json
import os
import random
import shutil
import subprocess

from . import build

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    args = ap.parse_args()
    b = build.Builder(args.ref)
    specs = build.all_specs(b)
    for s in specs:
        b.generate(s)
    mb = json.load(open(os.path.join(args.ref, 'bs/metadata/vanilladata_modules/mojang-blocks.json')))
    props = {p['name']: [v['value'] for v in p['values']] for p in mb['block_properties']}
    vdefs = {'minecraft:air': {}}
    for blk in mb['data_items']:
        vdefs[blk['name']] = {p['name']: props[p['name']] for p in blk.get('properties', [])}
    defs = dict(vdefs)
    for s in specs:
        st = {n: list(v) for n, v in s.states}
        for n, v in s.extra_states:
            st[n] = list(v)
        defs[s.full_id] = st

    rng = random.Random(7)
    cases, expect = [], []
    at, up = {'x': 0, 'y': 10, 'z': 0}, {'x': 0, 'y': 11, 'z': 0}

    def add(spec, world, java_expect, target=None):
        cases.append({'i': len(cases), 'world': world, 'target': target or at})
        expect.append((spec, java_expect, world))

    for s in specs:
        vid = 'minecraft:' + s.vanilla
        vprops = vdefs.get(vid, {})
        if s.family in ('fence', 'pane', 'bars'):
            for combo in itertools.product([False, True], repeat=4):
                st = {f'minecraft:connection_{d}': v for d, v in zip(build.DIRS4, combo)}
                st = {k: v for k, v in st.items() if k in vprops}
                jp = {d: 'true' if v else 'false' for d, v in zip(build.DIRS4, combo)}
                jp['waterlogged'] = 'false'
                add(s, [{'at': at, 'id': vid, 'states': st}], [(s.java_name, jp)])
            continue
        if s.family == 'wall':
            for _ in range(12):
                sides = [rng.choice(['none', 'short', 'tall']) for _ in range(4)]
                post = rng.choice([False, True])
                st = {f'wall_connection_type_{d}': v for d, v in zip(build.DIRS4, sides)}
                st['wall_post_bit'] = post
                jp = {d: {'none': 'none', 'short': 'low', 'tall': 'tall'}[v] for d, v in zip(build.DIRS4, sides)}
                jp['up'] = 'true' if post else 'false'
                jp['waterlogged'] = 'false'
                add(s, [{'at': at, 'id': vid, 'states': st}], [(s.java_name, jp)])
            continue
        if s.family == 'stairs':
            for wd in range(4):
                for ud in (False, True):
                    for corner in ['none', 'inner_left', 'inner_right', 'outer_left', 'outer_right']:
                        st = {'weirdo_direction': wd, 'upside_down_bit': ud}
                        if 'minecraft:corner' in vprops:
                            st['minecraft:corner'] = corner
                        elif corner != 'none':
                            continue
                        jp = {'facing': ['east', 'west', 'south', 'north'][wd], 'half': 'top' if ud else 'bottom',
                              'shape': 'straight' if corner == 'none' else corner, 'waterlogged': 'false'}
                        add(s, [{'at': at, 'id': vid, 'states': st}], [(s.java_name, jp)])
            continue
        entries = [(j, e) for j, e in b.geyser.by_bedrock.get(s.vanilla, [])]
        if s.vanilla == 'cave_vines':
            for extra in ('cave_vines_body_with_berries', 'cave_vines_head_with_berries'):
                entries += [(j, e) for j, e in b.geyser.by_bedrock.get(extra, [])]
        seen = set()
        for j, e in entries:
            key = (e['bedrock'], json.dumps(e['state'], sort_keys=True))
            if key in seen:
                continue
            seen.add(key)
            st = {k: v for k, v in e['state'].items() if k in vdefs.get('minecraft:' + e['bedrock'], {})}
            bid = 'minecraft:' + e['bedrock']
            if s.multi_block and 'upper_block_bit' in st:
                lo = dict(st, upper_block_bit=False)
                hi = dict(st, upper_block_bit=True)
                world = [{'at': at, 'id': bid, 'states': lo}, {'at': up, 'id': bid, 'states': hi}]
                target = up if st['upper_block_bit'] else at
                add(s, world, [(j, e['java'])], target)
            else:
                add(s, [{'at': at, 'id': bid, 'states': st}], [(j, e['java'])])

    work = os.path.join(HERE, 'jstest')
    shutil.rmtree(os.path.join(work, 'scripts'), ignore_errors=True)
    shutil.copytree(os.path.join(build.BP, 'scripts'), os.path.join(work, 'scripts'))
    paths = {k: os.path.join(work, k + '.json') for k in ('defs', 'cases', 'out')}
    json.dump(defs, open(paths['defs'], 'w'))
    json.dump(cases, open(paths['cases'], 'w'))
    env = dict(os.environ, DS_DEFS=paths['defs'], DS_CASES=paths['cases'], DS_OUT=paths['out'],
               DS_SCRIPTS=os.path.join(work, 'scripts'))
    subprocess.run(['node', 'run.mjs'], cwd=work, env=env, check=True)
    out = json.load(open(paths['out']))

    bad = 0
    ignore_visual = {'tripwire_hook'}   # the hook's look depends on a wire bedrock does not store
    for r, (s, java_expect, world) in zip(out, expect):
        if 'error' in r:
            bad += 1
            print('ERROR', s.id, world, r['error'])
            continue
        want = []
        for jname, jp in java_expect:
            for p in b.java.parts(jname, jp):
                if p not in want:
                    want.append(p)
        a = {k: v for k, v in r['ds'].items()}
        got = []
        for jname, jp in s.java_of(a) or []:
            for p in b.java.parts(jname, jp):
                if (s.part_filter is None or s.part_filter(a, p)) and p not in got:
                    got.append(p)
        if sorted(got) != sorted(want):
            bad += 1
            print('LOOK', s.id, world[0]['states'], '\n   want', want, '\n   got ', got)
        if r['back'] is None:
            bad += 1
            print('BACK', s.id, 'could not revert')
    print(f'{len(out)} conversions, {bad} problems')
    for k in paths.values():
        os.remove(k)
    shutil.rmtree(os.path.join(work, 'scripts'))


if __name__ == '__main__':
    main()
