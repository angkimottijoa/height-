"""Zips the behaviour pack (and its particle resource pack) into dist/ArceonDLC.mcaddon.

    python3 tools/arceon_dlc/package.py
"""
import os
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BP = os.path.join(REPO, 'packs', 'ArceonDLC_BP')
RP = os.path.join(REPO, 'packs', 'ArceonDLC_RP')


def main():
    out = os.path.join(REPO, 'dist', 'ArceonDLC.mcaddon')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for pack in (BP, RP):
            base = os.path.basename(pack)
            for dirpath, _, files in os.walk(pack):
                for fn in sorted(files):
                    full = os.path.join(dirpath, fn)
                    z.write(full, os.path.join(base, os.path.relpath(full, pack)))
    print('wrote', out, os.path.getsize(out) // 1024, 'KiB')


if __name__ == '__main__':
    main()
