"""Synthetic coverage for the SmallScaleInt UI kit audit.

The audit runs against the host's private asset library, so these tests build a tiny stand-in with the
same shape (`packs/<id>/<version>/extracted/...`, a `pack.json`, a `cards/` tree) and check the
decisions the real run depends on: an installed file becomes a source, a pack that is not installed
becomes a named gap, and rights come from the pack rather than from the tool.

Run: python3 -I scripts/assets/test_smallscaleint_ui_audit.py -v
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import smallscaleint_ui_audit as audit  # noqa: E402

# The installed packs these tests stand in for; ids are data, so the tests spell them out.
TILES = "smallscaleint-2d-desert-fantasy-tileset"
CHARACTER = "smallscaleint-2d-character-pack-1"
PROJECTILES_1 = "smallscaleint-2d-projectiles-character-pack-1"
PROJECTILES_2 = "smallscaleint-2d-projectiles-character-pack-2"
MICRO_ROGUELIKE = "kenney-micro-roguelike"
TINY_DUNGEON = "kenney-tiny-dungeon"
GENERIC_ITEMS = "kenney-generic-items"
PIXEL_UI = "kenney-ui-pack-pixel-adventure"
PIXEL_UI_BACKUP = "kenney-ui-pixel-pack"
RPG_UI = "kenney-ui-adventure-pack"
ADVENTURE_UI = "kenney-ui-pack-adventure"
FANTASY_BORDERS = "kenney-fantasy-ui-borders"
CARTOGRAPHY = "kenney-cartography-pack"
MAP_PACK = "kenney-map-pack"
MINIMAP = "kenney-minimap-pack"


def install(root: Path, pack: str, files: tuple[str, ...], license_id: str | None = "CC0-1.0") -> Path:
    """Write one installed pack: images under a versioned extracted folder plus its manifest."""

    directory = root / "packs" / pack
    (directory / "2026-11-01" / "extracted").mkdir(parents=True, exist_ok=True)
    for name in files:
        target = directory / "2026-11-01" / "extracted" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"png")
    manifest = {"title": pack.replace("-", " ").title()}
    if license_id is not None:
        manifest["license"] = license_id
        manifest["usage_rights"] = {"uses": ["in-game", "style-reference"]}
    (directory / "pack.json").write_text(json.dumps(manifest))
    return directory


class SmallScaleIntUiAuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "packs").mkdir()
        self.packs = {
            TILES: install(
                self.root,
                TILES,
                ("Animations/Equipment/Sword1/0001.png", "Animations/Equipment/Axe1/0001.png", "Animations/Effects/Dash/0001.png"),
                license_id="LicenseRef-smallscaleint-itch",
            ),
            MICRO_ROGUELIKE: install(
                self.root,
                MICRO_ROGUELIKE,
                ("Tiles/potion_red.png", "Tiles/scroll_old.png", "Tiles/shield_round.png"),
            ),
            PIXEL_UI: install(
                self.root,
                PIXEL_UI,
                ("PNG/Blue/Default/slot_01.png", "PNG/Blue/Default/panel_02.png", "PNG/Blue/Default/button_01.png", "PNG/lock.png"),
            ),
            ADVENTURE_UI: install(self.root, ADVENTURE_UI, ("PNG/compass.png", "PNG/exclamation.png")),
            CARTOGRAPHY: install(self.root, CARTOGRAPHY, ("PNG/village.png", "PNG/cave.png")),
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def rows(self) -> dict[str, dict]:
        out, rows, _summary = audit.audit(self.root)
        self.assertTrue(out.is_dir())
        return {row["key"]: row for row in rows}

    def test_installed_file_becomes_a_source(self) -> None:
        row = self.rows()["sword"]
        self.assertEqual(row["disposition"], "variant")
        self.assertEqual(
            row["picks"][0]["path"],
            "packs/smallscaleint-2d-desert-fantasy-tileset/2026-11-01/extracted/Animations/Equipment/Sword1/0001.png",
        )
        self.assertIn("Sword1/0001.png", row["source"])

    def test_unmatched_element_is_a_named_gap(self) -> None:
        row = self.rows()["crossbow"]
        self.assertEqual(row["disposition"], "named gap")
        self.assertEqual(row["source"], "GAP-CROSSBOW")
        self.assertEqual(row["picks"], [])
        self.assertIn("no file matching the expected words", row["note"])
        self.assertIn(MICRO_ROGUELIKE, row["note"])

    def test_gap_reason_separates_missing_pack_from_missing_file(self) -> None:
        rows = self.rows()
        self.assertIn("no candidate pack is installed", rows["map-fog"]["note"])
        self.assertEqual(rows["map-terrain"]["disposition"], "named gap")

    def test_rights_come_from_the_pack_manifest(self) -> None:
        rows = self.rows()
        self.assertEqual(rows["sword"]["rights"], "LicenseRef-smallscaleint-itch · in-game/style-reference")
        self.assertEqual(rows["health-potion"]["rights"], "CC0-1.0 · in-game/style-reference")

    def test_pack_without_a_licence_is_reported_as_unverified(self) -> None:
        install(self.root, GENERIC_ITEMS, ("PNG/bottle.png",), license_id=None)
        out, _rows, summary = audit.audit(self.root)
        self.assertGreater(summary["unverified_rights"], 0)
        self.assertIn("unverified", (out / "gap-table.md").read_text())

    def test_every_need_is_covered_exactly_once(self) -> None:
        rows = self.rows()
        self.assertEqual(len(rows), len(audit.NEEDS))
        for row in rows.values():
            self.assertIn(row["disposition"], {"direct", "variant", "named gap"})
            self.assertTrue(row["source"])
            self.assertTrue(row["element"])

    def test_variant_rows_name_their_recipe(self) -> None:
        rows = self.rows()
        self.assertIn("V-ITEM-CLOSEUP", rows["shield"]["note"])
        self.assertEqual(rows["button"]["disposition"], "direct")
        self.assertNotIn("V-", rows["button"]["note"])

    def test_scan_skips_originals_and_non_images(self) -> None:
        pack = self.packs[MICRO_ROGUELIKE]
        (pack / "2026-11-01" / "extracted" / "originals").mkdir()
        (pack / "2026-11-01" / "extracted" / "originals" / "potion_red.png").write_bytes(b"png")
        (pack / "2026-11-01" / "extracted" / "Tiles" / "potion_notes.txt").write_text("notes")
        paths = [pick["path"] for pick in self.rows()["health-potion"]["picks"]]
        self.assertFalse([path for path in paths if "originals" in path or path.endswith(".txt")])

    def test_patterns_do_not_match_unrelated_art(self) -> None:
        # Trap names a loose substring match would take: scroll is not a roll, office is not ice,
        # and a crossbow is not a destination marker.
        install(self.root, CHARACTER, ("1Knight/Scroll/0001.png", "1Knight/Trolled/0001.png"))
        install(self.root, PROJECTILES_1, ("Animations/Office/0001.png", "Animations/Choice/0001.png"))
        install(self.root, ADVENTURE_UI, ("PNG/crossbow.png",))
        rows = self.rows()
        self.assertEqual(rows["skill-evade"]["disposition"], "named gap")
        self.assertEqual(rows["skill-ice"]["disposition"], "named gap")
        paths = [pick["path"] for pick in rows["map-destination"]["picks"]]
        self.assertFalse([path for path in paths if "crossbow" in path])
        self.assertTrue(paths)

    def test_pack_previews_are_not_offered_as_art(self) -> None:
        preview = self.packs[ADVENTURE_UI] / "2026-11-01" / "extracted"
        for image in ("PNG/compass.png", "PNG/exclamation.png"):
            (preview / image).unlink()
        (preview / "Preview.png").write_bytes(b"png")
        rows = self.rows()
        self.assertEqual(rows["map-player"]["disposition"], "named gap")
        self.assertEqual(rows["quest-marker"]["disposition"], "named gap")

    def test_pack_scan_reports_truncation(self) -> None:
        directory = self.root / "packs" / MICRO_ROGUELIKE / "2026-11-01" / "extracted"
        images, truncated = audit.pack_images(directory, limit=1)
        self.assertEqual(len(images), 1)
        self.assertTrue(truncated)

    def test_outputs_reference_pack_files_in_place(self) -> None:
        install(self.root, PROJECTILES_1, ("Animations/Projectiles/Fire/0001.png",))
        out, _rows, _summary = audit.audit(self.root)
        self.assertEqual(
            {path.name for path in out.iterdir()},
            {"README.md", "gap-table.md", "lineups.html", "manifest.json"},
        )
        page = (out / "lineups.html").read_text()
        self.assertIn(
            'src="../../../../packs/smallscaleint-2d-desert-fantasy-tileset/2026-11-01/extracted/Animations/Equipment/Sword1/0001.png"',
            page,
        )
        self.assertNotIn(str(self.root), page)
        self.assertFalse(list(out.rglob("*.png")))

    def test_audit_never_touches_a_pack_file(self) -> None:
        before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        audit.audit(self.root)
        after = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        created = set(after) - set(before)
        self.assertTrue(created)
        self.assertTrue(all(path.parts[len(self.root.parts)] == "sets" for path in created))
        self.assertEqual({path: data for path, data in after.items() if path in before}, before)

    def test_page_escapes_pack_titles(self) -> None:
        (self.root / "packs" / PIXEL_UI / "pack.json").write_text(json.dumps({"title": "<script>x</script>", "license": "CC0-1.0"}))
        out, _rows, _summary = audit.audit(self.root)
        page = (out / "lineups.html").read_text()
        self.assertIn("&lt;script&gt;x&lt;/script&gt;", page)
        self.assertNotIn("<script>x</script>", page)

    def test_repeat_runs_are_byte_identical(self) -> None:
        out, _rows, _summary = audit.audit(self.root)
        first = {path.name: path.read_bytes() for path in out.iterdir()}
        audit.audit(self.root)
        self.assertEqual({path.name: path.read_bytes() for path in out.iterdir()}, first)

    def test_manifest_records_the_committed_pack_index(self) -> None:
        out, _rows, summary = audit.audit(self.root)
        manifest = json.loads((out / "manifest.json").read_text())
        self.assertEqual(manifest["schema"], "ogm.smallscaleint-ui-audit/1")
        self.assertEqual(manifest["counts"], summary)
        self.assertTrue(manifest["packs"][PIXEL_UI]["indexed"])
        self.assertEqual(manifest["packs"][PIXEL_UI]["style_family"], "pixel-art")
        self.assertTrue(manifest["packs"][TILES]["installed"])
        self.assertEqual(manifest["packs"][TINY_DUNGEON]["rights"], "not installed")

    def catalogue(self, mutate) -> Path:
        data = json.loads(audit.NEEDS_DATA.read_text())
        mutate(data)
        path = self.root / "catalogue.json"
        path.write_text(json.dumps(data))
        return path

    def test_shipped_catalogue_covers_every_group(self) -> None:
        needs, variants = audit.load_needs()
        groups = {item.group for item in needs}
        self.assertEqual(groups, set(audit.GROUPS))
        self.assertEqual(len({item.key for item in needs}), len(needs))
        self.assertTrue(variants)
        for item in needs:
            self.assertTrue(item.candidates, item.key)

    def test_catalogue_rejects_an_unknown_variant(self) -> None:
        def mutate(data: dict) -> None:
            data["needs"][0]["variant"] = "V-NOPE"

        with self.assertRaisesRegex(ValueError, "names unknown variant V-NOPE"):
            audit.load_needs(self.catalogue(mutate))

    def test_catalogue_rejects_a_need_without_a_candidate_pack(self) -> None:
        def mutate(data: dict) -> None:
            data["needs"][0]["candidates"] = []

        with self.assertRaisesRegex(ValueError, "names no candidate pack"):
            audit.load_needs(self.catalogue(mutate))

    def test_catalogue_rejects_an_unknown_group(self) -> None:
        def mutate(data: dict) -> None:
            data["needs"][0]["group"] = "Audio"

        with self.assertRaisesRegex(ValueError, "unknown need group: Audio"):
            audit.load_needs(self.catalogue(mutate))

    def test_a_root_without_packs_is_refused(self) -> None:
        empty = self.root / "not-a-library"
        empty.mkdir()
        with self.assertRaisesRegex(FileNotFoundError, "point --root at the asset library"):
            audit.audit(empty)
        self.assertFalse((empty / audit.OUTPUT).exists())

    def quiet_main(self, argv: list[str]) -> int:
        with contextlib.redirect_stdout(io.StringIO()):
            return audit.main(argv)

    def test_strict_exits_non_zero_while_a_gap_is_open(self) -> None:
        self.assertEqual(self.quiet_main(["--root", str(self.root), "--strict"]), 1)
        for pack, files in (
            (TINY_DUNGEON, ("Tiles/tile_0001.png",)),
            (CHARACTER, ("Animations/Knight/Block/0001.png", "Animations/Knight/Roll/0001.png")),
            (
                PROJECTILES_1,
                ("Animations/Fire/0001.png", "Animations/Ice/0001.png", "Animations/Arrow/0001.png", "Animations/Slash/0001.png"),
            ),
            (PROJECTILES_2, ("Animations/Storm/0001.png", "Animations/ArrowRain/0001.png")),
            (RPG_UI, ("PNG/bar_red.png", "PNG/bar_blue.png")),
            (GENERIC_ITEMS, ("PNG/scroll.png", "PNG/bottle.png")),
            (FANTASY_BORDERS, ("PNG/border_01.png", "PNG/panel_01.png")),
            (MAP_PACK, ("PNG/route.png", "PNG/forest.png")),
            (MINIMAP, ("PNG/fog.png", "PNG/marker.png")),
            (PIXEL_UI_BACKUP, ("PNG/circle_01.png",)),
        ):
            install(self.root, pack, files)
        out, rows, summary = audit.audit(self.root)
        self.assertEqual(summary["named_gaps"], 0, [row["source"] for row in rows if row["disposition"] == "named gap"])
        self.assertIn("None: every element", (out / "gap-table.md").read_text())
        self.assertEqual(self.quiet_main(["--root", str(self.root), "--strict"]), 0)


if __name__ == "__main__":
    unittest.main()
