#!/usr/bin/env python3
"""Generate the magic-circle particle textures for packs/MagicCircleRP.

No third-party dependencies: shapes are rendered from signed distance fields
into a float coverage buffer (1px analytic antialiasing) and written out as
8-bit RGBA PNGs with zlib.

The particle textures are pure white with an alpha mask so the colour can be
driven entirely by `minecraft:particle_appearance_tinting` in the .particle.json
files. Only pack_icon.png is rendered in colour.

    python3 tools/gen_magic_circle_textures.py
"""

from __future__ import annotations

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "MagicCircleRP")
TEX = os.path.join(RP, "textures", "particle")


# --------------------------------------------------------------------------
# PNG output
# --------------------------------------------------------------------------

def write_png(path: str, width: int, height: int, pixels: bytes) -> None:
    """Write RGBA8 `pixels` (width*height*4 bytes) as a PNG."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)
    print(f"  {os.path.relpath(path, ROOT)}  ({width}x{height})")


# --------------------------------------------------------------------------
# Canvas: a float coverage buffer painted with signed distance fields
# --------------------------------------------------------------------------

class Canvas:
    def __init__(self, size: int):
        self.size = size
        self.a = [0.0] * (size * size)

    # -- helpers ----------------------------------------------------------
    def _blend(self, x: int, y: int, cov: float) -> None:
        if cov <= 0.0:
            return
        i = y * self.size + x
        if cov > self.a[i]:
            self.a[i] = 1.0 if cov > 1.0 else cov

    def _box(self, x0: float, y0: float, x1: float, y1: float):
        """Clamped integer pixel range for a bounding box."""
        n = self.size
        return (max(0, int(math.floor(x0))), min(n - 1, int(math.ceil(x1))),
                max(0, int(math.floor(y0))), min(n - 1, int(math.ceil(y1))))

    @staticmethod
    def _cov(d: float) -> float:
        """Distance (in pixels, negative = inside) -> coverage."""
        return 0.5 - d

    # -- primitives -------------------------------------------------------
    def ring(self, cx: float, cy: float, r: float, w: float,
             a0: float | None = None, a1: float | None = None) -> None:
        """Stroked circle of radius `r` and total thickness `w`.

        `a0`/`a1` (radians, CCW from +x) optionally restrict it to an arc.
        """
        hw = w * 0.5
        x0, x1, y0, y1 = self._box(cx - r - hw - 2, cy - r - hw - 2,
                                   cx + r + hw + 2, cy + r + hw + 2)
        for py in range(y0, y1 + 1):
            dy = py + 0.5 - cy
            for px in range(x0, x1 + 1):
                dx = px + 0.5 - cx
                dist = math.hypot(dx, dy)
                if a0 is not None:
                    ang = math.atan2(dy, dx) % math.tau
                    lo = a0 % math.tau
                    span = (a1 - a0) % math.tau
                    if (ang - lo) % math.tau > span:
                        continue
                self._blend(px, py, self._cov(abs(dist - r) - hw))

    def disc(self, cx: float, cy: float, r: float) -> None:
        x0, x1, y0, y1 = self._box(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)
        for py in range(y0, y1 + 1):
            dy = py + 0.5 - cy
            for px in range(x0, x1 + 1):
                dx = px + 0.5 - cx
                self._blend(px, py, self._cov(math.hypot(dx, dy) - r))

    def line(self, x1: float, y1: float, x2: float, y2: float, w: float) -> None:
        hw = w * 0.5
        x0b, x1b, y0b, y1b = self._box(min(x1, x2) - hw - 2, min(y1, y2) - hw - 2,
                                       max(x1, x2) + hw + 2, max(y1, y2) + hw + 2)
        vx, vy = x2 - x1, y2 - y1
        vv = vx * vx + vy * vy
        for py in range(y0b, y1b + 1):
            for px in range(x0b, x1b + 1):
                wx, wy = px + 0.5 - x1, py + 0.5 - y1
                t = 0.0 if vv == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / vv))
                d = math.hypot(wx - vx * t, wy - vy * t)
                self._blend(px, py, self._cov(d - hw))

    def polyline(self, pts, w: float, close: bool = False) -> None:
        for i in range(len(pts) - 1):
            self.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w)
        if close and len(pts) > 2:
            self.line(pts[-1][0], pts[-1][1], pts[0][0], pts[0][1], w)

    def radial(self, cx: float, cy: float, r: float, power: float,
               inner: float = 0.0) -> None:
        """Soft radial falloff, 1.0 at the centre fading to 0 at `r`."""
        x0, x1, y0, y1 = self._box(cx - r, cy - r, cx + r, cy + r)
        for py in range(y0, y1 + 1):
            dy = py + 0.5 - cy
            for px in range(x0, x1 + 1):
                dx = px + 0.5 - cx
                d = math.hypot(dx, dy)
                if d >= r:
                    continue
                t = 1.0 if d <= inner else (r - d) / (r - inner)
                self._blend(px, py, t ** power)

    # -- output -----------------------------------------------------------
    def to_rgba(self, rgb=(255, 255, 255), gain: float = 1.0) -> bytes:
        r, g, b = rgb
        out = bytearray(len(self.a) * 4)
        for i, a in enumerate(self.a):
            v = a * gain
            if v <= 0.0:
                continue
            if v > 1.0:
                v = 1.0
            j = i * 4
            out[j] = r
            out[j + 1] = g
            out[j + 2] = b
            out[j + 3] = int(v * 255 + 0.5)
        return bytes(out)


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy - r * math.sin(a)


def star_points(cx, cy, r, n, step, phase=90.0):
    """Vertices of an {n/step} star polygon, in draw order."""
    pts, idx = [], 0
    for _ in range(n):
        pts.append(polar(cx, cy, r, phase + idx * 360.0 / n))
        idx = (idx + step) % n
    return pts


# --------------------------------------------------------------------------
# Rune alphabet: strokes in a [-1, 1] cell, +y is "outward"
# --------------------------------------------------------------------------

RUNES = [
    [("l", -0.6, -1.0, -0.6, 1.0), ("l", -0.6, 1.0, 0.5, 0.35), ("l", -0.6, 0.1, 0.5, -0.5)],
    [("l", 0.0, -1.0, 0.0, 1.0), ("l", -0.65, 0.35, 0.65, 0.35), ("l", -0.65, -0.3, 0.65, -0.3)],
    [("l", -0.6, -1.0, 0.0, 1.0), ("l", 0.0, 1.0, 0.6, -1.0), ("l", -0.36, -0.2, 0.36, -0.2)],
    [("l", -0.6, -1.0, -0.6, 1.0), ("l", 0.6, -1.0, 0.6, 1.0), ("l", -0.6, 1.0, 0.6, -1.0)],
    [("l", -0.6, 1.0, 0.6, 1.0), ("l", 0.0, 1.0, 0.0, -1.0), ("l", -0.55, -1.0, 0.55, -1.0)],
    [("l", -0.6, 1.0, 0.0, 0.1), ("l", 0.6, 1.0, 0.0, 0.1), ("l", 0.0, 0.1, 0.0, -1.0)],
    [("l", -0.6, 1.0, 0.6, 1.0), ("l", 0.6, 1.0, -0.6, -1.0), ("l", -0.6, -1.0, 0.6, -1.0)],
    [("l", -0.6, -1.0, -0.6, 1.0), ("l", -0.6, 1.0, 0.55, 0.3), ("l", 0.55, 0.3, -0.6, -0.1),
     ("l", -0.6, -0.1, 0.5, -1.0)],
    [("l", 0.0, -1.0, 0.0, 1.0), ("l", -0.6, 0.45, 0.0, 1.0), ("l", 0.0, 1.0, 0.6, 0.45)],
    [("l", -0.6, -0.6, 0.6, 0.6), ("l", -0.6, 0.6, 0.6, -0.6), ("l", 0.0, -1.0, 0.0, 1.0)],
    [("l", -0.6, 1.0, 0.6, 1.0), ("l", 0.0, 1.0, 0.0, -0.35), ("c", 0.0, -0.68, 0.32)],
    [("l", -0.6, 1.0, -0.6, -1.0), ("l", -0.6, 0.15, 0.6, 0.15), ("l", 0.6, 1.0, 0.6, -1.0)],
    [("l", -0.55, -1.0, -0.55, 1.0), ("l", -0.55, 1.0, 0.55, -1.0), ("l", 0.55, -1.0, 0.55, 1.0)],
    [("c", 0.0, 0.3, 0.45), ("l", 0.0, -0.15, 0.0, -1.0), ("l", -0.5, -1.0, 0.5, -1.0)],
]


def draw_rune(c: Canvas, glyph, cx, cy, scale, deg, w):
    """Draw `glyph` at (cx, cy), rotated so its +y axis points along `deg`."""
    rot = math.radians(deg - 90.0)
    cos_r, sin_r = math.cos(rot), math.sin(rot)

    def xf(x, y):
        rx = x * cos_r - y * sin_r
        ry = x * sin_r + y * cos_r
        return cx + rx * scale, cy - ry * scale

    for st in glyph:
        if st[0] == "l":
            x1, y1 = xf(st[1], st[2])
            x2, y2 = xf(st[3], st[4])
            c.line(x1, y1, x2, y2, w)
        else:  # "c" = small circle
            px, py = xf(st[1], st[2])
            c.ring(px, py, st[3] * scale, w)


# --------------------------------------------------------------------------
# Textures
# --------------------------------------------------------------------------

def tex_outer(size=256) -> Canvas:
    """Outer band: heavy double ring, tick marks, cardinal nodes."""
    c = Canvas(size)
    m = size / 256.0
    cx = cy = size / 2.0

    c.ring(cx, cy, 121 * m, 3.0 * m)
    c.ring(cx, cy, 113 * m, 1.6 * m)
    c.ring(cx, cy, 94 * m, 2.4 * m)

    # graduation marks between the two thin rings
    for i in range(72):
        deg = i * 5.0
        long_tick = (i % 6 == 0)
        r_in = (100 if long_tick else 105) * m
        x1, y1 = polar(cx, cy, r_in, deg)
        x2, y2 = polar(cx, cy, 112 * m, deg)
        c.line(x1, y1, x2, y2, (2.0 if long_tick else 1.1) * m)

    # cardinal nodes riding on the outer ring
    for deg in (0, 90, 180, 270):
        nx, ny = polar(cx, cy, 121 * m, deg)
        c.disc(nx, ny, 3.2 * m)
        c.ring(nx, ny, 7.0 * m, 1.6 * m)
    # secondary nodes
    for deg in (45, 135, 225, 315):
        nx, ny = polar(cx, cy, 121 * m, deg)
        c.ring(nx, ny, 4.2 * m, 1.4 * m)
    return c


def tex_runes(size=256) -> Canvas:
    """Middle band: 24 rune glyphs between two guide rings."""
    c = Canvas(size)
    m = size / 256.0
    cx = cy = size / 2.0

    c.ring(cx, cy, 118 * m, 1.5 * m)
    c.ring(cx, cy, 84 * m, 1.5 * m)
    c.ring(cx, cy, 80 * m, 2.6 * m)

    count = 24
    for i in range(count):
        deg = i * (360.0 / count) + 7.5
        gx, gy = polar(cx, cy, 101 * m, deg)
        draw_rune(c, RUNES[i % len(RUNES)], gx, gy, 11.0 * m, deg, 2.0 * m)
        # divider between cells
        dx1, dy1 = polar(cx, cy, 84 * m, deg + 180.0 / count)
        dx2, dy2 = polar(cx, cy, 118 * m, deg + 180.0 / count)
        c.line(dx1, dy1, dx2, dy2, 1.0 * m)
    return c


def tex_sigil(size=256) -> Canvas:
    """Inner band: heptagram + pentagram + triangle over concentric rings."""
    c = Canvas(size)
    m = size / 256.0
    cx = cy = size / 2.0

    c.ring(cx, cy, 122 * m, 2.6 * m)
    c.ring(cx, cy, 116 * m, 1.2 * m)
    c.ring(cx, cy, 58 * m, 1.6 * m)

    # {7/3} heptagram out to the main ring
    hep = star_points(cx, cy, 116 * m, 7, 3)
    c.polyline(hep, 2.2 * m, close=True)
    for px, py in hep:
        c.disc(px, py, 3.0 * m)

    # inverted triangle + inner pentagram
    tri = [polar(cx, cy, 96 * m, 270 + i * 120) for i in range(3)]
    c.polyline(tri, 1.6 * m, close=True)
    c.polyline(star_points(cx, cy, 56 * m, 5, 2), 1.8 * m, close=True)

    # core
    c.ring(cx, cy, 22 * m, 1.4 * m)
    c.radial(cx, cy, 18 * m, 2.0, inner=4 * m)
    return c


def tex_spark(size=32) -> Canvas:
    """Small mote with a faint 4-point flare."""
    c = Canvas(size)
    cx = cy = size / 2.0
    c.radial(cx, cy, size * 0.40, 2.2, inner=size * 0.05)
    for deg in (0, 90):
        x1, y1 = polar(cx, cy, size * 0.47, deg)
        x2, y2 = polar(cx, cy, size * 0.47, deg + 180)
        c.line(x1, y1, x2, y2, size * 0.055)
    return c


def tex_glow(size=64) -> Canvas:
    c = Canvas(size)
    c.radial(size / 2.0, size / 2.0, size * 0.5, 2.6, inner=size * 0.06)
    return c


def tex_beam(width=64, height=128) -> Canvas:
    """Vertical light shaft: soft horizontally, fading out towards the top.

    Non-square, so the alpha buffer is filled directly instead of going
    through the SDF primitives.
    """
    c = Canvas(width)
    c.a = [0.0] * (width * height)
    cx = width / 2.0
    for y in range(height):
        v = 1.0 - (y / (height - 1.0))          # 1 at the bottom, 0 at the top
        vertical = (v ** 0.9) * min(1.0, (1.0 - v) * 6.0 + 0.25)
        for x in range(width):
            t = abs(x + 0.5 - cx) / cx
            if t >= 1.0:
                continue
            c.a[y * width + x] = ((1.0 - t) ** 2.2) * vertical
    return c


def tex_icon(size=128) -> bytes:
    """Coloured composite for pack_icon.png."""
    c = Canvas(size)
    m = size / 256.0
    cx = cy = size / 2.0

    c.ring(cx, cy, 122 * m, 4.0 * m)
    c.ring(cx, cy, 112 * m, 2.0 * m)
    for i in range(24):
        deg = i * 15.0
        x1, y1 = polar(cx, cy, 112 * m, deg)
        x2, y2 = polar(cx, cy, 104 * m, deg)
        c.line(x1, y1, x2, y2, 2.0 * m)
    c.ring(cx, cy, 100 * m, 2.0 * m)
    for i in range(12):
        deg = i * 30.0 + 15.0
        gx, gy = polar(cx, cy, 86 * m, deg)
        draw_rune(c, RUNES[i % len(RUNES)], gx, gy, 12.0 * m, deg, 2.6 * m)
    c.ring(cx, cy, 70 * m, 2.4 * m)
    c.polyline(star_points(cx, cy, 68 * m, 7, 3), 2.6 * m, close=True)
    c.radial(cx, cy, 26 * m, 2.0, inner=6 * m)

    glyphs = c.to_rgba((150, 240, 255))

    # dark backdrop so the icon reads on a light UI
    out = bytearray(size * size * 4)
    for i in range(size * size):
        j = i * 4
        a = glyphs[j + 3] / 255.0
        bg = (10, 12, 26)
        out[j] = int(bg[0] * (1 - a) + glyphs[j] * a)
        out[j + 1] = int(bg[1] * (1 - a) + glyphs[j + 1] * a)
        out[j + 2] = int(bg[2] * (1 - a) + glyphs[j + 2] * a)
        out[j + 3] = 255
    return bytes(out)


def preview(size=512) -> bytes:
    """Composite the three flat layers at their real in-game size ratio.

    The `size` values in the .particle.json files are half-extents, so the
    ratios below are exactly what a player sees stacked on the ground.
    """
    layers = [
        (tex_outer(256), 2.60),   # magic:circle_outer
        (tex_runes(256), 2.10),   # magic:circle_runes
        (tex_sigil(256), 1.25),   # magic:circle_sigil
    ]
    biggest = max(s for _, s in layers)

    out = bytearray(size * size * 4)
    for i in range(size * size):
        j = i * 4
        out[j], out[j + 1], out[j + 2], out[j + 3] = 9, 11, 22, 255

    cx = cy = size / 2.0
    for canvas, scale in layers:
        n = canvas.size
        half = (scale / biggest) * (size / 2.0)      # on-screen half extent
        for py in range(size):
            v = (py + 0.5 - cy) / half
            if not -1.0 <= v < 1.0:
                continue
            sy = (v * 0.5 + 0.5) * (n - 1)
            y0 = int(sy)
            fy = sy - y0
            y1 = min(n - 1, y0 + 1)
            for px in range(size):
                u = (px + 0.5 - cx) / half
                if not -1.0 <= u < 1.0:
                    continue
                sx = (u * 0.5 + 0.5) * (n - 1)
                x0 = int(sx)
                fx = sx - x0
                x1 = min(n - 1, x0 + 1)
                a = (canvas.a[y0 * n + x0] * (1 - fx) * (1 - fy)
                     + canvas.a[y0 * n + x1] * fx * (1 - fy)
                     + canvas.a[y1 * n + x0] * (1 - fx) * fy
                     + canvas.a[y1 * n + x1] * fx * fy)
                if a <= 0.004:
                    continue
                j = (py * size + px) * 4
                for k, ch in enumerate((150, 242, 255)):
                    out[j + k] = int(out[j + k] * (1 - a) + ch * a)
    return bytes(out)


def main() -> None:
    print("generating magic circle textures:")

    for name, canvas in (
        ("magic_circle_outer", tex_outer()),
        ("magic_circle_runes", tex_runes()),
        ("magic_circle_sigil", tex_sigil()),
    ):
        write_png(os.path.join(TEX, name + ".png"), canvas.size, canvas.size,
                  canvas.to_rgba())

    spark = tex_spark()
    write_png(os.path.join(TEX, "magic_spark.png"), spark.size, spark.size,
              spark.to_rgba())

    glow = tex_glow()
    write_png(os.path.join(TEX, "magic_glow.png"), glow.size, glow.size,
              glow.to_rgba())

    beam = tex_beam()
    write_png(os.path.join(TEX, "magic_beam.png"), 64, 128, beam.to_rgba())

    write_png(os.path.join(RP, "pack_icon.png"), 128, 128, tex_icon())
    write_png(os.path.join(ROOT, "docs", "magic-circle-preview.png"), 512, 512,
              preview())


if __name__ == "__main__":
    main()
