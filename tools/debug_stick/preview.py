"""Software renderer used to check the generated blocks.

Renders the same block state twice: once straight from the Java model and
once from the generated Bedrock geometry (read back with the inverse of the
conversion rules in geo.py). Any difference points at a conversion bug.
The Bedrock render is also what the preview sheets in docs/ are made from.
"""
import math
import re

import numpy as np
from PIL import Image

from .geo import DIRS, blockstate_matrix, _rot_matrix, _apply, _mul

# face -> (u axis, v axis) as (component index, sign) in java space
FACE_AXES = {
    'north': ((0, -1), (1, -1)), 'south': ((0, 1), (1, -1)),
    'west': ((2, 1), (1, -1)), 'east': ((2, -1), (1, -1)),
    'up': ((0, 1), (2, 1)), 'down': ((0, 1), (2, -1)),
}


def face_quad(f, t, face):
    """Corners of a box face as 4 (point, (fu, fv)) in java space."""
    (ua, us), (va, vs) = FACE_AXES[face]
    n = DIRS[face]
    k = [i for i in range(3) if n[i]][0]
    fixed = t[k] if n[k] > 0 else f[k]
    pts = []
    for fu, fv in ((0, 0), (1, 0), (1, 1), (0, 1)):
        p = [0, 0, 0]
        p[k] = fixed
        p[ua] = (f[ua] if us > 0 else t[ua]) + (t[ua] - f[ua]) * fu * us
        p[va] = (f[va] if vs > 0 else t[va]) + (t[va] - f[va]) * fv * vs
        pts.append((p, (fu, fv)))
    return pts


def _rotate_uv(fu, fv, r):
    for _ in range((r // 90) % 4):
        fu, fv = 1 - fv, fu
    return fu, fv


class Scene:
    def __init__(self):
        self.tris = []   # (3 points, 3 uvs (pixels), texture array, tint)

    def add_face(self, pts, uv, rotation, tex, tint=None):
        u1, v1, u2, v2 = uv
        h, w = tex.shape[:2]
        q = []
        for p, (fu, fv) in pts:
            fu, fv = _rotate_uv(fu, fv, rotation)
            q.append((p, ((u1 + (u2 - u1) * fu) / 16 * w, (v1 + (v2 - v1) * fv) / 16 * h)))
        self.tris.append(([q[0][0], q[1][0], q[2][0]], [q[0][1], q[1][1], q[2][1]], tex, tint))
        self.tris.append(([q[0][0], q[2][0], q[3][0]], [q[0][1], q[2][1], q[3][1]], tex, tint))

    def render(self, size=160, yaw=-35, pitch=30):
        img = np.zeros((size, size, 4), dtype=np.float32)
        zbuf = np.full((size, size), np.inf)
        cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        scale = size / 34.0

        def proj(p):
            x, y, z = p[0] - 8, p[1] - 8, p[2] - 8
            x, z = x * cy - z * sy, x * sy + z * cy
            y, z = y * cp - z * sp, y * sp + z * cp
            return (size / 2 + x * scale, size / 2 - y * scale, -z)

        light = np.array([0.4, 1.0, 0.7])
        light /= np.linalg.norm(light)
        for pts, uvs, tex, tint in self.tris:
            a, b, c = (np.array(p, float) for p in pts)
            n = np.cross(b - a, c - a)
            ln = np.linalg.norm(n)
            if ln == 0:
                continue
            shade = 0.55 + 0.45 * abs(float(np.dot(n / ln, light)))
            P = [proj(p) for p in pts]
            xs = [p[0] for p in P]
            ys = [p[1] for p in P]
            x0, x1 = max(int(min(xs)), 0), min(int(max(xs)) + 1, size)
            y0, y1 = max(int(min(ys)), 0), min(int(max(ys)) + 1, size)
            if x0 >= x1 or y0 >= y1:
                continue
            (ax, ay, az), (bx, by, bz), (cx, cy2, cz) = P
            det = (by - cy2) * (ax - cx) + (cx - bx) * (ay - cy2)
            if abs(det) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            l1 = ((by - cy2) * (gx - cx) + (cx - bx) * (gy - cy2)) / det
            l2 = ((cy2 - ay) * (gx - cx) + (ax - cx) * (gy - cy2)) / det
            l3 = 1 - l1 - l2
            inside = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
            if not inside.any():
                continue
            z = l1 * az + l2 * bz + l3 * cz
            u = l1 * uvs[0][0] + l2 * uvs[1][0] + l3 * uvs[2][0]
            v = l1 * uvs[0][1] + l2 * uvs[1][1] + l3 * uvs[2][1]
            th, tw = tex.shape[:2]
            ui = np.clip(np.floor(u).astype(int), 0, tw - 1)
            vi = np.clip(np.floor(v).astype(int), 0, th - 1)
            col = tex[vi, ui].astype(np.float32)
            ok = inside & (col[..., 3] > 127)
            sub = zbuf[y0:y1, x0:x1]
            ok &= z < sub
            rgb = col[..., :3] * shade
            if tint is not None:
                rgb = rgb * np.array(tint) / 255.0
            region = img[y0:y1, x0:x1]
            region[ok, :3] = rgb[ok]
            region[ok, 3] = 255
            sub[ok] = z[ok]
        return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA')


GRASS = (124, 189, 107)
FOLIAGE = (106, 173, 74)
DRY = (174, 144, 92)
TINT_RGB = {'grass': GRASS, 'default_foliage': FOLIAGE, 'dry_foliage': DRY}


# ---------------------------------------------------------------- java side
def _rot_about(p, axis, angle, origin):
    m = _rot_matrix(axis, angle)
    v = [p[i] - origin[i] for i in range(3)]
    r = _apply(m, v)
    return [r[i] + origin[i] for i in range(3)]


def render_java(java, ti, parts, tint_of=lambda t: None):
    sc = Scene()
    for part in parts:
        model = java.model(part.model)
        M = blockstate_matrix(part.x, part.y)
        elements = model['elements']
        if part.uvlock and (part.x or part.y):
            from .geo import _rotated_element
            elements = [_rotated_element(e, M) for e in elements]
            M = blockstate_matrix(0, 0)
        for e in elements:
            f, t = list(e['from']), list(e['to'])
            rot = e.get('rotation')
            if rot and rot.get('rescale') and rot.get('angle'):
                k = 'xyz'.index(rot['axis'])
                s = 1 / math.cos(math.radians(abs(rot['angle'])))
                o = rot['origin']
                for i in range(3):
                    if i != k:
                        f[i] = o[i] + (f[i] - o[i]) * s
                        t[i] = o[i] + (t[i] - o[i]) * s
            for d, face in e.get('faces', {}).items():
                rel = ti.resolve(face['texture'])
                tex = ti.bedrock_image(rel)
                from .geo import default_uv
                uv = face.get('uv') or default_uv(d, f, t)
                q = face_quad(f, t, d)
                newq = []
                for p, fuv in q:
                    if rot and rot.get('angle'):
                        p = _rot_about(p, rot['axis'], rot['angle'], rot.get('origin', [8, 8, 8]))
                    p = [v - 8 for v in p]
                    p = _apply(M, p)
                    newq.append(([v + 8 for v in p], fuv))
                sc.add_face(newq, uv, face.get('rotation', 0), tex, tint_of(face))
    return sc


# ------------------------------------------------------------- bedrock side
def eval_condition(expr, state):
    if expr in ('1', 'true'):
        return True
    py = re.sub(r"q\.block_state\('([^']+)'\)", lambda m: repr(state[m.group(1)]), expr)
    py = py.replace('&&', ' and ').replace('||', ' or ')
    py = re.sub(r'!(?!=)', ' not ', py)
    return bool(eval(py, {}, {}))


def _bedrock_to_java_point(p):
    return [8 - p[0], p[1], p[2] + 8]


def _bedrock_rot(rotation):
    """Bedrock rotation vector -> list of (axis, java right-handed angle)."""
    rx, ry, rz = rotation
    out = []
    if rz:
        out.append(('z', rz))
    if ry:
        out.append(('y', -ry))
    if rx:
        out.append(('x', -rx))
    return out


def render_bedrock(geo, block, state, atlas, load_texture):
    comps = dict(block['minecraft:block']['components'])
    for p in block['minecraft:block'].get('permutations', []):
        if eval_condition(p['condition'], state):
            comps.update(p['components'])
    g = comps['minecraft:geometry']
    vis = {} if isinstance(g, str) else g.get('bone_visibility', {})
    mats = comps['minecraft:material_instances']
    gdesc = geo['minecraft:geometry'][0]
    bones = {b['name']: b for b in gdesc['bones']}
    sc = Scene()

    def chain(bone):
        out = []
        while bone:
            out.append(bone)
            bone = bones.get(bone.get('parent'))
        return out          # child first

    def visible(bone):
        return all(eval_condition(vis[b['name']], state) for b in chain(bone) if b['name'] in vis)

    for bone in gdesc['bones']:
        if not visible(bone):
            continue
        for cube in bone.get('cubes', []):
            o, s = cube['origin'], cube['size']
            # file box -> java box
            jf = [8 - (o[0] + s[0]), o[1], o[2] + 8]
            jt = [8 - o[0], o[1] + s[1], o[2] + s[2] + 8]
            for d, fd in cube['uv'].items():
                (u, v), (us, vs) = fd['uv'], fd['uv_size']
                if d in ('up', 'down'):
                    u, v, us, vs = u + us, v + vs, -us, -vs
                mi = mats.get(fd.get('material_instance', '*'), mats['*'])
                tex = load_texture(atlas[mi['texture']])
                tint = TINT_RGB.get(mi.get('tint_method'))
                q = face_quad(jf, jt, d)
                newq = []
                for p, fuv in q:
                    if 'rotation' in cube:
                        piv = _bedrock_to_java_point(cube['pivot'])
                        for axis, ang in _bedrock_rot(cube['rotation']):
                            p = _rot_about(p, axis, ang, piv)
                    for b in chain(bone):
                        if 'rotation' in b:
                            piv = _bedrock_to_java_point(b['pivot'])
                            for axis, ang in _bedrock_rot(b['rotation']):
                                p = _rot_about(p, axis, ang, piv)
                    newq.append((p, fuv))
                sc.add_face(newq, [u, v, u + us, v + vs], fd.get('uv_rotation', 0), tex, tint)
    return sc
