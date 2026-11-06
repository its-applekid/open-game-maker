"""Audit the installed asset library for the SmallScaleInt UI, item, skill and map kit.

The audit is a search rather than a fixed list of paths. Every element the first game's inventory and
HUD needs is looked up in the installed packs at run time, in the ticket's priority order: a pack that
is already installed first, a processed variant of an owned asset second. Anything the library cannot
supply becomes a named gap instead of an invented source, and licence/rights text is read from each
pack's ``pack.json`` so a row never claims provenance the library does not carry. No pack file is
copied or modified by this tool.

Run it on the asset-library host, from the repository root:

    python3 -I scripts/assets/smallscaleint_ui_audit.py --root assets-local

Outputs land under ``assets-local/sets/smallscaleint/kit/ui/`` (``gap-table.md``, ``lineups.html``,
``manifest.json``, ``README.md``). ``--strict`` exits non-zero when a named gap is still open.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


OUTPUT = Path("sets/smallscaleint/kit/ui")
PACKS = Path("packs")
TAGS = Path(__file__).resolve().parent / "data" / "collection_tags.jsonl"
IMAGE_SUFFIXES = frozenset({".png", ".gif", ".jpg", ".jpeg", ".webp"})
SKIP_PARTS = frozenset({"originals", "quarantine"})
# Pack sheets, not art: the same skip list build_collection_cards.py uses.
SKIP_NAMES = frozenset({"preview.png", "sample.png", "icon.png", "thumbnail.png"})
MAX_PACK_FILES = 200_000
PICKS_PER_NEED = 4
GROUPS = ("Equipment", "Consumable", "Skill", "HUD", "Map")


@dataclass(frozen=True)
class Candidate:
    """One installed pack to look in, and the word its files are expected to carry."""

    pack: str
    pattern: str
    note: str = ""


@dataclass(frozen=True)
class Need:
    """One inventory or HUD element the game needs, and where its art may come from."""

    key: str
    group: str
    label: str
    candidates: tuple[Candidate, ...]
    variant: str | None = None


def candidate(pack: str, pattern: str, note: str = "") -> Candidate:
    return Candidate(pack, pattern, note)


def need(group: str, key: str, label: str, candidates: tuple[Candidate, ...], variant: str | None = None) -> Need:
    if group not in GROUPS:
        raise ValueError(f"unknown need group: {group}")
    return Need(key, group, label, candidates, variant)


NEEDS_DATA = Path(__file__).resolve().parent / "data" / "smallscaleint_ui_needs.json"


def load_needs(path: Path = NEEDS_DATA) -> tuple[tuple[Need, ...], dict[str, dict]]:
    """The element catalogue and its variant recipes, read from data so later games extend the JSON."""

    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError) as error:
        raise ValueError(f"{path} is not a readable need catalogue: {error}") from error
    variants = {name: dict(body) for name, body in (data.get("variants") or {}).items()}
    if not variants:
        raise ValueError(f"{path} declares no variant recipes")
    declared = tuple(data.get("groups") or GROUPS)
    if declared != GROUPS:
        raise ValueError(f"{path} groups must be {GROUPS}, not {declared}")
    needs = []
    for raw in data.get("needs") or ():
        entries = tuple(
            candidate(entry["pack"], entry["pattern"], entry.get("note", "")) for entry in raw.get("candidates") or ()
        )
        if not entries:
            raise ValueError(f"{path}: need {raw.get('key')} names no candidate pack")
        if raw.get("variant") is not None and raw["variant"] not in variants:
            raise ValueError(f"{path}: need {raw.get('key')} names unknown variant {raw['variant']}")
        needs.append(need(raw["group"], raw["key"], raw["element"], entries, raw.get("variant")))
    if not needs:
        raise ValueError(f"{path} declares no needs")
    return tuple(needs), variants


NEEDS, VARIANTS = load_needs()


def need_keys() -> dict[str, Need]:
    keys = {item.key: item for item in NEEDS}
    if len(keys) != len(NEEDS):
        raise ValueError("need keys must be unique")
    for item in NEEDS:
        for entry in item.candidates:
            re.compile(entry.pattern, re.IGNORECASE)
    return keys


def load_index(path: Path = TAGS) -> dict[str, dict]:
    """The committed collection index, so a row can say what the library's own tag sheet claims."""

    index: dict[str, dict] = {}
    try:
        lines = Path(path).read_text().splitlines()
    except OSError:
        return index
    for line in lines:
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and isinstance(row.get("id"), str):
            index[row["id"]] = row
    return index


def pack_images(directory: Path, limit: int = MAX_PACK_FILES) -> tuple[list[str], bool]:
    """Every image under an installed pack, relative to it, in a stable order."""

    images: list[str] = []
    truncated = False
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        relative = path.relative_to(directory)
        if SKIP_PARTS & {part.lower() for part in relative.parts[:-1]}:
            continue
        images.append(relative.as_posix())
        if len(images) >= limit:
            truncated = True
            break
    return images, truncated


class Library:
    """Read-only access to the installed asset library, with per-pack caching."""

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.packs = self.root / PACKS
        if not self.packs.is_dir():
            raise FileNotFoundError(f"{self.root} has no {PACKS.as_posix()}/ directory; point --root at the asset library")
        self._images: dict[str, list[str]] = {}
        self._manifests: dict[str, dict] = {}
        self.truncated: set[str] = set()

    def installed(self, pack: str) -> bool:
        return (self.packs / pack).is_dir()

    def images(self, pack: str) -> list[str]:
        if pack not in self._images:
            images, truncated = pack_images(self.packs / pack)
            if truncated:
                self.truncated.add(pack)
            self._images[pack] = images
        return self._images[pack]

    def manifest(self, pack: str) -> dict:
        if pack not in self._manifests:
            try:
                data = json.loads((self.packs / pack / "pack.json").read_text())
            except (OSError, ValueError):
                data = {}
            self._manifests[pack] = data if isinstance(data, dict) else {}
        return self._manifests[pack]

    def title(self, pack: str) -> str:
        manifest = self.manifest(pack)
        for key in ("title", "name"):
            if isinstance(manifest.get(key), str) and manifest[key].strip():
                return manifest[key]
        return pack

    def rights(self, pack: str) -> str:
        """Licence and the uses its own pack.json allows, or `unverified` when the pack does not say."""

        manifest = self.manifest(pack)
        license_id = str(manifest.get("license") or "").strip()
        if not license_id:
            return "unverified (pack.json has no licence)"
        usage = manifest.get("usage_rights")
        uses = usage.get("uses") if isinstance(usage, dict) else None
        if isinstance(uses, list) and uses:
            return f"{license_id} · {'/'.join(str(use) for use in uses)}"
        return license_id


def lookup(library: Library, item: Need) -> tuple[list[dict], list[str]]:
    """Installed candidates for one need, in the catalogue's priority order."""

    picks: list[dict] = []
    searched: list[str] = []
    for entry in item.candidates:
        if len(picks) >= PICKS_PER_NEED:
            break
        if not library.installed(entry.pack):
            searched.append(f"{entry.pack} (not installed)")
            continue
        searched.append(entry.pack)
        pattern = re.compile(entry.pattern, re.IGNORECASE)
        for image in library.images(entry.pack):
            if len(picks) >= PICKS_PER_NEED:
                break
            if Path(image).name.lower() in SKIP_NAMES:
                continue
            if pattern.search(image):
                picks.append(
                    {
                        "pack": entry.pack,
                        "title": library.title(entry.pack),
                        "path": f"{PACKS.as_posix()}/{entry.pack}/{image}",
                        "note": entry.note,
                        "rights": library.rights(entry.pack),
                    }
                )
    return picks, searched


def coverage(library: Library) -> list[dict]:
    """One row per need: an installed source, an owned-asset variant of one, or a named gap."""

    rows: list[dict] = []
    for item in NEEDS:
        picks, searched = lookup(library, item)
        if picks:
            disposition = "variant" if item.variant else "direct"
            head = picks[0]
            # The last two segments: numbered frame files only mean something next to their folder.
            source = f"{head['pack']}: {'/'.join(Path(head['path']).parts[-2:])}"
            if len(picks) > 1:
                source += f" (+{len(picks) - 1} more)"
            if item.variant:
                note = f"{item.variant}: {VARIANTS[item.variant]['op']}"
                if head["note"]:
                    note += f"; {head['note']}"
            else:
                note = head["note"] or "installed as-is"
            rights = head["rights"]
        else:
            disposition = "named gap"
            source = f"GAP-{item.key.upper()}"
            installed = [name for name in searched if not name.endswith("(not installed)")]
            truncated = sorted(name for name in installed if name in library.truncated)
            if installed:
                note = f"no file matching the expected words in {', '.join(installed)}"
            else:
                note = "no candidate pack is installed"
            if truncated:
                note += f" (pack scan stopped at {MAX_PACK_FILES} files in {', '.join(truncated)}; confirm by eye)"
            rights = "—"
        rows.append(
            {
                "key": item.key,
                "group": item.group,
                "element": item.label,
                "disposition": disposition,
                "source": source,
                "rights": rights,
                "note": note,
                "variant": item.variant,
                "picks": picks,
                "searched": searched,
            }
        )
    return rows


def counts(rows: list[dict]) -> dict[str, int]:
    return {
        "needs": len(rows),
        "direct": sum(1 for row in rows if row["disposition"] == "direct"),
        "variant": sum(1 for row in rows if row["disposition"] == "variant"),
        "named_gaps": sum(1 for row in rows if row["disposition"] == "named gap"),
        "unverified_rights": sum(1 for row in rows if row["rights"].startswith("unverified")),
    }


def cell(value: str) -> str:
    return value.replace("|", "\\|")


def render_gap_table(rows: list[dict], summary: dict[str, int]) -> str:
    lines = [
        "# SmallScaleInt UI, item, skill, HUD and map audit",
        "",
        "One row per inventory and HUD element the first SmallScaleInt game needs. The audit searched the "
        "installed packs in the order the asset workflow requires: a pack that is already installed first, "
        "a processed variant of an owned asset second. `direct` is a pack file usable as-is, `variant` names "
        "the treatment an installed file needs, and `named gap` is an element the installed library cannot "
        "supply. Rights are read from each pack's own `pack.json`; no pack file is copied or modified.",
        "",
        f"{summary['needs']} elements: {summary['direct']} direct, {summary['variant']} variant, "
        f"{summary['named_gaps']} named gaps.",
        "",
        "| Group | Element | Disposition | Source or named gap | Rights | Note |",
        "|---|---|---|---|---|---|",
    ]
    for row in rows:
        values = [cell(row[key]) for key in ("group", "element", "disposition", "source", "rights", "note")]
        lines.append("| " + " | ".join(values) + " |")
    used = [row["variant"] for row in rows if row["variant"]]
    lines.extend(["", "## Variant proposals", ""])
    for name in sorted(set(used)):
        variant = VARIANTS[name]
        lines.append(f"- **{name}** — {variant['op']}; {variant['result']}.")
    gaps = [row for row in rows if row["disposition"] == "named gap"]
    lines.extend(["", "## Named gaps", ""])
    if gaps:
        for row in gaps:
            lines.append(f"- **{row['source']}** — {row['element']}: {row['note']}.")
    else:
        lines.append("- None: every element has an installed source or a named variant of one.")
    if summary["unverified_rights"]:
        lines.extend(
            [
                "",
                "## Rights to confirm",
                "",
                f"{summary['unverified_rights']} rows resolve to a pack whose `pack.json` does not state a licence. "
                "Confirm those rows before a game ships art from them.",
            ]
        )
    lines.append("")
    return "\n".join(lines)


CSS = """
:root{color-scheme:dark;--bg:#17191d;--card:#22262c;--ink:#f6ead2;--muted:#b7ad9d;--line:#5d554b;--gold:#d79a49}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:1440px;margin:auto;padding:24px}h1{margin:0 0 6px;font-size:25px}h2{margin:30px 0 10px;font-size:19px}
p{max-width:85ch}.muted,small{color:var(--muted)}a{color:#ffd18b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
figure{margin:0;padding:10px;background:var(--card);border:1px solid var(--line);border-radius:8px;min-width:0}
figcaption{margin-top:8px}img{display:block;width:100%;height:160px;object-fit:contain;background:#2d333b;image-rendering:pixelated}
.tag{display:inline-block;margin-top:5px;padding:2px 6px;border:1px solid var(--gold);border-radius:99px;color:#ffd18b;font-size:11px}
code{overflow-wrap:anywhere;font-size:12px}
@media(max-width:500px){main{padding:16px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}img{height:120px}}
"""


def source_href(path: str) -> str:
    """Link a pack file from the kit directory without copying it into it."""

    return "../../../../" + quote(path, safe="/")


def figure(row: dict, pick: dict) -> str:
    return (
        f'<figure><img src="{source_href(pick["path"])}" alt="{html.escape(row["element"])}">'
        f"<figcaption><b>{html.escape(row['element'])}</b><br>"
        f"<small>{html.escape(pick['title'])} · {html.escape(pick['rights'])}</small><br>"
        f"<code>{html.escape(pick['path'])}</code>"
        + (f'<br><small>{html.escape(pick["note"])}</small>' if pick["note"] else "")
        + f'<br><span class="tag">{html.escape(row["disposition"])}</span></figcaption></figure>'
    )


def render_lineups(rows: list[dict], summary: dict[str, int]) -> str:
    sections = []
    for group in GROUPS:
        picks = [(row, pick) for row in rows if row["group"] == group for pick in row["picks"]]
        missing = [row for row in rows if row["group"] == group and not row["picks"]]
        body = "".join(figure(row, pick) for row, pick in picks)
        if missing:
            body += '<p class="muted">Named gaps in this group: ' + html.escape(
                ", ".join(row["source"] for row in missing)
            ) + "</p>"
        sections.append(f"<h2>{group}</h2><div class=\"grid\">{body}</div>")
    intro = (
        f"Installed candidates for every element the first SmallScaleInt game's inventory and HUD needs "
        f"({summary['needs']} elements: {summary['direct']} direct, {summary['variant']} variant, "
        f"{summary['named_gaps']} named gaps). The images link to the pack files in place; nothing here is a copy."
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>SmallScaleInt UI kit lineups</title><style>{CSS}</style></head><body><main>"
        f"<h1>SmallScaleInt UI kit lineups</h1><p>{html.escape(intro)}</p>"
        '<p class="muted">The gap table beside this page names the source, the variant or the gap for every element.</p>'
        + "".join(sections)
        + "</main></body></html>"
    )


def render_manifest(library: Library, rows: list[dict], summary: dict[str, int], index: dict[str, dict]) -> str:
    packs: dict[str, dict] = {}
    for item in NEEDS:
        for entry in item.candidates:
            if entry.pack in packs:
                continue
            tagged = index.get(entry.pack, {})
            packs[entry.pack] = {
                "installed": library.installed(entry.pack),
                "title": library.title(entry.pack) if library.installed(entry.pack) else entry.pack,
                "rights": library.rights(entry.pack) if library.installed(entry.pack) else "not installed",
                "indexed": bool(tagged),
                "style_family": tagged.get("sf"),
                "roles": tagged.get("r", []),
                "summary": tagged.get("d"),
                "scan_truncated": entry.pack in library.truncated,
            }
    manifest = {
        "schema": "ogm.smallscaleint-ui-audit/1",
        "set": "smallscaleint",
        "scope": list(GROUPS),
        "priority": ["installed pack", "variant of an owned asset"],
        "outputs": ["gap-table.md", "lineups.html", "manifest.json", "README.md"],
        "variants": VARIANTS,
        "packs": packs,
        "coverage": rows,
        "counts": summary,
    }
    return json.dumps(manifest, indent=2, sort_keys=True) + "\n"


README = """# SmallScaleInt UI kit audit

- `lineups.html`: the installed candidate for every inventory, skill, HUD and map element, linked from the
  pack files in place. Open it over HTTP from the asset-library root (`sets/smallscaleint/kit/ui/lineups.html`).
- `gap-table.md`: one source, variant or named gap per element, with the rights each pack's `pack.json` states.
- `manifest.json`: the same rows plus the pack index and variant recipes, for later games on this set.

Regenerate on the asset-library host with:

    python3 -I scripts/assets/smallscaleint_ui_audit.py --root assets-local

Nothing here is committed: the pages reference private pack files in place and are regenerated, not edited.
"""


def audit(root: Path) -> tuple[Path, list[dict], dict[str, int]]:
    """Run the audit over the installed library and write the kit pages beneath it."""

    need_keys()
    library = Library(root)
    rows = coverage(library)
    summary = counts(rows)
    out = library.root / OUTPUT
    out.mkdir(parents=True, exist_ok=True)
    (out / "gap-table.md").write_text(render_gap_table(rows, summary))
    (out / "lineups.html").write_text(render_lineups(rows, summary))
    (out / "manifest.json").write_text(render_manifest(library, rows, summary, load_index()))
    (out / "README.md").write_text(README)
    return out, rows, summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit the installed library for the SmallScaleInt UI kit.")
    parser.add_argument("--root", type=Path, required=True, help="asset library root (for example assets-local)")
    parser.add_argument("--strict", action="store_true", help="exit non-zero while a named gap is open")
    args = parser.parse_args(argv)
    out, rows, summary = audit(args.root)
    print(f"wrote {out}")
    print(
        f"{summary['needs']} elements: {summary['direct']} direct, {summary['variant']} variant, "
        f"{summary['named_gaps']} named gaps, {summary['unverified_rights']} unverified rights"
    )
    if args.strict:
        gaps = [row for row in rows if row["disposition"] == "named gap"]
        for row in gaps:
            print(f"gap {row['source']}: {row['element']} — {row['note']}")
        return 1 if gaps else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
