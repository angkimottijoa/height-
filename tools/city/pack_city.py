"""
Pack the city JSON (osm_city.py) into compact script modules for the add-on:
packs/ArceonDLC_BP/scripts/data/city_<name>.js, each `export default '<json>'`
(parsed only when that city is built).

    python3 tools/city/pack_city.py tools/city/out/tokyo.json:tokyo:도쿄역 ...

Compact form (coordinates in blocks, one decimal):
  { n, a, ext:[x0,z0,x1,z1],
    b: [[h, min (+1000: a roof only), x,z, ...]], buildings
    r: [[kind, w, flags, layer, x,z, ...]],   roads (flags 1 bridge, 2 tunnel, 4 area)
    t: [[flags, layer, x,z, ...]],             railways (flags as roads)
    p: [[flags, layer, x,z, ...]],             platforms (4 = area, 2 = underground)
    w: [[area, x,z, ...]], g: [[x,z, ...]],    water, green
    bd: [x,z, ...] }                           the area the map covers
"""
import json, os, sys

KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
         'living_street', 'service', 'pedestrian', 'footway', 'steps', 'path', 'cycleway', 'corridor', 'other']
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'packs', 'ArceonDLC_BP', 'scripts', 'data')


def flat(pts):
    out = []
    for x, z in pts:
        out += [round(x, 1), round(z, 1)]
    return out


def pack(d):
    kind = lambda k: KINDS.index(k.replace('_link', '')) if k.replace('_link', '') in KINDS else KINDS.index('other')
    fl = lambda f: (1 if f.get('bridge') else 0) | (2 if f.get('tunnel') else 0) | (4 if f.get('area') else 0)
    return {
        'n': d['station'], 'a': d['angle'], 'ext': d['extent']['min'] + d['extent']['max'],
        # a roof only (no walls): roofs, canopies (station roofs over the tracks are found in the game)
        'b': [[round(b['h']), round(b['min']) + (1000 if b.get('kind') in ('roof', 'canopy', 'carport') else 0)] + flat(b['pts']) for b in d['buildings'] if b['h'] > 0.5],
        'r': [[kind(r['kind']), r['w'], fl(r), int(r['layer'])] + flat(r['pts']) for r in d['roads'] if not r['tunnel'] and r['layer'] >= 0],
        't': [[fl(t), int(t['layer'])] + flat(t['pts']) for t in d['rails'] if not t['tunnel'] and t['layer'] >= 0],
        'p': [[fl(p), int(p['layer'])] + flat(p['pts']) for p in d['platforms'] if not p['tunnel']],
        'w': [[1 if w['area'] else 0] + flat(w['pts']) for w in d['water']],
        'g': [flat(g['pts']) for g in d['green']],
        'bd': flat(d.get('bounds') or []),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for arg in sys.argv[1:]:
        path, name, label = arg.split(':', 2)
        d = json.load(open(path))
        txt = json.dumps(pack(d), ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(OUT, f'city_{name}.js'), 'w') as f:
            f.write('// Map data © OpenStreetMap contributors (ODbL). Made by tools/city/pack_city.py.\n')
            f.write('export default ' + json.dumps(txt, ensure_ascii=False) + ';\n')
        index.append((name, label, d['angle']))
        print(name, f'{len(txt) / 1024:.0f} KiB')
    with open(os.path.join(OUT, 'cities.js'), 'w') as f:
        f.write('// The cities the city tool can build (data/city_<id>.js). Made by tools/city/pack_city.py.\n')
        for name, _, _ in index:
            f.write(f"import {name} from './city_{name}.js';\n")
        f.write('export const CITIES = [\n')
        for name, label, a in index:
            f.write(f"    {{ id: '{name}', name: '{label}', align: {a}, data: {name} }},\n")
        f.write('];\n')


if __name__ == '__main__':
    main()
