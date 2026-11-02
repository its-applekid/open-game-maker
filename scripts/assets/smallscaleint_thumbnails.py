"""Deterministic private thumbnails for SmallScaleInt semantic cards."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


RENDERER = Path(__file__).resolve().parents[2] / "packages" / "asset-cards" / "scripts" / "build-smallscaleint-thumbnails.mjs"


def _preview(card: dict) -> tuple[str, dict | None]:
    animations = card.get("sprite", {}).get("animations", [])
    animations = sorted(animations, key=lambda item: (item.get("name") != "idle", item.get("name", "")))
    for animation in animations:
        if sheets := animation.get("sheets"):
            sheet = sheets[0]
            directions = animation.get("directions", [])
            row = directions.index("S") if "S" in directions else 0
            return sheet["path"], {
                "left": 0,
                "top": row * sheet["frame_h"],
                "width": sheet["frame_w"],
                "height": sheet["frame_h"],
            }
        if direction_files := animation.get("direction_files"):
            direction = "S" if "S" in direction_files else sorted(direction_files)[0]
            return direction_files[direction][0], None
        if files := animation.get("files"):
            return files[0], None
    if facings := card.get("sprite", {}).get("facings"):
        direction = "S" if "S" in facings else sorted(facings)[0]
        return facings[direction], None
    return card["source"]["files"][0]["path"], None


def thumbnail_jobs(root: Path, cards_by_pack: dict[str, list[dict]]) -> list[dict]:
    """Attach preview keys and return one root-relative render job per card."""
    jobs = []
    for pack_id, cards in sorted(cards_by_pack.items()):
        pack = root / "packs" / pack_id
        version = json.loads((pack / "pack.json").read_text())["current"]
        for card in cards:
            source_path, extract = _preview(card)
            sources = {item["path"]: item for item in card["source"]["files"]}
            if source_path not in sources:
                raise ValueError(f"preview source missing from card {card['id']}: {source_path}")
            transform = json.dumps(extract, sort_keys=True, separators=(",", ":"))
            digest = hashlib.sha256(
                f"{sources[source_path]['sha256']}|{transform}|webp-256-q82".encode()
            ).hexdigest()
            output = f"private/previews/{digest[:2]}/{digest[:16]}-thumb.webp"
            card["previews"] = {**card.get("previews", {}), "thumb": output}
            job = {"input": f"packs/{pack_id}/{version}/extracted/{source_path}", "output": output}
            if extract:
                job["extract"] = extract
            jobs.append(job)
    return jobs


def render_thumbnails(root: Path, jobs: list[dict]) -> None:
    """Render the batch through the workspace's pinned sharp dependency."""
    if not jobs:
        return
    result = subprocess.run(
        ["node", str(RENDERER), str(root)],
        input=json.dumps(jobs),
        capture_output=True,
        text=True,
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise ValueError(f"thumbnail renderer failed: {detail}")
