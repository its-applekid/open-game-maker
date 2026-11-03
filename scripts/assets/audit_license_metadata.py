#!/usr/bin/env python3
"""List installed asset packs that cannot produce complete lock credit metadata."""

import argparse
import json
from pathlib import Path
from typing import Any


UNKNOWN = {"", "unknown", "noassertion"}


def present(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() not in UNKNOWN


def source_present(value: Any) -> bool:
    if present(value):
        return True
    if not isinstance(value, dict):
        return False
    return any(present(value.get(key)) for key in ("label", "vendor", "url", "drop"))


def audit(root: Path) -> list[str]:
    packs = root / "packs"
    if not packs.is_dir():
        raise FileNotFoundError(f"asset pack directory does not exist: {packs}")
    gaps: list[str] = []
    for directory in sorted(path for path in packs.iterdir() if path.is_dir()):
        manifest = directory / "pack.json"
        if not manifest.is_file():
            gaps.append(f"{directory.name}: missing pack.json")
            continue
        try:
            document = json.loads(manifest.read_text())
        except (json.JSONDecodeError, OSError):
            gaps.append(f"{directory.name}: pack.json is not valid JSON")
            continue
        if not isinstance(document, dict):
            gaps.append(f"{directory.name}: pack.json is not an object")
            continue
        missing = [
            *([] if present(document.get("license")) else ["license"]),
            *([] if present(document.get("license_source")) else ["license_source"]),
            *([] if present(document.get("attribution")) else ["attribution"]),
            *([] if source_present(document.get("source")) else ["source"]),
        ]
        if missing:
            gaps.append(f"{directory.name}: missing {', '.join(sorted(missing))}")
    return gaps


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path("assets-local"))
    args = parser.parse_args()
    try:
        gaps = audit(args.root)
    except FileNotFoundError as error:
        parser.error(str(error))
    if gaps:
        print("\n".join(gaps))
        return 1
    print("all installed asset packs carry licence metadata")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
