"""Split "The Complete KayKit Collection vN.zip" into assets-local/packs/kaykit-<slug>/ (one pack per inner folder).

    python3 -I scripts/assets/import_kaykit_bundle.py <zip> <bundle version> [--source-json '<json>']

Mirrors import_kenney_bundle.py: the zip is copied untouched to assets-local/bundles/kaykit-complete/<ver>/originals/,
each inner "KayKit <Title> <ver>" folder becomes packs/kaykit-<slug>/<ver>/extracted/ with a pack.json of format
"bundle". Licence: the collection's License.txt (CC0). Nothing is executed; paths are checked before extraction.
"""
import datetime, json, re, shutil, sys, zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2] / "assets-local"
TODAY = str(datetime.date.today())
NAME = re.compile(r"^KayKit (.+?) \(?(\d+(?:\.\d+)*)\)?$")
SKIP = {".url", ".ds_store"}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def safe(rel: str) -> PurePosixPath:
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts:
        sys.exit(f"unsafe path in archive: {rel}")
    return p


def main() -> None:
    zip_path, ver = Path(sys.argv[1]), sys.argv[2]
    source = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] == "--source-json" else {}
    bundle_dir = ROOT / "bundles" / "kaykit-complete" / ver
    (bundle_dir / "originals").mkdir(parents=True, exist_ok=True)
    if not (bundle_dir / "originals" / zip_path.name).exists():
        shutil.copy2(zip_path, bundle_dir / "originals" / zip_path.name)
    packs: dict[str, dict] = {}
    license_text = None
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            p = safe(info.filename)
            if info.is_dir() or len(p.parts) < 2 or "__macosx" in info.filename.lower() or p.suffix.lower() in SKIP:
                continue
            if len(p.parts) == 2:  # top-level files: License.txt and friends
                if p.name == "License.txt":
                    license_text = z.read(info).decode("utf-8", "replace")
                continue
            m = NAME.match(p.parts[1])
            if not m:
                sys.exit(f"unexpected pack folder: {p.parts[1]}")
            title, pver = m.group(1), m.group(2)
            pid = "kaykit-" + slug(title)
            rel = PurePosixPath(*p.parts[2:])
            dst = ROOT / "packs" / pid / pver / "extracted" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(dst, "wb") as out:
                shutil.copyfileobj(src, out)
            e = packs.setdefault(pid, {"title": title, "ver": pver, "path": p.parts[1], "types": Counter(), "n": 0})
            e["types"][p.suffix.lower().lstrip(".")] += 1
            e["n"] += 1
    if license_text is None:
        sys.exit("License.txt not found at the top of the bundle")
    (bundle_dir / "License.txt").write_text(license_text)
    rights = {"uses": ["in-game", "placeholder", "style-reference", "vision-input"], "audience": "public",
              "redistribution": "free", "attribution": "Kay Lousberg, www.kaylousberg.com (optional)",
              "processing": "local-only", "basis": f"bundles/kaykit-complete/{ver}/License.txt",
              "confirmed_by": "licence text (CC0-1.0)", "date": TODAY}
    for pid, e in sorted(packs.items()):
        pdir = ROOT / "packs" / pid
        shutil.copy2(bundle_dir / "License.txt", pdir / e["ver"] / "extracted" / "License.txt")
        pj = {"id": pid, "vendor": "kaykit", "title": e["title"], "category": "3d", "license": "CC0-1.0",
              "license_source": f"{e['ver']}/extracted/License.txt", "requires": [], "current": e["ver"],
              "versions": {e["ver"]: {"format": "bundle", "bundle": f"kaykit-complete@{ver}", "bundle_path": e["path"],
                                      "extracted_files": e["n"], "file_types": dict(e["types"].most_common()),
                                      "added": TODAY, "source": source, "usage_rights": rights}}}
        (pdir / "pack.json").write_text(json.dumps(pj, indent=2) + "\n")
        print(f"{pid:<40} {e['ver']:<7} {e['n']:>6} files")
    (bundle_dir / "bundle.json").write_text(json.dumps({
        "id": "kaykit-complete", "version": ver, "vendor": "kaykit", "license": "CC0-1.0", "added": TODAY,
        "source": source, "packs": sorted(packs)}, indent=2) + "\n")
    print(f"{len(packs)} packs from {zip_path.name}")


if __name__ == "__main__":
    main()
