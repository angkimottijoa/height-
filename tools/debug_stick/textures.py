"""Maps Java texture names onto Bedrock terrain atlas keys.

Bedrock and Java mostly ship pixel-identical block textures under different
names, so the match is made on pixel content first and on name second.
Only atlas keys that exist in the vanilla terrain_texture.json are ever
returned, which is what keeps the generated blocks from referencing a
texture the game does not have.
"""
import os
import numpy as np
from PIL import Image

from . import jsonc


def _first_path(entry):
    t = entry.get('textures')
    while True:
        if isinstance(t, str):
            return t
        if isinstance(t, list):
            if not t:
                return None
            t = t[0]
        elif isinstance(t, dict):
            if 'path' in t:
                t = t['path']
            elif 'variations' in t:
                t = t['variations']
            else:
                return None
        else:
            return None


def _load_image(base):
    """Bedrock prefers .tga over .png when both exist."""
    for ext in ('.tga', '.png'):
        p = base + ext
        if os.path.exists(p):
            im = Image.open(p).convert('RGBA')
            return np.asarray(im)
    return None


def _frame(arr):
    """First square frame of a (possibly animated) strip."""
    if arr is None:
        return None
    h, w = arr.shape[:2]
    if h > w and h % w == 0:
        arr = arr[:w]
    return arr


def _key(arr):
    arr = _frame(arr)
    if arr is None:
        return None
    a = arr.copy()
    a[a[..., 3] == 0] = 0          # colour of invisible pixels does not matter
    return (a.shape, a.tobytes())


class TextureIndex:
    """Index of the vanilla Bedrock block texture files.

    resolve() returns a resource path such as "textures/blocks/lever" that
    is guaranteed to exist in the vanilla resource pack. The generated
    resource pack registers its own atlas keys pointing at those paths, so
    the blocks never depend on a vanilla atlas key that might be an array
    of textures or be renamed.
    """

    SKIP = ('_mers', '_heightmap')

    def __init__(self, bedrock_rp, java_assets):
        self.rp = bedrock_rp
        self.java = java_assets
        root = os.path.join(bedrock_rp, 'textures/blocks')
        self.files = {}           # resource path -> absolute base (no ext)
        for dirpath, _, names in os.walk(root):
            for fn in names:
                base, ext = os.path.splitext(fn)
                if ext not in ('.png', '.tga') or base.endswith(self.SKIP):
                    continue
                full = os.path.join(dirpath, base)
                rel = os.path.relpath(full, bedrock_rp).replace(os.sep, '/')
                self.files[rel] = full
        # X_normal is a normal map when X exists, a real texture otherwise
        # (sandstone_normal is the plain sandstone side).
        for rel in [r for r in self.files if r.endswith('_normal')]:
            if rel[:-7] in self.files:
                del self.files[rel]
        self._img = {}
        self._by_pixels = {}
        for rel in self.files:
            k = _key(self.bedrock_image(rel))
            if k is not None:
                self._by_pixels.setdefault(k, []).append(rel)
        self.overrides = {}
        self.approx = {}
        flip = jsonc.load(os.path.join(bedrock_rp, 'textures/flipbook_textures.json'))
        self.flipbooks = {f['flipbook_texture']: f for f in flip}

    def exists(self, rel):
        return rel in self.files

    def raw_image(self, rel):
        return _load_image(self.files[rel])

    def bedrock_image(self, rel):
        if rel not in self._img:
            self._img[rel] = _frame(_load_image(self.files[rel])) if rel in self.files else None
        return self._img[rel]

    def is_animated(self, rel):
        arr = _load_image(self.files[rel])
        return arr.shape[0] > arr.shape[1]

    def java_image(self, name):
        name = name.replace('minecraft:', '')
        if name.startswith('block/'):
            name = name[6:]
        p = os.path.join(self.java, 'textures/block', name + '.png')
        if not os.path.exists(p):
            return None
        return _frame(np.asarray(Image.open(p).convert('RGBA')))

    @staticmethod
    def is_grey(arr):
        """True when the visible pixels carry no colour (a tint mask)."""
        if arr is None:
            return False
        vis = arr[arr[..., 3] > 0][:, :3].astype(int)
        if not len(vis):
            return False
        spread = vis.max(axis=1) - vis.min(axis=1)
        return float(np.mean(spread)) < 6

    def resolve(self, java_tex):
        """Java texture id -> Bedrock resource path, or None."""
        name = java_tex.replace('minecraft:', '').replace('block/', '')
        if name in self.overrides:
            return self.overrides[name]
        arr = self.java_image(name)
        cands = self._by_pixels.get(_key(arr), []) if arr is not None else []
        if cands:
            def score(rel):
                b = rel.rsplit('/', 1)[-1]
                return (b != name, 'carried' in b, len(b), rel)
            return sorted(cands, key=score)[0]
        rel = 'textures/blocks/' + name
        if rel in self.files:
            return rel
        return self._nearest(name, arr)

    def _nearest(self, name, arr, max_alpha=0.02, max_col=10.0):
        """Closest texture by pixels: same silhouette, near-identical colour.
        Covers textures Mojang touched up by a pixel or two on one edition."""
        if arr is None:
            return None
        best = None
        va = arr[..., 3] > 0
        for rel in self.files:
            b = self.bedrock_image(rel)
            if b is None or b.shape != arr.shape:
                continue
            vb = b[..., 3] > 0
            alpha = float((va != vb).mean())
            if alpha > max_alpha:
                continue
            both = va & vb
            col = float(np.abs(arr[..., :3].astype(int) - b[..., :3]).mean(axis=2)[both].mean()) if both.any() else 0.0
            if col > max_col:
                continue
            score = (alpha * 100 + col * 0.1, rel)
            if best is None or score < best:
                best = score
        if best:
            self.approx[name] = best[1]
            return best[1]
        return None
