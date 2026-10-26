"""Rebuild assets-local/catalog.json from every packs/*/pack.json.

One line per pack so tools (and a future `gm packs` CLI) can search without walking 100k files.
Run: python3 -I scripts/assets/build_catalog.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "assets-local"

packs = []
for pj in sorted((ROOT / "packs").glob("*/pack.json")):
    m = json.loads(pj.read_text())
    v = m["versions"][m["current"]]
    packs.append({
        "id": m["id"],
        "vendor": m["vendor"],
        "title": m["title"],
        "category": m.get("category"),
        "license": m["license"],
        "version": m["current"],
        "path": f"packs/{m['id']}/{m['current']}/extracted",
        "icon": f"packs/{m['id']}/icon.png" if (pj.parent / "icon.png").exists() else None,
        "files": v["extracted_files"],
        "file_types": v["file_types"],
        "requires": m["requires"],
    })

(ROOT / "catalog.json").write_text(json.dumps({"packs": packs}, indent=1) + "\n")
print(f"{len(packs)} packs -> {ROOT / 'catalog.json'}")
