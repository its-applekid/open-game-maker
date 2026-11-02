"""Generate KayKit model and animation cards, thumbnails, lineups, QA, and catalog metadata.

The glTF copy is canonical when present; otherwise GLB is canonical. Other model
formats and external glTF resources are recorded on the same source block.

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

REPO = Path(__file__).resolve().parents[2]
RENDERER = REPO / "apps" / "web" / "tools" / "render-gltf.mjs"
VALIDATOR = REPO / "packages" / "contracts" / "bin" / "validate-cards.mjs"
COLLECTION_BUILDER = Path(__file__).parent / "build_collection_cards.py"
CATALOG_BUILDER = Path(__file__).parent / "build_catalog.py"
VOCAB = "2026-10-27"
TOOL = "preprocess-kaykit@0.1"
FORMAT_DIRS = {"blend", "blender", "fbx", "glb", "gltf", "models", "obj", "source", "sources"}
COMPANION_EXTS = {".blend", ".dae", ".fbx", ".mtl", ".obj"}
MODEL_EXTS = {".glb", ".gltf"}
MESHLESS_PACK_IDS = {"kaykit-character-animations"}
LOOP_CLIPS = {"crouch", "drive", "fall", "hold", "idle", "run", "sit", "sprint", "swim", "walk"}
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


def is_animation_library(model: Model, analysis: dict) -> bool:
    return (bool(analysis.get("rig") and analysis.get("clips")) and
            re.match(r"^rig[-_]", Path(model.key).name, re.IGNORECASE) is not None)


def animation_subkind(rig_type: str) -> str:
    if rig_type in {"creature", "quadruped"}:
        return "creature"
    return "vehicle" if rig_type == "vehicle" else "humanoid"


def retarget_rigs(models: list[Model], results: dict) -> dict[str, str]:
    """Model uid -> library rig id for skeletons no library targets whose joints (name + parent) a library rig contains."""
    analyses = {model.uid: results[model.uid]["analysis"] for model in models if results.get(model.uid, {}).get("ok")}
    libraries = {}
    for model in models:
        analysis = analyses.get(model.uid)
        if analysis and is_animation_library(model, analysis):
            libraries[analysis["rig"]["rig_id"]] = {(bone["name"], bone["parent"]) for bone in analysis["rig"]["bones"]}
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


def build_card(model: Model, analysis: dict, generated: str, source_cache: dict[Path, dict] | None = None,
               retarget_rig_id: str | None = None) -> dict:
    source_files = [source_entry(model, item, source_cache) for item in model.files]
    texture_keys = [item.path.as_posix() for item in model.files if item.role == "texture"]
    animation_library = is_animation_library(model, analysis)
    card = {
        "schema": "ogm.asset-card/1.0", "vocab": VOCAB,
        "id": f"t1:{model.pack_id}/{model.key}@{model.version}", "card_type": "asset", "status": "measured",
        "title": title_for(model),
        "collection": f"t1:{model.pack_id}@{model.version}",
        "source": {"files": source_files, "content_hash": next(row["sha256"] for row in source_files if row["role"] == "primary")},
        "previews": {"thumb": f"packs/{model.pack_id}/thumbnails/{model.key}.png"},
        "describe": {"style_family": "chunky-low-poly"},
        "provenance": {"*": {"by": "code", "tool": TOOL, "at": generated,
                                "input": "glTF/GLB loaded by three.js; source files hashed"},
                       "describe.style_family": {"by": "collection", "tool": TOOL, "at": generated,
                                                 "input": "KayKit Complete v7 compatibility pass"}},
    }
    if animation_library:
        rig = analysis["rig"]
        card.update({"kind": "anim", "subkind": animation_subkind(rig["rig_type"]),
                     "anim": {"target_rig_id": rig["rig_id"], "clips": clips(analysis["clips"])}})
    else:
        card.update({"kind": "model", "subkind": subkind(model, analysis),
                     "geometry": {"bounds_m": analysis["bounds"], "pivot": analysis["pivot"],
                                  "triangles": analysis["triangles"], "vertices": analysis["vertices"],
                                  "materials": analysis["materials"], "texture_keys": texture_keys,
                                  "normalized": False}})
    if analysis.get("rig") and not animation_library:
        rig = {key: value for key, value in analysis["rig"].items() if key != "bones"}
        rig["clips"] = clips(analysis.get("clips", []))
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
    pivots, scales, variants, previews = [], [], [], []
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
            companion_formats = {item.path.suffix.lower() for item in model.files if item.role == "companion"}
            missing = sorted({".fbx", ".obj"} - companion_formats)
            if missing:
                variants.append(f"`{model.uid}`: missing {', '.join(missing)} companion")
            if not result.get("output"):
                previews.append(f"`{model.uid}`: missing preview")

    def section(title: str, rows: list[str]) -> str:
        body = "\n".join(f"- {row}" for row in rows) if rows else "- None."
        return f"## {title}\n\n{body}\n"

    total = sum(len(models) for models in packs.values())
    return (f"# KayKit Complete v7 asset QA\n\nGenerated: {generated} by `{TOOL}`.\n\n"
            f"Checked {len(packs)} packs and {total} canonical glTF/GLB assets: {len(failures)} load failures.\n\n"
            + section("Load failures", [f"`{uid}`: {error}" for uid, error in failures]) + "\n"
            + section("Suspect pivots", pivots) + "\n" + section("Scale outliers", scales) + "\n"
            + section("Missing source variants", variants) + "\n" + section("Missing previews", previews))


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


def write_cards(root: Path, models: list[Model], results: dict, generated: str) -> int:
    source_cache = {}
    pairs = []
    retargets = retarget_rigs(models, results)
    for model in models:
        if not results.get(model.uid, {}).get("ok"):
            continue
        card = build_card(model, results[model.uid]["analysis"], generated, source_cache, retargets.get(model.uid))
        output = root / "packs" / model.pack_id / "cards" / f"{model.key}.card.json"
        if output.exists():
            card = preserve_unchanged(json.loads(output.read_text()), card)
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
