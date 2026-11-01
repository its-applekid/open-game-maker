"""Import loose archives (zip, rar, 7z) from a Drive drop (quarantine) into assets-local/packs, one pack per archive.

    python3 -I scripts/assets/import_drop_zips.py <quarantine dir> <spec.json>

spec.json is a list; each entry: {"zip": "<path under files/>", "id": "<pack id>", "title": "...", "vendor": "...",
"category": "2d|3d|audio|ui|icons|other", "license": "<SPDX or vendor class>", "license_file": "<member path or null>",
"usage_rights": {...C2 §10 fields...}, "set": "<optional set id>", "notes": "..."}.
The zip is copied untouched to <pack>/<version>/originals/, its content lands in <pack>/<version>/extracted/ with a
single wrapper folder stripped, __MACOSX and .DS_Store dropped, and every path checked before extraction. The
version is today's date unless the spec gives "version". Nothing is executed.
"""
import collections, datetime, json, shutil, subprocess, sys, zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2] / "assets-local"
TODAY = str(datetime.date.today())


def safe(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    if p.is_absolute() or ".." in p.parts:
        sys.exit(f"unsafe path in archive: {name}")
    return p


def wrapper(z: zipfile.ZipFile) -> bool:
    tops = {safe(i.filename).parts[0] for i in z.infolist() if not i.filename.startswith("__MACOSX")}
    return len(tops) == 1 and all(len(safe(i.filename).parts) > 1 or i.is_dir() for i in z.infolist()
                                  if not i.filename.startswith("__MACOSX"))


def extract_7z(src: Path, ext: Path) -> int:
    lst = subprocess.run(["7z", "l", "-slt", "-ba", str(src)], capture_output=True, text=True, errors="replace",
                         timeout=600, stdin=subprocess.DEVNULL, check=True).stdout
    names = [line[7:] for line in lst.splitlines() if line.startswith("Path = ")]
    for name in names:
        safe(name)
    subprocess.run(["7z", "x", "-y", "-bd", f"-o{ext}", str(src)], capture_output=True, timeout=3600,
                   stdin=subprocess.DEVNULL, check=True)
    for junk in list(ext.rglob("__MACOSX")) + list(ext.rglob(".DS_Store")):
        shutil.rmtree(junk) if junk.is_dir() else junk.unlink()
    tops = [p for p in ext.iterdir()]
    if len(tops) == 1 and tops[0].is_dir():  # strip a single wrapper folder
        for child in list(tops[0].iterdir()):
            shutil.move(str(child), str(ext / child.name))
        tops[0].rmdir()
    return sum(1 for p in ext.rglob("*") if p.is_file())


def import_zip(qdir: Path, manifest: dict, spec: dict) -> dict:
    src = qdir / "files" / spec["zip"]
    ver = spec.get("version", TODAY)
    root = ROOT / "packs" / spec["id"]
    ext, orig = root / ver / "extracted", root / ver / "originals"
    ext.mkdir(parents=True, exist_ok=True)
    orig.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, orig / src.name)
    n = 0
    if src.suffix.lower() == ".zip":
        with zipfile.ZipFile(src) as z:
            strip = wrapper(z)
            for info in z.infolist():
                p = safe(info.filename)
                if info.is_dir() or "__macosx" in info.filename.lower() or p.name.lower() == ".ds_store":
                    continue
                rel = PurePosixPath(*p.parts[1:]) if strip and len(p.parts) > 1 else p
                dst = ext / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as f, open(dst, "wb") as out:
                    shutil.copyfileobj(f, out)
                n += 1
    else:  # rar, 7z, tar...: list first (path check), then let 7z extract into the fresh directory
        n = extract_7z(src, ext)
    types = collections.Counter(p.suffix.lower().lstrip(".") for p in ext.rglob("*") if p.is_file())
    lic = spec.get("license_file")
    rights = dict(spec["usage_rights"])
    rights.setdefault("processing", "local-only")
    rights.setdefault("basis", f"{ver}/extracted/{lic}" if lic else "none in drop")
    rights.setdefault("date", TODAY)
    pj = {"id": spec["id"], "vendor": spec["vendor"], "title": spec["title"], "category": spec["category"],
          "license": spec["license"], "license_source": f"{ver}/extracted/{lic}" if lic else None, "requires": [],
          "current": ver,
          "versions": {ver: {"format": "loose", "extracted_files": n, "file_types": dict(types.most_common()),
                             "added": TODAY,
                             "source": {"type": "google-drive", "drive_id": manifest.get("drop_id"),
                                        "quarantine": qdir.name, "file": spec["zip"]},
                             "usage_rights": rights}}}
    if spec.get("set"):
        pj["set"] = spec["set"]
    if spec.get("notes"):
        pj["notes"] = spec["notes"]
    (root / "pack.json").write_text(json.dumps(pj, indent=2) + "\n")
    return {"id": spec["id"], "files": n, "types": dict(types.most_common(4))}


def main() -> None:
    qdir, spec_path = Path(sys.argv[1]), Path(sys.argv[2])
    manifest = json.loads((qdir / "manifest.json").read_text())
    if not manifest.get("integrity_ok", False):
        sys.exit("manifest integrity_ok is false: not importing")
    for spec in json.loads(spec_path.read_text()):
        r = import_zip(qdir, manifest, spec)
        print(f"{r['id']:<48} {r['files']:>6} files  {r['types']}")


if __name__ == "__main__":
    main()
