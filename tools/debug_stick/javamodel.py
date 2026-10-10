"""Java Edition block models and blockstates, resolved into plain parts.

A *part* is one model placed with a blockstate rotation:
    Part(model='block/lever_on', x=90, y=180, uvlock=False)

Models are flattened through their parent chain into a list of elements
with every '#texture' reference resolved to a concrete texture id.
"""
import json
import os
from collections import namedtuple

Part = namedtuple('Part', 'model x y uvlock')

# Builtin parents that only carry display settings; reaching one ends the chain.
_BUILTIN = {'block/block', 'builtin/generated', 'builtin/entity', 'item/generated'}


def _norm(ref):
    ref = ref.replace('minecraft:', '')
    return ref if '/' in ref else 'block/' + ref


class JavaAssets:
    def __init__(self, root):
        self.root = root  # .../assets/minecraft
        self._models = {}
        self._states = {}

    # ----------------------------------------------------------- models
    def _raw_model(self, ref):
        path = os.path.join(self.root, 'models', _norm(ref) + '.json')
        if not os.path.exists(path):
            raise KeyError('missing java model ' + ref)
        with open(path) as f:
            return json.load(f)

    def model(self, ref):
        """Flattened model: {'elements': [...], 'textures': {...}}."""
        ref = _norm(ref)
        if ref in self._models:
            return self._models[ref]
        chain = []
        cur = ref
        while cur and cur not in _BUILTIN:
            m = self._raw_model(cur)
            chain.append(m)
            cur = _norm(m['parent']) if 'parent' in m else None
        textures = {}
        elements = None
        for m in reversed(chain):          # root first, child overrides
            textures.update(m.get('textures', {}))
            if 'elements' in m:
                elements = m['elements']
        if elements is None:
            raise KeyError('model without elements: ' + ref)

        def resolve(t, depth=0):
            while depth < 16:
                if isinstance(t, dict):        # {"sprite": ..., "force_translucent": ...}
                    t = t.get('sprite')
                if isinstance(t, str) and t.startswith('#'):
                    t = textures.get(t[1:])
                    depth += 1
                else:
                    break
            return t

        out = []
        for e in elements:
            e = json.loads(json.dumps(e))
            for face in e.get('faces', {}).values():
                face['texture_var'] = face['texture'].lstrip('#')
                face['texture'] = resolve(face['texture'])
            out.append(e)
        res = {'elements': out, 'textures': {k: resolve(v) for k, v in textures.items()},
               'ambientocclusion': next((m['ambientocclusion'] for m in chain if 'ambientocclusion' in m), True)}
        self._models[ref] = res
        return res

    # ------------------------------------------------------ blockstates
    def blockstate(self, name):
        if name not in self._states:
            path = os.path.join(self.root, 'blockstates', name + '.json')
            if not os.path.exists(path):
                raise KeyError('missing java blockstate ' + name)
            with open(path) as f:
                self._states[name] = json.load(f)
        return self._states[name]

    def has_blockstate(self, name):
        return os.path.exists(os.path.join(self.root, 'blockstates', name + '.json'))

    @staticmethod
    def _part(v):
        if isinstance(v, list):          # weighted random: the first one is the default
            v = v[0]
        return Part(_norm(v['model']), v.get('x', 0), v.get('y', 0), bool(v.get('uvlock', False)))

    @staticmethod
    def _when(cond, props):
        if 'OR' in cond:
            return any(JavaAssets._when(c, props) for c in cond['OR'])
        if 'AND' in cond:
            return all(JavaAssets._when(c, props) for c in cond['AND'])
        for k, v in cond.items():
            if str(props.get(k)) not in str(v).split('|'):
                return False
        return True

    def parts(self, name, props):
        """Parts drawn for blockstate `name` with java properties `props`."""
        s = self.blockstate(name)
        if 'variants' in s:
            best = None
            for key, v in s['variants'].items():
                conds = dict(kv.split('=') for kv in key.split(',') if kv)
                if all(str(props.get(k)) == val for k, val in conds.items()):
                    # most specific key wins (they are exclusive in vanilla)
                    if best is None or len(conds) > best[0]:
                        best = (len(conds), v)
            if best is None:
                raise KeyError(f'no variant of {name} for {props}')
            return [self._part(best[1])]
        out = []
        for entry in s['multipart']:
            if 'when' not in entry or self._when(entry['when'], props):
                out.append(self._part(entry['apply']))
        return out


OPPOSITE = {'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east',
            'up': 'down', 'down': 'up'}


def closed(model):
    """Copy of `model` with every element's missing faces filled in.

    Java's wall/fence/pane side models leave out the face that points at
    the centre, because the post or the opposite arm always covers it in
    vanilla. With the debug stick an arm can stand alone with no post, and
    that missing face shows as a hole, so give it one: same texture as the
    opposite face, positional UVs.
    """
    out = json.loads(json.dumps(model))
    for e in out['elements']:
        faces = e.setdefault('faces', {})
        if not faces:
            continue
        size = [e['to'][i] - e['from'][i] for i in range(3)]
        for d in ('north', 'south', 'east', 'west', 'up', 'down'):
            if d in faces:
                continue
            # a face with no area (plane elements) is not a hole
            axis = {'north': 2, 'south': 2, 'east': 0, 'west': 0, 'up': 1, 'down': 1}[d]
            if size[axis] <= 0:
                continue
            src = faces.get(OPPOSITE[d]) or next(iter(faces.values()))
            nf = {k: v for k, v in src.items() if k in ('texture', 'texture_var', 'tintindex')}
            faces[d] = nf
    return out
