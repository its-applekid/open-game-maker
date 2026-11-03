#!/usr/bin/env python3
"""Render the OGM V1 requirement-to-ticket disposition table."""

import argparse
import base64
import json
import re
import subprocess
import sys
from pathlib import Path


LOCAL_PLANNING_REF = "origin/research"
REMOTE_PLANNING_REF = "research"
DEFAULT_REPO = "its-everdred/open-game-maker"
PACK_PATH = "docs/plans/ogm-v1-build/build-order.json"
REQUIREMENTS_PATH = "docs/plans/ogm-v1-build/requirements.md"
REPO_ROOT = Path(__file__).resolve().parents[4]
REQUIREMENT_RE = re.compile(r"^-\s+(R\d+)\.", re.MULTILINE)
MARKER_RE = re.compile(r"<!--\s*gm-ticket:(OGM-\d{3})\b")


def command(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(args, cwd=cwd, check=False, capture_output=True, text=True)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise RuntimeError(f"{' '.join(args[:2])} failed: {detail}")
    return result.stdout


def frozen_text(path: str, repo: str) -> str:
    result = subprocess.run(
        ["git", "show", f"{LOCAL_PLANNING_REF}:{path}"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return result.stdout

    encoded = command(
        "gh",
        "api",
        "--method",
        "GET",
        f"repos/{repo}/contents/{path}",
        "-f",
        f"ref={REMOTE_PLANNING_REF}",
        "--jq",
        ".content",
    )
    return base64.b64decode("".join(encoded.split())).decode("utf-8")


def load_issues(path: Path | None, repo: str) -> list[dict]:
    if path:
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = json.loads(
            command(
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "--method",
                "GET",
                f"repos/{repo}/issues",
                "-f",
                "state=all",
                "-f",
                "per_page=100",
            )
        )
    if data and isinstance(data[0], list):
        return [issue for page in data for issue in page]
    return data


def issue_index(issues: list[dict]) -> dict[str, dict]:
    indexed: dict[str, dict] = {}
    for issue in issues:
        body = issue.get("body") or ""
        match = MARKER_RE.search(body)
        label_names = {
            label.get("name", "") if isinstance(label, dict) else str(label)
            for label in issue.get("labels", [])
        }
        is_planned = any(name.startswith("build-lane:") for name in label_names) and any(
            name.startswith("complexity:") for name in label_names
        )
        if not match or not is_planned:
            continue
        ticket_id = match.group(1)
        if ticket_id in indexed:
            raise ValueError(f"duplicate issue marker: {ticket_id}")
        indexed[ticket_id] = issue
    return indexed


def render(requirements_text: str, pack: dict, issues: list[dict]) -> str:
    requirement_ids = REQUIREMENT_RE.findall(requirements_text)
    requirement_set = set(requirement_ids)
    entries = {entry["id"]: entry for entry in pack["requirements"]}
    missing = sorted(requirement_set - entries.keys())
    extra = sorted(entries.keys() - requirement_set)
    if missing:
        raise ValueError(f"requirements missing from pack: {', '.join(missing)}")
    if extra:
        raise ValueError(f"pack entries missing from requirements: {', '.join(extra)}")

    indexed = issue_index(issues)
    lines = [
        "| Requirement | Disposition | Tickets | Merged | Note |",
        "|---|---|---|---|---|",
    ]
    for requirement_id in requirement_ids:
        entry = entries[requirement_id]
        ticket_ids = entry.get("ticket_ids", [])
        open_tickets = [
            ticket_id
            for ticket_id in ticket_ids
            if ticket_id in indexed and indexed[ticket_id].get("state", "").lower() != "closed"
        ]
        missing_tickets = [ticket_id for ticket_id in ticket_ids if ticket_id not in indexed]
        merged = "yes" if ticket_ids and not open_tickets and not missing_tickets else "no"
        notes = []
        if open_tickets:
            notes.append(
                "open: "
                + ", ".join(f"{ticket_id} (#{indexed[ticket_id]['number']})" for ticket_id in open_tickets)
            )
        if missing_tickets:
            notes.append(f"missing: {', '.join(missing_tickets)}")
        note = "; ".join(notes) if notes else "all ticket issues closed"
        lines.append(
            f"| {requirement_id} | {entry['disposition']} | {', '.join(ticket_ids)} | {merged} | {note} |"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path)
    parser.add_argument("--requirements", type=Path)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--offline", type=Path, metavar="ISSUES_JSON")
    args = parser.parse_args()

    try:
        pack_text = args.pack.read_text(encoding="utf-8") if args.pack else frozen_text(PACK_PATH, args.repo)
        requirements_text = (
            args.requirements.read_text(encoding="utf-8")
            if args.requirements
            else frozen_text(REQUIREMENTS_PATH, args.repo)
        )
        print(render(requirements_text, json.loads(pack_text), load_issues(args.offline, args.repo)), end="")
    except (KeyError, OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
