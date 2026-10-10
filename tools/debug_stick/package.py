"""Zips the two packs into dist/DebugStick.mcaddon.

    python3 -m debug_stick.package
"""
import os
import zipfile

from .build import BP, RP, REPO


def main():
    out = os.path.join(REPO, 'dist', 'DebugStick.mcaddon')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root in (BP, RP):
            base = os.path.basename(root)
            for dirpath, _, files in os.walk(root):
                for fn in sorted(files):
                    full = os.path.join(dirpath, fn)
                    z.write(full, os.path.join(base, os.path.relpath(full, root)))
    print('wrote', out, os.path.getsize(out) // 1024, 'KiB')


if __name__ == '__main__':
    main()
