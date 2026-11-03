#!/usr/bin/env python3
"""File a finished Pixabay curated run as one library pack (no tagging): moves
assets-local/inbox/pixabay-curated/<playlist>/ into assets-local/packs/pixabay-music-curated/<date>/extracted/<playlist>/,
writes pack.json (licence, rights, per-track source and credit), then rebuilds the catalog.
Usage: python3 -I scripts/assets/pixabay/file-pack.py [date]   (run from the repo root; safe to rerun: merges new playlists)"""
import json, shutil, subprocess, sys, datetime
from pathlib import Path
ROOT = Path.cwd(); INBOX = ROOT / "assets-local/inbox/pixabay-curated"; PACK = ROOT / "assets-local/packs/pixabay-music-curated"
date = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
dest = PACK / date / "extracted"; dest.mkdir(parents=True, exist_ok=True)
for d in sorted(p for p in INBOX.iterdir() if p.is_dir()):
    target = dest / d.name; target.mkdir(exist_ok=True)
    for f in d.iterdir():
        if not (target / f.name).exists(): shutil.move(str(f), target / f.name)
    if not any(d.iterdir()): d.rmdir()
tracks, types = [], {}
for j in sorted(dest.glob("*/*.json")):
    t = json.loads(j.read_text()); audio = j.with_suffix(".mp3")
    if not audio.exists(): continue
    tracks.append({"file": str(audio.relative_to(PACK / date)), "id": t.get("id"), "title": t.get("title"),
                   "page": t.get("page"), "playlist": t.get("playlist"), "downloaded": t.get("downloaded"),
                   "credit": f'"{t.get("title")}" from Pixabay ({t.get("page")})'})
for f in dest.rglob("*"):
    if f.is_file(): types[f.suffix.lstrip(".")] = types.get(f.suffix.lstrip("."), 0) + 1
pack_file = PACK / "pack.json"
pack = json.loads(pack_file.read_text()) if pack_file.exists() else {
    "id": "pixabay-music-curated", "vendor": "pixabay", "title": "Pixabay curated music playlists", "category": "audio",
    "license": "LicenseRef-Pixabay-Content-License", "license_source": "https://pixabay.com/service/license-summary/",
    "requires": [], "versions": {}}
pack["current"] = date
pack["versions"][date] = {
    "format": "mp3", "extracted_files": sum(types.values()), "file_types": types, "added": date,
    "source": {"type": "browser-download", "vendor": "pixabay", "log": "assets-local/inbox/pixabay-curated.log"},
    "usage_rights": {"uses": ["in-game", "derive", "audio-input"], "audience": "private", "redistribution": "none",
        "attribution": "not required; credits page lists each track (#367)",
        "basis": "Pixabay Content License: free use incl. commercial, modify allowed; no sale or distribution of the tracks as they are",
        "confirmed_by": "kevin (chose Pixabay curated playlists, 2026-11-02)", "confirmed_on": date, "processing": "local-only"},
    "tagging": "pending (#364, #355, #357)", "tracks": tracks}
pack_file.write_text(json.dumps(pack, indent=1))
print(f"{len(tracks)} tracks in {len(list(dest.iterdir()))} playlists -> {pack_file}")
subprocess.run([sys.executable, "-I", "scripts/assets/build_catalog.py"], check=True)
