"""Card every 3D pack in the local asset library, converting FBX/OBJ/DAE/BLEND sources first.

Run: python3 -I scripts/assets/preprocess_3d.py [options]

    --root PATH        asset library (default assets-local/)
    --only GLOB        pack id glob, repeatable (default: every 3D-family pack)
    --pack ID          exact pack id, repeatable
    --skip-convert     card the glTF/GLB that already exist and leave sources alone
    --dry-run          print the conversion plan and stop
    --scale FLOAT      source unit scale handed to Blender (default 1.0)
    --no-normalize     skip standing each converted model on Y = 0
    --skip-render      write no thumbnails or lineups (analysis is unavailable without the renderer)
    --qa PATH          QA report path

The pipeline is the KayKit one made vendor-agnostic: `three_d.py` decides which file represents each
model and which style family and set its pack belongs to, the shared three.js renderer measures every
canonical glTF and draws its thumbnail and pack lineup, and every card carries the four-to-six numbers
an agent filters on (triangles, bounds, footprint in cells, materials, rig id, clips) with no prose.
`style-families.json` order is the creation-choice order, so a finished family is processed first.

Tier files are not made here: `gm build assets` (OGM-063) produces the device tiers from the
polycount these cards record (D-TIERS: import never makes variants).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import preprocess_kaykit as kaykit  # noqa: E402
import three_d  # noqa: E402

REPO = kaykit.REPO
TOOL = "preprocess-3d@0.1"
FAMILIES = REPO / "packages" / "asset-cards" / "data" / "style-families.json"
BLENDER_SCRIPT = HERE / "blender_fbx_to_glb.py"


def manifests(root: Path) -> dict[str, tuple[Path, dict]]:
    found = {}
    for path in sorted((root / "packs").glob("*/pack.json")):
        manifest = json.loads(path.read_text(encoding="utf-8"))
        found[manifest["id"]] = (path, manifest)
    return found


def selected(root: Path, styles: dict[str, three_d.StyleEntry], only: list[str],
             packs: list[str]) -> list[tuple[Path, dict]]:
    """3D-family packs in creation-choice order, then any pack the caller named explicitly."""
    known = manifests(root)
    order = [pack_id for pack_id in styles if pack_id in known]
    order += sorted(pack_id for pack_id in known if pack_id not in styles)
    chosen = []
    for pack_id in order:
        path, manifest = known[pack_id]
        if packs and pack_id not in packs:
            continue
        if only and not any(path.parent.match(pattern) for pattern in only):
            continue
        if not packs and not only and pack_id not in styles:
            continue
        chosen.append((path, manifest))
    return chosen


def extracted_for(manifest_path: Path, manifest: dict) -> Path:
    return manifest_path.parent / manifest["current"] / "extracted"


def plan_all(chosen: list[tuple[Path, dict]]) -> tuple[list[three_d.SourcePlan], dict[str, Path]]:
    plans, roots = [], {}
    for manifest_path, manifest in chosen:
        extracted = extracted_for(manifest_path, manifest)
        roots[manifest["id"]] = extracted
        plans.extend(three_d.plan_pack(manifest, extracted))
    return plans, roots


def convert(plans: list[three_d.SourcePlan], roots: dict[str, Path], blender: str, scale: float,
            normalize: bool) -> list[dict]:
    """Run the pending conversions, returning one row per failure so QA can name them."""
    failures = []
    for plan in plans:
        if not plan.needs_conversion:
            continue
        extracted = roots[plan.pack_id]
        target = extracted / plan.target
        if target.exists() and target.stat().st_mtime >= (extracted / plan.source).stat().st_mtime:
            continue
        argv = three_d.conversion_argv(BLENDER_SCRIPT, extracted / plan.source, target,
                                       scale=scale, normalize=normalize, blender=blender)
        completed = subprocess.run(argv, capture_output=True, text=True)
        if completed.returncode != 0 or not target.is_file():
            detail = (completed.stderr or completed.stdout).strip().splitlines()
            failures.append({"uid": plan.uid, "source": plan.source.as_posix(),
                             "error": detail[-1] if detail else f"blender exited {completed.returncode}"})
    return failures


def models_for(chosen: list[tuple[Path, dict]], roots: dict[str, Path]) -> list[kaykit.Model]:
    """One Model per canonical key, using the file `three_d.plan_pack` picked as primary."""
    models = []
    for manifest_path, manifest in chosen:
        extracted = roots[manifest["id"]]
        for plan in three_d.plan_pack(manifest, extracted):
            if plan.error or plan.source is None:
                continue
            primary = extracted / plan.source
            files = [kaykit.SourceFile(plan.source, "primary")]
            if plan.source.suffix.lower() == ".gltf":
                files.extend(kaykit.external_resources(primary, extracted))
            files.extend(kaykit.SourceFile(path, "companion") for path in plan.alternates)
            models.append(kaykit.Model(manifest["id"], manifest["current"], manifest["title"], extracted,
                                       plan.source, plan.key,
                                       tuple(sorted(set(files), key=lambda item: item.path.as_posix()))))
    return models


def describe(style: three_d.StyleEntry) -> dict:
    """A pack outside a curated set has no `set`: the field is a string, never null."""
    document = {"style_family": style.style_family}
    if style.set_id:
        document["set"] = style.set_id
    return document


def build_card(model: kaykit.Model, style: three_d.StyleEntry, analysis: dict, generated: str,
               cell_m: float, source_cache: dict | None = None) -> dict:
    source_files = [kaykit.source_entry(model, item, source_cache) for item in model.files]
    texture_keys = [item.path.as_posix() for item in model.files if item.role == "texture"]
    geometry = three_d.geometry_facts(analysis, texture_keys, cell_m)
    card = {
        "schema": "ogm.asset-card/1.0", "vocab": kaykit.VOCAB,
        "id": f"t1:{model.pack_id}/{model.key}@{model.version}", "card_type": "asset", "status": "measured",
        "title": kaykit.title_for(model),
        "collection": f"t1:{model.pack_id}@{model.version}",
        "source": {"files": source_files,
                   "content_hash": next(row["sha256"] for row in source_files if row["role"] == "primary")},
        "previews": {"thumb": f"packs/{model.pack_id}/thumbnails/{model.key}.png"},
        "describe": describe(style),
        "geometry": geometry,
        "kind": "model",
        "subkind": kaykit.subkind(model, analysis),
        "provenance": {
            "*": {"by": "code", "tool": TOOL, "at": generated,
                  "input": "glTF/GLB loaded by three.js; source files hashed"},
            "describe.style_family": {"by": "code", "tool": TOOL, "at": generated,
                                      "input": "packages/asset-cards/data/style-families.json"},
        },
    }
    if style.set_id:
        card["provenance"]["describe.set"] = {"by": "code", "tool": TOOL, "at": generated,
                                              "input": "packages/asset-cards/data/style-families.json"}
    if analysis.get("rig"):
        rig = {key: value for key, value in analysis["rig"].items() if key != "bones"}
        rig["clips"] = kaykit.clips(analysis.get("clips", []))
        card["rig"] = rig
    if not three_d.fits_mobile(analysis["triangles"]):
        card["flags"] = ["oversized-for-mobile"]
    return card


def write_cards(root: Path, models: list[kaykit.Model], results: dict, styles: dict, generated: str,
                cell_m: float) -> int:
    source_cache: dict = {}
    pairs = []
    for model in models:
        result = results.get(model.uid)
        if not result or not result.get("ok"):
            continue
        card = build_card(model, styles[model.pack_id], result["analysis"], generated, cell_m, source_cache)
        output = root / "packs" / model.pack_id / "cards" / f"{model.key}.card.json"
        if output.exists():
            card = kaykit.preserve_unchanged(json.loads(output.read_text()), card)
        pairs.append((output, card))
    kaykit.validate([card for _, card in pairs])
    for output, card in pairs:
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and json.loads(output.read_text()) == card:
            continue
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(card, indent=2) + "\n")
        temporary.replace(output)
    return len(pairs)


def qa_markdown(results: dict, packs: dict, styles: dict, failures: list[dict], generated: str) -> str:
    load = sorted((uid, result["error"]) for uid, result in results.items() if not result.get("ok"))
    scales, previews, heavy = [], [], []
    for pack_id, pack_models in packs.items():
        measured = []
        for model in pack_models:
            result = results.get(model.uid)
            if not result or not result.get("ok"):
                continue
            bounds = result["analysis"]["bounds"]
            largest = max(maximum - minimum for minimum, maximum in zip(bounds["min"], bounds["max"]))
            measured.append((model, result, largest))
        reference = median(largest for _, _, largest in measured if largest > 0) if measured else 0
        for model, result, largest in measured:
            analysis = result["analysis"]
            ratio = largest / reference if reference else 1
            if largest > 100 or (0 < largest < 0.01) or ratio > 10 or ratio < 0.1:
                scales.append(f"`{model.uid}`: largest bound {largest:g} (pack median {reference:g})")
            if not result.get("output"):
                previews.append(f"`{model.uid}`: missing preview")
            if not three_d.fits_mobile(analysis["triangles"]):
                heavy.append(f"`{model.uid}`: {analysis['triangles']} triangles, over the mobile budget")

    def section(title: str, rows: list[str]) -> str:
        body = "\n".join(f"- {row}" for row in rows) if rows else "- None."
        return f"## {title}\n\n{body}\n"

    families = sorted({(styles[pack_id].style_family, styles[pack_id].set_id) for pack_id in packs})
    total = sum(len(models) for models in packs.values())
    measured = sum(1 for result in results.values() if result.get("ok"))
    return (f"# 3D pack QA\n\nGenerated: {generated} by `{TOOL}`.\n\n"
            f"Checked {len(packs)} packs and {total} canonical glTF/GLB assets: {measured} measured, "
            f"{len(load)} load failures, {len(failures)} conversion failures.\n\n"
            f"Families in creation-choice order: {', '.join(f'{family}/{set_id}' for family, set_id in families)}.\n\n"
            + section("Conversion failures", [f"`{row['uid']}` ({row['source']}): {row['error']}" for row in failures])
            + "\n" + section("Load failures", [f"`{uid}`: {error}" for uid, error in load]) + "\n"
            + section("Over the mobile budget", heavy) + "\n"
            + section("Scale outliers", scales) + "\n" + section("Missing previews", previews))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=REPO / "assets-local")
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--pack", action="append", default=[])
    parser.add_argument("--skip-convert", action="store_true")
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--no-normalize", action="store_true")
    parser.add_argument("--cell-m", type=float, default=three_d.CELL_M)
    parser.add_argument("--qa", type=Path,
                        default=REPO / "docs" / "plans" / "ogm-v1-build" / "asset-qa" / "3d.md")
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "packs").is_dir():
        parser.error(f"{root} must contain an existing packs directory")
    styles = three_d.style_index(three_d.families_from_file(FAMILIES))
    chosen = selected(root, styles, args.only, args.pack)
    if not chosen:
        parser.error(f"no 3D packs matched {args.only or args.pack or 'the 3D families'} under {root}")
    unlisted = [manifest["id"] for _, manifest in chosen if manifest["id"] not in styles]
    if unlisted:
        parser.error("not in a 3D style family: " + ", ".join(sorted(unlisted)))
    plans, roots = plan_all(chosen)
    if args.dry_run:
        print(json.dumps({"packs": [manifest["id"] for _, manifest in chosen],
                          **three_d.conversion_summary(plans)}, indent=2))
        return 1 if three_d.conversion_summary(plans)["errors"] else 0

    failures = []
    if not args.skip_convert:
        pending = [plan for plan in plans if plan.needs_conversion]
        if pending:
            blender = shutil.which("blender")
            if not blender:
                parser.error("blender is not on PATH; pass --skip-convert to card existing glTF only")
            failures = convert(plans, roots, blender, args.scale, not args.no_normalize)

    packs: dict[str, list[kaykit.Model]] = defaultdict(list)
    for model in models_for(chosen, roots):
        packs[model.pack_id].append(model)
    if not packs:
        parser.error(f"no 3D models found in {len(chosen)} pack(s)")
    results = {model.uid: {"path": model.primary.as_posix(), "ok": False,
                           "error": "no converted glTF/GLB"} for model in sum(packs.values(), [])}
    if not args.skip_render:
        rendered, lineups = kaykit.run_renderer(root, kaykit.renderer_document(root, packs))
        results.update(rendered)
        if any(not row.get("ok") for row in lineups):
            failures.extend({"uid": row["output"], "source": "lineup",
                             "error": row.get("error", "lineup failed")} for row in lineups if not row.get("ok"))
    generated = datetime.now().astimezone().isoformat(timespec="seconds")
    written = 0 if args.skip_render else write_cards(root, sum(packs.values(), []), results, styles,
                                                     generated, args.cell_m)
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    args.qa.write_text(qa_markdown(results, packs, styles, failures, generated))
    subprocess.run([sys.executable, "-I", str(kaykit.CATALOG_BUILDER), "--root", str(root)],
                   check=True, cwd=REPO)
    if not args.skip_render:
        subprocess.run(["pnpm", "--filter", "@ogm/asset-cards", "index:build", "--", str(root)],
                       check=True, cwd=REPO)
    total = sum(len(models) for models in packs.values())
    unmeasured = sum(1 for result in results.values() if not result.get("ok"))
    print(f"{len(packs)} packs, {total} canonical models, {written} cards, "
          f"{unmeasured} unmeasured, {len(failures)} conversion/lineup failures -> {args.qa}")
    return 1 if (unmeasured and not args.skip_render) or failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
