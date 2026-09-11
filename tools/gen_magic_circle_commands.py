#!/usr/bin/env python3
"""Generate the command-driven magic circle (vanilla particles, no resource pack).

Bedrock has no loops in functions, so every particle position is written out as
a literal `particle <id> ~dx ~dy ~dz` line. This script draws the circle
mathematically and emits the .mcfunction files for:

  mc/draw          one shot, full density  (screenshots / command blocks)
  mc/frames/fNN    16 sparse frames of the same geometry, each rotated a little
  mc/drive         per-anchor driver: advances the frame counter, dispatches
  mc/tick          tick.json entry point
  mc/cast          10s circle at the caller, with activation burst
  mc/place         same, but stays until mc/stop
  mc/stop          removes every circle

Rotation is seamless: each layer advances exactly one of its own symmetry steps
per 16-frame loop, so frame 16 lands on the same picture as frame 0. Each frame
only draws a fraction of the points and relies on the ~2s particle lifetime to
keep the rest on screen, which keeps the per-tick cost low.

Only particle IDs from the Bedrock wiki's "works without issues" list are used
(https://wiki.bedrock.dev/particles/vanilla-particles), so nothing spams the
content log.

    python3 tools/gen_magic_circle_commands.py
"""

from __future__ import annotations

import math
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "packs", "MagicCircleCmd")
FUNC = os.path.join(PACK, "functions")
MC = os.path.join(FUNC, "mc")

# ---------------------------------------------------------------------------
# tuning
# ---------------------------------------------------------------------------

FRAMES = 16              # frames per rotation loop
TICKS_PER_FRAME = 2      # -> loop is 32 ticks (1.6s)
GROUND = 0.05            # how far above the block face the flat layers sit

LINE = "minecraft:endrod"                  # white glow: all geometry
ACCENT = "minecraft:blue_flame_particle"   # blue flame: cardinal nodes, vortex
CORE = "minecraft:endrod"                  # centre column
MOTE = "minecraft:snowflake_particle"      # blue-white motes: beam, trail
RING = "minecraft:knockback_roar_particle"  # expanding white ring

R_OUTER = 5.00           # outer ring
R_INNER_RING = 4.55      # second ring
R_DASH_IN = 3.95         # rune band, inner end of each dash
R_DASH_OUT = 4.40        # rune band, outer end
DASH_SLOTS = 24          # number of rune dashes
R_STAR = 3.60            # heptagram vertex radius
STAR_N, STAR_STEP = 7, 3  # {7/3} star polygon
R_CORE_RING = 1.55       # inner ring
R_NODE = 4.75            # cardinal flame nodes
COLUMN_STEPS = 8         # centre column sample count
COLUMN_TOP = 4.0         # centre column height

VORTEX_STRANDS = 3       # rising helix around the caster
VORTEX_R = 2.20          # helix radius at the ground
VORTEX_TOP = 4.50        # helix height
VORTEX_TAPER = 0.30      # how much the helix narrows per block of height

BEAM_FROM = 0.8          # first beam sample, blocks in front of the eyes
BEAM_TO = 26.0           # beam length
BEAM_STEP = 0.6          # beam sample spacing
BEAM_RING_EVERY = 3.6    # a shockwave ring every N blocks along the beam
EYE = 1.5                # eye height offset for the beam origin

TRAIL_VARIANTS = 4       # projectile trail sub-frames (spins the trail ring)
TRAIL_R = 0.45           # projectile trail ring radius

STATIC_SPACING = 0.32    # point spacing for mc/draw (smaller = denser/heavier)


# ---------------------------------------------------------------------------
# geometry helpers
# ---------------------------------------------------------------------------

def pt(r: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def particle(pid: str, x: float, y: float, z: float) -> str:
    """One Bedrock particle command with relative offsets."""
    return f"particle {pid} ~{x:.2f} ~{y:.2f} ~{z:.2f}"


def ring_points(r: float, count: int, phase: float = 0.0):
    return [pt(r, phase + i * 360.0 / count) for i in range(count)]


def star_path(r: float, n: int, step: int, phase: float = 90.0):
    """Closed {n/step} star polygon as a list of vertices (first repeated)."""
    verts, idx = [], 0
    for _ in range(n):
        verts.append(pt(r, phase + idx * 360.0 / n))
        idx = (idx + step) % n
    verts.append(verts[0])
    return verts


def sample_path(verts, spacing: float):
    """Even-ish samples along a polyline, endpoints included once."""
    out = []
    for i in range(len(verts) - 1):
        (x1, z1), (x2, z2) = verts[i], verts[i + 1]
        length = math.hypot(x2 - x1, z2 - z1)
        steps = max(1, int(round(length / spacing)))
        for s in range(steps):
            t = s / steps
            out.append((x1 + (x2 - x1) * t, z1 + (z2 - z1) * t))
    return out


def rotate(points, deg: float):
    a = math.radians(deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    return [(x * cos_a - z * sin_a, x * sin_a + z * cos_a) for x, z in points]


# ---------------------------------------------------------------------------
# the six layers
# ---------------------------------------------------------------------------
# Each layer returns the lines for one frame. `f` is the frame index; a layer
# advances `spacing / FRAMES` degrees per frame so that after FRAMES frames it
# has moved exactly one symmetry step and the loop is invisible.

# The geometry is split across SWEEP frames by index, never by rotation: a
# vanilla particle lives ~2s and its lifetime cannot be shortened, so anything
# drawn at a rotated position leaves the previous position on screen and the
# figure smears. Splitting by index means the frames add up to exactly the
# intended shape, and one full pass (SWEEP * TICKS_PER_FRAME ticks) finishes
# well inside that lifetime, so the circle never blinks.
SWEEP = 8


def sweep(points, f: int, pid: str = LINE, y: float = GROUND) -> list[str]:
    return [particle(pid, x, y, z)
            for i, (x, z) in enumerate(points) if i % SWEEP == f % SWEEP]


def layer_outer(f: int) -> list[str]:
    return sweep(ring_points(R_OUTER, 128), f)


def layer_second(f: int) -> list[str]:
    return sweep(ring_points(R_INNER_RING, 96), f)


def layer_dashes(f: int) -> list[str]:
    """Rune band: 24 short radial dashes."""
    pts = []
    for slot in range(DASH_SLOTS):
        deg = slot * 360.0 / DASH_SLOTS
        for r in (R_DASH_IN, (R_DASH_IN + R_DASH_OUT) / 2, R_DASH_OUT):
            pts.append(pt(r, deg))
    return sweep(pts, f)


def layer_star(f: int) -> list[str]:
    return sweep(sample_path(star_path(R_STAR, STAR_N, STAR_STEP), 0.30), f)


def layer_core_ring(f: int) -> list[str]:
    return sweep(ring_points(R_CORE_RING, 32), f)


def layer_accents(f: int) -> list[str]:
    """One cardinal flame node per frame, plus the rising centre column."""
    lines = []
    x, z = pt(R_NODE, (f % 4) * 90.0)
    lines.append(particle(ACCENT, x, GROUND, z))

    step = f % COLUMN_STEPS
    y = 0.4 + COLUMN_TOP * step / COLUMN_STEPS
    lines.append(particle(CORE, 0.0, y, 0.0))

    if f % 4 == 0:
        lines.append(particle(ACCENT, 0.0, GROUND + 0.1, 0.0))
    return lines


def layer_vortex(f: int) -> list[str]:
    """Rising blue helix around the caster — one point per strand per frame.

    The strand climbs `VORTEX_TOP` and wraps a full turn over the loop, so the
    pattern repeats exactly; particles outlive the loop, so the whole spiral is
    on screen at once.
    """
    lines = []
    t = f / FRAMES
    y = 0.20 + VORTEX_TOP * t
    r = max(0.35, VORTEX_R - y * VORTEX_TAPER)
    for s in range(VORTEX_STRANDS):
        deg = 360.0 * t + s * (360.0 / VORTEX_STRANDS)
        x, z = pt(r, deg)
        lines.append(particle(ACCENT, x, y, z))
    return lines


LAYERS = (layer_outer, layer_second, layer_dashes, layer_star,
          layer_core_ring, layer_accents, layer_vortex)


# ---------------------------------------------------------------------------
# the spell: a beam in the look direction, and a projectile trail
# ---------------------------------------------------------------------------

def beam_lines() -> list[str]:
    """Instant ray from the caster's eyes along their view direction.

    Uses local (caret) coordinates: `positioned ^ ^ ^d` walks forward along the
    rotation set by `rotated as @s`. Must be run with the caster as @s, e.g.
    `/execute as @p at @s run function mc/spell/beam`.
    """
    def at(dist: float, body: str) -> str:
        return (f"execute positioned ~ ~{EYE:.1f} ~ rotated as @s"
                f" positioned ^ ^ ^{dist:.1f} run {body}")

    lines, next_ring, d = [], BEAM_RING_EVERY, BEAM_FROM
    while d <= BEAM_TO + 1e-9:
        lines.append(at(d, particle(MOTE, 0, 0, 0)))
        if int(d / BEAM_STEP) % 2 == 0:
            lines.append(at(d, particle(LINE, 0, 0, 0)))
        if d >= next_ring:
            lines.append(at(d, particle(RING, 0, 0, 0)))
            next_ring += BEAM_RING_EVERY
        d += BEAM_STEP
    return lines


def trail_lines(variant: int) -> list[str]:
    """One sub-frame of the projectile trail: a ring of motes around it.

    Consecutive sub-frames are rotated, and the projectile moves between ticks,
    so the ring turns into a spiral along the flight path.
    """
    lines = []
    phase = variant * (360.0 / (6 * TRAIL_VARIANTS))
    for j in range(6):
        x, z = pt(TRAIL_R, phase + j * 60.0)
        lines.append(particle(MOTE, x, 0.0, z))
    lines.append(particle(LINE, 0.0, 0.0, 0.0))
    if variant % 2 == 0:
        lines.append(particle(ACCENT, 0.0, 0.0, 0.0))
    return lines


def frame_lines(f: int) -> list[str]:
    out = []
    for layer in LAYERS:
        out += layer(f)
    return out


def static_lines() -> list[str]:
    """Every layer at full density, for the one-shot draw."""
    out: list[str] = []
    for r in (R_OUTER, R_INNER_RING):
        n = max(8, int(round(2 * math.pi * r / STATIC_SPACING)))
        out += [particle(LINE, x, GROUND, z) for x, z in ring_points(r, n)]

    for slot in range(DASH_SLOTS):
        deg = slot * 360.0 / DASH_SLOTS
        steps = max(1, int(round((R_DASH_OUT - R_DASH_IN) / STATIC_SPACING)))
        for s in range(steps + 1):
            r = R_DASH_IN + (R_DASH_OUT - R_DASH_IN) * s / steps
            x, z = pt(r, deg)
            out.append(particle(LINE, x, GROUND, z))

    out += [particle(LINE, x, GROUND, z) for x, z in
            sample_path(star_path(R_STAR, STAR_N, STAR_STEP), STATIC_SPACING)]

    n = max(8, int(round(2 * math.pi * R_CORE_RING / STATIC_SPACING)))
    out += [particle(LINE, x, GROUND, z) for x, z in ring_points(R_CORE_RING, n)]

    for i in range(4):
        x, z = pt(R_NODE, i * 90.0)
        out.append(particle(ACCENT, x, GROUND, z))
    out.append(particle(ACCENT, 0.0, GROUND + 0.1, 0.0))
    for s in range(COLUMN_STEPS):
        out.append(particle(CORE, 0.0, 0.4 + COLUMN_TOP * s / COLUMN_STEPS, 0.0))
    return out


# ---------------------------------------------------------------------------
# file writers
# ---------------------------------------------------------------------------

BANNER = ("# 자동 생성 파일 — 직접 수정하지 마세요.\n"
          "# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.\n")


def write(path: str, header: str, lines: list[str]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(BANNER)
        fh.write(header.rstrip() + "\n")
        fh.write("\n".join(lines) + "\n")
    print(f"  {os.path.relpath(path, ROOT)}  ({len(lines)} commands)")


def write_frames() -> int:
    total = 0
    for f in range(FRAMES):
        lines = frame_lines(f)
        total += len(lines)
        write(os.path.join(MC, "frames", f"f{f:02d}.mcfunction"),
              f"# 프레임 {f}/{FRAMES - 1} — 회전 루프 {FRAMES * TICKS_PER_FRAME}틱",
              lines)
    return total


def write_control() -> None:
    write(os.path.join(MC, "draw.mcfunction"),
          "# 마법진 1회 그리기 (점 밀도 최대). 명령 블록 반복 실행용.\n"
          "# 파티클이 약 2초 남으므로 40틱 주기로 반복하면 계속 보입니다.",
          static_lines())

    write(os.path.join(MC, "init.mcfunction"),
          "# 월드에서 처음 한 번만 실행하세요. (스코어보드 준비)",
          ["scoreboard objectives add mc_t dummy",
           "scoreboard objectives add mc_life dummy"])

    # The anchor is an unnamed armor stand: a name tag would float in mid-air.
    # It is picked out right after summoning with r=0.5,c=1 — the new stand is
    # at distance 0, so it always wins, and a decorative stand nearby is never
    # touched. From then on it is identified by its tag, not its position.
    new_anchor = "@e[type=armor_stand,r=0.5,c=1]"
    tagged = "@e[type=armor_stand,tag=mc_on,r=0.5,c=1]"
    summon = [
        "summon armor_stand ~ ~ ~",
        f"tag {new_anchor} add mc_on",
        f"scoreboard players set {tagged} mc_t 0",
        f"scoreboard players set {tagged} mc_life 0",
        f"effect {tagged} invisibility 1000000 1 true",
    ]

    write(os.path.join(MC, "cast.mcfunction"),
          "# 마법진 발동 (10초 후 자동 소멸)\n"
          "# 예: /function mc/cast  ·  /execute as @p at @s run function mc/cast",
          summon + ["function mc/burst"])

    write(os.path.join(MC, "place.mcfunction"),
          "# 마법진 설치 (/function mc/stop 으로 지울 때까지 유지)",
          summon + [f"tag {tagged} add mc_keep", "function mc/burst"])

    write(os.path.join(MC, "follow.mcfunction"),
          "# 시전자를 따라다니는 마법진 ON (영상처럼 플레이어 발밑에 유지)\n"
          "#   /execute as @p at @s run function mc/follow\n"
          "# 끄기: /function mc/unfollow",
          ["tag @s add mc_caster",
           "scoreboard players set @s mc_t 0",
           "function mc/burst"])

    write(os.path.join(MC, "unfollow.mcfunction"),
          "# 따라다니는 마법진 OFF",
          ["tag @s remove mc_caster"])

    burst = [f"particle {RING} ~ ~0.1 ~",
             f"particle {RING} ~ ~1.2 ~",
             "particle minecraft:critical_hit_emitter ~ ~0.8 ~"]
    for i in range(8):                      # a ring of motes kicked outward
        x, z = pt(1.2, i * 45.0)
        burst.append(particle(MOTE, x, 0.6, z))
    burst += ["playsound beacon.activate @a ~ ~ ~ 1 1.2",
              "playsound random.levelup @a ~ ~ ~ 0.6 1.6"]
    write(os.path.join(MC, "burst.mcfunction"),
          "# 발동 순간 연출: 퍼지는 충격파 링 + 스파크 + 소리", burst)

    write(os.path.join(MC, "stop.mcfunction"),
          "# 모든 마법진 제거 (설치형 + 따라다니는 것 모두)",
          ["kill @e[type=armor_stand,tag=mc_on]",
           "tag @a remove mc_caster"])

    write(os.path.join(MC, "tick.mcfunction"),
          "# tick.json 진입점: 기준점 마법진 · 따라다니는 마법진 · 눈덩이 궤적",
          ["execute as @e[type=armor_stand,tag=mc_on] at @s run function mc/drive",
           "execute as @e[type=armor_stand,tag=mc_on] at @s run function mc/expire",
           "execute as @a[tag=mc_caster] at @s run function mc/drive",
           "execute as @e[type=snowball] at @s run function mc/spell/trail"])

    drive = [
        "scoreboard players add @s mc_t 1",
        f"execute if score @s mc_t matches {FRAMES * TICKS_PER_FRAME}.."
        " run scoreboard players set @s mc_t 0",
    ]
    for f in range(FRAMES):
        drive.append(f"execute if score @s mc_t matches {f * TICKS_PER_FRAME}"
                     f" run function mc/frames/f{f:02d}")
    write(os.path.join(MC, "drive.mcfunction"),
          "# 마법진 1개당 매 틱 실행: 프레임 카운터를 돌리고 해당 프레임을 그림\n"
          f"# (프레임 {FRAMES}개 × {TICKS_PER_FRAME}틱 = "
          f"{FRAMES * TICKS_PER_FRAME}틱 주기)",
          drive)

    write(os.path.join(MC, "expire.mcfunction"),
          "# 기준점 수명 관리. mc_keep 태그(설치형)는 만료되지 않습니다.\n"
          "# 지속 시간을 바꾸려면 200(틱 = 10초)을 고치세요.",
          ["scoreboard players add @s mc_life 1",
           "execute if score @s mc_life matches 200.. unless entity"
           " @s[tag=mc_keep] run kill @s"])

    with open(os.path.join(FUNC, "tick.json"), "w", encoding="utf-8") as fh:
        fh.write('{\n    "values": [\n        "mc/tick"\n    ]\n}\n')
    print("  packs/MagicCircleCmd/functions/tick.json")


def write_spell() -> None:
    """The video-style spell: caster vortex, forward beam, projectile trail."""
    write(os.path.join(MC, "spell", "beam.mcfunction"),
          "# 시선 방향으로 뻗는 빔 (즉시 1회)\n"
          "# 반드시 시전자를 @s 로 두고 실행하세요:\n"
          "#   /execute as @p at @s run function mc/spell/beam\n"
          "# ^(로컬 좌표) 미지원 환경이면 대신 mc/spell/throw 방식을 쓰세요.",
          beam_lines())

    write(os.path.join(MC, "spell", "cast.mcfunction"),
          "# 전체 시전: 발밑 마법진 + 빔 + 소리\n"
          "#   /execute as @p at @s run function mc/spell/cast",
          ["function mc/cast",
           "function mc/spell/beam",
           "playsound beacon.activate @a ~ ~ ~ 1 1.4",
           "playsound random.explode @a ~ ~ ~ 0.5 2.0"])

    write(os.path.join(MC, "spell", "throw.mcfunction"),
          "# 발사체 방식 (로컬 좌표 ^ 없이 동작하는 대안)\n"
          "# 이 함수는 발사 준비 연출만 하고, 실제 궤적은 던진 눈덩이를\n"
          "# tick.json이 매 틱 따라다니며 그립니다. (/give @s snowball 로 준비)",
          ["function mc/cast",
           f"particle {RING} ~ ~1.2 ~",
           "playsound beacon.activate @a ~ ~ ~ 1 1.6"])

    for v in range(TRAIL_VARIANTS):
        write(os.path.join(MC, "spell", f"t{v}.mcfunction"),
              f"# 눈덩이 궤적 서브프레임 {v}", trail_lines(v))

    trail = ["scoreboard players add @s mc_t 1"]
    for v in range(TRAIL_VARIANTS):
        trail.append(f"execute if score @s mc_t matches {v + 1}"
                     f" run function mc/spell/t{v}")
    trail += [
        f"execute if score @s mc_t matches {TRAIL_VARIANTS}.."
        f" run particle {RING} ~ ~ ~",
        f"execute if score @s mc_t matches {TRAIL_VARIANTS}.."
        " run scoreboard players set @s mc_t 0",
    ]
    write(os.path.join(MC, "spell", "trail.mcfunction"),
          "# 날아가는 눈덩이마다 매 틱 실행 (나선 궤적 + 주기적 충격파 링)",
          trail)


def write_command_dump() -> None:
    """Plain text copy of the static draw, for command blocks / reference."""
    path = os.path.join(ROOT, "dist", "magic-circle-commands.txt")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = static_lines()
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("# 바닐라 파티클 마법진 — 정적 1회 그리기 명령어 목록\n")
        fh.write("# 실행 위치 기준 상대 좌표(~)입니다. 명령 블록/함수에 그대로 넣으세요.\n")
        fh.write(f"# 총 {len(lines)}줄. 채팅에 한 줄씩 넣기보다 "
                 "packs/MagicCircleCmd 팩의 /function mc/draw 사용을 권합니다.\n\n")
        fh.write("\n".join(lines) + "\n")
    print(f"  dist/magic-circle-commands.txt  ({len(lines)} commands)")


MANIFEST = """{
    "format_version": 2,
    "header": {
        "name": "§b마법진 (명령어/바닐라 파티클)§r",
        "description": "리소스팩 없이 바닐라 파티클로 그리는 회전 마법진.\\n/function mc/init 후 /function mc/cast",
        "uuid": "0f2a6d5c-8b41-4f7e-9c23-1d58e6a7b904",
        "version": [ 1, 0, 0 ],
        "min_engine_version": [ 1, 20, 0 ]
    },
    "modules": [
        {
            "description": "Magic circle functions (vanilla particles only)",
            "type": "data",
            "uuid": "7c3e91b8-2a64-4d05-8e17-b93f5c20da61",
            "version": [ 1, 0, 0 ]
        }
    ]
}
"""


def main() -> None:
    frames_dir = os.path.join(MC, "frames")
    if os.path.isdir(frames_dir):
        shutil.rmtree(frames_dir)          # stale frames must not survive
    os.makedirs(PACK, exist_ok=True)

    with open(os.path.join(PACK, "manifest.json"), "w", encoding="utf-8") as fh:
        fh.write(MANIFEST)

    icon_src = os.path.join(ROOT, "packs", "MagicCircleRP", "pack_icon.png")
    if os.path.isfile(icon_src):
        shutil.copyfile(icon_src, os.path.join(PACK, "pack_icon.png"))

    print("generating command pack:")
    per_frame = write_frames()
    write_control()
    write_spell()
    write_command_dump()

    print(f"\n  {FRAMES} frames, {per_frame} commands total,"
          f" ~{per_frame / FRAMES:.0f} per frame"
          f" (= ~{per_frame / FRAMES / TICKS_PER_FRAME:.0f} particles/tick)")
    print(f"  rotation loop: {FRAMES * TICKS_PER_FRAME} ticks"
          f" ({FRAMES * TICKS_PER_FRAME / 20:.1f}s)")


if __name__ == "__main__":
    main()
