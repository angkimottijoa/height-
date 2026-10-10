"""Validates generated block files against Mojang's official JSON schemas.

    python3 -m debug_stick.schema_check <bedrock-samples>/metadata/json_schemas
"""
import glob
import json
import os
import sys
import urllib.parse

import jsonschema
from referencing import Registry, Resource

from . import build


def main(root):
    schemas = {}
    for p in glob.glob(os.path.join(root, '**', '*.json'), recursive=True):
        try:
            d = json.load(open(p))
        except Exception:
            continue
        rel = '/' + os.path.relpath(p, root).replace(os.sep, '/')
        schemas[urllib.parse.quote(rel)] = d
        if '$id' in d:
            schemas[d['$id']] = d

    def retrieve(uri):
        path = urllib.parse.urlparse(uri).path
        if path in schemas:
            return Resource.from_contents(schemas[path])
        raise KeyError(uri)

    reg = Registry(retrieve=retrieve)
    top = json.load(open(os.path.join(root, 'server/block/1.26.20/Blocks.json')))
    v = jsonschema.Draft7Validator(top, registry=reg)
    bad = 0
    files = sorted(glob.glob(os.path.join(build.BP, 'blocks', '*.json')))
    for f in files:
        data = json.load(open(f))
        errs = []
        for e in v.iter_errors(data['minecraft:block']):
            p = list(e.absolute_path)
            # integer state lists are documented and accepted by the game; the
            # published schema only spells out the string form
            if len(p) == 3 and p[:2] == ['description', 'states'] and isinstance(e.instance, list) \
                    and all(isinstance(x, int) for x in e.instance) and len(e.instance) <= 16:
                continue
            errs.append(e)
        for name, vals in data['minecraft:block']['description'].get('states', {}).items():
            if len(vals) > 16:
                errs.append(jsonschema.ValidationError(f'state {name} has {len(vals)} values (max 16)'))
        if errs:
            bad += 1
            for e in errs[:3]:
                print(os.path.basename(f), list(e.absolute_path), e.message[:200])
    print(f'{len(files)} block files, {bad} invalid')


if __name__ == '__main__':
    main(sys.argv[1])
