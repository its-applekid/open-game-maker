"""SmallScaleInt layout discovery, semantic cards, local sheets, and Unity extraction.

The vendor trees are deliberately not normalized: this reader recognizes their
sheet, direction-folder, facing-suffix, and numbered-sequence conventions while
keeping source bytes in place. Licensed output stays below ``assets-local``.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import html
import json
import os
import re
import shutil
import struct
import sys
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from smallscaleint_unity import extract_unitypackage

DIRECTIONS = ("E", "N", "NE", "NW", "S", "SE", "SW", "W")
TOOL = "smallscaleint-layout@0.1"
NOW = datetime.now().astimezone().isoformat(timespec="seconds")
SAFE_ID = re.compile(r"[^a-z0-9]+")
NUMBER = re.compile(r"(\d+)")
FACING = re.compile(r"^(.*)_(NE|NW|SE|SW|E|N|S|W)$", re.IGNORECASE)

PACKS = (
    "smallscaleint-2d-animals-mega-pack-1", "smallscaleint-2d-character-knight",
    "smallscaleint-2d-character-pack-1", "smallscaleint-2d-character-pack-2",
    "smallscaleint-2d-demons-topdown-assetpack", "smallscaleint-2d-desert-fantasy-tileset",
    "smallscaleint-2d-hd-barbarian-pack-1", "smallscaleint-2d-hd-character-knight",
    "smallscaleint-2d-hd-character-pack-1", "smallscaleint-2d-hd-enemy-pack-1",
    "smallscaleint-2d-hd-undead-pack-1", "smallscaleint-2d-hd-zombie-individual-sprites",
    "smallscaleint-2d-hd-zombie-interior-tiles", "smallscaleint-2d-hd-zombie-pack-1",
    "smallscaleint-2d-hd-zombie-rural-tileset", "smallscaleint-2d-orcs-and-goblins-topdown",
    "smallscaleint-2d-projectiles-character-pack-1", "smallscaleint-2d-projectiles-character-pack-2",
    "smallscaleint-2d-topdown-archer-character", "smallscaleint-2d-zombie-pack-2-top-down",
    "smallscaleint-fantasy-tileset-2d-isometric", "smallscaleint-free-character-16-bit-thug-outlined",
    "smallscaleint-free-character-hd-survivor-w-bike", "smallscaleint-knight-demo-character",
    "smallscaleint-projectiles-2d-hd-character-pack-1", "smallscaleint-projectiles-barbarian-pack-hd",
)
MODERN = {
    "smallscaleint-2d-hd-enemy-pack-1", "smallscaleint-2d-hd-zombie-individual-sprites",
    "smallscaleint-2d-hd-zombie-interior-tiles", "smallscaleint-2d-hd-zombie-pack-1",
    "smallscaleint-2d-hd-zombie-rural-tileset", "smallscaleint-2d-zombie-pack-2-top-down",
    "smallscaleint-free-character-16-bit-thug-outlined", "smallscaleint-free-character-hd-survivor-w-bike",
}
CREATURES = {"smallscaleint-2d-animals-mega-pack-1"}
def slug(value: str) -> str:
    return SAFE_ID.sub("-", value.lower()).strip("-") or "asset"


def natural(path: Path) -> tuple:
    return tuple(int(part) if part.isdigit() else part.lower() for part in NUMBER.split(path.name))
def world_for(pack_id: str) -> str:
    if pack_id in CREATURES:
        return "creatures"
    return "modern-zombie" if pack_id in MODERN else "fantasy"


def decorate_collection(card: dict, pack_id: str, pack_dir: Path | None = None) -> dict:
    """Add the canonical set, world, and local illustration references to one collection card."""
    if pack_id not in PACKS:
        return card
    card["describe"].update(style_family="isometric-2d", set="smallscaleint", world=world_for(pack_id))
    for field, value in (("style_family", "canonical family"), ("set", "curated set"), ("world", "ticket taxonomy")):
        card["provenance"][f"describe.{field}"] = {
            "by": "code", "tool": TOOL, "at": NOW, "input": value,
        }
    world = world_for(pack_id)
    card["previews"] = {
        **card.get("previews", {}),
        "specimen": f"packs/{pack_id}/specimen.png",
        "diorama": f"sets/smallscaleint/diorama.{world}.256.png",
        "loop": f"sets/smallscaleint/diorama.{world}.256.gif",
    }
    for field in ("specimen", "diorama", "loop"):
        card["provenance"][f"previews.{field}"] = {
            "by": "code", "tool": "thumbnail-scene@0.1", "at": NOW, "input": "deterministic local render",
        }
    manifest = None
    if pack_dir is not None:
        manifest_path = pack_dir / "store" / "media.json"
        try:
            manifest = json.loads(manifest_path.read_text())
        except FileNotFoundError:
            pass
    if manifest is not None:
        fallback = manifest.get("selected_fallback")
        media_paths = {item.get("path") for item in manifest.get("media", []) if isinstance(item, dict)}
        valid_fallback = (
            isinstance(fallback, str)
            and fallback not in (".", "..")
            and Path(fallback).name == fallback
            and fallback in media_paths
            and (manifest_path.parent / fallback).is_file()
        )
        if manifest.get("pack_id") != pack_id or not valid_fallback:
            raise ValueError(f"invalid store media manifest for {pack_id}")
        card["previews"]["store"] = f"packs/{pack_id}/store/{fallback}"
        card["provenance"]["previews.store"] = {
            "by": "vendor-metadata", "tool": "thumbnail-scene@0.1", "at": NOW,
            "input": f"packs/{pack_id}/store/media.json",
        }
    if card.get("flags") == ["missing-preview"]:
        card.pop("flags")
    return card


def png_info(path: Path) -> tuple[int, int, bool]:
    data = path.read_bytes()
    head = data[:29]
    if len(head) < 29 or head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        raise ValueError(f"not a PNG: {path}")
    width, height = struct.unpack(">II", head[16:24])
    return width, height, head[25] in (4, 6) or b"tRNS" in data


def extracted_dir(pack_dir: Path) -> tuple[Path, str]:
    manifest = pack_dir / "pack.json"
    if manifest.exists():
        version = json.loads(manifest.read_text())["current"]
    else:
        versions = sorted(path.name for path in pack_dir.iterdir() if (path / "extracted").is_dir())
        if not versions:
            raise ValueError(f"no extracted version below {pack_dir}")
        version = versions[-1]
    return pack_dir / version / "extracted", version


def source(ext: Path, path: Path, primary: bool = False) -> dict:
    data = path.read_bytes()
    return {
        "path": path.relative_to(ext).as_posix(),
        "sha256": f"sha256:{hashlib.sha256(data).hexdigest()}",
        "bytes": len(data),
        "format": path.suffix.lower().lstrip("."),
        "role": "primary" if primary else "companion",
    }


def measured_card(collection: dict, ext: Path, rel_id: str, title: str, subkind: str, paths: list[Path], sprite: dict) -> dict:
    unique = sorted(set(paths), key=lambda path: path.relative_to(ext).as_posix().lower())
    files = [source(ext, path, index == 0) for index, path in enumerate(unique)]
    width, height, alpha = png_info(unique[0])
    describe = {key: collection.get("describe", {}).get(key) for key in ("style_family", "set", "world")}
    describe = {key: value for key, value in describe.items() if value}
    return {
        "schema": collection["schema"], "vocab": collection["vocab"],
        "id": f"t1:{collection['id'].split(':', 1)[1].split('@', 1)[0]}/{rel_id}@{collection['id'].rsplit('@', 1)[1]}",
        "card_type": "asset", "status": "measured", "title": title,
        "kind": "sprite", "subkind": subkind, "collection": collection["id"],
        "source": {"files": files, "content_hash": files[0]["sha256"]},
        **({"describe": describe} if describe else {}),
        "image": {"width_px": width, "height_px": height, "has_alpha": alpha, "pixel_art": True},
        "sprite": {"drawn_view": "iso", **sprite},
        "provenance": {"*": {"by": "code", "tool": TOOL, "at": NOW, "input": "vendor folders, PNG IHDR, and Unity animation metadata"}},
    }


def animation_rates(ext: Path) -> dict[str, float]:
    rates: dict[str, set[float]] = defaultdict(set)
    for path in ext.rglob("*.anim"):
        match = re.search(r"(?:m_SampleRate|sampleRate):\s*([0-9]+(?:\.[0-9]+)?)", path.read_text(errors="replace"))
        if match:
            rates[slug(path.stem)].add(float(match.group(1)))
    return {name: next(iter(values)) for name, values in rates.items() if len(values) == 1}


def sheet_entries(ext: Path) -> dict[tuple[str, str], list[tuple[str, Path]]]:
    found: dict[tuple[str, str], list[tuple[str, Path]]] = defaultdict(list)
    for path in ext.rglob("*.png"):
        parts = path.relative_to(ext).parts
        indices = [index for index, part in enumerate(parts) if slug(part) == "spritesheets"]
        if not indices:
            continue
        tail = list(parts[indices[-1] + 1 :])
        if len(tail) < 2:
            continue
        variant = "shadowless"
        if slug(tail[0]) in ("with-shadow", "withshadow", "shadow"):
            variant, tail = "shadow", tail[1:]
        elif slug(tail[0]) in ("shadowless", "without-shadow", "withoutshadow"):
            tail = tail[1:]
        if len(tail) >= 2:
            found[(slug(tail[-2]), slug(Path(tail[-1]).stem))].append((variant, path))
    return found


def frame_groups(ext: Path) -> dict[tuple[str, str], dict[str, list[Path]]]:
    groups: dict[tuple[str, str], dict[str, list[Path]]] = defaultdict(dict)
    for directory in ext.rglob("*"):
        direction = directory.name.upper()
        relative_parts = directory.relative_to(ext).parts
        if not directory.is_dir() or direction not in DIRECTIONS or "spritesheets" in {slug(part) for part in relative_parts}:
            continue
        frames = sorted((path for path in directory.glob("*.png") if NUMBER.search(path.stem)), key=natural)
        if not frames or len(relative_parts) < 3:
            continue
        groups[(slug(directory.parent.parent.name), slug(directory.parent.name))][direction] = frames
    return groups


def character_cards(collection: dict, ext: Path, rates: dict[str, float]) -> tuple[list[dict], set[Path]]:
    sheets = sheet_entries(ext)
    frames, consumed = frame_groups(ext), set()
    character_names: dict[str, str] = {}
    for (character, _), entries in sheets.items():
        character_names[character] = entries[0][1].parent.name
    for (character, _), directions in frames.items():
        if len(directions) >= 4 or any(key[0] == character for key in sheets):
            character_names.setdefault(character, next(iter(directions.values()))[0].parents[2].name)
    cards = []
    for character in sorted(character_names):
        actions = sorted({action for char, action in set(sheets) | set(frames) if char == character})
        animations, paths = [], []
        for action in actions:
            action_sheets = sheets.get((character, action), [])
            direction_files = frames.get((character, action), {})
            if not action_sheets and len(direction_files) < 4:
                continue
            consumed.update(path for files in direction_files.values() for path in files)
            sample = next(iter(direction_files.values()))[0] if direction_files else None
            frame_w = png_info(sample)[0] if sample else None
            frame_h = png_info(sample)[1] if sample else None
            mapped_sheets = []
            for variant, path in sorted(action_sheets):
                width, height, _ = png_info(path)
                fh = frame_h or (height // 8 if height % 8 == 0 else height)
                fw = frame_w or fh
                if width % fw or height % fh:
                    raise ValueError(f"odd sheet geometry: {path} is {width}x{height}, frame {fw}x{fh}")
                mapped_sheets.append({"path": path.relative_to(ext).as_posix(), "variant": variant,
                                      "frame_w": fw, "frame_h": fh, "cols": width // fw, "rows": height // fh})
                paths.append(path)
            cols = mapped_sheets[0]["cols"] if mapped_sheets else max(len(value) for value in direction_files.values())
            if mapped_sheets and any(sheet["cols"] != cols or sheet["rows"] != mapped_sheets[0]["rows"] for sheet in mapped_sheets):
                raise ValueError(f"shadow variants disagree for {character}/{action}")
            directions = list(DIRECTIONS) if mapped_sheets and mapped_sheets[0]["rows"] == 8 else [d for d in DIRECTIONS if d in direction_files]
            animation = {"name": action, "frames": list(range(cols)), "directions": directions}
            if mapped_sheets:
                animation["sheets"] = mapped_sheets
            else:
                animation["direction_files"] = {d: [p.relative_to(ext).as_posix() for p in direction_files[d]] for d in directions}
                paths.extend(path for direction in directions for path in direction_files[direction])
            if action in rates:
                animation["fps"] = rates[action]
            animations.append(animation)
        if animations:
            title = character_names[character]
            cards.append(measured_card(collection, ext, f"characters/{slug(title)}", title, "character", paths,
                                       {"animations": animations}))
    return cards, consumed


def facing_cards(collection: dict, ext: Path, consumed: set[Path]) -> tuple[list[dict], set[Path]]:
    groups: dict[tuple[Path, str], dict[str, Path]] = defaultdict(dict)
    for path in ext.rglob("*.png"):
        if path in consumed or "spritesheets" in {slug(part) for part in path.parts}:
            continue
        match = FACING.match(path.stem)
        if match:
            groups[(path.parent, match.group(1))][match.group(2).upper()] = path
    cards, used = [], set()
    for (parent, stem), facings in sorted(groups.items(), key=lambda item: item[0][1].lower()):
        if len(facings) < 2:
            continue
        paths = [facings[direction] for direction in DIRECTIONS if direction in facings]
        used.update(paths)
        rel_parent = slug(parent.relative_to(ext).as_posix())
        cards.append(measured_card(collection, ext, f"tiles/{rel_parent}/{slug(stem)}", stem, "tile", paths,
                                   {"facings": {d: facings[d].relative_to(ext).as_posix() for d in DIRECTIONS if d in facings},
                                    "tile": {"layer": "decor", "autotile": "none"}}))
    return cards, used


def flat_character_card(collection: dict, ext: Path, consumed: set[Path]) -> dict | None:
    """Conservative fallback for the small free/demo packs that ship loose PNGs."""
    pack_id = collection["id"].split(":", 1)[1].split("@", 1)[0]
    signals = ("character", "knight-demo", "survivor", "thug")
    if not any(signal in pack_id for signal in signals):
        return None
    paths = sorted((path for path in ext.rglob("*.png") if path not in consumed), key=lambda path: path.as_posix().lower())
    if not paths:
        return None
    groups: dict[Path, list[Path]] = defaultdict(list)
    for path in paths:
        groups[path.parent].append(path)
    animations = []
    for parent, files in sorted(groups.items(), key=lambda item: item[0].as_posix().lower()):
        name = "default" if parent == ext else slug(parent.name)
        animations.append({"name": name, "frames": list(range(len(files))),
                           "files": [path.relative_to(ext).as_posix() for path in files]})
    raw_title = collection.get("title", pack_id).split(" (", 1)[0]
    title = raw_title if raw_title != pack_id else " ".join(word.capitalize() for word in pack_id.removeprefix("smallscaleint-").split("-"))
    return measured_card(collection, ext, f"characters/{slug(title)}", title, "character", paths,
                         {"animations": animations})


def sequence_cards(collection: dict, ext: Path, consumed: set[Path], rates: dict[str, float]) -> list[dict]:
    cards = []
    for directory in sorted((path for path in ext.rglob("*") if path.is_dir()), key=lambda path: path.as_posix().lower()):
        paths = sorted((path for path in directory.glob("*.png") if NUMBER.search(path.stem) and path not in consumed), key=natural)
        if len(paths) < 2:
            continue
        rel = directory.relative_to(ext).as_posix()
        low = f"{collection['id']} {rel}".lower()
        subkind = "item" if "projectile" in low or "equipment" in low else "fx" if "effect" in low else "tile" if "tile" in low else "prop"
        animation = {"name": slug(directory.name), "frames": list(range(len(paths))),
                     "files": [path.relative_to(ext).as_posix() for path in paths]}
        if slug(directory.name) in rates:
            animation["fps"] = rates[slug(directory.name)]
        cards.append(measured_card(collection, ext, f"sequences/{slug(rel)}", directory.name, subkind, paths,
                                   {"animations": [animation]}))
    return cards


def build_cards(pack_dir: Path, collection: dict) -> list[dict]:
    ext, _ = extracted_dir(pack_dir)
    rates = animation_rates(ext)
    characters, frame_files = character_cards(collection, ext, rates)
    if not characters and (fallback := flat_character_card(collection, ext, frame_files)):
        characters.append(fallback)
        frame_files.update(ext / file["path"] for file in fallback["source"]["files"])
    facings, facing_files = facing_cards(collection, ext, frame_files)
    sequences = sequence_cards(collection, ext, frame_files | facing_files, rates)
    cards = sorted([*characters, *facings, *sequences], key=lambda card: card["id"])
    if len({card["id"] for card in cards}) != len(cards):
        raise ValueError(f"duplicate semantic card id below {pack_dir}")
    return cards


def card_path(pack_dir: Path, card: dict) -> Path:
    rel = card["id"].split("/", 1)[1].rsplit("@", 1)[0]
    return pack_dir / "cards" / f"{rel}.card.json"
def without_provenance_times(card: dict) -> dict:
    stable = copy.deepcopy(card)
    for entry in stable.get("provenance", {}).values():
        entry.pop("at", None)
    return stable
def write_cards(pack_dir: Path, cards: list[dict], dry_run: bool = False) -> int:
    expected = {card_path(pack_dir, card).relative_to(pack_dir / "cards"): json.dumps(card, indent=2) + "\n" for card in cards}
    current = {path.relative_to(pack_dir / "cards"): path.read_text() for path in (pack_dir / "cards").rglob("*.card.json")} if (pack_dir / "cards").exists() else {}
    for rel in expected.keys() & current.keys():
        try:
            if without_provenance_times(json.loads(expected[rel])) == without_provenance_times(json.loads(current[rel])):
                expected[rel] = current[rel]
        except json.JSONDecodeError:
            pass
    if current == expected or dry_run:
        return 0
    stage = Path(tempfile.mkdtemp(prefix=".smallscaleint-cards-", dir=pack_dir))
    backup = pack_dir / ".smallscaleint-cards-backup"
    try:
        for rel, text in expected.items():
            target = stage / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
        if backup.exists():
            shutil.rmtree(backup)
        if (pack_dir / "cards").exists():
            (pack_dir / "cards").rename(backup)
        stage.rename(pack_dir / "cards")
        if backup.exists():
            shutil.rmtree(backup)
    except Exception:
        if backup.exists() and not (pack_dir / "cards").exists():
            backup.rename(pack_dir / "cards")
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return len(cards)


def page(title: str, cells: list[tuple[str, str]]) -> str:
    figures = "\n".join(f'<figure><img src="{html.escape(src)}"><figcaption>{html.escape(label)}</figcaption></figure>' for label, src in cells)
    return f"""<!doctype html><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>body{{font:14px system-ui;background:#202124;color:#eee}}main{{display:flex;flex-wrap:wrap;gap:12px}}figure{{margin:0;padding:8px;background:#303134}}img{{image-rendering:pixelated;max-width:512px}}figcaption{{margin-top:4px}}</style>
<h1>{html.escape(title)}</h1><main>{figures}</main>\n"""


def write_contact_sheets(root: Path, collections: dict[str, dict], cards_by_pack: dict[str, list[dict]]) -> list[Path]:
    final_out = root / "sets" / "smallscaleint" / "sheets"
    final_out.parent.mkdir(parents=True, exist_ok=True)
    out = Path(tempfile.mkdtemp(prefix=".smallscaleint-sheets-", dir=final_out.parent))
    backup = final_out.parent / ".smallscaleint-sheets-backup"
    pages, lineups = [], defaultdict(list)
    try:
        for pack_id, cards in sorted(cards_by_pack.items()):
            pack_dir, collection = root / "packs" / pack_id, collections[pack_id]
            ext, _ = extracted_dir(pack_dir)
            south_frames: dict[tuple[str, str], list[Path]] = defaultdict(list)
            for source_path in ext.rglob("*.png"):
                relative_parts = source_path.relative_to(ext).parts
                if source_path.parent.name.upper() == "S" and len(relative_parts) >= 4:
                    south_frames[(slug(source_path.parent.parent.parent.name), slug(source_path.parent.parent.name))].append(source_path)
            for card in cards:
                if card["subkind"] == "character":
                    cells = []
                    lineup_source = None
                    for animation in card["sprite"].get("animations", []):
                        candidates = sorted(south_frames.get((slug(card["title"]), slug(animation["name"])), []), key=natural)
                        if candidates:
                            cells.append((animation["name"], os.path.relpath(candidates[0], out / "characters")))
                            lineup_source = lineup_source or candidates[0]
                        else:
                            fallback_path = next(iter(animation.get("files", [])), None)
                            fallback_path = fallback_path or next((sheet["path"] for sheet in animation.get("sheets", [])), None)
                            if fallback_path:
                                source_path = ext / fallback_path
                                cells.append((animation["name"], os.path.relpath(source_path, out / "characters")))
                                lineup_source = lineup_source or source_path
                    if cells:
                        target = out / "characters" / f"{pack_id}-{slug(card['title'])}.html"
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text(page(f"{pack_id}: {card['title']}", cells))
                        pages.append(target)
                        lineups[collection["describe"]["world"]].append((card["title"], lineup_source))
                elif card["subkind"] == "tile":
                    category = card["source"]["files"][0]["path"].split("/", 1)[0]
                    target = out / "tiles" / f"{pack_id}-{slug(category)}.html"
                    if target in pages:
                        continue
                    cells = [(item["title"], os.path.relpath(ext / item["source"]["files"][0]["path"], target.parent))
                             for item in cards if item["subkind"] == "tile" and item["source"]["files"][0]["path"].startswith(category + "/")]
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(page(f"{pack_id}: {category}", cells))
                    pages.append(target)
        for world, cells in sorted(lineups.items()):
            target = out / "worlds" / f"{world}.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(page(f"SmallScaleInt: {world}", [(label, os.path.relpath(source, target.parent)) for label, source in cells]))
            pages.append(target)
        relative_pages = [path.relative_to(out) for path in pages]
        if backup.exists():
            shutil.rmtree(backup)
        if final_out.exists():
            final_out.rename(backup)
        try:
            out.rename(final_out)
        except Exception:
            if backup.exists() and not final_out.exists():
                backup.rename(final_out)
            raise
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        return [final_out / path for path in relative_pages]
    finally:
        if out.exists():
            shutil.rmtree(out)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract-unity")
    extract.add_argument("package", type=Path)
    extract.add_argument("destination", type=Path)
    extract.add_argument("--world", choices=("fantasy", "modern-zombie"), default="fantasy")
    args = parser.parse_args(argv)
    if args.command == "extract-unity":
        result = extract_unitypackage(args.package, args.destination, args.world)
        print(json.dumps({"destination": str(args.destination), "layers": len(result["layers"])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
