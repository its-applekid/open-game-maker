"""Generate KayKit model and animation cards, thumbnails, lineups, QA, and catalog metadata.

The glTF copy is canonical when present; otherwise GLB is canonical. Other model
formats and external glTF resources are recorded on the same source block.

Each card carries the layer-1 tags a filename and a measurement can carry
(`describe.description`, `objects`, `keywords`), the measured texture sizes, and
the clips that play on its skeleton: a character lists the clips of every clip
library that shares its rig, so `gm assets search` finds it without opening a
file (`docs/research/asset-searchability-2026-11-05.md`).

Run: python3 -I scripts/assets/preprocess_kaykit.py [--root assets-local]
"""
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import median
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import check_glb  # noqa: E402  (sibling asset tool: GLB container and image-header readers)

REPO = Path(__file__).resolve().parents[2]
RENDERER = REPO / "apps" / "web" / "tools" / "render-gltf.mjs"
VALIDATOR = REPO / "packages" / "contracts" / "bin" / "validate-cards.mjs"
COLLECTION_BUILDER = Path(__file__).parent / "build_collection_cards.py"
CATALOG_BUILDER = Path(__file__).parent / "build_catalog.py"
VOCAB = "2026-10-27"
TOOL = "preprocess-kaykit@0.2"
FORMAT_DIRS = {"blend", "blender", "fbx", "glb", "gltf", "models", "obj", "source", "sources"}
COMPANION_EXTS = {".blend", ".dae", ".fbx", ".mtl", ".obj"}
MODEL_EXTS = {".glb", ".gltf"}
MESHLESS_PACK_IDS = {"kaykit-character-animations"}
LOOP_CLIPS = {"crouch", "drive", "fall", "hold", "idle", "run", "sit", "sprint", "swim", "walk"}
# Variant suffixes that qualify a name rather than name a thing: kept out of `describe.objects`
# (`box_b` is a box) and carried in `describe.keywords` instead, where "empty" still finds a barrel.
VARIANT_WORDS = {
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
    "w", "x", "y", "z", "alt", "v1", "v2", "lod1", "half", "large", "medium", "small", "decorated", "empty",
    "broken", "open", "closed", "withstring", "withoutbase", "single", "double", "triple",
}
PACK_STOP_WORDS = {"kaykit", "pack", "packs", "bits", "series", "mystery", "monthly", "complete", "v7"}
CATEGORY_ORDER = ("character", "creature", "anim", "building", "nature", "prop", "weapon", "vehicle", "food", "other")
LINEUP_PAGE_SIZE = 96
TEXTURE_CAP_PX = 2048  # the device-tier texture cap a mobile build is gated on; `check_glb.py --texture-cap` defaults to it
HEADER_BYTES = 65_536
CLIP_WORDS = (
    ("attack-ranged", ("shoot", "ranged", "bow", "gun")),
    ("attack-kick", ("kick",)),
    ("attack-melee", ("attack", "slash", "stab", "punch", "melee")),
    ("pick-up", ("pickup", "pick-up", "pick_up")),
    ("sprint", ("sprint",)),
    ("walk", ("walk",)),
    ("run", ("run", "jog")),
    ("jump", ("jump",)),
    ("fall", ("fall",)),
    ("land", ("land",)),
    ("crouch", ("crouch",)),
    ("sit", ("sit",)),
    ("cast", ("cast", "spell", "magic")),
    ("block", ("block", "guard")),
    ("hit", ("hit", "hurt", "damage")),
    ("die", ("die", "death", "dead")),
    ("interact", ("interact", "use")),
    ("emote", ("emote", "wave", "cheer")),
    ("hold", ("hold",)),
    ("drive", ("drive",)),
    ("swim", ("swim",)),
    ("climb", ("climb",)),
    ("idle", ("idle",)),
)


@dataclass(frozen=True)
class SourceFile:
    path: Path
    role: str


@dataclass(frozen=True)
class Model:
    pack_id: str
    version: str
    title: str
    extracted: Path
    primary: Path
    key: str
    files: tuple[SourceFile, ...]
    error: str | None = None

    @property
    def uid(self) -> str:
        return f"{self.pack_id}/{self.key}"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9._-]+", "-", value.lower()).strip("-._") or "model"


def canonical_key(path: Path) -> str:
    path = path.with_suffix("")
    while path.suffix.lower() in MODEL_EXTS:
        path = path.with_suffix("")
    parts = []
    for part in path.parts:
        normalized = slug(part).removesuffix("-format")
        if normalized not in FORMAT_DIRS:
            parts.append(normalized)
    return "/".join(parts)


def external_resources(gltf: Path, extracted: Path) -> list[SourceFile]:
    document = json.loads(gltf.read_text(encoding="utf-8"))
    files = []
    for role, rows in (("metadata", document.get("buffers", [])), ("texture", document.get("images", []))):
        for row in rows:
            uri = row.get("uri")
            if not uri or uri.startswith("data:"):
                continue
            parsed = urlparse(uri)
            if parsed.scheme or parsed.netloc:
                raise ValueError(f"remote glTF resource is not allowed: {uri}")
            lexical = gltf.parent / unquote(parsed.path)
            try:
                candidate = lexical.resolve(strict=True)
            except FileNotFoundError as error:
                raise ValueError(f"glTF resource is missing: {uri}") from error
            try:
                relative = candidate.relative_to(extracted.resolve())
            except ValueError as error:
                raise ValueError(f"glTF resource escapes extracted root: {uri}") from error
            files.append(SourceFile(relative, role))
    return files


def kaykit_manifests(root: Path, only: str = "kaykit-*") -> list[tuple[Path, dict]]:
    manifests = []
    for path in sorted((root / "packs").glob(f"{only}/pack.json")):
        manifest = json.loads(path.read_text())
        if manifest.get("vendor") == "kaykit" or manifest["id"].startswith("kaykit-"):
            manifests.append((path, manifest))
    return manifests


def models_for_manifests(manifests: list[tuple[Path, dict]]) -> list[Model]:
    models = []
    for manifest_path, manifest in manifests:
        version = manifest["current"]
        extracted = manifest_path.parent / version / "extracted"
        companions = defaultdict(list)
        candidates = defaultdict(list)
        for path in extracted.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(extracted)
            if path.suffix.lower() in COMPANION_EXTS:
                companions[canonical_key(relative)].append(SourceFile(relative, "companion"))
            elif path.suffix.lower() in MODEL_EXTS:
                candidates[canonical_key(relative)].append(path)
        for key, paths in sorted(candidates.items()):
            paths.sort(key=lambda path: path.as_posix().lower())
            gltfs = [path for path in paths if path.suffix.lower() == ".gltf"]
            canonical = gltfs if gltfs else paths
            if len(canonical) != 1:
                relative = [path.relative_to(extracted) for path in canonical]
                uid = f"{manifest['id']}/{key}"
                raise ValueError(f"canonical model key {uid!r} is shared by {relative[0]} and {relative[1]}")
            path = canonical[0]
            primary = path.relative_to(extracted)
            error = None
            resources = []
            if path.suffix.lower() == ".gltf":
                try:
                    resources = external_resources(path, extracted)
                except (OSError, UnicodeError, ValueError) as caught:
                    error = f"invalid glTF metadata: {caught}"
            alternatives = [SourceFile(item.relative_to(extracted), "companion") for item in paths if item != path]
            sources = [SourceFile(primary, "primary"), *resources, *alternatives, *companions.get(key, [])]
            files = tuple(sorted(set(sources), key=lambda item: item.path.as_posix().lower()))
            model = Model(manifest["id"], version, manifest["title"], extracted, primary, key, files, error)
            models.append(model)
    return models


def discover_models(root: Path, only: str = "kaykit-*") -> list[Model]:
    return models_for_manifests(kaykit_manifests(root, only))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def source_entry(model: Model, item: SourceFile, cache: dict[Path, dict] | None = None) -> dict:
    path = model.extracted / item.path
    key = path.resolve()
    facts = cache.get(key) if cache is not None else None
    if facts is None:
        facts = {"sha256": sha256(path), "bytes": path.stat().st_size, "format": path.suffix.lower().lstrip(".")}
        if cache is not None:
            cache[key] = facts
    return {"path": item.path.as_posix(), **facts, "role": item.role}


def canonical_clip(name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return next((canonical for canonical, words in CLIP_WORDS if any(word in normalized for word in words)), "other")


def clips(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        canonical = canonical_clip(row["name"])
        out.append({"name": row["name"], "duration_s": row["duration"], "canonical": canonical,
                    "loop": canonical in LOOP_CLIPS})
    return sorted(out, key=lambda row: row["name"].lower())


def subkind(model: Model, analysis: dict) -> str:
    if analysis.get("rig"):
        return "creature" if analysis["rig"]["rig_type"] in {"creature", "quadruped"} else "character"
    words = model.key.lower()
    for kind, needles in (("vehicle", ("vehicle", "car", "truck", "boat")),
                          ("building", ("building", "house", "tower", "wall")),
                          ("nature", ("tree", "plant", "rock", "nature")),
                          ("weapon", ("weapon", "sword", "axe", "bow", "gun")),
                          ("food", ("food", "fruit", "bread", "meal"))):
        if any(needle in words for needle in needles):
            return kind
    return "prop"


def title_for(model: Model) -> str:
    return re.sub(r"[_-]+", " ", Path(model.key).name).strip().title()


def name_words(model: Model) -> list[str]:
    return [word for word in re.split(r"[^a-z0-9]+", Path(model.key).name.lower()) if word]


def objects_for(model: Model, animation_library: bool = False) -> list[str]:
    """The name words that name a thing: `chair_desk_a` is a chair and a desk, not an `a`."""
    if animation_library:  # `Rig_Medium_General` names a clip set, not an object
        return []
    words = [word for word in name_words(model)
             if word not in VARIANT_WORDS and not word[:1].isdigit() and len(word) > 1]
    return sorted(dict.fromkeys(words))[:12]


def keywords_for(model: Model, analysis: dict, animation_library: bool, clip_count: int) -> list[str]:
    """Vendor, pack and measured words that are not enum values, so a plain query still finds the card."""
    words = ["kaykit"]
    if animation_library:
        words += name_words(model)
    else:
        words += [word for word in name_words(model) if word in VARIANT_WORDS and len(word) > 1]
    words += [word for word in re.split(r"[^a-z0-9]+", model.pack_id.lower())
              if len(word) > 2 and word not in PACK_STOP_WORDS]
    if analysis.get("rig"):
        words.append("clips" if animation_library else "rigged")
    if clip_count and not animation_library:
        words.append("animated")
    return sorted(dict.fromkeys(words))[:12]


def description_for(model: Model, analysis: dict, animation_library: bool, clip_count: int,
                    max_texture_px: int | None) -> str:
    """One measured line, so a search row and `gm assets info` say what the model is without opening it."""
    rig = analysis.get("rig") or {}
    triangles = analysis.get("triangles") or 0
    if animation_library:
        text = (f"{model.title}: animation library of {clip_count} clips on the shared {rig['rig_type']} rig "
                f"({rig['joint_count']} joints).")
    else:
        facts = [f"{triangles} triangles"]
        if max_texture_px:
            facts.append(f"textures up to {max_texture_px} px")
        if clip_count:
            facts.append(f"{clip_count} shared clips")
        shape = f"rigged {subkind(model, analysis)}" if rig else subkind(model, analysis)
        text = f"{model.title}: {shape}, " + ", ".join(facts) + "."
    return text if len(text) <= 300 else text[:299].rstrip() + "."


def image_size_from_file(path: Path) -> tuple[int, int] | None:
    """Pixel size from a texture file's header: the first 64 KiB, then the whole file only for a JPEG that needs it."""
    try:
        with path.open("rb") as handle:
            head = handle.read(HEADER_BYTES)
    except OSError:
        return None
    measured = check_glb.image_size(head)
    if measured or head[:2] != b"\xff\xd8" or len(head) < HEADER_BYTES:
        return measured
    try:
        return check_glb.image_size(path.read_bytes())
    except OSError:
        return None


def texture_entries(model: Model) -> list[dict]:
    """Measured pixel size of every texture the model references, read from the image headers alone."""
    rows = []
    for item in model.files:
        if item.role != "texture":
            continue
        measured = image_size_from_file(model.extracted / item.path)
        if measured:
            rows.append({"key": item.path.as_posix(), "width_px": measured[0], "height_px": measured[1]})
    if model.primary.suffix.lower() == ".glb":
        try:
            document, binary = check_glb.read_glb(model.extracted / model.primary)
        except (OSError, ValueError, check_glb.GlbError):
            document = None
        if document is not None:
            for size in check_glb.texture_sizes(document, binary):
                if size["width"] and size["height"]:
                    rows.append({"key": size["name"] or "embedded", "width_px": int(size["width"]),
                                 "height_px": int(size["height"])})
    unique = {(row["key"], row["width_px"], row["height_px"]) for row in rows}
    return [{"key": key, "width_px": width, "height_px": height} for key, width, height in sorted(unique)]


def is_animation_library(model: Model, analysis: dict) -> bool:
    return (bool(analysis.get("rig") and analysis.get("clips")) and
            re.match(r"^rig[-_]", Path(model.key).name, re.IGNORECASE) is not None)


def animation_subkind(rig_type: str) -> str:
    if rig_type in {"creature", "quadruped"}:
        return "creature"
    return "vehicle" if rig_type == "vehicle" else "humanoid"


def library_rigs(models: list[Model], results: dict) -> dict[str, set]:
    """Rig id -> joints (name, parent) of every clip library this run measured."""
    libraries = {}
    for model in models:
        analysis = results.get(model.uid, {}).get("analysis") if results.get(model.uid, {}).get("ok") else None
        if analysis and is_animation_library(model, analysis):
            libraries[analysis["rig"]["rig_id"]] = {(bone["name"], bone["parent"]) for bone in analysis["rig"]["bones"]}
    return libraries


def retarget_rigs(models: list[Model], results: dict) -> dict[str, str]:
    """Model uid -> library rig id for skeletons no library targets whose joints (name + parent) a library rig contains."""
    analyses = {model.uid: results[model.uid]["analysis"] for model in models if results.get(model.uid, {}).get("ok")}
    libraries = library_rigs(models, results)
    out = {}
    for model in models:
        analysis = analyses.get(model.uid)
        rig = analysis.get("rig") if analysis else None
        if not rig or is_animation_library(model, analysis) or rig["rig_id"] in libraries:
            continue
        joints = {(bone["name"], bone["parent"]) for bone in rig["bones"]}
        matches = sorted(rig_id for rig_id, library in libraries.items() if joints and joints <= library)
        if matches:
            out[model.uid] = matches[0]
    return out


def library_clips(models: list[Model], results: dict) -> dict[str, list[dict]]:
    """Rig id -> the raw clips of every clip library this run measured; joined onto characters by `shared_clips`."""
    out = defaultdict(list)
    for model in models:
        result = results.get(model.uid) or {}
        analysis = result.get("analysis") if result.get("ok") else None
        if analysis and is_animation_library(model, analysis):
            out[analysis["rig"]["rig_id"]].extend(analysis.get("clips") or [])
    return dict(out)


def shared_clips(analysis: dict, retarget_rig_id: str | None, libraries: dict[str, list[dict]]) -> list[dict]:
    """The clips that play on this skeleton: its own, plus those of every library on its rig or the rig it retargets to."""
    rows = list(analysis.get("clips") or [])
    rig = analysis.get("rig")
    if rig:
        for rig_id in (rig["rig_id"], retarget_rig_id):
            rows.extend(libraries.get(rig_id, []) if rig_id else [])
    by_name = {}
    for row in clips(rows):
        by_name.setdefault(row["name"], row)
    return [by_name[name] for name in sorted(by_name, key=str.lower)]


def build_card(model: Model, analysis: dict, generated: str, source_cache: dict[Path, dict] | None = None,
               retarget_rig_id: str | None = None, libraries: dict[str, list[dict]] | None = None) -> dict:
    source_files = [source_entry(model, item, source_cache) for item in model.files]
    texture_keys = [item.path.as_posix() for item in model.files if item.role == "texture"]
    texture_sizes = texture_entries(model)
    max_texture_px = max((max(row["width_px"], row["height_px"]) for row in texture_sizes), default=None)
    animation_library = is_animation_library(model, analysis)
    card_clips = clips(analysis.get("clips") or []) if animation_library else shared_clips(
        analysis, retarget_rig_id, libraries or {})
    card = {
        "schema": "ogm.asset-card/1.0", "vocab": VOCAB,
        "id": f"t1:{model.pack_id}/{model.key}@{model.version}", "card_type": "asset", "status": "measured",
        "title": title_for(model),
        "collection": f"t1:{model.pack_id}@{model.version}",
        "source": {"files": source_files, "content_hash": next(row["sha256"] for row in source_files if row["role"] == "primary")},
        "previews": {"thumb": f"packs/{model.pack_id}/thumbnails/{model.key}.png"},
        "describe": {"style_family": "chunky-low-poly",
                     "description": description_for(model, analysis, animation_library, len(card_clips),
                                                    max_texture_px),
                     "objects": objects_for(model, animation_library),
                     "keywords": keywords_for(model, analysis, animation_library, len(card_clips))},
        "provenance": {"*": {"by": "code", "tool": TOOL, "at": generated,
                                "input": "glTF/GLB loaded by three.js; source files hashed"},
                       "describe.style_family": {"by": "collection", "tool": TOOL, "at": generated,
                                                 "input": "KayKit Complete v7 compatibility pass"},
                       "describe.description": {"by": "code", "tool": TOOL, "at": generated,
                                                "input": "measured triangles, textures, rig and clips"},
                       "describe.objects": {"by": "code", "tool": TOOL, "at": generated, "input": "model name"},
                       "describe.keywords": {"by": "code", "tool": TOOL, "at": generated,
                                             "input": "pack id, vendor and measured rig facts"}},
    }
    if animation_library:
        rig = analysis["rig"]
        card.update({"kind": "anim", "subkind": animation_subkind(rig["rig_type"]),
                     "anim": {"target_rig_id": rig["rig_id"], "clips": card_clips}})
    else:
        geometry = {"bounds_m": analysis["bounds"], "pivot": analysis["pivot"],
                    "triangles": analysis["triangles"], "vertices": analysis["vertices"],
                    "materials": analysis["materials"], "texture_keys": texture_keys,
                    "normalized": False}
        if texture_sizes:
            geometry["texture_sizes"] = texture_sizes
            geometry["max_texture_px"] = max_texture_px
        card.update({"kind": "model", "subkind": subkind(model, analysis), "geometry": geometry})
    if analysis.get("rig") and not animation_library:
        rig = {key: value for key, value in analysis["rig"].items() if key != "bones"}
        rig["clips"] = card_clips
        if retarget_rig_id:
            rig["retarget_rig_id"] = retarget_rig_id
        card["rig"] = rig
    if card["kind"] == "model" and analysis["triangles"] > 300_000:
        card["flags"] = ["oversized-for-mobile"]
    return card


def without_generated_times(card: dict) -> dict:
    clone = json.loads(json.dumps(card))
    for entry in clone.get("provenance", {}).values():
        entry.pop("at", None)
    return clone


def get_path(document: dict, path: str):
    value = document
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def set_path(document: dict, path: str, value) -> None:
    *head, last = path.split(".")
    for part in head:
        document = document.setdefault(part, {})
    if value is None:
        document.pop(last, None)
    else:
        document[last] = value


def preserve_unchanged(old: dict, new: dict) -> dict:
    merged = copy.deepcopy(new)
    for path, entry in old.get("provenance", {}).items():
        if path == "*" or not entry.get("locked"):
            continue
        set_path(merged, path, copy.deepcopy(get_path(old, path)))
        merged["provenance"][path] = copy.deepcopy(entry)
    return old if without_generated_times(old) == without_generated_times(merged) else merged


def qa_markdown(results: dict, packs: dict[str, list[Model]], generated: str) -> str:
    failures = sorted((uid, result["error"]) for uid, result in results.items() if not result.get("ok"))
    models = [model for pack_models in packs.values() for model in pack_models]
    clips_by_rig = library_clips(models, results)
    retargets = retarget_rigs(models, results)
    pivots, scales, variants, previews, textures, unanimated = [], [], [], [], [], []
    for pack_models in packs.values():
        measured = []
        for model in pack_models:
            result = results.get(model.uid)
            if not result or not result.get("ok"):
                continue
            analysis = result["analysis"]
            bounds = analysis["bounds"]
            largest = max(maximum - minimum for minimum, maximum in zip(bounds["min"], bounds["max"]))
            measured.append((model, result, analysis, largest))
        reference = median(largest for _, _, _, largest in measured if largest > 0) if measured else 0
        for model, result, analysis, largest in measured:
            if analysis["pivot"] == "other":
                pivots.append(f"`{model.uid}`: pivot `other`")
            ratio = largest / reference if reference else 1
            if largest > 100 or (0 < largest < 0.01) or ratio > 10 or ratio < 0.1:
                scales.append(f"`{model.uid}`: largest bound {largest:g} (pack median {reference:g})")
            sizes = texture_entries(model)
            over_cap = sorted((row for row in sizes if max(row["width_px"], row["height_px"]) > TEXTURE_CAP_PX),
                              key=lambda row: -max(row["width_px"], row["height_px"]))
            if over_cap:
                row = over_cap[0]
                textures.append(f"`{model.uid}`: `{row['key']}` is {row['width_px']}x{row['height_px']} px "
                                f"(cap {TEXTURE_CAP_PX})")
            if analysis.get("rig") and not clips(analysis.get("clips") or []):
                rig = analysis["rig"]
                plays = clips_by_rig.get(rig["rig_id"]) or clips_by_rig.get(retargets.get(model.uid, ""))
                if not plays:
                    unanimated.append(f"`{model.uid}`")
            companion_formats = {item.path.suffix.lower() for item in model.files if item.role == "companion"}
            missing = sorted({".fbx", ".obj"} - companion_formats)
            if missing:
                variants.append(f"`{model.uid}`: missing {', '.join(missing)} companion")
            if not result.get("output"):
                previews.append(f"`{model.uid}`: missing preview")

    def section(title: str, rows: list[str]) -> str:
        body = "\n".join(f"- {row}" for row in rows) if rows else "- None."
        return f"## {title}\n\n{body}\n"

    total = sum(len(pack_models) for pack_models in packs.values())
    categories = category_counts(packs, results)
    counted = ", ".join(f"{category} {count}" for category, count in categories)
    return (f"# KayKit Complete v7 asset QA\n\nGenerated: {generated} by `{TOOL}`.\n\n"
            f"Checked {len(packs)} packs and {total} canonical glTF/GLB assets: {len(failures)} load failures.\n\n"
            + section("Load failures", [f"`{uid}`: {error}" for uid, error in failures]) + "\n"
            + section("Categories", [counted or "None."]) + "\n"
            + section("Texture budget", textures) + "\n"
            + section("Characters with no clip library on their rig", unanimated) + "\n"
            + section("Suspect pivots", pivots) + "\n" + section("Scale outliers", scales) + "\n"
            + section("Missing source variants", variants) + "\n" + section("Missing previews", previews))


def category_of(model: Model, analysis: dict) -> str:
    if is_animation_library(model, analysis):
        return "anim"
    kind = subkind(model, analysis)
    return kind if kind in CATEGORY_ORDER else "other"


def category_counts(packs: dict[str, list[Model]], results: dict) -> list[tuple[str, int]]:
    counts = defaultdict(int)
    for pack_models in packs.values():
        for model in pack_models:
            result = results.get(model.uid)
            if result and result.get("ok"):
                counts[category_of(model, result["analysis"])] += 1
    return [(category, counts[category]) for category in CATEGORY_ORDER if counts[category]]


def category_lineups(packs: dict[str, list[Model]], results: dict) -> list[dict]:
    """One line-up per category across the whole set, paginated so no page is taller than the renderer can composite."""
    groups = defaultdict(list)
    for pack_models in packs.values():
        for model in pack_models:
            result = results.get(model.uid)
            if not result or not result.get("ok") or not result.get("output"):
                continue
            groups[category_of(model, result["analysis"])].append({
                "label": title_for(model),
                "thumbnail": f"packs/{model.pack_id}/thumbnails/{model.key}.png",
            })
    lineups = []
    for category in CATEGORY_ORDER:
        items = sorted(groups.pop(category, []), key=lambda item: (item["label"].lower(), item["thumbnail"]))
        pages = [items[start:start + LINEUP_PAGE_SIZE] for start in range(0, len(items), LINEUP_PAGE_SIZE)]
        for number, page in enumerate(pages, start=1):
            suffix = f"-{number:02d}" if len(pages) > 1 else ""
            label = f"KayKit {category.replace('-', ' ').title()}"
            lineups.append({"title": label if len(pages) == 1 else f"{label} {number}/{len(pages)}",
                            "output": f"derived/kaykit/lineups/{category}{suffix}.png",
                            "html": f"derived/kaykit/lineups/{category}{suffix}.html", "items": page})
    return lineups


def renderer_document(root: Path, packs: dict[str, list[Model]]) -> dict:
    jobs, lineups = [], []
    for pack_id, models in sorted(packs.items()):
        items = []
        for model in models:
            if model.error:
                continue
            path = (model.extracted / model.primary).relative_to(root).as_posix()
            output = f"packs/{pack_id}/thumbnails/{model.key}.png"
            jobs.append({"path": path, "output": output, "id": model.uid})
            items.append({"label": title_for(model), "thumbnail": output})
        lineups.append({"title": models[0].title, "output": f"packs/{pack_id}/lineup.png",
                        "html": f"packs/{pack_id}/lineup.html", "items": items})
    return {"jobs": jobs, "lineups": lineups}


def run_renderer(root: Path, document: dict) -> tuple[dict, list[dict]]:
    with tempfile.TemporaryDirectory(prefix="ogm-kaykit-") as tmp:
        jobs = Path(tmp) / "jobs.json"
        jobs.write_text(json.dumps(document))
        completed = subprocess.run(["node", str(RENDERER), "--root", str(root), "--jobs", str(jobs)],
                                   capture_output=True, text=True)
    if completed.returncode not in (0, 1):
        raise RuntimeError(f"renderer failed: {completed.stderr.strip()}")
    rows = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
    model_rows = [row for row in rows if row.get("type") != "lineup"]
    by_path = {job["path"]: job["id"] for job in document["jobs"]}
    return {by_path[row["path"]]: row for row in model_rows}, [row for row in rows if row.get("type") == "lineup"]


def validate(cards: list[dict]) -> None:
    if not cards:
        return
    with tempfile.TemporaryDirectory(prefix="ogm-kaykit-cards-") as tmp:
        files = []
        for index, card in enumerate(cards):
            path = Path(tmp) / f"{index}.json"
            path.write_text(json.dumps(card))
            files.append(str(path))
        completed = subprocess.run(["node", str(VALIDATOR), "--no-fixtures", *files], capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(f"generated card validation failed:\n{completed.stdout}{completed.stderr}")


def keep_unmeasured_rig(old: dict, card: dict, measured_libraries: bool) -> None:
    """A run that measured no clip library (`--only` another pack, or their renders failed) keeps what a full run wrote."""
    rig = card.get("rig")
    old_rig = old.get("rig") or {}
    if not rig or measured_libraries or rig["rig_id"] != old_rig.get("rig_id"):
        return
    if not rig.get("clips") and old_rig.get("clips"):
        rig["clips"] = copy.deepcopy(old_rig["clips"])
    if old_rig.get("retarget_rig_id"):
        rig["retarget_rig_id"] = old_rig["retarget_rig_id"]


def write_cards(root: Path, models: list[Model], results: dict, generated: str) -> int:
    source_cache = {}
    pairs = []
    clips_by_rig = library_clips(models, results)
    retargets = retarget_rigs(models, results)
    for model in models:
        if not results.get(model.uid, {}).get("ok"):
            continue
        card = build_card(model, results[model.uid]["analysis"], generated, source_cache, retargets.get(model.uid),
                          clips_by_rig)
        output = root / "packs" / model.pack_id / "cards" / f"{model.key}.card.json"
        if output.exists():
            old = json.loads(output.read_text())
            keep_unmeasured_rig(old, card, bool(clips_by_rig))
            card = preserve_unchanged(old, card)
        pairs.append((output, card))
    validate([card for _, card in pairs])
    for output, card in pairs:
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and json.loads(output.read_text()) == card:
            continue
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(card, indent=2) + "\n")
        temporary.replace(output)
    return len(pairs)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=REPO / "assets-local")
    parser.add_argument("--qa", type=Path, default=REPO / "docs" / "plans" / "ogm-v1-build" / "asset-qa" / "kaykit.md")
    parser.add_argument("--only", default="kaykit-*")
    parser.add_argument("--expected-packs", type=int, default=0)
    args = parser.parse_args()
    root = args.root.resolve()
    manifests = kaykit_manifests(root, args.only)
    models = models_for_manifests(manifests)
    if not models:
        parser.error(f"no KayKit glTF or GLB assets found under {root / 'packs'}")
    pack_ids = {manifest["id"] for _, manifest in manifests}
    if args.expected_packs:
        model_pack_ids = {model.pack_id for model in models}
        unexpected_meshless = sorted(pack_ids - model_pack_ids - MESHLESS_PACK_IDS)
        if unexpected_meshless:
            parser.error(f"KayKit packs contain no glTF or GLB assets: {', '.join(unexpected_meshless)}")
        if len(pack_ids) != args.expected_packs:
            parser.error(f"expected {args.expected_packs} KayKit packs, found {len(pack_ids)}")
    subprocess.run([sys.executable, "-I", str(COLLECTION_BUILDER), "--root", str(root), "--only", args.only], check=True)
    packs = defaultdict(list)
    for model in models:
        packs[model.pack_id].append(model)
    results = {model.uid: {"path": model.primary.as_posix(), "ok": False, "error": model.error}
               for model in models if model.error}
    rendered, lineups = run_renderer(root, renderer_document(root, packs))
    results.update(rendered)
    category_pages = category_lineups(packs, results)
    if category_pages:
        _, extra = run_renderer(root, {"jobs": [], "lineups": category_pages})
        lineups = [*lineups, *extra]
    generated = datetime.now().astimezone().isoformat(timespec="seconds")
    written = write_cards(root, models, results, generated)
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    args.qa.write_text(qa_markdown(results, packs, generated))
    subprocess.run([sys.executable, "-I", str(CATALOG_BUILDER), "--root", str(root)], check=True, cwd=REPO)
    subprocess.run(["pnpm", "--filter", "@ogm/asset-cards", "index:build", "--", str(root)], check=True, cwd=REPO)
    failed = sum(not result.get("ok") for result in results.values()) + sum(not row.get("ok") for row in lineups)
    print(f"{len(pack_ids)} packs, {len(models)} glTF/GLB assets, {written} cards, {failed} failures -> {args.qa}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
