"""Copy every ProFantasy PDF (install tree + downloads) into the inspiration collection and index it (goal item 11).

usage: python3 -I scripts/maps/import_profantasy_docs.py
writes assets-local/inspiration/profantasy-cc3/docs/<source>/<path>.pdf (deduplicated by sha256) and docs/index.json:
  [{"path", "title", "source", "sha256", "bytes", "pages", "keywords"}]
C3 has no asset kind for documents, so manuals and Annual write-ups are indexed for agents to read (how a map style was
built, symbol catalogues), not carded; the collection's hash manifest still covers them. Inspiration only (Kevin, 2026-10-26)."""
import hashlib, json, re, shutil, subprocess
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "assets-local/inspiration/profantasy-cc3/docs"
SOURCES = {"install": HOME / ".wine-cc3/drive_c/ProgramData/Profantasy", "downloads": HOME / "Downloads/profantasy",
           "downloads-top": HOME / "Downloads"}
STOP = {"pdf", "the", "and", "for", "with", "content", "guide", "cc3plus", "issue"}


def pages(p: Path):
    try:
        out = subprocess.run(["pdfinfo", str(p)], capture_output=True, text=True, timeout=60).stdout
        m = re.search(r"^Pages:\s+(\d+)", out, re.M)
        return int(m.group(1)) if m else None
    except subprocess.SubprocessError:
        return None


def main():
    seen, rows = {}, []
    for src, root in SOURCES.items():
        if not root.exists():
            continue
        files = sorted(root.glob("*.pdf")) if src == "downloads-top" else sorted(root.rglob("*.pdf"))
        for f in files:
            h = hashlib.sha256(f.read_bytes()).hexdigest()
            if h in seen:
                continue
            rel = f.relative_to(root)
            dest = OUT / src.split("-")[0] / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                shutil.copy2(f, dest)
            words = [w.lower() for w in re.findall(r"[A-Za-z]{3,}", " ".join(rel.parts))]
            kw = list(dict.fromkeys(w for w in words if w not in STOP))[:12]
            seen[h] = True
            rows.append({"path": dest.relative_to(OUT.parent).as_posix(), "title": f.stem, "source": src, "sha256": "sha256:" + h,
                         "bytes": f.stat().st_size, "pages": pages(f), "keywords": kw})
    (OUT / "index.json").write_text(json.dumps(rows, indent=1) + "\n")
    print(json.dumps({"pdfs": len(rows), "bytes": sum(r["bytes"] for r in rows)}))


if __name__ == "__main__":
    main()
