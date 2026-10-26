"""Split the Kenney All-in-1 bundle into assets-local/packs/kenney-<slug>/ and stash the launcher."""
import json, re, shutil, stat, sys, zipfile
from pathlib import Path, PurePosixPath

DL = Path.home() / "Downloads"
ROOT = Path.home() / "games/open-game-maker-2000/assets-local"
TODAY = "2026-10-26"
BUNDLE_ID, BUNDLE_VER = "kenney-all-in-1", "3.7.0"
BUNDLE_ZIP = "Kenney Game Assets All-in-1 3.7.0.zip"
LAUNCHER_ZIP = "Kenney Game Assets All-in-1-3.4.0 (Linux).zip"

# Folder -> (category slug, id suffix). Archive/Early access hold old or unfinished copies whose
# names collide with current packs, so they get a suffix.
CATS = {
    "2D assets": ("2d", ""), "3D assets": ("3d", ""), "Audio": ("audio", ""), "Icons": ("icons", ""),
    "UI assets": ("ui", ""), "Other": ("other", ""),
    "Archive": ("archive", "-archive"), "Early access": ("early-access", "-early-access"),
}


def slug(s: str) -> str:
    s = s.replace("×", "x").replace("&", "and").replace("+", "plus")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def safe(rel: str) -> PurePosixPath:
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts:
        sys.exit(f"unsafe path in archive: {rel}")
    return p


def read_license(pack_dir: Path):
    lic = next((f for f in pack_dir.glob("[Ll]icense*.txt")), None)
    if not lic:
        return None, None
    text = lic.read_text(errors="replace")
    ver = re.search(r"\(([\d.]+)\)", text)
    spdx = "CC0-1.0" if "CC0" in text or "publicdomain/zero" in text else "unknown"
    return spdx, ver.group(1) if ver else None


def counts(root: Path):
    c = {}
    for f in root.rglob("*"):
        if f.is_file():
            ext = f.suffix.lower().lstrip(".") or "(none)"
            c[ext] = c.get(ext, 0) + 1
    return dict(sorted(c.items(), key=lambda kv: -kv[1]))


bdir = ROOT / "bundles" / BUNDLE_ID / BUNDLE_VER
staging = bdir / "extracted"
if not staging.exists():
    with zipfile.ZipFile(DL / BUNDLE_ZIP) as z:
        for i in z.infolist():
            safe(i.filename)
        z.extractall(staging)

packs, seen = [], set()
for cat_dir, (cat, suffix) in CATS.items():
    for pack_dir in sorted(p for p in (staging / cat_dir).iterdir() if p.is_dir()):
        pid = f"kenney-{slug(pack_dir.name)}{suffix}"
        if pid in seen:
            sys.exit(f"id collision: {pid}")
        seen.add(pid)
        spdx, pver = read_license(pack_dir)
        ver = pver or BUNDLE_VER
        pdir = ROOT / "packs" / pid
        ext = pdir / ver / "extracted"
        ext.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(pack_dir, ext)
        preview = ext / "Preview.png"
        if preview.exists():
            shutil.copy2(preview, pdir / "icon.png")
        manifest = {
            "id": pid,
            "vendor": "kenney",
            "title": pack_dir.name,
            "category": cat,
            "license": spdx or "unknown",
            "requires": [],
            "versions": {ver: {
                "format": "bundle",
                "bundle": f"{BUNDLE_ID}@{BUNDLE_VER}",
                "bundle_path": f"{cat_dir}/{pack_dir.name}",
                "extracted_files": sum(counts(ext).values()),
                "file_types": counts(ext),
                "added": TODAY,
            }},
            "current": ver,
        }
        (pdir / "pack.json").write_text(json.dumps(manifest, indent=2) + "\n")
        packs.append(pid)
        if manifest["license"] != "CC0-1.0":
            print(f"LICENSE CHECK: {pid} -> {manifest['license']}", flush=True)

# What is left in staging (Readme, Overview.html, assets.json, Goodies, empty category dirs) stays with the bundle.
for d in sorted(staging.iterdir()):
    if d.is_dir() and not any(d.iterdir()):
        d.rmdir()
orig = bdir / "originals"
orig.mkdir(exist_ok=True)
shutil.move(DL / BUNDLE_ZIP, orig / BUNDLE_ZIP)
(ROOT / "bundles" / BUNDLE_ID / "bundle.json").write_text(json.dumps({
    "id": BUNDLE_ID, "vendor": "kenney", "title": "Kenney Game Assets All-in-1",
    "current": BUNDLE_VER, "versions": {BUNDLE_VER: {"originals": [BUNDLE_ZIP], "packs": packs, "added": TODAY}},
}, indent=2) + "\n")

# Launcher: a tool, not assets.
tdir = ROOT / "tools" / "kenney-launcher" / "3.4.0"
tdir.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(DL / LAUNCHER_ZIP) as z:
    for i in z.infolist():
        safe(i.filename)
    z.extractall(tdir)
for f in tdir.glob("*.AppImage"):
    f.chmod(f.stat().st_mode | stat.S_IXUSR)
(DL / LAUNCHER_ZIP).unlink()
print(f"{len(packs)} kenney packs; launcher in {tdir}")
