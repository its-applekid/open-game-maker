"""Hash every ProFantasy file we hold (C3 §7 hash manifest): the CC3+ install tree, the exported maps and the copied PDFs.

usage: python3 -I scripts/maps/hash_manifest.py
writes assets-local/private/hash-manifests/profantasy-cc3-v1.txt ("sha256  bytes  path" per line, sorted, unique by hash+path).
The repo commit check blocks every hash listed, so symbol bitmaps and fills that never get cards still can't reach a game repo."""
import hashlib, os
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parents[2]
ROOTS = {"install": HOME / ".wine-cc3/drive_c/ProgramData/Profantasy", "maps": REPO / "assets-local/inspiration/profantasy-cc3/maps",
         "docs": REPO / "assets-local/inspiration/profantasy-cc3/docs"}
OUT = REPO / "assets-local/private/hash-manifests/profantasy-cc3-v1.txt"


def main():
    lines, hashes = [], set()
    for name, root in ROOTS.items():
        for dirpath, _, files in os.walk(root):
            for fn in files:
                p = Path(dirpath) / fn
                if p.is_symlink() or not p.is_file():
                    continue
                h = hashlib.sha256()
                with open(p, "rb") as r:
                    for b in iter(lambda: r.read(1 << 20), b""):
                        h.update(b)
                hashes.add(h.hexdigest())
                lines.append(f"{h.hexdigest()}  {p.stat().st_size}  {name}/{p.relative_to(root).as_posix()}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(sorted(lines)) + "\n")
    print(f"{len(lines)} files, {len(hashes)} unique hashes -> {OUT}")


if __name__ == "__main__":
    main()
