"""The map card's C3 §12 layout block, so a map can be picked by structure instead of by text (research 2026-11-05).

Run: python3 -I scripts/py/maps/test_layout_fields.py -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import layout_fields as L  # noqa: E402


class GridTest(unittest.TestCase):
    def test_grid_comes_from_the_export(self) -> None:
        """CC3+ records the cells and the cell size, so the card carries the grid every map is drawn on."""
        self.assertEqual(
            L.grid({"type": "square", "export_cols": 40, "export_rows": 30, "px_per_cell": 50}),
            {"type": "square", "cols": 40, "rows": 30, "cell_px": 50.0},
        )
        self.assertEqual(L.grid({"type": "hex"}), {"type": "hex"})

    def test_absent_stays_absent(self) -> None:
        """A map exported without a grid block gets no grid, not a zero."""
        self.assertIsNone(L.grid(None))
        self.assertIsNone(L.grid({"units": {"name": "feet"}}))


class BiomeTest(unittest.TestCase):
    def test_a_judged_environment_wins(self) -> None:
        self.assertEqual(L.biome("dungeon", ["crypt", "dungeon"]), "crypt")

    def test_a_map_type_that_names_an_environment_still_gives_a_place(self) -> None:
        self.assertEqual(L.biome("keep", []), "castle")
        self.assertEqual(L.biome("wilderness", []), "forest")

    def test_a_battle_map_or_a_region_names_no_single_place(self) -> None:
        self.assertIsNone(L.biome("battlemap", []))
        self.assertIsNone(L.biome("region", []))


class FeaturesTest(unittest.TestCase):
    def test_features_come_from_symbols_labels_and_a_road_environment(self) -> None:
        """A builder asks for water, stairs and a road by name, so those are filters and not free text."""
        self.assertEqual(
            L.features(["water", "stairs", "banana"], ["well", "tavern"], ["road"]),
            ["road", "stairs", "water", "well"],
        )

    def test_words_outside_the_closed_vocabulary_never_get_in(self) -> None:
        self.assertEqual(L.features(["wall", "floor"], [], ["dungeon"]), [])


class LevelsTest(unittest.TestCase):
    def test_levels_follow_the_export_count_then_the_level_word(self) -> None:
        """The cellar's 'Map Links' legend names the other floors, so only this map's own count or word counts."""
        self.assertEqual(L.levels(2, "cellar"), 2)
        self.assertEqual(L.levels(None, "cellar"), 3)
        self.assertIsNone(L.levels(None, None))


class LayoutBlockTest(unittest.TestCase):
    def test_layout_block_is_only_what_code_measured(self) -> None:
        """The graph counts need a layout spec, which the map index joins; this block never invents them."""
        block = L.layout(
            "dungeon", ["dungeon", "crypt"], ["pillar", "altar"], [], {"type": "square", "px_per_cell": 50}
        )
        self.assertEqual(
            block,
            {"biome": "dungeon", "features": ["altar", "pillar"], "grid": {"type": "square", "cell_px": 50.0}},
        )
        self.assertNotIn("rooms", block)
        self.assertNotIn("loops", block)

    def test_layout_block_is_empty_when_nothing_is_known(self) -> None:
        """No symbols, no grid and no single place: the card says nothing rather than guessing."""
        self.assertEqual(L.layout("region", [], [], [], None), {})


if __name__ == "__main__":
    unittest.main()
