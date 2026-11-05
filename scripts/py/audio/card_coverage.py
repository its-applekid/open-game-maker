"""Coverage per pack and per field: what a pre-processing run actually put on the cards.

The searchability plan (`docs/research/asset-searchability-2026-11-05.md` §6) asks a pre-processing run to report
"coverage per pack and per field, not per file". A per-file list of ten thousand sound effects answers nothing; the
question an operator has is whether every pack came out with the fields an agent will search on — duration, key,
tempo, energy, loop points, previews, tags — and which pack is short and of what.

Fields that a card may legitimately lack are printed too but are not required: a one-second impact has no loop points
and a single gunshot belongs to no variation set. The distinction is in `REQUIRED` below, and `--min` gates on it.

usage: python3 -I card_coverage.py [--packs DIR] [--json] [--min FRACTION]
reads  packs/<id>/cards/**/*.card.json
prints one row per pack and a totals row, or the same report as JSON.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import name_tags  # noqa: E402  (the worker's own module, resolved from this file's directory)

REPO = HERE.parents[2]
ROOT = REPO / "assets-local"

# Every field the ticket asks a card to carry, by kind. Reported whether or not it is present.
FIELDS = {
    "music": (
        "audio.duration_s",
        "audio.tempo_bpm",
        "audio.key",
        "audio.energy",
        "audio.loop_points",
        "previews.clip",
        "describe.moods",
        "describe.genre",
        "describe.instruments",
        "describe.keywords",
    ),
    "sfx": (
        "audio.duration_s",
        "audio.ucs_cat_id",
        "audio.variation_group",
        "previews.clip",
        "describe.objects",
        "describe.keywords",
    ),
}

# What a card of each kind must carry for a search to work without opening the file. Music keeps its measured facts plus
# the tags CLAP fills in; a sound effect keeps the free name tags and one preview.
REQUIRED = {
    "music": ("audio.duration_s", "previews.clip", "describe.moods", "describe.keywords"),
    "sfx": ("audio.duration_s", "previews.clip", "describe.keywords"),
}

# A loop pack is carded to be looped, so every file with a seamless pair must say so. Which files those are is the
# measurement's call, so this is required of the pack, not of every card.
LOOP_PACK_REQUIRED = ("audio.loop_points",)


def kind_of(card):
    """Music or sound effect, from the card's own subkind rather than the pack name it came from."""
    return "music" if str(card.get("subkind", "")).startswith("music/") else "sfx"


def present(card, path):
    """True when the field carries a value. An empty string, list or object is not coverage: `moods: []` tells a search
    nothing, and counting it would hide a pack the model never reached."""
    node = card
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    if node is None:
        return False
    if isinstance(node, (str, list, dict, tuple)):
        return len(node) > 0
    return True


def load(packs):
    """(pack id, card, kind) for every asset card under a packs directory, in a stable order."""
    out = []
    for path in sorted(packs.glob("*/cards/**/*.card.json")):
        try:
            card = json.loads(path.read_text())
        except json.JSONDecodeError as error:
            print(f"skipping unreadable card {path}: {error}", file=sys.stderr)
            continue
        out.append((path.relative_to(packs).parts[0], card, kind_of(card)))
    return out


def summarise(rows, min_coverage=0.0):
    """Per pack and per kind: how many cards carry each field, and which of the required ones fall short."""
    packs = {}
    for pack, card, kind in rows:
        entry = packs.setdefault(pack, {"cards": 0, "kinds": {"music": 0, "sfx": 0}, "fields": {}})
        entry["cards"] += 1
        entry["kinds"][kind] += 1
        for path in FIELDS[kind]:
            seen = entry["fields"].setdefault(path, {"n": 0, "of": 0})
            seen["of"] += 1
            seen["n"] += 1 if present(card, path) else 0
    for pack, entry in packs.items():
        entry["fields"] = {
            path: {**counts, "pct": round(100.0 * counts["n"] / counts["of"], 1) if counts["of"] else None}
            for path, counts in entry["fields"].items()
        }
        entry["short"] = short_fields(pack, entry, min_coverage)
    return {"packs": dict(sorted(packs.items())), "min": min_coverage}


def short_fields(pack, entry, min_coverage=0.0):
    """The required fields of a pack that are below `min_coverage`, spelled out so a report says what to fix."""
    short = []
    for kind, required in REQUIRED.items():
        if not entry["kinds"][kind]:
            continue
        for path in required:
            counts = entry["fields"].get(path)
            if counts and (counts["pct"] or 0.0) < min_coverage * 100.0:
                short.append(f"{kind}:{path}={counts['pct']}%")
    if name_tags.is_loop_pack(pack) and entry["kinds"]["music"]:
        for path in LOOP_PACK_REQUIRED:
            counts = entry["fields"].get(path)
            if counts and (counts["pct"] or 0.0) < min_coverage * 100.0:
                short.append(f"loop-pack:{path}={counts['pct']}%")
    return short


def totals(report, kind=None):
    """The same field counts summed over every pack, so one number answers "is this family ready".

    With `kind`, only packs holding that kind contribute and only that kind's fields appear: a music total that counted
    an effect pack's missing key would understate readiness, and the two families are shipped separately anyway.
    """
    out = {"cards": 0, "kinds": {"music": 0, "sfx": 0}, "fields": {}}
    for entry in report["packs"].values():
        if kind and not entry["kinds"][kind]:
            continue
        out["cards"] += entry["cards"]
        for name in out["kinds"]:
            out["kinds"][name] += entry["kinds"][name]
        for path in FIELDS[kind] if kind else entry["fields"]:
            counts = entry["fields"].get(path)
            if not counts:
                continue
            seen = out["fields"].setdefault(path, {"n": 0, "of": 0})
            seen["n"] += counts["n"]
            seen["of"] += counts["of"]
    out["fields"] = {
        path: {**counts, "pct": round(100.0 * counts["n"] / counts["of"], 1) if counts["of"] else None}
        for path, counts in out["fields"].items()
    }
    return out


def label(path):
    """The column name of a field path: the last segment, which is unambiguous within a kind's list."""
    return path.rsplit(".", 1)[-1]


def cell(counts):
    """One percentage cell, or a dash where the kind has no cards carrying that field."""
    pct = (counts or {}).get("pct")
    return f"{pct:>9}" if pct is not None else f"{'-':>9}"


def render(report):
    """A table per kind, one row per pack plus a totals row; only the fields that kind of card can carry."""
    lines = []
    for kind in ("music", "sfx"):
        paths = list(FIELDS[kind])
        rows = [(pack, entry) for pack, entry in report["packs"].items() if entry["kinds"][kind]]
        if not rows:
            continue
        every = totals(report, kind)
        width = max([len("pack")] + [len(pack) for pack, _ in rows] + [len("TOTAL")])
        header = f"{'pack':<{width}}  cards  " + "  ".join(f"{label(p):>9}" for p in paths)
        lines.append(f"{kind}: {len(rows)} packs")
        lines.append(header)
        for pack, entry in rows:
            cells = "  ".join(cell(entry["fields"].get(path)) for path in paths)
            lines.append(f"{pack:<{width}}  {entry['kinds'][kind]:>5}  {cells}")
        cells = "  ".join(cell(every["fields"].get(path)) for path in paths)
        lines.append(f"{'TOTAL':<{width}}  {every['kinds'][kind]:>5}  {cells}")
        lines.append("")
    short = [(pack, entry["short"]) for pack, entry in report["packs"].items() if entry["short"]]
    if short:
        lines.append(f"below {report['min'] * 100:.0f}%:")
        lines.extend(f"  {pack}: {', '.join(fields)}" for pack, fields in short)
    else:
        lines.append(f"every required field is at or above {report['min'] * 100:.0f}%")
    return "\n".join(lines)


def project_run_hours(per_file_secs, files):
    """Extrapolate a calibrated run: time a handful of files, multiply by the files still to do.

    C3 §13's cost guard, and the one number a long run cannot give until it is over. Rounded to one decimal, because a
    calibration of twenty files should not look more precise than it is.
    """
    if not files or per_file_secs is None:
        return None
    return round(float(per_file_secs) * float(files) / 3600.0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", type=Path, default=ROOT / "packs")
    ap.add_argument("--json", action="store_true", help="print the report as JSON instead of tables")
    ap.add_argument("--min", type=float, default=0.0, help="fraction (0-1) every required field must reach; exits 1 when one does not")
    args = ap.parse_args()
    rows = load(args.packs)
    if not rows:
        print(json.dumps({"packs": {}, "min": args.min, "error": f"no cards under {args.packs}"}))
        return 1
    report = summarise(rows, args.min)
    print(json.dumps({**report, "total": totals(report)}, indent=1) if args.json else render(report))
    return 1 if any(entry["short"] for entry in report["packs"].values()) else 0


if __name__ == "__main__":
    sys.exit(main())
