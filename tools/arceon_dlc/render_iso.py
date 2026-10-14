"""Isometric render of a block dump ([x, y, z, id, states] list) to PNG, for checking designs.
   python3 render_iso.py in.json out.png [view: se|sw|ne|nw] [scale]"""
import json, sys, math
from PIL import Image, ImageDraw

COL = [
    ('oxidized', (82, 160, 135)), ('weathered', (98, 150, 110)), ('exposed', (160, 130, 105)), ('copper', (190, 110, 80)),
    ('white_concrete', (225, 228, 230)), ('light_gray_concrete', (150, 150, 145)), ('gray_concrete', (85, 88, 92)),
    ('smooth_stone', (165, 165, 165)), ('stone_brick', (122, 122, 124)), ('polished_andesite', (135, 138, 136)), ('andesite', (138, 138, 136)),
    ('diorite', (200, 200, 200)), ('tuff', (108, 110, 98)), ('mossy', (100, 120, 90)), ('mud_brick', (140, 100, 72)), ('gravel', (128, 122, 120)),
    ('mossy', (98, 118, 88)), ('cracked', (112, 112, 112)), ('calcite', (222, 222, 216)), ('cobblestone', (120, 120, 120)), ('anvil', (68, 68, 72)), ('iron', (170, 172, 175)), ('chain', (55, 60, 72)), ('button', (40, 40, 44)),
    ('hopper', (70, 70, 75)), ('heavy_core', (90, 95, 100)), ('pale_oak', (225, 215, 210)), ('grindstone', (150, 150, 150)), ('skull', (50, 50, 50)),
    ('grass', (95, 150, 70)), ('stone', (125, 125, 125)), ('barrier', None),
]
def color(i):
    for k, c in COL:
        if k in i: return c
    return (200, 80, 200)

def boxes(i, st):
    if 'barrier' in i: return []
    half = st.get('minecraft:vertical_half')
    if i.endswith('_slab'):
        return [(0, .5, 0, 1, 1, 1)] if half == 'top' else [(0, 0, 0, 1, .5, 1)]
    if i.endswith('_stairs'):
        up = st.get('upside_down_bit'); w = st.get('weirdo_direction', 0)
        base = (0, .5, 0, 1, 1, 1) if up else (0, 0, 0, 1, .5, 1)
        y0, y1 = (0, .5) if up else (.5, 1)
        part = {0: (.5, y0, 0, 1, y1, 1), 1: (0, y0, 0, .5, y1, 1), 2: (0, y0, .5, 1, y1, 1), 3: (0, y0, 0, 1, y1, .5)}[w]
        return [base, part]
    def conn(prefix, t, h):
        out = [(.5 - t, 0, .5 - t, .5 + t, h, .5 + t)]
        for d, b in (('north', (.5 - t * .8, 0, 0, .5 + t * .8, h * .9, .5)), ('south', (.5 - t * .8, 0, .5, .5 + t * .8, h * .9, 1)),
                     ('west', (0, 0, .5 - t * .8, .5, h * .9, .5 + t * .8)), ('east', (.5, 0, .5 - t * .8, 1, h * .9, .5 + t * .8))):
            v = st.get(prefix + d)
            if v is True or v in ('short', 'tall'): out.append(b)
        return out
    if 'bars' in i: return conn('minecraft:connection_', .07, 1)
    if i.endswith('_wall'): return conn('wall_connection_type_', .25, 1)
    if 'chain' in i: return [(.44, 0, .44, .56, 1, .56)]
    if 'lightning_rod' in i or 'end_rod' in i:
        f = st.get('facing_direction', 1)
        return [(.42, 0, .42, .58, 1, .58)] if f in (0, 1) else ([(0, .42, .42, 1, .58, .58)] if f in (4, 5) else [(.42, .42, 0, .58, .58, 1)])
    if i.endswith('_button'):
        f = st.get('facing_direction', 1)
        return {0: [(.35, .85, .4, .65, 1, .6)], 1: [(.35, 0, .4, .65, .15, .6)], 2: [(.35, .4, .85, .65, .6, 1)], 3: [(.35, .4, 0, .65, .6, .15)],
                4: [(.85, .4, .35, 1, .6, .65)], 5: [(0, .4, .35, .15, .6, .65)]}[f]
    if 'trapdoor' in i:
        if st.get('open_bit'): return [(0, 0, 0, 1, 1, .19)]
        return [(0, .81, 0, 1, 1, 1)] if st.get('upside_down_bit') else [(0, 0, 0, 1, .19, 1)]
    if 'skull' in i: return [(.25, 0, .25, .75, .5, .75)]
    if 'gate' in i: return [(0, .3, .4, 1, .9, .6)]
    if 'lantern' in i: return [(.3, 0, .3, .7, .5, .7)]
    return [(0, 0, 0, 1, 1, 1)]

def front(data, dst, scale, axis='x', cut=None):
    # orthographic elevation looking north (axis x) or west (axis z); cut = keep only blocks with depth >= cut
    items = []
    for x, y, z, i, st in data:
        h, dep = (x, z) if axis == 'x' else (-z, x)
        if cut is not None and dep > cut + 1: continue
        for b in boxes(i, st):
            x0, y0, z0, x1, y1, z1 = b
            if axis == 'x': items.append((h + x0, h + x1, y + y0, y + y1, dep + z1, color(i)))
            else: items.append((h - z1, h - z0, y + y0, y + y1, dep + x1, color(i)))
    if not items: return
    minh = min(t[0] for t in items); maxh = max(t[1] for t in items); miny = min(t[2] for t in items); maxy = max(t[3] for t in items)
    W = int((maxh - minh) * scale) + 20; H = int((maxy - miny) * scale) + 20
    img = Image.new('RGB', (W, H), (205, 225, 240)); d = ImageDraw.Draw(img)
    items.sort(key=lambda t: t[4])
    for h0, h1, y0, y1, dep, col in items:
        if col is None: continue
        k = 1.0 if cut is None else max(.45, 1 - (cut + 1 - dep) * .05)
        f = tuple(int(v * k) for v in col)
        d.rectangle([10 + (h0 - minh) * scale, 10 + (maxy - y1) * scale, 10 + (h1 - minh) * scale, 10 + (maxy - y0) * scale], fill=f, outline=tuple(int(v * .75) for v in f))
    img.save(dst)

def main(src, dst, view='se', scale=6):
    data = json.load(open(src))
    if view.startswith('front') or view.startswith('side'):
        cut = float(view.split(':')[1]) if ':' in view else None
        return front(data, dst, scale, 'x' if view.startswith('front') else 'z', cut)
    rot = {'se': (1, 1), 'sw': (-1, 1), 'ne': (1, -1), 'nw': (-1, -1)}[view]
    sx, sz = rot
    c, s = math.cos(math.pi / 6), math.sin(math.pi / 6)
    items = []
    for x, y, z, i, st in data:
        for b in boxes(i, st):
            x0, y0, z0, x1, y1, z1 = b
            X0, X1 = (x + x0, x + x1) if sx > 0 else (-(x + x1), -(x + x0))
            Z0, Z1 = (z + z0, z + z1) if sz > 0 else (-(z + z1), -(z + z0))
            items.append((X0, y + y0, Z0, X1, y + y1, Z1, color(i)))
    proj = lambda X, Y, Z: ((X - Z) * c * scale, ((X + Z) * s - Y) * scale)
    pts = [proj(a, b, cz) for it in items for a in (it[0], it[3]) for b in (it[1], it[4]) for cz in (it[2], it[5])]
    minx = min(p[0] for p in pts) - 10; miny = min(p[1] for p in pts) - 10
    W = int(max(p[0] for p in pts) - minx + 10); H = int(max(p[1] for p in pts) - miny + 10)
    img = Image.new('RGB', (W, H), (205, 225, 240)); d = ImageDraw.Draw(img)
    items.sort(key=lambda t: (t[0] + t[3] + t[2] + t[5], t[1] + t[4]))
    P = lambda X, Y, Z: (proj(X, Y, Z)[0] - minx, proj(X, Y, Z)[1] - miny)
    for X0, Y0, Z0, X1, Y1, Z1, col in items:
        if col is None: continue
        sh = lambda k: tuple(int(v * k) for v in col)
        d.polygon([P(X0, Y1, Z0), P(X1, Y1, Z0), P(X1, Y1, Z1), P(X0, Y1, Z1)], fill=sh(1.0), outline=sh(.8))
        d.polygon([P(X0, Y0, Z1), P(X1, Y0, Z1), P(X1, Y1, Z1), P(X0, Y1, Z1)], fill=sh(.78), outline=sh(.6))
        d.polygon([P(X1, Y0, Z0), P(X1, Y0, Z1), P(X1, Y1, Z1), P(X1, Y1, Z0)], fill=sh(.62), outline=sh(.48))
    img.save(dst)

if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], a[3] if len(a) > 3 else 'se', float(a[4]) if len(a) > 4 else 6)
