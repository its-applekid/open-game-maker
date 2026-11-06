#!/usr/bin/env python3
"""Dump the JSON chunk facts we care about from a GLB: nodes, extras, animations, materials."""
import json, struct, sys
from pathlib import Path


def read(path):
    data = Path(path).read_bytes()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', magic
    off = 12
    doc = None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            doc = json.loads(chunk.decode('utf-8'))
        off += 8 + clen + ((4 - clen % 4) % 4)
    return doc


def main(paths):
    for p in paths:
        doc = read(p)
        print('==', Path(p).name)
        print('  generator:', doc.get('asset', {}).get('generator'))
        print('  nodes:', len(doc.get('nodes', [])), 'meshes:', len(doc.get('meshes', [])),
              'materials:', len(doc.get('materials', [])), 'animations:', len(doc.get('animations', [])))
        for n in doc.get('nodes', []):
            ex = n.get('extras')
            bits = [f"name={n.get('name')!r}"]
            for k in ('mesh', 'translation', 'rotation', 'scale', 'children'):
                if k in n:
                    v = n[k]
                    if isinstance(v, list) and len(v) > 4:
                        v = f'[{len(v)} items]'
                    bits.append(f'{k}={v}')
            if ex is not None:
                bits.append(f'extras={json.dumps(ex)[:200]}')
            print('   ', ' '.join(bits))
        for a in doc.get('animations', []):
            chans = a.get('channels', [])
            targets = sorted({c['target'].get('path') for c in chans})
            print('    anim:', a.get('name'), 'channels', len(chans), targets)
        for m in doc.get('materials', []):
            pbr = m.get('pbrMetallicRoughness', {})
            print('    mat:', m.get('name'), 'base', pbr.get('baseColorFactor'),
                  'tex', 'yes' if 'baseColorTexture' in pbr else 'no', 'extras', json.dumps(m.get('extras'))[:120])
        print('    extras(asset):', json.dumps(doc.get('extras'))[:200])


if __name__ == '__main__':
    main(sys.argv[1:])
