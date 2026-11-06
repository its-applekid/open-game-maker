"""Vendor-agnostic 3D pack planning: style families, FBX sources, conversion targets, and card facts.

Pure planning only: no Blender, no network, no subprocess. `preprocess_3d.py` runs the plans this
module builds, so every rule here is unit-testable without a host library or a GPU.

The card shape, model discovery helpers and renderer protocol are shared with
`preprocess_kaykit.py`; this module adds what a mixed-vendor 3D library needs on top: which style
family and set a pack belongs to, which source file a pack's model comes from, where its glTF lands,
and the four-to-six numbers a 3D card carries.
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import preprocess_kaykit as kaykit  # noqa: E402  (shared card shape and source helpers)

MODEL_EXTS = kaykit.MODEL_EXTS
# Blender opens these headlessly; `.mtl` and texture companions travel with them.
SOURCE_EXTS = frozenset(kaykit.COMPANION_EXTS - {".mtl"})
SOURCE_PREFERENCE = (".fbx", ".obj", ".dae", ".blend")
# Relative to a pack's extracted root. Converting a source never overwrites vendor bytes, and the
# glTF lands next to the vendor's own format folders so one canonical-key walk finds both.
GLB_DIR = "glb"
# C4 §5.5 mobile budget is 300 k visible triangles per scene; one model over it cannot ship on a
# phone tier, which is what KayKit's own card flag already means. Tier *files* are made later by
# `gm build assets` (OGM-063): import never makes variants (D-TIERS), so preprocessing records the
# polycount a tier judgement reads and nothing else.
MOBILE_TRIANGLES = 300_000
# B11 §2 world grid. Footprint in cells is how "something to block a corridor, 2×2 cells" filters.
CELL_M = 1.0


@dataclass(frozen=True)
class StyleEntry:
    """Where a pack sits in the creation-choice order, from `style-families.json`."""

    pack_id: str
    style_family: str
    set_id: str | None = None
    compat: tuple[str, ...] = ()


@dataclass(frozen=True)
class SourcePlan:
    """One canonical model key in one pack, and the file that represents it."""

    pack_id: str
    version: str
    key: str
    source: Path | None
    target: Path | None
    alternates: tuple[Path, ...] = ()
    error: str | None = None

    @property
    def uid(self) -> str:
        return f"{self.pack_id}/{self.key}"

    @property
    def needs_conversion(self) -> bool:
        return self.source is not None and self.target is not None


def style_index(families: list[dict]) -> dict[str, StyleEntry]:
    """Pack id -> style family, set and cross-set compatibility, for the 3D families only.

    A family lists most packs at family level (`packs.primary` / `packs.extras`) and groups the
    curated ones into sets; a pack in a set keeps the set id and any `compatible_with` it declares.
    The returned order is the creation-choice order the style picker shows, so a finished family can
    be processed first without touching this function.
    """
    index: dict[str, StyleEntry] = {}
    for family in families:
        if family.get("dimension") != "3d":
            continue
        listed = family.get("packs", {})
        for pack_id in [*listed.get("primary", []), *listed.get("extras", [])]:
            index.setdefault(pack_id, StyleEntry(pack_id, family["id"]))
        for style_set in family.get("sets", []):
            for pack in style_set.get("packs", []):
                pack_id = pack["id"] if isinstance(pack, dict) else pack
                compat = tuple(sorted(pack.get("compatible_with", []))) if isinstance(pack, dict) else ()
                index[pack_id] = StyleEntry(pack_id, family["id"], style_set["id"], compat)
    return index


def pack_order(families: list[dict]) -> list[str]:
    """Every 3D pack id in creation-choice order: family order, then set order, then pack order."""
    return list(style_index(families))


def families_from_file(path: Path) -> list[dict]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, list):
        raise ValueError(f"{path} is not a style-family list")
    return document


def plan_pack(manifest: dict, extracted: Path, glb_dir: str = GLB_DIR) -> list[SourcePlan]:
    """Group a pack's extracted tree by canonical key and pick the file that represents each key.

    A glTF or GLB already present is canonical and needs no conversion. A key with only vendor
    sources gets a conversion target under `<extracted>/<glb_dir>/`, which the next walk finds as
    the canonical model. Two candidates in the winning class are an error, as KayKit's own
    discovery treats them: silently picking one loses a model.
    """
    pack_id, version = manifest["id"], manifest["current"]
    candidates: dict[str, list[Path]] = {}
    for path in extracted.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in MODEL_EXTS | SOURCE_EXTS:
            continue
        candidates.setdefault(kaykit.canonical_key(path.relative_to(extracted)), []).append(path)
    plans: list[SourcePlan] = []
    for key, paths in sorted(candidates.items()):
        paths.sort(key=lambda item: item.as_posix().lower())
        models = [path for path in paths if path.suffix.lower() in MODEL_EXTS]
        # glTF is canonical when a pack ships both: it carries external resources the card records.
        canonical_models = [path for path in models if path.suffix.lower() == ".gltf"] or models
        chosen = _single(canonical_models) if canonical_models else None
        if chosen is None and canonical_models:
            plans.extend(_ambiguous(canonical_models, key, pack_id, version))
            continue
        if chosen is not None:
            plans.append(SourcePlan(pack_id, version, key, chosen.relative_to(extracted),
                                    None, tuple(path.relative_to(extracted) for path in paths
                                                if path != chosen)))
            continue
        sources = _ordered_sources(paths)
        chosen = _single(sources)
        if chosen is None:
            plans.extend(_ambiguous(sources, key, pack_id, version))
            continue
        target = Path(glb_dir) / key
        plans.append(SourcePlan(pack_id, version, key, chosen.relative_to(extracted),
                                target.with_suffix(".glb"),
                                tuple(path.relative_to(extracted) for path in paths if path != chosen)))
    return plans


def _single(paths: list[Path]) -> Path | None:
    return paths[0] if len(paths) == 1 else None


def _ambiguous(paths: list[Path], key: str, pack_id: str, version: str) -> list[SourcePlan]:
    names = " and ".join(sorted(path.name for path in paths))
    return [SourcePlan(pack_id, version, key, None, None, (),
                       f"canonical model key {pack_id}/{key!r} is shared by {names}")]


def _ordered_sources(paths: list[Path]) -> list[Path]:
    def rank(path: Path) -> tuple[int, str]:
        suffix = path.suffix.lower()
        order = SOURCE_PREFERENCE.index(suffix) if suffix in SOURCE_PREFERENCE else len(SOURCE_PREFERENCE)
        return order, path.as_posix().lower()

    return sorted(paths, key=rank)


def conversion_argv(script: Path, source: Path, target: Path, *, scale: float = 1.0,
                    normalize: bool = True, report: Path | None = None,
                    blender: str = "blender") -> list[str]:
    """Blender argv for one conversion. `--python-exit-code 1` must precede `--python`."""
    argv = [blender, "--background", "--factory-startup", "--python-exit-code", "1",
            "--python", str(script), "--",
            "--input", str(source), "--output", str(target), "--scale", f"{scale:g}"]
    if normalize:
        argv.append("--normalize")
    if report:
        argv.extend(["--report", str(report)])
    return argv


def footprint_cells(bounds: dict, cell_m: float = CELL_M) -> dict:
    """Width and depth in world cells, rounded up so a 1.2-cell wall still blocks a 2-cell corridor."""
    if cell_m <= 0:
        raise ValueError("cell_m must be positive")
    minimum, maximum = bounds["min"], bounds["max"]
    return {"w": round(math.ceil((maximum[0] - minimum[0]) / cell_m - 1e-9), 2),
            "d": round(math.ceil((maximum[2] - minimum[2]) / cell_m - 1e-9), 2),
            "cell_m": cell_m}


def fits_mobile(triangles: int, budget: int = MOBILE_TRIANGLES) -> bool:
    return triangles <= budget


def geometry_facts(analysis: dict, texture_keys: list[str] | None = None,
                   cell_m: float = CELL_M) -> dict:
    """The card's measured 3D facts. Numbers only; prose belongs in `describe`."""
    geometry = {
        "bounds_m": analysis["bounds"],
        "triangles": analysis["triangles"],
        "vertices": analysis.get("vertices", 0),
        "materials": list(analysis.get("materials", [])),
        "footprint_cells": footprint_cells(analysis["bounds"], cell_m),
        "normalized": analysis.get("pivot") == "base-center",
    }
    if texture_keys:
        geometry["texture_keys"] = list(texture_keys)
    if analysis.get("pivot"):
        geometry["pivot"] = analysis["pivot"]
    return geometry


def conversion_summary(plans: list[SourcePlan]) -> dict:
    """Counts a dry run prints, so an operator can price a run before starting Blender."""
    pending = [plan for plan in plans if plan.needs_conversion]
    return {"models": len(plans), "to_convert": len(pending),
            "already_gltf": len(plans) - len(pending) - len([plan for plan in plans if plan.error]),
            "errors": [{"uid": plan.uid, "error": plan.error} for plan in plans if plan.error],
            "formats": _count(plan.source.suffix.lower().lstrip(".") for plan in pending)}


def _count(values) -> dict:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))
