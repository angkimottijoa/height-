"""Builds the all-in-one add-on dist/AllInOne.mcaddon from the separate packs:

  behaviour pack  = Debug Stick (blocks, items, scripts)
                  + Arceon DLC (items, scripts)
                  + structures with their functions (Jewel Changi diagrid, Cocoon Tower)
  resource pack   = Debug Stick models / names (textures are vanilla)

Both script packs keep their own folders under scripts/ and are started by
one entry file. The structures only come into the world through their
functions (/function diagrid/build, /function ctw4/build).

    python3 tools/integrated/build.py
"""
import json
import os
import shutil
import tempfile
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(REPO, 'packs', *a)
VERSION = '1.0.0'
BP_UUID, BP_DATA, BP_SCRIPT = '575eb684-c939-4a29-a90d-99250154e80f', 'df28aa6a-c30d-41a3-a43a-9216b9b78fd9', '8c96040f-e0ba-4d12-b4f0-995222aefb07'
RP_UUID, RP_RES = '702c1168-1ab6-476f-9e61-27bf18b87ee3', 'bbe31d70-f313-468b-befb-8764faa3aefc'

DESC_BP = ("§b통합팩§r — 디버그 스틱 + 아르세온 DLC + 구조물\n\n"
           "§e디버그 스틱§r §a/give @s vyt:debug_stick§r — 독립형 블록 333종, 멀리서도 안 사라지는 철문 (vyt:ds_iron_door)\n"
           "§e아르세온 DLC§r §a/arc:tools§r 도구 6개 · §a/arc:menu§r 메뉴 (8Crafter's Server Utilities와 같이 쓰는 확장)\n"
           "§e구조물§r (치트 필요, 서 있는 자리가 -X/-Z 아래 모서리)\n"
           "  §a/function diagrid/build§r 주얼 창이 다이아그리드 171×46×228 (p01~p12 분할, clear)\n"
           "  §a/function ctw4/build§r 코쿤 타워 52×203×59 (clear)\n\n"
           "§c따로 받은 Debug Stick / Arceon DLC / Jewel Diagrid / Cocoon Tower 팩은 빼고 이것만 적용하세요.§r")
DESC_RP = "§b통합팩 리소스§r — 디버그 스틱 독립형 블록의 모델·이름. 텍스처는 바닐라 것을 씁니다.\n§c통합팩 행동 팩과 함께 적용하세요.§r"


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
    bp, rp = os.path.join(tmp, 'AllInOne_BP'), os.path.join(tmp, 'AllInOne_RP')
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
        'header': {'name': '통합팩 [BP]', 'description': DESC_BP, 'version': VERSION, 'min_engine_version': '1.26.40', 'uuid': BP_UUID},
        'modules': [
            {'description': 'behaviour', 'type': 'data', 'version': VERSION, 'uuid': BP_DATA},
            {'description': 'scripting', 'type': 'script', 'language': 'javascript', 'version': VERSION, 'uuid': BP_SCRIPT, 'entry': 'scripts/main.js'},
        ],
        'dependencies': deps,
    }, open(os.path.join(bp, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    # resource pack
    copytree(P('DebugStickRP'), rp, skip=('manifest.json',))
    json.dump({
        'format_version': 3,
        'header': {'name': '통합팩 [RP]', 'description': DESC_RP, 'version': VERSION, 'min_engine_version': '1.26.40', 'uuid': RP_UUID},
        'modules': [{'description': 'resources', 'type': 'resources', 'version': VERSION, 'uuid': RP_RES}],
    }, open(os.path.join(rp, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    return bp, rp


def main():
    out = os.path.join(REPO, 'dist', 'AllInOne.mcaddon')
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
