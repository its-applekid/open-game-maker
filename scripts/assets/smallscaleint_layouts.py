"""Measured SmallScaleInt character-layout conventions.

Keep vendor-specific path exceptions here so the semantic reader can assemble
cards without guessing from broad words such as ``character`` in a pack id.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


DIRECTIONS = ("E", "N", "NE", "NW", "S", "SE", "SW", "W")
SHEET_DIRECTIONS = ("E", "SE", "S", "SW", "W", "NW", "N", "NE")
DEFAULT_FPS = 12

SAFE_ID = re.compile(r"[^a-z0-9]+")
NUMBER = re.compile(r"(\d+)")
SHADOWLESS_SUFFIX = re.compile(r"[_ -]shadowless$", re.IGNORECASE)

TILESET_CHARACTER_PACKS = {
    "smallscaleint-2d-desert-fantasy-tileset",
    "smallscaleint-2d-hd-zombie-interior-tiles",
    "smallscaleint-fantasy-tileset-2d-isometric",
}
TOPDOWN_STRIP_PACKS = {
    "smallscaleint-2d-demons-topdown-assetpack",
    "smallscaleint-2d-hd-zombie-pack-1",
    "smallscaleint-2d-orcs-and-goblins-topdown",
    "smallscaleint-2d-zombie-pack-2-top-down",
}
SHEET_ONLY_PACKS = {
    "smallscaleint-2d-character-knight": "1Knight",
    "smallscaleint-2d-hd-character-knight": "Knight",
}
LOOSE_SHEET_PACKS = {
    "smallscaleint-free-character-16-bit-thug-outlined": "Thug",
    "smallscaleint-free-character-hd-survivor-w-bike": "Survivor",
}
DEMO_PACK = "smallscaleint-knight-demo-character"
ARCHER_PACK = "smallscaleint-2d-topdown-archer-character"


def slug(value: str) -> str:
    return SAFE_ID.sub("-", value.lower()).strip("-") or "asset"


def natural(path: Path) -> tuple:
    return tuple(int(part) if part.isdigit() else part.lower() for part in NUMBER.split(path.name))


def shadow_variant(value: str) -> str | None:
    normalized = slug(value)
    if normalized in {"with-shadow", "with-shadows", "withshadow", "withshadows", "shadow"} or normalized.endswith(
        ("-with-shadow", "-with-shadows")
    ):
        return "shadow"
    if normalized in {"shadowless", "without-shadow", "without-shadows", "withoutshadow", "withoutshadows"} or normalized.endswith(
        ("-shadowless", "-without-shadow", "-without-shadows")
    ):
        return "shadowless"
    return None


@dataclass(frozen=True)
class SheetEntry:
    character: str
    title: str
    action: str
    path: Path
    rows: int
    variant: str | None = None


def _entry(title: str, action_name: str, path: Path, rows: int, variant: str | None) -> SheetEntry:
    suffix_shadowless = bool(SHADOWLESS_SUFFIX.search(Path(action_name).stem))
    base_action = SHADOWLESS_SUFFIX.sub("", Path(action_name).stem)
    return SheetEntry(slug(title), title, slug(base_action), path, rows, "shadowless" if suffix_shadowless else variant)


def discover_sheets(ext: Path, pack_id: str) -> dict[tuple[str, str], list[SheetEntry]]:
    found: dict[tuple[str, str], list[SheetEntry]] = defaultdict(list)
    for path in ext.rglob("*.png"):
        parts = path.relative_to(ext).parts
        entry = _sheet_entry(path, parts, pack_id)
        if entry is not None:
            found[(entry.character, entry.action)].append(entry)
    return found


def _sheet_entry(path: Path, parts: tuple[str, ...], pack_id: str) -> SheetEntry | None:
    slugs = tuple(slug(part) for part in parts)
    if "spritesheets" in slugs:
        index = max(index for index, part in enumerate(slugs) if part == "spritesheets")
        tail = list(parts[index + 1 :])
        variant = shadow_variant(tail[0]) if tail else None
        if variant:
            tail = tail[1:]
        if pack_id in SHEET_ONLY_PACKS and len(tail) == 1:
            return _entry(SHEET_ONLY_PACKS[pack_id], tail[0], path, 8, variant)
        if len(tail) >= 2:
            return _entry(tail[-2], tail[-1], path, 8, variant)

    if pack_id in TILESET_CHARACTER_PACKS and len(parts) == 3 and slugs[0] == "characters":
        return _entry(parts[1], parts[2], path, 8, None)

    if pack_id in TOPDOWN_STRIP_PACKS and len(parts) == 3:
        variant = shadow_variant(parts[0])
        if slug(parts[0]) == "combined" or variant:
            return _entry(parts[1], parts[2], path, 1, variant)

    if pack_id == "smallscaleint-2d-character-knight" and len(parts) == 2 and slug(parts[0]) == "1knight":
        return _entry("1Knight", parts[1], path, 8, None)

    if pack_id in LOOSE_SHEET_PACKS and len(parts) == 1:
        return _entry(LOOSE_SHEET_PACKS[pack_id], parts[0], path, 8, None)

    if pack_id == DEMO_PACK and len(parts) == 2:
        return _entry(parts[0], parts[1], path, 8, None)

    return None


def discover_frame_groups(
    ext: Path, pack_id: str
) -> tuple[dict[tuple[str, str], dict[str, list[Path]]], dict[str, str]]:
    groups: dict[tuple[str, str], dict[str, list[Path]]] = defaultdict(dict)
    titles: dict[str, str] = {}
    for directory in ext.rglob("*"):
        direction = directory.name.upper()
        if not directory.is_dir() or direction not in DIRECTIONS:
            continue
        relative_parts = directory.relative_to(ext).parts
        if "spritesheets" in {slug(part) for part in relative_parts}:
            continue
        frames = sorted((path for path in directory.glob("*.png") if NUMBER.search(path.stem)), key=natural)
        if not frames:
            continue
        if pack_id == ARCHER_PACK and len(relative_parts) == 2:
            character, title, action = slug("Archer"), "Archer", slug(directory.parent.name)
        elif len(relative_parts) >= 3:
            title, action = directory.parent.parent.name, slug(directory.parent.name)
            character = slug(title)
        else:
            continue
        groups[(character, action)][direction] = frames
        titles[character] = title
    return groups, titles
