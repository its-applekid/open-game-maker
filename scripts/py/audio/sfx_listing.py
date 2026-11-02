"""Contact listings for sound-effect libraries: one line per library in each pack, and a library index per set (C3 §9).

usage: python3 -I sfx_listing.py --set SET [--packs DIR] [--index DIR]
writes packs/<id>/listing.txt (one line per library: its sounds with durations and kinds) for every pack in the set, and
index/sets/<set>.json + .txt (vendor, library, pack, file count, minutes, kinds, keywords) so an agent picks a library
before a file. Reads the cards build_audio_cards.py wrote; standard library only."""
import argparse, json, sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from music_listing import packs_in_set
ROOT = HERE.parents[2] / "assets-local"


def library_of(card):
    """`Vendor - Library` from the file's folder (the bundle's layout)."""
    path = card["source"]["files"][0]["path"]
    return path.split("/")[0] if "/" in path else "-"


def kind_of(card):
    """The kind word an agent asks for: ambience, loop or one-shot from the keywords, else the subkind's last part."""
    kw = card.get("describe", {}).get("keywords", [])
    shape = next((k for k in ("ambience", "loop", "one-shot") if k in kw), None)
    sub = card.get("subkind", "-").split("/")[-1]
    return sub if shape in (None, sub) else f"{sub} {shape}"


def entry(card):
    a = card.get("audio", {})
    return {"id": card["id"], "title": card["title"], "duration_s": a.get("duration_s") or 0, "kind": kind_of(card),
            "loudness_lufs": a.get("loudness_lufs"), "loopable": a.get("loopable"), "ucs_cat_id": a.get("ucs_cat_id"),
            "keywords": card.get("describe", {}).get("keywords", [])}


def line(folder, files):
    """`Vendor - Library (n, m:ss): Title 1.2 s impact one-shot; ...` sorted by title."""
    total = sum(f["duration_s"] for f in files)
    sounds = "; ".join(f"{f['title']} {f['duration_s']:.1f} s {f['kind']}" for f in sorted(files, key=lambda f: f["title"].lower()))
    return f"{folder} ({len(files)}, {int(total // 60)}:{int(total % 60):02d}): {sounds}"


def build(packs: Path, index: Path, set_id: str):
    libraries = []
    for pid in packs_in_set(packs, set_id):
        by_lib = defaultdict(list)
        for f in sorted((packs / pid / "cards").rglob("*.card.json")):
            card = json.loads(f.read_text())
            by_lib[library_of(card)].append(entry(card))
        rows = sorted(by_lib.items(), key=lambda kv: kv[0].lower())
        head = f"{pid}: {len(rows)} libraries, {sum(len(v) for v in by_lib.values())} sounds"
        (packs / pid / "listing.txt").write_text("\n".join([head, *(line(k, v) for k, v in rows)]) + "\n")
        for folder, files in rows:
            vendor, _, library = folder.partition(" - ")
            kinds = Counter(f["kind"] for f in files)
            libraries.append({"vendor": vendor, "library": library or folder, "pack": pid, "files": len(files),
                              "minutes": round(sum(f["duration_s"] for f in files) / 60, 1), "kinds": dict(kinds.most_common()),
                              "keywords": list(dict.fromkeys(k for f in files for k in f["keywords"]))[:24],
                              "sounds": [f["id"] for f in files]})
    libraries.sort(key=lambda r: (r["vendor"].lower(), r["library"].lower()))
    out = index / "sets"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{set_id}.json").write_text(json.dumps({"set": set_id, "libraries": libraries}, indent=1) + "\n")
    text = [f"{set_id}: {len(libraries)} libraries, {sum(r['files'] for r in libraries)} sounds"]
    text += [f"{r['vendor'][:24]:<24} {r['library'][:40]:<40} {r['files']:>3}  {r['minutes']:>5.1f} min  "
             f"{', '.join(f'{k} {n}' for k, n in r['kinds'].items())}" for r in libraries]
    (out / f"{set_id}.txt").write_text("\n".join(text) + "\n")
    return libraries


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", required=True)
    ap.add_argument("--packs", type=Path, default=ROOT / "packs")
    ap.add_argument("--index", type=Path, default=ROOT / "index")
    a = ap.parse_args(argv)
    libs = build(a.packs, a.index, a.set)
    print(json.dumps({"set": a.set, "libraries": len(libs), "sounds": sum(r["files"] for r in libs)}))


if __name__ == "__main__":
    main()
