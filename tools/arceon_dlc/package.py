"""Zips the behaviour pack into dist/ArceonDLC.mcaddon.

    python3 tools/arceon_dlc/package.py
"""
import os
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BP = os.path.join(REPO, 'packs', 'ArceonDLC_BP')


def main():
    out = os.path.join(REPO, 'dist', 'ArceonDLC.mcaddon')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        base = os.path.basename(BP)
        for dirpath, _, files in os.walk(BP):
            for fn in sorted(files):
                full = os.path.join(dirpath, fn)
                z.write(full, os.path.join(base, os.path.relpath(full, BP)))
    print('wrote', out, os.path.getsize(out) // 1024, 'KiB')


if __name__ == '__main__':
    main()
