"""Validates the add-on's item files and manifest against Mojang's schemas.

    python3 tools/arceon_dlc/schema_check.py <bedrock-samples>/metadata/json_schemas
"""
import glob
import json
import os
import sys
import urllib.parse

import jsonschema
from referencing import Registry, Resource

BP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'packs', 'ArceonDLC_BP'))


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
    top = json.load(open(os.path.join(root, 'server/item/1.26.30/ItemDocument.json')))
    v = jsonschema.Draft7Validator(top, registry=reg)
    bad = 0
    files = sorted(glob.glob(os.path.join(BP, 'items', '*.json')))
    for f in files:
        errs = list(v.iter_errors(json.load(open(f))['minecraft:item']))
        if errs:
            bad += 1
            for e in errs[:3]:
                print(os.path.basename(f), list(e.absolute_path), e.message[:200])
    print(f'{len(files)} item files, {bad} invalid')


if __name__ == '__main__':
    main(sys.argv[1])
