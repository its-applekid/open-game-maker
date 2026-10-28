"""Tag the exported CC3+ maps per C3 at three depths (cards, CAD sidecar, the image) and write validated cards.

usage: scripts/audio/.venv/bin/python -I scripts/maps/tag_maps.py analyse [--workers N]   # sha, thumbnail, CLIP embedding per map
       scripts/audio/.venv/bin/python -I scripts/maps/tag_maps.py cards                   # score labels, write cards, validate

Depth 1 (card): map type, setting, environment, mood, objects (from CAD symbol names), keywords (from map labels), grid,
publication. Depth 2 (sidecar, already written by the export): every symbol and label with coordinates, referenced from
source.files. Depth 3: the PNG itself. Map type comes from the title and folder words first; CLIP ViT-L/14 (MIT, local)
decides only when they say nothing, and its judgments are ranked by lift against the whole map library."""
import argparse, hashlib, json, re, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime
from multiprocessing import Pool
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
COLL_DIR = REPO / "assets-local/inspiration/profantasy-cc3"
MAPS = COLL_DIR / "maps"
ANALYSIS = COLL_DIR / "analysis"
PREVIEWS = REPO / "assets-local"
SCHEMAS = REPO / "docs/research/v0.5/schemas"
CLIP_ID = "openai/clip-vit-large-patch14"
VERSION = "v1"
COLL_ID = f"t1:profantasy-cc3@{VERSION}"
VOCAB = "2026-10-27"
TOOL = "tag_maps@0.1"
NOW = datetime.now().astimezone().isoformat(timespec="seconds")
NOT_MAPS = re.compile(r"(^|/)(Parts|Symbols)/")  # grid templates, altitude keys and symbol catalogues: hash-listed, not carded

MAP_TYPES = {"dungeon": "a top-down dungeon map with rooms and corridors", "cave": "a map of natural caves and caverns",
             "castle": "a floor plan of a castle", "keep": "a floor plan of a fortified keep tower", "temple": "a floor plan of a temple",
             "crypt": "a map of a tomb or crypt", "building": "a floor plan of a house or building",
             "tavern": "a floor plan of a tavern or inn", "town": "a map of a small town or village", "city": "a map of a large city",
             "ship": "a deck plan of a ship or starship", "sewer": "a map of sewers", "mine": "a map of a mine with tunnels",
             "wilderness": "a local area map with forests, fields and roads", "battlemap": "a battle map on a square grid",
             "region": "a world or regional map with mountains, rivers and kingdoms"}
# Title/folder words -> map type, most specific first.
TYPE_WORDS = [("tavern", r"\b(tavern|inn|alehouse|pub)\b"), ("sewer", r"\bsewers?\b"), ("mine", r"\bmines?\b"),
              ("crypt", r"\b(crypts?|tombs?|catacombs?|mausoleums?|barrows?)\b"),
              ("temple", r"\b(temples?|church|cathedral|monastery|abbey|shrine|chapel)\b"), ("keep", r"\b(keep|tower)\b"),
              ("castle", r"\b(castles?|fortress|fort|citadel|stronghold)\b"), ("cave", r"\b(caves?|caverns?|grotto)\b"),
              ("dungeon", r"\b(dungeons?|geomorphs?|lair)\b"), ("ship", r"\b(ships?|starships?|galleon|boat|deck|spaceship)\b"),
              ("city", r"\b(city|cities|metropolis)\b"), ("town", r"\b(towns?|village|hamlet)\b"),
              ("building", r"\b(house|mansions?|manor|shop|hall|villa|palace|building|floorplan)\b"),
              ("region", r"\b(world|worlds|realms?|atlas|continent|islands?|kingdom|overland|region|fractal|star ?charts?|projection|hex)\b")]
ENVIRONMENTS = {"dungeon": "a dungeon", "crypt": "a crypt", "cave": "a cave", "mine": "a mine", "sewer": "a sewer",
                "castle": "a castle", "temple": "a temple", "ruins": "ruins", "graveyard": "a graveyard", "camp": "a camp",
                "town": "a town", "village": "a village", "city": "a city", "interior": "a building interior", "tavern": "a tavern",
                "shop": "a shop", "house": "a house", "farm": "a farm", "forest": "a forest", "jungle": "a jungle",
                "grassland": "grassland", "mountain": "mountains", "snow": "a snowy land", "desert": "a desert", "swamp": "a swamp",
                "beach": "a coast", "ocean": "the sea", "underwater": "an underwater place", "sky": "a sky city",
                "space": "outer space", "space-station": "a space station", "industrial": "an industrial site", "road": "roads",
                "arena": "an arena"}
SETTINGS = {"fantasy": "a fantasy", "medieval": "a medieval", "sci-fi": "a science fiction", "modern": "a modern",
            "post-apocalyptic": "a post-apocalyptic", "western": "a wild west", "pirate": "a pirate", "horror": "a horror",
            "steampunk": "a steampunk"}
MOODS = ["dark", "eerie", "mysterious", "cozy", "cheerful", "calm", "epic"]
SYM_STOP = {"flat", "small", "large", "big", "med", "medium", "shadow", "color", "colour", "top", "var", "alt", "default", "symbol",
            "layer", "new", "left", "right", "half", "full", "dark", "light", "white", "black", "red", "blue", "green", "brown", "grey",
            "gray", "yellow", "and", "the", "with", "block", "bldng", "sheet", "fill", "mask", "base", "copy"}
SYM_STOP |= {"fill", "tool", "circle", "loop", "patch", "vari", "mixed", "marker", "piece", "standard", "tan", "bare", "button", "str",
             "edge", "part", "single", "lrg", "sml", "normal", "background", "lead", "round", "closed", "down", "ornate", "gothic", "rose",
             "varicolor", "symbol", "arched", "lit", "open", "side", "end", "inner", "outer", "corner", "straight", "curved", "style"}
SYM_ALIAS = {"decid": "tree", "fdecid": "tree", "deciduous": "tree", "ftree": "tree", "trees": "tree", "conifer": "pine", "fir": "pine",
             "mtns": "mountain", "mtn": "mountain", "mountains": "mountain", "hills": "hill", "foothill": "hill", "foothills": "hill",
             "rocks": "rock", "woods": "forest", "stonewall": "wall", "bushes": "bush", "shrub": "bush", "esc": "escarpment",
             "leaves": "leaf", "needles": "pine", "scrubland": "scrub"}
STYLE_PREFIX = ("merc", "spd", "msf", "wrt", "ttc", "cosa", "sym", "jr", "mk", "ca", "f", "s", "d")
try:
    DICT = {w.strip().lower() for w in open("/usr/share/dict/american-english", encoding="utf-8", errors="ignore") if w.strip().isalpha()}
except OSError:  # no word list: keep every word, the stop list still applies
    DICT = None
OVERLAND = {"mountain", "hill", "peak", "ridge", "escarpment"}
SETTLEMENT = {"city", "town", "village", "castle"}
FLORA = {"tree", "pine", "bush", "forest", "copse", "jungle", "reed", "heather", "scrub", "palm", "fern", "grass", "weed", "marsh", "swamp"}
INTERIOR = {"door", "window", "wall", "stair", "chair", "table", "bed", "chest", "barrel", "bench", "bookcase", "torch", "sconce", "stool",
            "crate", "pillar", "altar", "throne", "rug", "fireplace"}
LABEL_STOP = {"scale", "feet", "foot", "miles", "mile", "north", "south", "east", "west", "level", "map", "the", "and", "of"}


def maps():
    for png in sorted(MAPS.rglob("*.png")):
        rel = png.relative_to(MAPS).as_posix()
        meta = png.with_suffix(".json")
        if NOT_MAPS.search(rel) or not meta.exists():
            continue
        if json.loads(meta.read_text()).get("ok"):
            yield png


def sidecar(png: Path) -> Path:
    return ANALYSIS / (png.relative_to(MAPS).with_suffix("").as_posix() + ".analysis.json")


_M = None


def clip():
    global _M
    if _M is None:
        import torch
        from transformers import CLIPModel, CLIPProcessor
        torch.set_num_threads(3)
        _M = (CLIPModel.from_pretrained(CLIP_ID).eval(), CLIPProcessor.from_pretrained(CLIP_ID))
    return _M


def analyse(png: Path):
    sc = sidecar(png)
    h = hashlib.sha256(png.read_bytes()).hexdigest()
    if sc.exists() and json.loads(sc.read_text()).get("sha256") == h:
        return {"map": str(png), "status": "skip"}
    try:
        import torch
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None  # our own renders, up to ~100 MP
        im = Image.open(png)
        w, hgt, alpha = im.width, im.height, im.mode in ("RGBA", "LA") or "transparency" in im.info
        im = im.convert("RGB")
        im.thumbnail((1024, 1024))
        key = f"private/previews/{h[:2]}/{h[:16]}-thumb.webp"  # redistribution none: private prefix (C3 §7)
        (PREVIEWS / key).parent.mkdir(parents=True, exist_ok=True)
        im.save(PREVIEWS / key, "WEBP", quality=80)
        def square(x):
            s = max(x.size)
            c = Image.new("RGB", (s, s), "white")
            c.paste(x, ((s - x.width) // 2, (s - x.height) // 2))
            return c
        cw, ch = im.width // 4, im.height // 4
        views = [square(im), square(im.crop((cw, ch, im.width - cw, im.height - ch)))]  # whole map + its centre at 2x detail
        m, p = clip()
        with torch.no_grad():
            e = m.get_image_features(**p(images=views, return_tensors="pt"))
        e = torch.nn.functional.normalize(e, dim=-1)
        res = {"map": png.relative_to(MAPS).as_posix(), "sha256": h, "bytes": png.stat().st_size, "width": w, "height": hgt,
               "has_alpha": bool(alpha), "thumb": key, "clip": {"model": CLIP_ID, "views": ["whole", "centre"],
                                                                 "embeddings": [[round(float(v), 5) for v in x] for x in e]}}
    except Exception as ex:
        return {"map": str(png), "status": "fail", "error": f"{type(ex).__name__}: {ex}"[:300]}
    sc.parent.mkdir(parents=True, exist_ok=True)
    sc.with_name(sc.name + ".part").write_text(json.dumps(res))
    sc.with_name(sc.name + ".part").rename(sc)
    return {"map": str(png), "status": "ok"}


def kebab(s):
    return re.sub(r"[^a-z0-9/]+", "-", s.lower()).strip("-").replace("/-", "/").replace("-/", "/")


def tag(s):
    t = kebab(s).replace("/", "-")[:40].strip("-")
    return t if re.fullmatch(r"[a-z][a-z0-9-]*", t) else None


def noun(w):
    """One CAD symbol-name word -> an English noun, or None. Strips vendor style prefixes (mercTree, spdHouse)."""
    w = SYM_ALIAS.get(w, w)
    if DICT is not None and w not in DICT:
        for pre in STYLE_PREFIX:
            if w.startswith(pre) and len(w) - len(pre) >= 3 and SYM_ALIAS.get(w[len(pre):], w[len(pre):]) in DICT | set(SYM_ALIAS.values()):
                w = SYM_ALIAS.get(w[len(pre):], w[len(pre):])
                break
        else:
            return None
    w = w[:-1] if w.endswith("s") and not w.endswith("ss") and (DICT is None or w[:-1] in DICT) else w
    return None if w in SYM_STOP or len(w) < 3 else w


def symbol_counts(symbols):
    c = Counter()
    for s in symbols:
        name = re.sub(r"^CA\d+_", "", s.get("name") or "")
        for w in re.findall(r"[A-Za-z][a-z]+|[A-Z]{3,}(?![a-z])|[a-z]{3,}", name.replace("_", " ")):
            n = noun(w.lower())
            if n:
                c[n] += 1
    return c


def symbol_objects(symbols):
    return [w for w, _ in symbol_counts(symbols).most_common(12)]


def symbol_type(c: Counter):
    """Map type from what the CAD symbols depict, when the title says nothing: mountains + settlements = region."""
    total = sum(c.values())
    if total < 20:
        return None
    over, sett, flora, inner = (sum(c[w] for w in S) for S in (OVERLAND, SETTLEMENT, FLORA, INTERIOR))
    if over >= 5 and sett >= 1:
        return "region"
    if flora / total >= 0.6 and inner / total < 0.1:
        return "wilderness"
    return None


def label_keywords(labels):
    c = Counter()
    for l in labels:
        for w in re.findall(r"[A-Za-z][A-Za-z']{3,}", l.get("text", "")):
            w = w.lower().replace("'", "")
            if w not in LABEL_STOP and tag(w):
                c[w] += 1
    return [w for w, _ in c.most_common(12)]


def publication(rel: str):
    parts = rel.split("/")
    return parts[-2] if len(parts) > 1 else "CC3+ examples"


def text_type(rel: str):
    words = (rel.replace("_", " ").replace("-", " ")).lower()
    for t, rx in TYPE_WORDS:
        if re.search(rx, words):
            return t
    return None


def cards():
    import torch
    from transformers import CLIPModel, CLIPProcessor
    rows = [json.loads(p.read_text()) for p in sorted(ANALYSIS.rglob("*.analysis.json"))]
    m, p = CLIPModel.from_pretrained(CLIP_ID).eval(), CLIPProcessor.from_pretrained(CLIP_ID)
    sets = {"map_type": (list(MAP_TYPES), list(MAP_TYPES.values())),
            "environments": (list(ENVIRONMENTS), [f"a map of {v}" for v in ENVIRONMENTS.values()]),
            "settings": (list(SETTINGS), [f"{v} map" for v in SETTINGS.values()]),
            "moods": (MOODS, [f"a {x} looking map" for x in MOODS])}
    with torch.no_grad():
        T = {k: torch.nn.functional.normalize(m.get_text_features(**p(text=v[1], return_tensors="pt", padding=True)), dim=-1).numpy()
             for k, v in sets.items()}
        scale = float(m.logit_scale.exp())
    for r in rows:
        E = np.array(r["clip"]["embeddings"], dtype=np.float32)
        r["_p"] = {}
        for k in sets:
            z = scale * E @ T[k].T
            z = np.exp(z - z.max(1, keepdims=True))
            r["_p"][k] = (z / z.sum(1, keepdims=True)).mean(0)
    mean = {k: np.mean([r["_p"][k] for r in rows], 0) for k in sets}
    seen, dups, written = {}, [], 0
    outdir = COLL_DIR / "cards"
    type_counts = Counter()
    for r in sorted(rows, key=lambda r: (r["map"].startswith("Source Maps"), r["map"])):  # keep the non-"Source Maps" copy of duplicates
        if r["sha256"] in seen:
            dups.append((r["map"], seen[r["sha256"]]))
            continue
        rel = r["map"]
        png = MAPS / rel
        meta = json.loads(png.with_suffix(".json").read_text())
        ents_path = png.with_name(png.stem + ".entities.json")
        ents = json.loads(ents_path.read_text()) if ents_path.exists() else {"symbols": [], "labels": []}
        lift = {k: r["_p"][k] / mean[k] for k in sets}
        names = lambda k: sets[k][0]
        tt = text_type(rel) or symbol_type(symbol_counts(ents["symbols"]))
        ci = int(np.argmax(lift["map_type"]))
        map_type = tt or names("map_type")[ci]
        type_conf = round(float(min(0.9, 0.4 + r["_p"]["map_type"][ci])), 2)
        envs = [names("environments")[i] for i in np.argsort(-lift["environments"])[:2] if lift["environments"][i] >= 1.5]
        if map_type in ENVIRONMENTS and map_type not in envs:
            envs = [map_type] + envs[:1]
        settings = [names("settings")[i] for i in np.argsort(-lift["settings"])[:1] if lift["settings"][i] >= 1.3] or ["fantasy"]
        moods = [names("moods")[i] for i in np.argsort(-lift["moods"])[:2] if lift["moods"][i] >= 1.3]
        objects = symbol_objects(ents["symbols"])
        keywords = label_keywords(ents["labels"])
        g = meta.get("grid") or {}
        title = re.sub(r"\s+", " ", png.stem.replace("_", " ")).strip()[:120]
        bits = []
        if g.get("type") in ("square", "hex") and g.get("spacing"):
            bits.append(f"{g['spacing']:g} {meta.get('units', {}).get('name', 'unit')} {g['type']} grid")
        bits.append(f"{len(ents['symbols'])} symbols")
        if objects:
            bits.append("mostly " + ", ".join(objects[:3]))
        if ents["labels"]:
            bits.append(f"{len(ents['labels'])} labels")
        desc = f"{map_type.capitalize()} map '{title}' from {publication(rel)}: {'; '.join(bits)}."
        if len(desc) > 300:
            desc = desc[:297] + "..."
        files = [{"path": f"maps/{rel}", "sha256": "sha256:" + r["sha256"], "bytes": r["bytes"], "format": "png", "role": "primary"}]
        for extra in (png.with_suffix(".json"), ents_path):
            if extra.exists():
                files.append({"path": f"maps/{extra.relative_to(MAPS).as_posix()}", "sha256": "sha256:" + hashlib.sha256(extra.read_bytes()).hexdigest(),
                              "bytes": extra.stat().st_size, "format": "json", "role": "metadata"})
        mapb = {"map_type": map_type, "publication": publication(rel)[:120], "levels_shown": 1,
                "site": kebab(png.stem).replace("/", "-")[:60].strip("-") or "map", "layout_spec": {"status": "pending"}}
        if g.get("px_per_cell") and g.get("export_cols"):
            mapb["grid_detected"] = {"cell_px": g["px_per_cell"], "cols": g["export_cols"], "rows": g["export_rows"],
                                     "confidence": 0.95 if g.get("source") != "inferred" else 0.7}
        describe = {"description": desc, "objects": [o for o in objects if tag(o)], "environments": envs, "settings": settings,
                    "roles": ["layout-reference"]}
        if moods:
            describe["moods"] = moods
        if keywords:
            describe["keywords"] = keywords
        prov = {"*": {"by": "code", "tool": TOOL, "at": NOW, "input": "PNG header, sha256, CC3+ export metadata"},
                "describe": {"by": "model", "model": CLIP_ID, "tool": TOOL, "at": NOW, "confidence": 0.55,
                             "input": "CLIP on the whole map and its centre vs environment/setting/mood prompts, lift vs library"},
                "describe.objects": {"by": "code", "tool": TOOL, "at": NOW, "input": "CAD symbol names from the DXF export (depth 2 sidecar)"},
                "describe.keywords": {"by": "code", "tool": TOOL, "at": NOW, "input": "words of the map's own text labels"},
                "describe.description": {"by": "code", "tool": TOOL, "at": NOW, "input": "template from map type, grid and CAD counts"},
                "map": {"by": "code", "tool": TOOL, "at": NOW, "input": "export JSON grid + folder name"}}
        if tt:
            prov["map.map_type"] = {"by": "filename" if text_type(rel) else "code", "tool": TOOL, "at": NOW,
                                    "input": "title and folder words" if text_type(rel) else "CAD symbol mix (relief + settlements, or mostly flora)"}
        else:
            prov["map.map_type"] = {"by": "model", "model": CLIP_ID, "tool": TOOL, "at": NOW, "confidence": type_conf,
                                    "input": "CLIP map-type prompts, lift vs library; no type word in title or folder"}
        flags = ["low-confidence"] if not tt and type_conf < 0.6 else []
        card = {"schema": "ogm.asset-card/1.0", "vocab": VOCAB, "id": f"t1:profantasy-cc3/{kebab(Path(rel).with_suffix('').as_posix())}@{VERSION}",
                "card_type": "asset", "status": "tagged", "title": title, "kind": "inspiration", "subkind": "map", "collection": COLL_ID,
                "source": {"files": files, "content_hash": "sha256:" + r["sha256"]}, "previews": {"thumb": r["thumb"]},
                "describe": describe, "image": {"width_px": r["width"], "height_px": r["height"], "has_alpha": r["has_alpha"],
                                                "indexed_colors": None, "pixel_art": False},
                "map": mapb, "provenance": prov}
        if flags:
            card["flags"] = flags
        out = outdir / (kebab(Path(rel).with_suffix("").as_posix()) + ".card.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(card, indent=1) + "\n")
        seen[r["sha256"]] = card["id"]
        type_counts[map_type] += 1
        written += 1
    (COLL_DIR / "duplicates.json").write_text(json.dumps([{"duplicate": d, "same_as": k} for d, k in dups], indent=1) + "\n")
    write_collection(written, type_counts)
    print(json.dumps({"analysed": len(rows), "cards": written, "duplicates": len(dups), "map_types": dict(type_counts.most_common())}))
    cardsf = sorted(str(x) for x in outdir.rglob("*.card.json"))
    rr = subprocess.run(["node", str(SCHEMAS / "tools/validate.mjs"), str(SCHEMAS), str(COLL_DIR / "collection.card.json"), *cardsf],
                        capture_output=True, text=True)
    fails = [l for l in rr.stdout.splitlines() if l.startswith("FAIL")]
    print(json.dumps({"validated": len(cardsf), "fail_lines": len(fails), "rc": rr.returncode}))
    for l in fails[:20]:
        print(l)


def write_collection(n, type_counts):
    """Rights: Kevin's 2026-10-26 decision (inspiration only). The EULA reading is not yet confirmed, so the strict default
    applies and effective rights are vision-input only; confirming the licence entry unlocks derive-layout."""
    lic = {"type": "license", "license": "LicenseRef-profantasy-eula", "ref": "ProFantasy EULA shipped with the CC3+ installers",
           "uses": ["derive-layout", "style-reference", "vision-input"], "audience": "private", "redistribution": "none", "attribution": None,
           "set_by": {"role": "intake-code"}, "date": "2026-10-28",
           "note": "Proposed ceiling for a purchased product used privately. Needs Kevin's confirmation of the EULA reading (confirmed_by)."}
    default = {"type": "default", "uses": ["vision-input"], "audience": "private", "redistribution": "none", "set_by": {"role": "intake-code"},
               "date": "2026-10-28"}
    decision = {"type": "decision", "uses": ["derive-layout", "vision-input"], "audience": "private", "redistribution": "none",
                "set_by": {"role": "admin", "name": "kevin"}, "date": "2026-10-26",
                "note": "Inspiration only: agents learn layouts; images and symbols never used in a game, not even as placeholders (C2 §9)."}
    files_total = sum(1 for f in MAPS.rglob("*") if f.is_file())
    card = {"schema": "ogm.asset-card/1.0", "vocab": VOCAB, "id": COLL_ID, "card_type": "collection", "status": "tagged",
            "title": "Campaign Cartographer 3+ maps (ProFantasy)", "license": "LicenseRef-profantasy-eula",
            "rights": {"uses": ["vision-input"], "audience": "private", "redistribution": "none", "attribution": None,
                       "basis": [lic, default, decision]},
            "describe": {"description": "Every map shipped with Kevin's CC3+ bundle (examples, Cartographer's Annual issues, castles, temples, cities), exported to PNG with grid scale and CAD symbol/label sidecars.",
                         "environments": ["dungeon", "castle", "temple", "city", "town"], "settings": ["fantasy", "medieval", "sci-fi"],
                         "roles": ["layout-reference"]},
            "collection_info": {"vendor": "profantasy", "version": VERSION, "origin": "vendor-pack", "counts": {"inspiration/map": n},
                                "creation_choice": False, "files_total": files_total},
            "provenance": {"*": {"by": "code", "tool": TOOL, "at": NOW},
                           "rights": {"by": "license", "tool": TOOL, "at": NOW, "input": "proposed licence + strict default + Kevin's decision"},
                           "describe": {"by": "code", "tool": TOOL, "at": NOW, "input": "folder list"}}}
    (COLL_DIR / "collection.card.json").write_text(json.dumps(card, indent=1) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["analyse", "cards"])
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    if a.step == "analyse":
        jobs = list(maps())
        jobs = jobs[:a.limit] if a.limit else jobs
        print(json.dumps({"maps": len(jobs)}), flush=True)
        c = Counter()
        with Pool(a.workers) as pool:
            for r in pool.imap_unordered(analyse, jobs):
                c[r["status"]] += 1
                if r["status"] == "fail":
                    print(json.dumps(r), flush=True)
        print(json.dumps({"done": dict(c)}), flush=True)
    else:
        cards()


if __name__ == "__main__":
    main()
