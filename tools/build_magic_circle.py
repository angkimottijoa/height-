#!/usr/bin/env python3
"""Validate and package the magic circle packs.

Checks performed before zipping:
  * every .particle json parses and declares a unique identifier
  * the referenced texture exists and its real PNG size matches the `uv` block
  * the render material is one Bedrock actually ships
  * every `particle <id>` in a .mcfunction resolves to a defined effect
  * manifest UUIDs are unique across every pack in this repository

Outputs:
  dist/MagicCircle.mcaddon                 RP + BP (recommended install)
  dist/MagicCircleParticles.mcpack         resource pack only

    python3 tools/build_magic_circle.py
"""

from __future__ import annotations

import json
import os
import re
import struct
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "packs")
DIST = os.path.join(ROOT, "dist")
RP = os.path.join(PACKS, "MagicCircleRP")
BP = os.path.join(PACKS, "MagicCircleBP")

MATERIALS = {"particles_alpha", "particles_blend", "particles_add", "particles_opaque"}

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def png_size(path: str) -> tuple[int, int]:
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    return struct.unpack(">II", head[16:24])


def check_particles() -> set[str]:
    ids: dict[str, str] = {}
    pdir = os.path.join(RP, "particles")
    for name in sorted(os.listdir(pdir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(pdir, name)
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            fail(f"{name}: invalid JSON ({exc})")
            continue

        effect = data.get("particle_effect")
        if not data.get("format_version") or not effect:
            fail(f"{name}: missing format_version or particle_effect")
            continue

        desc = effect.get("description", {})
        ident = desc.get("identifier")
        if not ident or ":" not in ident:
            fail(f"{name}: missing or unnamespaced identifier")
            continue
        if ident in ids:
            fail(f"{name}: identifier '{ident}' already used by {ids[ident]}")
        ids[ident] = name

        render = desc.get("basic_render_parameters", {})
        material = render.get("material")
        if material not in MATERIALS:
            fail(f"{name}: unknown material '{material}'")

        tex = render.get("texture", "")
        tex_path = os.path.join(RP, tex + ".png")
        if not os.path.isfile(tex_path):
            fail(f"{name}: texture '{tex}.png' not found")
            continue

        w, h = png_size(tex_path)
        uv = effect.get("components", {}).get(
            "minecraft:particle_appearance_billboard", {}).get("uv", {})
        if uv.get("texture_width") != w or uv.get("texture_height") != h:
            fail(f"{name}: uv texture size {uv.get('texture_width')}x"
                 f"{uv.get('texture_height')} != actual {w}x{h}")
        if uv.get("uv_size") != [w, h]:
            fail(f"{name}: uv_size {uv.get('uv_size')} != full texture [{w}, {h}]")
    return set(ids)


def check_functions(defined: set[str]) -> None:
    fdir = os.path.join(BP, "functions")
    names = set()
    for base, _, files in os.walk(fdir):
        for f in files:
            if f.endswith(".mcfunction"):
                rel = os.path.relpath(os.path.join(base, f), fdir)
                names.add(rel[:-len(".mcfunction")].replace(os.sep, "/"))

    for base, _, files in os.walk(fdir):
        for f in sorted(files):
            path = os.path.join(base, f)
            with open(path, encoding="utf-8") as fh:
                for n, line in enumerate(fh, 1):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    m = re.match(r"particle\s+(\S+)", line)
                    if m and m.group(1) not in defined:
                        fail(f"{f}:{n}: undefined particle '{m.group(1)}'")
                    m = re.match(r"function\s+(\S+)", line)
                    if m and m.group(1) not in names:
                        fail(f"{f}:{n}: unknown function '{m.group(1)}'")


def check_manifests() -> None:
    seen: dict[str, str] = {}
    for pack in sorted(os.listdir(PACKS)):
        mpath = os.path.join(PACKS, pack, "manifest.json")
        if not os.path.isfile(mpath):
            continue
        with open(mpath, encoding="utf-8") as fh:
            man = json.load(fh)
        uuids = [man["header"]["uuid"]] + [m["uuid"] for m in man.get("modules", [])]
        for u in uuids:
            if u in seen:
                fail(f"{pack}/manifest.json: UUID {u} duplicated from {seen[u]}")
            seen[u] = pack + "/manifest.json"

    # the behavior pack must point at the resource pack's header UUID
    with open(os.path.join(RP, "manifest.json"), encoding="utf-8") as fh:
        rp_uuid = json.load(fh)["header"]["uuid"]
    with open(os.path.join(BP, "manifest.json"), encoding="utf-8") as fh:
        deps = json.load(fh).get("dependencies", [])
    if not any(d.get("uuid") == rp_uuid for d in deps):
        fail("MagicCircleBP/manifest.json: dependency does not reference the RP UUID")


def zip_dir(zf: zipfile.ZipFile, src: str, prefix: str) -> None:
    for base, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(base, f)
            arc = os.path.join(prefix, os.path.relpath(full, src))
            zf.write(full, arc.replace(os.sep, "/"))


def build() -> None:
    os.makedirs(DIST, exist_ok=True)

    addon = os.path.join(DIST, "MagicCircle.mcaddon")
    with zipfile.ZipFile(addon, "w", zipfile.ZIP_DEFLATED) as zf:
        zip_dir(zf, RP, "MagicCircleRP")
        zip_dir(zf, BP, "MagicCircleBP")
    print(f"  dist/MagicCircle.mcaddon         {os.path.getsize(addon):,} bytes")

    pack = os.path.join(DIST, "MagicCircleParticles.mcpack")
    with zipfile.ZipFile(pack, "w", zipfile.ZIP_DEFLATED) as zf:
        zip_dir(zf, RP, "")
    print(f"  dist/MagicCircleParticles.mcpack {os.path.getsize(pack):,} bytes")


def main() -> int:
    print("validating:")
    defined = check_particles()
    check_functions(defined)
    check_manifests()

    if errors:
        for e in errors:
            print(f"  ERROR  {e}")
        return 1

    print(f"  {len(defined)} particle effects OK")
    print("building:")
    build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
