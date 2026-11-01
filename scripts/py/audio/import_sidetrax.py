"""Import the Sidetrax "Complete Works" Humble bundle into assets-local/packs/sidetrax-<slug>/.

usage: python3 -I import_sidetrax.py [--downloads DIR] [--packs DIR] [--links FILE]

Each product zip becomes one pack, laid out like the Synty importer:
  packs/sidetrax-<slug>/v1/originals/<zip>      the vendor zip, moved here
  packs/sidetrax-<slug>/v1/extracted/<files>    one audio format only: lossless if present, else MP3
  packs/sidetrax-<slug>/pack.json               manifest
  packs/sidetrax-<slug>/collection.card.json    draft C3 collection card (default rights + Kevin's interpretation)
Product names come from the private links file (name and file name only; links are never read out or written).
Writes a report of repeated track-name stems for variant grouping (plan U3)."""
import argparse, json, re, shutil, sys, zipfile
from collections import Counter
from datetime import date
from pathlib import Path, PurePosixPath

HOME = Path.home()
LOSSLESS = {"wav", "aif", "aiff", "flac"}
LOSSY = ["mp3", "m4a", "ogg"]  # preference order when no lossless format exists
FORMAT_DIRS = re.compile(r"^(wav|mp3|aac|m4a|aiff?|flac|ogg)( files)?$", re.I)
VERSION = "v1"
TODAY = date.today().isoformat()
LICENSE_REF = "https://www.sidetrax.co.uk/page-21/terms.php"
INTERPRETATION_NOTE = ("License silent on AI; vendor site says 'Human-made music. No AI.' Kevin approved analysis by local "
                       "models only (nothing uploaded, nothing generated). Vendor not asked.")


def slug(name: str) -> str:
    return "sidetrax-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def safe(rel: str) -> PurePosixPath:
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts:
        raise ValueError(f"unsafe path in archive: {rel}")
    return p


def is_junk(p: PurePosixPath) -> bool:
    return "__MACOSX" in p.parts or p.name.startswith("._") or p.name == ".DS_Store"


def choose_members(names):
    """Audio members of the single best format, and that format."""
    audio = [p for p in map(safe, names) if not is_junk(p) and p.suffix.lower().lstrip(".") in LOSSLESS | set(LOSSY)]
    exts = {p.suffix.lower().lstrip(".") for p in audio}
    fmt = next((e for e in ("wav", "aif", "aiff", "flac") if e in exts), None) or next((e for e in LOSSY if e in exts), None)
    return [p for p in audio if p.suffix.lower().lstrip(".") == fmt], fmt


def dest_path(p: PurePosixPath, top: str | None) -> PurePosixPath:
    """Drop the archive's single wrapper folder and any WAV/MP3/AAC format folder."""
    parts = list(p.parts)
    if top and parts[0] == top:
        parts = parts[1:]
    parts = [x for x in parts[:-1] if not FORMAT_DIRS.match(x)] + [parts[-1]]
    return PurePosixPath(*parts)


def draft_card(pid: str, name: str, n_tracks: int, lossless: bool) -> dict:
    lic = {"type": "license", "license": "LicenseRef-sidetrax-royalty-free", "ref": LICENSE_REF, "uses": ["in-game"], "forbids": [],
           "audience": "private", "redistribution": "in-build", "attribution": None, "set_by": {"role": "intake-code"}, "date": TODAY,
           "note": "Grants use in games, personal or commercial; one user; no redistribution except as part of the project. "
                   "Silent on editing, derivatives, attribution and AI. Unconfirmed until Kevin's sign-off."}
    default = {"type": "default", "uses": ["vision-input"], "audience": "private", "redistribution": "none",
               "set_by": {"role": "intake-code"}, "date": TODAY}
    interp = {"type": "interpretation", "uses": ["vision-input"], "audience": "private", "redistribution": "none",
              "set_by": {"role": "admin", "name": "kevin"}, "date": "2026-10-27", "note": INTERPRETATION_NOTE}
    at = f"{TODAY}T00:00:00-07:00"
    return {
        "schema": "ogm.asset-card/1.0", "vocab": "2026-10-27", "id": f"t1:{pid}@{VERSION}", "card_type": "collection",
        "status": "draft", "title": f"{name} (Sidetrax)", "license": "LicenseRef-sidetrax-royalty-free",
        "rights": {"uses": ["vision-input"], "audience": "private", "redistribution": "none", "attribution": None,
                   "basis": [lic, default, interp]},
        "describe": {"style_family": "any"},
        "collection_info": {"vendor": "sidetrax", "version": VERSION, "origin": "bundle", "bundle": "humble-sidetrax-complete-works",
                            "counts": {"audio": n_tracks}, "creation_choice": False,
                            "pack_manifest": f"assets-local/packs/{pid}/pack.json"},
        "provenance": {"*": {"by": "code", "tool": "import_sidetrax@0.1", "at": at},
                       "rights": {"by": "license", "tool": "import_sidetrax@0.1", "at": at}},
        **({} if lossless else {"flags": ["needs-review"]}),
    }


def import_product(name: str, zpath: Path, packs: Path) -> dict:
    """Import one zip. Returns a report row. Never leaves a half-written pack."""
    pid = slug(name)
    pdir = packs / pid
    if (pdir / "pack.json").exists():
        return {"name": name, "pack": pid, "status": "skip"}
    try:
        z = zipfile.ZipFile(zpath)
    except zipfile.BadZipFile:
        return {"name": name, "pack": pid, "status": "bad-zip"}
    with z:
        members, fmt = choose_members(z.namelist())
        if not members:
            return {"name": name, "pack": pid, "status": "no-audio", "files": len(z.namelist())}
        tops = {p.parts[0] for p in members}
        top = next(iter(tops)) if len(tops) == 1 and all(len(p.parts) > 1 for p in members) else None
        tmp = packs / f".{pid}.part"
        shutil.rmtree(tmp, ignore_errors=True)
        ext = tmp / VERSION / "extracted"
        for p in members:
            out = ext / dest_path(p, top)
            out.parent.mkdir(parents=True, exist_ok=True)
            with z.open(str(p)) as r, open(out, "wb") as w:
                shutil.copyfileobj(r, w)
    lossless = fmt in LOSSLESS
    manifest = {"id": pid, "vendor": "sidetrax", "title": name, "license": "sidetrax-royalty-free",
                "bundle": "humble-sidetrax-complete-works", "requires": [],
                "versions": {VERSION: {"format": f"vendor-zip/{fmt}", "originals": [zpath.name], "extracted_files": len(members),
                                       "lossless": lossless, "added": TODAY}},
                "current": VERSION}
    (tmp / "pack.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (tmp / "collection.card.json").write_text(json.dumps(draft_card(pid, name, len(members), lossless), indent=2) + "\n")
    (tmp / VERSION / "originals").mkdir(parents=True)
    if pdir.exists():
        shutil.rmtree(pdir)
    tmp.rename(pdir)
    shutil.move(str(zpath), pdir / VERSION / "originals" / zpath.name)
    return {"name": name, "pack": pid, "status": "ok", "format": fmt, "tracks": len(members), "lossless": lossless,
            "stems": [dest_path(p, top).stem for p in members]}


def stem_key(stem: str) -> str:
    """Track name with common cut/loop suffixes removed, for the variant report."""
    s = re.sub(r"[\s_-]*(\(?(\d+\s?s(ec)?|loop\s?\d*|sting(er)?|alt(ernate)?( mix)?|edit|short|full|version \d+|v\d+)\)?)$", "", stem, flags=re.I)
    return re.sub(r"[\s_-]+", " ", s).strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--downloads", type=Path, default=HOME / "Downloads/humble-audio")
    ap.add_argument("--packs", type=Path, default=HOME / "games/open-game-maker-2000/assets-local/packs")
    ap.add_argument("--links", type=Path, default=HOME / ".config/ogm/humble-audio-links.json")
    a = ap.parse_args()
    rows = []
    for product in json.loads(a.links.read_text()):
        for d in product["dls"]:
            fn = (d.get("href") or "").split("?")[0].rsplit("/", 1)[-1]
            zp = a.downloads / fn
            if not fn:
                continue
            if not zp.exists() and (a.packs / slug(product["name"]) / "pack.json").exists():
                rows.append({"name": product["name"], "pack": slug(product["name"]), "status": "skip"})
            elif not zp.exists():
                rows.append({"name": product["name"], "pack": slug(product["name"]), "status": "not-downloaded"})
            else:
                rows.append(import_product(product["name"], zp, a.packs))
            print(f"{rows[-1]['status']:15s} {rows[-1]['pack']}", flush=True)
    stems = Counter(stem_key(s) for r in rows for s in r.get("stems", []))
    report = {"date": TODAY, "products": len(rows), "by_status": Counter(r["status"] for r in rows),
              "tracks": sum(r.get("tracks", 0) for r in rows), "lossy_packs": [r["pack"] for r in rows if r.get("lossless") is False],
              "repeated_stems": {k: v for k, v in stems.most_common() if v > 1},
              "problems": [r for r in rows if r["status"] in ("bad-zip", "no-audio")]}
    (a.packs / ".sidetrax-import-report.json").write_text(json.dumps(report, indent=2, default=dict) + "\n")
    print(json.dumps({k: report[k] for k in ("products", "by_status", "tracks", "lossy_packs")}, default=dict))
    print(f"repeated stems: {len(report['repeated_stems'])}; problems: {len(report['problems'])}")


if __name__ == "__main__":
    sys.exit(main())
