"""Builds 에디터 DLC (dist/EditorDLC_V<version>.mcaddon) from the separate packs:

  behaviour pack  = Debug Stick (blocks, items, scripts)
                  + Arceon DLC (items, scripts)
                  + structures with their functions (Jewel Changi diagrid, Cocoon Tower)
  resource pack   = Debug Stick models / names (textures are vanilla)
                  + Arceon DLC particles (the protractor's lines and guides)

Both script packs keep their own folders under scripts/ and are started by
one entry file. The structures only come into the world through their
functions (/function diagrid/build, /function ctw4/build).

    python3 tools/integrated/build.py          # build the current version
    python3 tools/integrated/build.py --bump   # +0.1 (do this for every change we ship)

The version lives in tools/integrated/VERSION ("0", "0.1", "0.2" ...). It is
shown in the pack name (에디터 DLC V0.1) and becomes the manifest version
(0.1 -> 0.1.0, 1.3 -> 1.3.0).
"""
import sys
import json
import os
import shutil
import tempfile
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(REPO, 'packs', *a)
VFILE = os.path.join(os.path.dirname(__file__), 'VERSION')


def read_version():
    return open(VFILE).read().strip()


def bump(v):
    major, _, minor = v.partition('.')
    tenths = int(major) * 10 + int(minor or 0) + 1
    return f'{tenths // 10}.{tenths % 10}'


def semver(v):
    major, _, minor = v.partition('.')
    return f'{int(major)}.{int(minor or 0)}.0'


LABEL = VERSION = None  # set in main()
BP_UUID, BP_DATA, BP_SCRIPT = 'ab6e0423-ef96-41ab-aa9f-5975e4681840', '1f479df0-4d33-41ec-82f5-7579507a0afc', 'a7e1e9c0-9be1-43b9-b5c3-f0fdce52658d'
RP_UUID, RP_RES = '883833f2-e5d0-462c-8136-ea47811b6bae', '442c1e32-188f-4641-aac3-682f63bf4699'

DESC_BP = ("§b에디터 DLC {label}§r — 디버그 스틱 + 아르세온 DLC + 구조물\n\n"
           "§e디버그 스틱§r §a/give @s vyt:debug_stick§r — 독립형 블록 333종, 멀리서도 안 사라지는 철문 (vyt:ds_iron_door)\n"
           "§e아르세온 DLC§r §a/arc:tools§r 도구 7개 · §a/arc:menu§r 메뉴 (8Crafter's Server Utilities와 같이 쓰는 확장)\n"
           "§e구조물§r (치트 필요, 서 있는 자리가 -X/-Z 아래 모서리)\n"
           "  §a/function diagrid/build§r 주얼 창이 다이아그리드 171×46×228 (p01~p12 분할, clear)\n"
           "  §a/function ctw4/build§r 코쿤 타워 52×203×59 (clear)\n\n"
           "§c따로 받은 Debug Stick / Arceon DLC / Jewel Diagrid / Cocoon Tower 팩과 예전 통합팩은 빼고 이것만 적용하세요.§r")
DESC_RP = "§b에디터 DLC {label} 리소스§r — 디버그 스틱 독립형 블록의 모델·이름, 아르세온 도구의 커스텀 파티클. 블록 텍스처는 바닐라 것을 씁니다.\n§c에디터 DLC 행동 팩과 함께 적용하세요.§r"


def copytree(src, dst, skip=()):
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        if rel.split(os.sep)[0] in skip:
            continue
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            if rel == '.' and f in skip:
                continue
            out = os.path.join(dst, rel, f)
            if os.path.exists(out):
                raise SystemExit(f'file clash: {os.path.join(rel, f)}')
            shutil.copy2(os.path.join(root, f), out)


def build(tmp):
    bp, rp = os.path.join(tmp, 'EditorDLC_BP'), os.path.join(tmp, 'EditorDLC_RP')
    # behaviour pack
    copytree(P('DebugStickBP'), bp, skip=('scripts', 'manifest.json', 'README', 'LICENSE'))
    copytree(P('ArceonDLC_BP'), bp, skip=('scripts', 'manifest.json'))
    copytree(P('StructuresBP'), bp)
    copytree(P('DebugStickBP', 'scripts'), os.path.join(bp, 'scripts', 'debugstick'))
    copytree(P('ArceonDLC_BP', 'scripts'), os.path.join(bp, 'scripts', 'arceon'))
    shutil.copy2(P('DebugStickBP', 'LICENSE'), os.path.join(bp, 'LICENSE_debug_stick.txt'))
    shutil.copy2(P('DebugStickBP', 'README'), os.path.join(bp, 'README_debug_stick.txt'))
    with open(os.path.join(bp, 'scripts', 'main.js'), 'w') as f:
        f.write('// All-in-one entry: each add-on keeps its own folder and its own events.\n'
                "import './debugstick/index.js';\nimport './arceon/main.js';\n")
    ds = json.load(open(P('DebugStickBP', 'manifest.json')))
    deps = [d for d in ds['dependencies'] if 'module_name' in d]
    deps.append({'module_name': '@minecraft/server-ui', 'version': '2.0.0'})
    deps.append({'uuid': RP_UUID, 'version': VERSION})
    json.dump({
        'format_version': 3,
        'header': {'name': f'에디터 DLC {LABEL} (행동)', 'description': DESC_BP.format(label=LABEL), 'version': VERSION, 'min_engine_version': '1.26.40', 'uuid': BP_UUID},
        'modules': [
            {'description': 'behaviour', 'type': 'data', 'version': VERSION, 'uuid': BP_DATA},
            {'description': 'scripting', 'type': 'script', 'language': 'javascript', 'version': VERSION, 'uuid': BP_SCRIPT, 'entry': 'scripts/main.js'},
        ],
        'dependencies': deps,
    }, open(os.path.join(bp, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    # resource pack
    copytree(P('DebugStickRP'), rp, skip=('manifest.json', 'pack_icon.png'))
    copytree(P('ArceonDLC_RP'), rp, skip=('manifest.json',))  # the tools' own particles
    # same icon on both so the pair is easy to spot in the pack list
    shutil.copy2(os.path.join(bp, 'pack_icon.png'), os.path.join(rp, 'pack_icon.png'))
    json.dump({
        'format_version': 3,
        'header': {'name': f'에디터 DLC {LABEL} (리소스)', 'description': DESC_RP.format(label=LABEL), 'version': VERSION, 'min_engine_version': '1.26.40', 'uuid': RP_UUID},
        'modules': [{'description': 'resources', 'type': 'resources', 'version': VERSION, 'uuid': RP_RES}],
        # linked both ways: turning on either pack turns on the other
        'dependencies': [{'uuid': BP_UUID, 'version': VERSION}],
    }, open(os.path.join(rp, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    return bp, rp


def main():
    global LABEL, VERSION
    v = read_version()
    if '--bump' in sys.argv:
        v = bump(v)
        open(VFILE, 'w').write(v + '\n')
    LABEL, VERSION = 'V' + v, semver(v)
    dist = os.path.join(REPO, 'dist')
    for old in os.listdir(dist):
        if old == 'AllInOne.mcaddon' or (old.startswith('EditorDLC_V') and old.endswith('.mcaddon')):
            os.remove(os.path.join(dist, old))
    out = os.path.join(dist, f'EditorDLC_{LABEL}.mcaddon')
    keep = os.environ.get('ALLINONE_KEEP')
    tmp = keep or tempfile.mkdtemp()
    if keep:
        shutil.rmtree(keep, ignore_errors=True)
        os.makedirs(keep)
    bp, rp = build(tmp)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root in (bp, rp):
            base = os.path.basename(root)
            for dirpath, _, files in os.walk(root):
                for fn in sorted(files):
                    full = os.path.join(dirpath, fn)
                    z.write(full, os.path.join(base, os.path.relpath(full, root)))
    if not keep:
        shutil.rmtree(tmp)
    print('wrote', out, os.path.getsize(out) // 1024, 'KiB')


if __name__ == '__main__':
    main()
