"""Judge a whole asset set, not one item at a time: the pass bar, the fixes cap, the round cap and what "done" means.

One beautiful prop beside an off-style one is a failed set. This module holds the parts of that judgement that should
not be re-derived by hand every round - the score bar, the fixes cap, the round cap, the stall rule, and the
deliverable list that must exist before any "done" claim - so a showcase or kit review ends on evidence rather than
on the reviewer's mood. The looking itself stays with the agent (`gm-verify`): no provider key and no paid judge.

The rubric and the bar are adapted from AnyKit's critic (`agent/kit_builder.py`, MIT,
https://github.com/apekshik/anykit). See `docs/research/anykit-lessons-2026-11.md` for what was adopted and where.

Run:

    python3 -I scripts/assets/set_critic.py round.json [--work <dir>]

`round.json` is one round: ``{"round": 2, "scores": {"cohesion": 7, ...}, "fixes": ["..."], "history": [6.1, 6.4]}``.
It prints the verdict and exits 0 only when the set may ship. ``--work <dir>`` also gates deliverables, which default to
``manifest.json``, ``lineup.png`` and a non-empty ``thumbs/`` and can be replaced by a ``deliverables`` list in the
round file when a pipeline names its outputs differently.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CATEGORIES = (
    "cohesion",
    "reference_fidelity",
    "brief",
    "mesh_quality",
    "texture_quality",
    "assembly",
    "scale",
    "labels",
)
CATEGORY_MEANING = {
    "cohesion": "the items read as one set: shared palette, material language, era, wear and level of detail",
    "reference_fidelity": "the set belongs in the reference's world",
    "brief": "the items are what was asked for, nothing off-topic",
    "mesh_quality": "clean recognisable shapes; nothing broken, blobby or melted",
    "texture_quality": "believable surfaces; nothing untextured, smeared or flat grey",
    "assembly": "parts that belong together are seated and connected; nothing hovering or intersecting",
    "scale": "each item's real-world size is right alone and relative to the others",
    "labels": "no real brands, no garbled text on a hero label",
}
MIN_SCORE = 6
AVERAGE_SCORE = 7
MAX_FIXES = 5
MAX_ROUNDS = 8
STALL_ROUNDS = 3
DELIVERABLES = ("manifest.json", "lineup.png", "thumbs")


def score_round(scores: dict) -> dict:
    """Pass or fail one round of scores; malformed input fails rather than passes."""
    failures: list[str] = []
    clean: dict[str, int] = {}
    for category in CATEGORIES:
        if category not in (scores or {}):
            failures.append(f"missing score for {category}")
            continue
        value = scores[category]
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 10:
            failures.append(f"{category}: {value!r} is not a whole score from 1 to 10")
            continue
        clean[category] = value
    values = [clean[category] for category in CATEGORIES if category in clean]
    average = sum(values) / len(values) if values else 0.0
    lowest = [category for category in CATEGORIES if values and clean.get(category) == min(values)]
    passed = not failures and min(values) >= MIN_SCORE and average >= AVERAGE_SCORE
    if not failures and not passed:
        if min(values) < MIN_SCORE:
            failures.append(f"{lowest[0]} is below {MIN_SCORE}")
        if average < AVERAGE_SCORE:
            failures.append(f"average {average:.1f} is below {AVERAGE_SCORE}")
    return {
        "scores": clean,
        "lowest": lowest,
        "min": min(values) if values else None,
        "average": round(average, 2),
        "passed": passed,
        "failures": failures,
    }


def fixes_to_do(fixes: list) -> dict:
    """At most five fixes, most damaging first; the rest are reported, never silently dropped."""
    usable = [str(fix).strip() for fix in fixes or [] if str(fix).strip()]
    return {"fixes": usable[:MAX_FIXES], "dropped": max(0, len(usable) - MAX_FIXES)}


def stalled(history: list) -> bool:
    """Totals that stopped beating the best earlier total: the builder is going in circles and should deliver."""
    totals = [float(entry) if isinstance(entry, (int, float)) else float(entry.get("average", 0)) for entry in history or []]
    if len(totals) < STALL_ROUNDS + 1:
        return False
    earlier, recent = totals[:-STALL_ROUNDS], totals[-STALL_ROUNDS:]
    return max(recent) <= max(earlier)


def round_verdict(round_doc: dict) -> dict:
    """Keep fixing, deliver, or stop. Going past the round cap never blocks delivery: the best version ships."""
    number = int(round_doc.get("round") or 1)
    scored = score_round(round_doc.get("scores") or {})
    todo = fixes_to_do(round_doc.get("fixes"))
    stop = scored["passed"] or number >= MAX_ROUNDS or stalled(round_doc.get("history"))
    return {
        "round": number,
        "passed": scored["passed"],
        "scores": scored["scores"],
        "average": scored["average"],
        "lowest": scored["lowest"],
        "failures": scored["failures"],
        "fixes": todo["fixes"],
        "dropped_fixes": todo["dropped"],
        "stop_iterating": stop,
        "next": "deliver" if scored["passed"] else ("deliver the best version" if stop else "fix and render again"),
    }


def missing_deliverables(work: Path, deliverables=DELIVERABLES) -> list[str]:
    """The definition-of-done gate: every deliverable exists, and a directory deliverable holds something."""
    missing = []
    for name in deliverables:
        target = Path(work) / name
        if not target.exists():
            missing.append(name)
        elif target.is_dir() and not any(target.iterdir()):
            missing.append(f"{name} is empty")
    return missing


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Score one critic round of an asset set and say what to do next.")
    parser.add_argument("round", type=Path, help="JSON with round, scores, fixes and optional history")
    parser.add_argument("--work", type=Path, default=None, help="deliverable directory to gate")
    args = parser.parse_args(argv)
    round_doc = json.loads(args.round.read_text())
    verdict = round_verdict(round_doc)
    if args.work is not None:
        missing = missing_deliverables(args.work, round_doc.get("deliverables") or DELIVERABLES)
        verdict["missing_deliverables"] = missing
        if missing and verdict["passed"]:
            verdict["passed"] = False
            verdict["failures"].append("deliverables missing: " + ", ".join(missing))
            verdict["next"] = "finish the missing deliverables"
    print(json.dumps(verdict, indent=1))
    return 0 if verdict["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
