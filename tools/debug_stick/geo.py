"""Java model parts -> Bedrock block geometry.

Coordinate rules (verified against the Bedrock Wiki fence example, where the
"east" rail bone sits at negative X, and against Blockbench's Bedrock codec):

  * Java model space: x east, y up, z south, 0..16.
  * Bedrock geometry file: x is mirrored, so  file_x = 8 - java_x,
    file_z = java_z - 8, file_y = java_y.
  * Rotations: a Java right-handed angle `a` about x / y / z is written as
    [-a, 0, 0] / [0, -a, 0] / [0, 0, a].
  * Face UVs are copied, except up/down which Bedrock reads flipped in both
    directions (uv += size, size = -size), exactly like Blockbench exports.

Blockstate rotations (x, y) are right-handed rotations of -x about X then -y
about Y around the block centre. With uvlock they are baked into the cube
coordinates (UVs re-derived from position, which is what uvlock means);
without uvlock they become bone rotations so the texture turns with the face.
"""
import math

DIRS = {
    'north': (0, 0, -1), 'south': (0, 0, 1),
    'west': (-1, 0, 0), 'east': (1, 0, 0),
    'down': (0, -1, 0), 'up': (0, 1, 0),
}
VEC2DIR = {v: k for k, v in DIRS.items()}
AXES = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}


def _rot_matrix(axis, deg):
    """Right-handed rotation matrix, integer for multiples of 90."""
    r = math.radians(deg)
    c, s = round(math.cos(r), 10), round(math.sin(r), 10)
    if axis == 'x':
        return ((1, 0, 0), (0, c, -s), (0, s, c))
    if axis == 'y':
        return ((c, 0, s), (0, 1, 0), (-s, 0, c))
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _mul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def _apply(m, v):
    return tuple(sum(m[i][k] * v[k] for k in range(3)) for i in range(3))


def blockstate_matrix(x, y):
    return _mul(_rot_matrix('y', -y), _rot_matrix('x', -x))


def _clean(v):
    v = round(v, 4)
    return int(v) if v == int(v) else v


def default_uv(face, f, t):
    """Java's automatic UV for a face of the box f..t."""
    x1, y1, z1 = f
    x2, y2, z2 = t
    return {
        'down': [x1, 16 - z2, x2, 16 - z1],
        'up': [x1, z1, x2, z2],
        'north': [16 - x2, 16 - y2, 16 - x1, 16 - y1],
        'south': [x1, 16 - y2, x2, 16 - y1],
        'west': [z1, 16 - y2, z2, 16 - y1],
        'east': [16 - z2, 16 - y2, 16 - z1, 16 - y1],
    }[face]


def _rescaled(e):
    """Apply Java's `rescale` (stretch by 1/cos(angle) across the axis)."""
    f, t = list(e['from']), list(e['to'])
    rot = e.get('rotation')
    if not rot or not rot.get('rescale') or not rot.get('angle'):
        return f, t
    k = 'xyz'.index(rot['axis'])
    scale = 1 / math.cos(math.radians(abs(rot['angle'])))
    o = rot.get('origin', [8, 8, 8])
    for i in range(3):
        if i != k:
            f[i] = o[i] + (f[i] - o[i]) * scale
            t[i] = o[i] + (t[i] - o[i]) * scale
    return f, t


def _rotated_element(e, m):
    """Bake a 90-degree blockstate rotation into an element (uvlock)."""
    f, t = _rescaled(e)
    c = (8, 8, 8)
    p1 = _apply(m, [f[i] - c[i] for i in range(3)])
    p2 = _apply(m, [t[i] - c[i] for i in range(3)])
    nf = [min(p1[i], p2[i]) + c[i] for i in range(3)]
    nt = [max(p1[i], p2[i]) + c[i] for i in range(3)]
    out = {'from': nf, 'to': nt, 'faces': {}}
    rot = e.get('rotation')
    if rot and rot.get('angle'):
        ax = _apply(m, AXES[rot['axis']])
        k = [i for i in range(3) if ax[i]][0]
        o = rot.get('origin', [8, 8, 8])
        po = _apply(m, [o[i] - c[i] for i in range(3)])
        out['rotation'] = {'axis': 'xyz'[k], 'angle': rot['angle'] * ax[k],
                           'origin': [po[i] + c[i] for i in range(3)]}
    for d, face in e.get('faces', {}).items():
        nd = VEC2DIR[tuple(int(v) for v in _apply(m, DIRS[d]))]
        nface = dict(face)
        old = default_uv(d, f, t)
        new = default_uv(nd, nf, nt)
        uv = face.get('uv')
        # uvlock: the texture stays aligned to the world. Positional UVs are
        # re-derived from the new position; mirrored positional UVs (used
        # for the back of a plane) stay mirrored; anything else is kept.
        if uv is None or _same(uv, old):
            nface['uv'] = new
            nface.pop('rotation', None)
        elif _same(uv, [old[2], old[1], old[0], old[3]]):
            nface['uv'] = [new[2], new[1], new[0], new[3]]
            nface.pop('rotation', None)
        out['faces'][nd] = nface
    return out


def _same(a, b):
    return all(abs(x - y) < 1e-6 for x, y in zip(a, b))


def _bedrock_rotation(axis, angle):
    v = [0, 0, 0]
    k = 'xyz'.index(axis)
    v[k] = angle if axis == 'z' else -angle
    return [_clean(x) for x in v]


def element_to_cube(e, material_of, baked=False):
    """One Java element -> one Bedrock cube (or None if it has no faces)."""
    if baked:
        f, t = e['from'], e['to']
    else:
        f, t = _rescaled(e)
    cube = {
        'origin': [_clean(8 - t[0]), _clean(f[1]), _clean(f[2] - 8)],
        'size': [_clean(t[0] - f[0]), _clean(t[1] - f[1]), _clean(t[2] - f[2])],
    }
    rot = e.get('rotation')
    if rot and rot.get('angle'):
        o = rot.get('origin', [8, 8, 8])
        cube['pivot'] = [_clean(8 - o[0]), _clean(o[1]), _clean(o[2] - 8)]
        cube['rotation'] = _bedrock_rotation(rot['axis'], rot['angle'])
    uv = {}
    for d, face in e.get('faces', {}).items():
        if d not in DIRS:
            continue
        mat = material_of(face)
        if mat is None:
            continue
        u = face.get('uv') or default_uv(d, f, t)
        u1, v1, u2, v2 = u
        entry = {'uv': [_clean(u1), _clean(v1)], 'uv_size': [_clean(u2 - u1), _clean(v2 - v1)]}
        if d in ('up', 'down'):
            entry['uv'] = [_clean(u2), _clean(v2)]
            entry['uv_size'] = [_clean(u1 - u2), _clean(v1 - v2)]
        r = face.get('rotation', 0)
        if r:
            entry['uv_rotation'] = r
        entry['material_instance'] = mat
        uv[d] = entry
    if not uv:
        return None
    cube['uv'] = uv
    return cube


def element_box(e, m=None):
    """World-space AABB (java coords) of an element, after blockstate
    rotation `m`. Element-level rotations are ignored (vanilla shapes
    are axis aligned too)."""
    f, t = e['from'], e['to']
    if m is None:
        return (tuple(f), tuple(t))
    c = (8, 8, 8)
    p1 = _apply(m, [f[i] - c[i] for i in range(3)])
    p2 = _apply(m, [t[i] - c[i] for i in range(3)])
    return (tuple(min(p1[i], p2[i]) + c[i] for i in range(3)),
            tuple(max(p1[i], p2[i]) + c[i] for i in range(3)))


def part_to_bones(name, part, model, material_of):
    """Bones for one placed model. Returns (bones, bone_names)."""
    bones = []
    if part.uvlock and (part.x or part.y):
        m = blockstate_matrix(part.x, part.y)
        cubes = [element_to_cube(_rotated_element(e, m), material_of, baked=True)
                 for e in model['elements']]
        bones.append({'name': name, 'pivot': [0, 8, 0], 'cubes': [c for c in cubes if c]})
        return bones
    cubes = [c for c in (element_to_cube(e, material_of) for e in model['elements']) if c]
    if part.x and part.y:
        bones.append({'name': name, 'pivot': [0, 8, 0], 'rotation': [0, part.y % 360, 0]})
        bones.append({'name': name + '_x', 'parent': name, 'pivot': [0, 8, 0],
                      'rotation': [part.x % 360, 0, 0], 'cubes': cubes})
    else:
        bone = {'name': name, 'pivot': [0, 8, 0], 'cubes': cubes}
        if part.x or part.y:
            bone['rotation'] = [part.x % 360, part.y % 360, 0]
        bones.append(bone)
    return bones


def part_boxes(part, model):
    m = blockstate_matrix(part.x, part.y) if (part.x or part.y) else None
    return [element_box(e, m) for e in model['elements']]


def box_to_bedrock(box):
    """Java-space AABB -> Bedrock {origin, size} (collision/selection)."""
    (x1, y1, z1), (x2, y2, z2) = box
    return {'origin': [_clean(8 - x2), _clean(y1), _clean(z1 - 8)],
            'size': [_clean(x2 - x1), _clean(y2 - y1), _clean(z2 - z1)]}
