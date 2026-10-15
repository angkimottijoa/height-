"""
OSM → Minecraft city data, 1:1 (1 m = 1 block), lined up on a station.

    python3 tools/city/osm_city.py map.osm --station 東京 [--out tools/city/out/tokyo]
        [--north] [--angle DEG] [--radius M]

* Origin: the station (its main railway=station node; the one with no
  `station=subway` when there are several).
* Lined up: the map is turned so the station's tracks run along the
  Minecraft Z axis (north end toward -Z), or X when they run east-west, so platforms, tracks and the street
  grid laid out with them come out straight instead of in diagonal steps.
  --north keeps true north at -Z instead, --angle sets the turn by hand.
* Writes <out>.json (features in block coordinates) and <out>.png (a top
  view, 1 pixel = 1 block, the station marked, +X right, +Z down).

Features: buildings (outline, height from height / building:levels, else an
estimate), roads (centre line, width from lanes / class, bridge / tunnel /
layer), railways (bridge / tunnel / subway), platforms, water, green areas.

Map data © OpenStreetMap contributors, ODbL.
"""
import argparse, json, math, re, sys
import xml.etree.ElementTree as ET

LEVEL_M = 3.5
ROAD_W = {  # metres, when the way has no lanes / width
    'motorway': 14, 'trunk': 18, 'primary': 16, 'secondary': 12, 'tertiary': 9,
    'unclassified': 6, 'residential': 6, 'living_street': 5, 'service': 4,
    'pedestrian': 6, 'motorway_link': 7, 'trunk_link': 7, 'primary_link': 7,
    'secondary_link': 6, 'tertiary_link': 6, 'footway': 2, 'steps': 2, 'path': 2,
    'cycleway': 2, 'corridor': 2,
}
LANE_M = 3.25


def num(v):
    if v is None:
        return None
    m = re.match(r'\s*(-?\d+(?:\.\d+)?)', str(v))
    return float(m.group(1)) if m else None


def load(path):
    root = ET.parse(path).getroot()
    nodes, ways, rels = {}, {}, []
    for n in root.iter('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')), {t.get('k'): t.get('v') for t in n.findall('tag')})
    for w in root.iter('way'):
        ways[w.get('id')] = ([nd.get('ref') for nd in w.findall('nd')], {t.get('k'): t.get('v') for t in w.findall('tag')})
    for r in root.iter('relation'):
        rels.append(([(m.get('type'), m.get('ref'), m.get('role')) for m in r.findall('member')], {t.get('k'): t.get('v') for t in r.findall('tag')}))
    b = root.find('bounds')
    bounds = {k: float(b.get(k)) for k in ('minlat', 'minlon', 'maxlat', 'maxlon')} if b is not None else None
    return nodes, ways, rels, bounds


def find_station(nodes, name):
    best = None
    for lat, lon, t in nodes.values():
        if t.get('railway') != 'station' and t.get('public_transport') != 'station':
            continue
        if name not in (t.get('name') or '') and name != t.get('name:en') and name != t.get('name:ja'):
            continue
        jr = any(k in (t.get('operator') or '') for k in ('JR', '旅客鉄道'))
        score = (t.get('railway') == 'station') * 2 + (t.get('station') != 'subway') * 4 + (t.get('name') == name) * 8 + jr * 3
        if not best or score > best[0]:
            best = (score, lat, lon, t.get('name'))
    if not best:
        sys.exit(f'역을 찾지 못했습니다: {name}')
    return best[1], best[2], best[3]


class Frame:
    """lat/lon → block x, z: the station at 0, 0, turned by `angle` (degrees)."""

    def __init__(self, lat0, lon0, angle=0.0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = 111320.0 * math.cos(math.radians(lat0))
        self.kz = 110574.0
        self.c, self.s = math.cos(math.radians(angle)), math.sin(math.radians(angle))

    def raw(self, lat, lon):
        # east = +x, north = -z (Minecraft)
        return (lon - self.lon0) * self.kx, -(lat - self.lat0) * self.kz

    def __call__(self, lat, lon):
        x, z = self.raw(lat, lon)
        return round(x * self.c - z * self.s, 2), round(x * self.s + z * self.c, 2)


def track_angle(nodes, ways, frame, radius=350):
    """The turn that puts the station's tracks along Z: the mean direction of the
    surface railway near the origin (doubled angles, so either way along counts)."""
    sx = sy = 0.0
    for refs, t in ways.values():
        if t.get('railway') != 'rail' or t.get('tunnel') in ('yes', 'building_passage'):
            continue
        pts = [frame.raw(*nodes[r][:2]) for r in refs if r in nodes]
        for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
            mx, mz = (x1 + x2) / 2, (z1 + z2) / 2
            if mx * mx + mz * mz > radius * radius:
                continue
            dx, dz = x2 - x1, z2 - z1
            L = math.hypot(dx, dz)
            if L < 1e-6:
                continue
            a = math.atan2(dx, -dz)  # bearing from north (-z), clockwise
            sx += L * math.cos(2 * a)
            sy += L * math.sin(2 * a)
    if not sx and not sy:
        return 0.0
    bearing = math.degrees(math.atan2(sy, sx) / 2)
    # turning by -bearing brings that direction onto north (-z); when the tracks
    # run more east-west, line them up with X instead (the smaller turn)
    a = -bearing
    if a > 45:
        a -= 90
    elif a < -45:
        a += 90
    return a


def building_height(t):
    h = num(t.get('height')) or num(t.get('building:height'))
    est = False
    if h is None:
        lv = num(t.get('building:levels'))
        if lv is not None:
            h = lv * LEVEL_M + (num(t.get('roof:levels')) or 0) * LEVEL_M
        else:
            h, est = (4 if t.get('building') in ('roof', 'canopy', 'kiosk') else 14), True
    mh = num(t.get('min_height'))
    if mh is None and t.get('building:min_level'):
        mh = num(t.get('building:min_level')) * LEVEL_M
    return round(h, 1), round(mh or 0, 1), est


def road_width(t):
    w = num(t.get('width'))
    if w:
        return w
    lanes = num(t.get('lanes'))
    if lanes:
        return lanes * LANE_M + (2 if t.get('highway') not in ('motorway', 'motorway_link') else 1)
    return ROAD_W.get(t.get('highway'), 4)


def convert(path, station, angle=None, north=False, radius=None):
    nodes, ways, rels, B = load(path)
    lat0, lon0, sname = find_station(nodes, station)
    fr = Frame(lat0, lon0)
    if angle is None:
        angle = 0.0 if north else track_angle(nodes, ways, fr)
    fr = Frame(lat0, lon0, angle)

    def near(pts):
        return radius is None or any(x * x + z * z <= radius * radius for x, z in pts)

    # The export holds whole ways reaching far outside the box asked for: lines
    # are cut at the box, areas kept when their middle is inside it.
    def inside(ll):
        return not B or (B['minlat'] <= ll[0] <= B['maxlat'] and B['minlon'] <= ll[1] <= B['maxlon'])

    def clip(a, b):
        t0, t1 = 0.0, 1.0  # Liang-Barsky on lat / lon
        d = (b[0] - a[0], b[1] - a[1])
        for p, q in ((-d[0], a[0] - B['minlat']), (d[0], B['maxlat'] - a[0]), (-d[1], a[1] - B['minlon']), (d[1], B['maxlon'] - a[1])):
            if p == 0:
                if q < 0:
                    return None
                continue
            r = q / p
            if p < 0:
                t0 = max(t0, r)
            else:
                t1 = min(t1, r)
            if t0 > t1:
                return None
        return (a[0] + d[0] * t0, a[1] + d[1] * t0), (a[0] + d[0] * t1, a[1] + d[1] * t1), t1 < 1.0

    def ring(refs):
        return [list(fr(*nodes[r][:2])) for r in refs if r in nodes]

    def lines(refs):
        """A way as pieces of line inside the box."""
        ll = [nodes[r][:2] for r in refs if r in nodes]
        if not B:
            return [ring(refs)]
        out, cur = [], []
        for a, b in zip(ll, ll[1:]):
            c = clip(a, b)
            if not c:
                if cur:
                    out.append(cur)
                cur = []
                continue
            pa, pb = list(fr(*c[0])), list(fr(*c[1]))
            if not cur:
                cur = [pa]
            cur.append(pb)
            if c[2]:
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return [p for p in out if len(p) >= 2]

    def area_in(refs):
        ll = [nodes[r][:2] for r in refs if r in nodes]
        return bool(ll) and inside((sum(p[0] for p in ll) / len(ll), sum(p[1] for p in ll) / len(ll)))

    out = {
        'source': 'OpenStreetMap (ODbL) © OpenStreetMap contributors',
        'station': sname, 'origin': [lat0, lon0], 'angle': round(angle, 2),
        'note': '1 block = 1 m. -z = along the tracks (north end), +x to its right. h / min: metres above ground.',
        'buildings': [], 'roads': [], 'rails': [], 'platforms': [], 'water': [], 'green': [],
    }

    def add_building(pts, t, wid):
        if len(pts) < 3 or not near(pts):
            return
        h, mh, est = building_height(t)
        out['buildings'].append({'id': wid, 'pts': pts, 'h': h, 'min': mh, 'est': est, 'part': 'building:part' in t, 'kind': t.get('building') or t.get('building:part'),
                                 'name': t.get('name'), 'levels': num(t.get('building:levels'))})

    flag = lambda t, k: t.get(k) not in (None, 'no')
    for wid, (refs, t) in ways.items():
        if len(refs) < 2:
            continue
        closed = refs[0] == refs[-1]
        if 'building' in t or 'building:part' in t:
            if area_in(refs):
                add_building(ring(refs), t, wid)
            continue
        if closed and not area_in(refs):
            continue
        pieces = [ring(refs)] if closed else lines(refs)
        for pts in pieces:
            if len(pts) < 2 or not near(pts):
                continue
            hw, rw = t.get('highway'), t.get('railway')
            if hw and hw not in ('proposed', 'construction', 'platform', 'bus_stop', 'elevator'):
                out['roads'].append({'id': wid, 'pts': pts, 'kind': hw, 'w': round(road_width(t), 1),
                                     'lanes': num(t.get('lanes')), 'layer': num(t.get('layer')) or 0,
                                     'bridge': flag(t, 'bridge'), 'tunnel': flag(t, 'tunnel'),
                                     'area': t.get('area') == 'yes', 'name': t.get('name')})
            elif rw in ('rail', 'subway', 'light_rail', 'monorail', 'narrow_gauge'):
                out['rails'].append({'id': wid, 'pts': pts, 'kind': rw, 'layer': num(t.get('layer')) or 0,
                                     'bridge': flag(t, 'bridge'), 'tunnel': flag(t, 'tunnel') or rw == 'subway',
                                     'gauge': num(t.get('gauge')), 'name': t.get('name')})
            elif rw == 'platform':
                out['platforms'].append({'id': wid, 'pts': pts, 'area': closed, 'layer': num(t.get('layer')) or 0,
                                         'tunnel': flag(t, 'tunnel') or (num(t.get('layer')) or 0) < 0, 'name': t.get('name')})
            elif t.get('natural') == 'water' or t.get('waterway') in ('river', 'canal', 'riverbank'):
                out['water'].append({'id': wid, 'pts': pts, 'area': closed, 'kind': t.get('waterway') or 'water'})
            elif closed and (t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'forest') or t.get('natural') in ('wood', 'scrub', 'grassland')):
                out['green'].append({'id': wid, 'pts': pts, 'kind': t.get('leisure') or t.get('landuse') or t.get('natural')})
    # the area the map covers (the box exported), as a turned outline
    if B:
        out['bounds'] = [list(fr(la, lo)) for la, lo in ((B['minlat'], B['minlon']), (B['minlat'], B['maxlon']), (B['maxlat'], B['maxlon']), (B['maxlat'], B['minlon']))]
    # multipolygon buildings: their outer rings
    for members, t in rels:
        if t.get('type') == 'multipolygon' and ('building' in t or 'building:part' in t):
            for typ, ref, role in members:
                if typ == 'way' and role == 'outer' and ref in ways and area_in(ways[ref][0]):
                    add_building(ring(ways[ref][0]), t, 'r' + ref)
    return out, B, fr


def preview(data, png, pad=20):
    from PIL import Image, ImageDraw
    xs, zs = [], []
    for k in ('buildings', 'roads', 'rails', 'water', 'green', 'platforms'):
        for f in data[k]:
            for x, z in f['pts']:
                xs.append(x)
                zs.append(z)
    x0, x1, z0, z1 = min(xs) - pad, max(xs) + pad, min(zs) - pad, max(zs) + pad
    W, H = int(x1 - x0) + 1, int(z1 - z0) + 1
    im = Image.new('RGB', (W, H), (226, 222, 210))
    d = ImageDraw.Draw(im)
    P = lambda pts: [(x - x0, z - z0) for x, z in pts]
    for f in data['green']:
        d.polygon(P(f['pts']), fill=(170, 210, 150))
    for f in data['water']:
        (d.polygon(P(f['pts']), fill=(120, 170, 230)) if f['area'] else d.line(P(f['pts']), fill=(120, 170, 230), width=12))
    order = {'footway': 0, 'steps': 0, 'path': 0, 'corridor': 0, 'service': 1}
    for f in sorted(data['roads'], key=lambda f: order.get(f['kind'], 2)):
        if f['tunnel']:
            continue
        thin = f['kind'] in ('footway', 'steps', 'path', 'corridor', 'cycleway')
        col = (200, 196, 186) if thin else (250, 250, 250) if f['kind'] in ('service', 'unclassified', 'residential') else (255, 230, 160) if not f['bridge'] else (250, 200, 120)
        if f['area']:
            d.polygon(P(f['pts']), fill=col)
        else:
            d.line(P(f['pts']), fill=col, width=max(1, int(f['w'])), joint='curve')
    for f in sorted(data['buildings'], key=lambda f: f['h']):
        g = int(max(60, 200 - f['h'] * 0.9))
        col = (g, g, g + 15) if not f['est'] else (g + 20, g + 10, g)
        d.polygon(P(f['pts']), fill=col, outline=(70, 70, 80))
    for f in data['platforms']:
        if not f['tunnel']:
            (d.polygon(P(f['pts']), fill=(240, 160, 160)) if f['area'] else d.line(P(f['pts']), fill=(240, 160, 160), width=3))
    for f in data['rails']:
        if f['tunnel']:
            d.line(P(f['pts']), fill=(150, 120, 200), width=1)
        else:
            d.line(P(f['pts']), fill=(200, 40, 40) if f['bridge'] else (60, 60, 60), width=2)
    ox, oz = -x0, -z0
    d.ellipse((ox - 8, oz - 8, ox + 8, oz + 8), outline=(255, 0, 0), width=3)
    d.line((ox - 40, oz, ox + 40, oz), fill=(255, 0, 0), width=1)
    d.line((ox, oz - 40, ox, oz + 40), fill=(255, 0, 0), width=1)
    im.save(png)
    return (x0, z0, x1, z1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('osm')
    ap.add_argument('--station', required=True)
    ap.add_argument('--out', default='tools/city/out/city')
    ap.add_argument('--north', action='store_true', help='keep true north at -Z (no turn)')
    ap.add_argument('--angle', type=float, help='turn by this many degrees')
    ap.add_argument('--radius', type=float, help='only features within this many metres of the station')
    a = ap.parse_args()
    data, bounds, fr = convert(a.osm, a.station, a.angle, a.north, a.radius)
    import os
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    box = preview(data, a.out + '.png')
    data['extent'] = {'min': [round(box[0]), round(box[1])], 'max': [round(box[2]), round(box[3])]}
    json.dump(data, open(a.out + '.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    est = sum(1 for b in data['buildings'] if b['est'])
    print(f"{data['station']}역 기준, 회전 {data['angle']}° · 범위 x {box[0]:.0f}~{box[2]:.0f}, z {box[1]:.0f}~{box[3]:.0f}")
    print(f"건물 {len(data['buildings'])} (높이 추정 {est}) · 도로 {len(data['roads'])} · 철도 {len(data['rails'])} · 승강장 {len(data['platforms'])} · 물 {len(data['water'])} · 녹지 {len(data['green'])}")


if __name__ == '__main__':
    main()
