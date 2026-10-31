"""GLB -> self-contained glTF JSON (buffer as a data URI) so the artifact can serve models as .json. usage: glb2json.py FILE.glb..."""
import json, struct, base64, sys
from pathlib import Path
for p in map(Path, sys.argv[1:]):
    b = p.read_bytes()
    magic, ver, length = struct.unpack_from("<4sII", b, 0)
    assert magic == b"glTF"
    off, js, binc = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from("<II", b, off); data = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A: js = json.loads(data)
        elif ctype == 0x004E4942: binc = data
        off += 8 + clen
    if binc is not None:
        js["buffers"][0]["uri"] = "data:application/octet-stream;base64," + base64.b64encode(binc).decode()
    p.with_suffix(".json").write_text(json.dumps(js, separators=(",", ":")))
    print(p.name, [i.get("uri") for i in js.get("images", [])][:2])
