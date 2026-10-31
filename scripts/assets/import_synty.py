"""Move Synty downloads into assets-local/packs/<pack-id>/ and extract them."""
import json, os, shutil, sys, tarfile, zipfile
from datetime import date
from pathlib import Path, PurePosixPath

DL = Path.home() / "Downloads"
LIB = Path.home() / "games/open-game-maker-2000/assets-local/packs"
TODAY = date.today().isoformat()

# pack-id, title, version, archive (source of truth), format, icon, extra files, requires
PACKS = [
    ("synty-animation-goblin-locomotion", "ANIMATION - Goblin Locomotion", "v2",
     "ANIMATION_Goblin_Locomotion_SourceFiles_v2.zip", "source-zip", "ANIMATION_Goblin_Locomotion_ICON.png", [], []),
    ("synty-interface-apocalypse-hud", "INTERFACE - Apocalypse HUD", "v3",
     "INTERFACE_Apocalypse_HUD_Source_Sprites_v3.zip", "source-zip", "INTERFACE_Apocalypse_HUD_ICON.png", [], []),
    ("synty-polygon-generic", "POLYGON - Generic", "v3",
     "POLYGON_Generic_SourceFiles_v3.zip", "source-zip", None, [], []),
    ("synty-polygon-goblin-war-camp", "POLYGON - Goblin War Camp", "v3",
     "POLYGON_Goblin_War_Camp_SourceFiles_v3.zip", "source-zip", "POLYGON_Goblin_War_Camp_ICON.png", [], []),
    ("synty-polygon-nature-biomes-alpine-mountain", "POLYGON - Nature Biomes: Alpine Mountain", "v3",
     "POLYGON_NatureBiomes_AlpineMountain_SourceFiles_v3.zip", "source-zip", "POLYGON_NatureBiomes_AlpineMountain_ICON.png", [], []),
    ("synty-polygon-particle-fx", "POLYGON - Particle FX", "1.4.1",
     "POLYGON_Particle_FX_Unity_2022_3_v1_4_1.unitypackage", "unitypackage", None, [], []),
    ("synty-polygon-prototype", "POLYGON - Prototype", "v4",
     "POLYGON_Prototype_SourceFiles_v4.zip", "source-zip", "POLYGON_Prototype_ICON.png", [], []),
    ("synty-polygon-shopping-plaza-map", "POLYGON - Shopping Plaza Map", "v2",
     "POLYGON_Shopping_Plaza_Map_SourceFiles_v2.zip", "source-zip", "POLYGON_Shopping_Plaza_Map_ICON.png.png",
     ["Read_Me_Shopping_Plaza_Map.txt"], ["synty-polygon-shops"]),
    ("synty-polygon-shops", "POLYGON - Shops", "v5",
     "POLYGON_Shops_SourceFiles_v5.zip", "source-zip", "POLYGON_Shops_ICON.png", [], []),
    ("synty-polygon-viking-realm", "POLYGON - Viking Realm", "v3",
     "POLYGON_Viking_Realm_SourceFiles_v3.zip", "source-zip", "POLYGON_Viking_Realm_ICON.png", [], []),
    ("synty-sidekick-goblin-fighters", "SIDEKICK - Goblin Fighters", "1.0.4",
     "SIDEKICK_Goblin_Fighters_Unity_2021_3_v1_0_4.unitypackage", "unitypackage", "SIDEKICK_Goblin_Fighters_ICON.png", [], []),
    ("synty-simple-buildings", "SIMPLE - Buildings", "v1",
     "SIMPLE_Buildings_SourceFiles.zip", "source-zip", "SIMPLE_Buildings_ICON.png", [], []),
    ("synty-simple-props-items-icons", "SIMPLE - Props, Items & Icons", "v2",
     "SIMPLE_Props_Items_Icons_Source_Files_v2.zip", "source-zip", "SIMPLE_Props_Items_Icons.png", [], []),
]

# Top-level folders Synty wraps some archives in; stripped so every extracted/ starts at the content.
WRAPPERS = {"SourceFiles", "Source_Sprites", "Source_Files"}


def safe(rel: str) -> PurePosixPath:
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts:
        sys.exit(f"unsafe path in archive: {rel}")
    return p


def strip_wrapper(paths):
    tops = {p.parts[0] for p in paths if p.parts}
    if len(tops) == 1 and next(iter(tops)) in WRAPPERS:
        return lambda p: PurePosixPath(*p.parts[1:])
    return lambda p: p


def extract_zip(src: Path, dest: Path) -> int:
    with zipfile.ZipFile(src) as z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        strip = strip_wrapper([safe(i.filename) for i in infos])
        for i in infos:
            out = dest / strip(safe(i.filename))
            out.parent.mkdir(parents=True, exist_ok=True)
            with z.open(i) as r, open(out, "wb") as w:
                shutil.copyfileobj(r, w)
    return len(infos)


def extract_unitypackage(src: Path, dest: Path) -> int:
    """A .unitypackage is a tar.gz of <guid>/{pathname,asset}; rebuild real paths, drop Unity .meta."""
    tmp = dest.parent / ".unpack"
    with tarfile.open(src, "r:gz") as t:
        t.extractall(tmp, filter="data")  # one sequential pass; filter rejects links/traversal
    n = 0
    for g in tmp.rglob("pathname"):
        asset = g.parent / "asset"
        if not asset.exists():
            continue
        rel = safe(g.read_text().splitlines()[0].removeprefix("Assets/"))
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(asset, out)
        n += 1
    shutil.rmtree(tmp)
    return n


def counts(root: Path):
    c = {}
    for f in root.rglob("*"):
        if f.is_file():
            ext = f.suffix.lower().lstrip(".") or "(none)"
            c[ext] = c.get(ext, 0) + 1
    return dict(sorted(c.items(), key=lambda kv: -kv[1]))


for pid, title, ver, archive, fmt, icon, extras, requires in PACKS:
    pdir = LIB / pid
    vdir = pdir / ver
    orig, ext = vdir / "originals", vdir / "extracted"
    if ext.exists():
        print(f"skip {pid}: already extracted")
        continue
    orig.mkdir(parents=True, exist_ok=True)
    src = DL / archive
    n = (extract_zip if fmt == "source-zip" else extract_unitypackage)(src, ext)
    shutil.move(src, orig / archive)
    for x in extras:
        shutil.move(DL / x, orig / x)
    if icon:
        shutil.move(DL / icon, pdir / "icon.png")
    manifest = {
        "id": pid,
        "vendor": "synty",
        "title": title,
        "license": "synty-personal",  # Synty standard EULA, personal purchase: never commit or redistribute raw files
        "requires": requires,
        "versions": {ver: {
            "format": fmt,
            "originals": [archive, *extras],
            "extracted_files": n,
            "file_types": counts(ext),
            "added": TODAY,
        }},
        "current": ver,
    }
    (pdir / "pack.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{pid}@{ver}: {n} files", flush=True)
