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
CMD = os.path.join(PACKS, "MagicCircleCmd")

MATERIALS = {"particles_alpha", "particles_blend", "particles_add", "particles_opaque"}

# Vanilla particles the command pack is allowed to use. Everything here is on
# the Bedrock wiki's "works without issues" list, so none of them spam the
# content log: https://wiki.bedrock.dev/particles/vanilla-particles
VANILLA_PARTICLES = {
    "minecraft:endrod",
    "minecraft:blue_flame_particle",
    "minecraft:snowflake_particle",
    "minecraft:knockback_roar_particle",
    "minecraft:critical_hit_emitter",
}

VANILLA_SOUNDS = {"beacon.activate", "random.levelup", "random.explode"}

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


def function_names(fdir: str) -> set[str]:
    names = set()
    for base, _, files in os.walk(fdir):
        for f in files:
            if f.endswith(".mcfunction"):
                rel = os.path.relpath(os.path.join(base, f), fdir)
                names.add(rel[:-len(".mcfunction")].replace(os.sep, "/"))
    return names


def check_functions(pack: str, particles: set[str],
                    sounds: set[str] | None = None) -> None:
    """Every particle, sound and function a .mcfunction names must exist."""
    fdir = os.path.join(pack, "functions")
    names = function_names(fdir)
    label = os.path.basename(pack)

    # a command can appear bare or behind `execute ... run`
    pat_particle = re.compile(r"(?:^|\brun )particle\s+(\S+)")
    pat_function = re.compile(r"(?:^|\brun )function\s+(\S+)")
    pat_sound = re.compile(r"(?:^|\brun )playsound\s+(\S+)")

    for base, _, files in os.walk(fdir):
        for f in sorted(files):
            if not f.endswith(".mcfunction"):
                continue
            with open(os.path.join(base, f), encoding="utf-8") as fh:
                for n, line in enumerate(fh, 1):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    for m in pat_particle.finditer(line):
                        if m.group(1) not in particles:
                            fail(f"{label}/{f}:{n}: unknown particle "
                                 f"'{m.group(1)}'")
                    for m in pat_function.finditer(line):
                        if m.group(1) not in names:
                            fail(f"{label}/{f}:{n}: unknown function "
                                 f"'{m.group(1)}'")
                    if sounds is not None:
                        for m in pat_sound.finditer(line):
                            if m.group(1) not in sounds:
                                fail(f"{label}/{f}:{n}: unvetted sound "
                                     f"'{m.group(1)}'")

    tick = os.path.join(fdir, "tick.json")
    if os.path.isfile(tick):
        with open(tick, encoding="utf-8") as fh:
            for value in json.load(fh).get("values", []):
                if value not in names:
                    fail(f"{label}/functions/tick.json: '{value}' does not exist")


def check_scoreboards() -> None:
    """Objectives the command pack reads must be created by mc/init."""
    fdir = os.path.join(CMD, "functions")
    with open(os.path.join(fdir, "mc", "init.mcfunction"), encoding="utf-8") as fh:
        created = set(re.findall(r"scoreboard objectives add (\S+)", fh.read()))

    used: set[str] = set()
    for base, _, files in os.walk(fdir):
        for f in files:
            if not f.endswith(".mcfunction"):
                continue
            with open(os.path.join(base, f), encoding="utf-8") as fh:
                text = fh.read()
            used |= set(re.findall(r"scoreboard players \w+ \S+ (\S+)", text))
            used |= set(re.findall(r"if score @\w+ (\S+) matches", text))

    for obj in sorted(used - created):
        fail(f"MagicCircleCmd: objective '{obj}' is used but mc/init never "
             f"creates it")


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

    cmd = os.path.join(DIST, "MagicCircleCommands.mcpack")
    with zipfile.ZipFile(cmd, "w", zipfile.ZIP_DEFLATED) as zf:
        zip_dir(zf, CMD, "")
    print(f"  dist/MagicCircleCommands.mcpack  {os.path.getsize(cmd):,} bytes")


def main() -> int:
    print("validating:")
    defined = check_particles()
    check_functions(BP, defined)
    check_functions(CMD, VANILLA_PARTICLES, VANILLA_SOUNDS)
    check_scoreboards()
    check_manifests()

    if errors:
        for e in errors:
            print(f"  ERROR  {e}")
        return 1

    cmd_funcs = len(function_names(os.path.join(CMD, "functions")))
    print(f"  {len(defined)} custom particle effects OK")
    print(f"  {cmd_funcs} command functions OK (vanilla particles only)")
    print("building:")
    build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
