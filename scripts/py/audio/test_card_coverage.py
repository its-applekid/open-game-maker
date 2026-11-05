"""Tests for the coverage report: what a pre-processing run put on the cards, per pack and per field.

The ticket asks for "coverage per pack"; these tests pin the three ways such a report lies — counting an empty field as
covered, averaging a short pack away behind a healthy one, and calling a loop pack finished when nothing says what
loops.
"""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import card_coverage as cov


def music_card(subkind="music/track"):
    return {
        "schema": "ogm.asset-card/1.0",
        "kind": "audio",
        "subkind": subkind,
        "audio": {
            "duration_s": 132.0,
            "tempo_bpm": 92.0,
            "key": "Am",
            "energy": 0.42,
            "loop_points": {"start_s": 0.5, "end_s": 64.0},
        },
        "previews": {"waveform": "previews/ab/abcdef0123456789-waveform.png", "clip": "previews/ab/abcdef0123456789-clip.ogg"},
        "describe": {
            "moods": ["calm"],
            "genre": ["ambient"],
            "instruments": ["piano"],
            "keywords": ["ambient"],
        },
    }


def sfx_card():
    return {
        "schema": "ogm.asset-card/1.0",
        "kind": "audio",
        "subkind": "sfx/weapon",
        "audio": {"duration_s": 0.8, "ucs_cat_id": "WEAPSwd", "variation_group": "weapons/sword-slice"},
        "previews": {"waveform": "previews/cd/cdef012345678901-waveform.png", "clip": "previews/cd/cdef012345678901-clip.ogg"},
        "describe": {"objects": ["sword"], "keywords": ["sword", "slice"]},
    }


def without(card, path):
    """Return the card with one dotted field removed, the way a pack the model never reached comes out."""
    head, _, tail = path.rpartition(".")
    node = card
    for part in head.split("."):
        node = node[part]
    node.pop(tail, None)
    return card


class PresentTests(unittest.TestCase):
    def test_an_empty_list_is_not_coverage(self):
        """`moods: []` tells a search nothing; counting it would hide a pack the model never reached."""
        self.assertFalse(cov.present({"describe": {"moods": []}}, "describe.moods"))

    def test_null_and_missing_are_not_coverage(self):
        self.assertFalse(cov.present({"audio": {"tempo_bpm": None}}, "audio.tempo_bpm"))
        self.assertFalse(cov.present({"audio": {}}, "audio.tempo_bpm"))
        self.assertFalse(cov.present({}, "audio.tempo_bpm"))

    def test_zero_and_false_are_coverage(self):
        """A measured 0.0 or a false flag is an answer the run produced, not a gap."""
        self.assertTrue(cov.present({"audio": {"energy": 0.0}}, "audio.energy"))
        self.assertTrue(cov.present({"audio": {"loopable": False}}, "audio.loopable"))

    def test_kind_comes_from_the_card_subkind_not_the_pack_name(self):
        """One pack can hold both kinds; the report groups by what the card says it is."""
        self.assertEqual(cov.kind_of(music_card("music/loop")), "music")
        self.assertEqual(cov.kind_of(sfx_card()), "sfx")


class ReportTests(unittest.TestCase):
    def rows(self, *entries):
        return [(pack, card, cov.kind_of(card)) for pack, card in entries]

    def test_coverage_is_counted_per_pack_and_per_field(self):
        """One pack missing a tempo must not lower another pack's number: the report is per pack or it is useless."""
        report = cov.summarise(
            self.rows(
                ("pixabay-music-curated", music_card()),
                ("pixabay-music-curated", music_card()),
                ("abstraction-music-loop-01", without(music_card(), "audio.tempo_bpm")),
            )
        )
        pixabay = report["packs"]["pixabay-music-curated"]
        abstraction = report["packs"]["abstraction-music-loop-01"]
        self.assertEqual(pixabay["fields"]["audio.tempo_bpm"]["pct"], 100.0)
        self.assertEqual(abstraction["fields"]["audio.tempo_bpm"]["pct"], 0.0)
        self.assertEqual(pixabay["kinds"]["music"], 2)
        self.assertEqual(pixabay["cards"], 2)

    def test_the_total_sums_the_packs(self):
        report = cov.summarise(
            self.rows(("a-pack", music_card()), ("b-pack", without(music_card(), "audio.tempo_bpm")))
        )
        self.assertEqual(cov.totals(report)["fields"]["audio.tempo_bpm"]["pct"], 50.0)
        self.assertEqual(cov.totals(report)["cards"], 2)

    def test_a_kind_total_ignores_the_other_kind(self):
        """The audio families ship separately, so an effect pack must not drag the music total down."""
        report = cov.summarise(
            self.rows(("a-music-pack", music_card()), ("an-sfx-pack", without(sfx_card(), "previews.clip")))
        )
        self.assertEqual(cov.totals(report, "music")["fields"]["previews.clip"]["pct"], 100.0)
        self.assertEqual(cov.totals(report, "sfx")["fields"]["previews.clip"]["pct"], 0.0)
        self.assertNotIn("describe.moods", cov.totals(report, "sfx")["fields"])

    def test_required_fields_gate_the_run_and_optional_ones_do_not(self):
        """A clip and searchable tags are what a card needs to be usable; a loop point is not owed by a 2 s impact."""
        card = without(music_card(), "describe.keywords")
        report = cov.summarise(self.rows(("a-pack", card)), min_coverage=0.9)
        self.assertIn("music:describe.keywords=0.0%", report["packs"]["a-pack"]["short"])
        self.assertNotIn("music:describe.instruments=0%", " ".join(report["packs"]["a-pack"]["short"]))

    def test_nothing_is_short_without_a_threshold(self):
        report = cov.summarise(self.rows(("a-pack", without(music_card(), "describe.keywords"))))
        self.assertEqual(report["packs"]["a-pack"]["short"], [])

    def test_a_loop_pack_must_say_which_tracks_loop(self):
        """`abstraction-music-loop-*` exists to be looped; a run that dropped loop points has not carded the pack."""
        report = cov.summarise(
            self.rows(("abstraction-music-loop-01", without(music_card(), "audio.loop_points"))), min_coverage=0.9
        )
        short = report["packs"]["abstraction-music-loop-01"]["short"]
        self.assertTrue(any(entry.startswith("loop-pack:audio.loop_points") for entry in short), short)

    def test_a_non_loop_pack_is_not_held_to_loop_points(self):
        report = cov.summarise(
            self.rows(("pixabay-music-curated", without(music_card(), "audio.loop_points"))), min_coverage=0.9
        )
        self.assertFalse(any("loop" in entry for entry in report["packs"]["pixabay-music-curated"]["short"]))

    def test_effects_report_the_fields_effects_carry(self):
        """A sound effect has no key or mood to report; its report must not be all zeroes for fields it never has."""
        report = cov.summarise(self.rows(("sonniss-gdc2026-part9-1of5", sfx_card())), min_coverage=0.9)
        fields = report["packs"]["sonniss-gdc2026-part9-1of5"]["fields"]
        self.assertEqual(fields["audio.ucs_cat_id"]["pct"], 100.0)
        self.assertEqual(fields["audio.variation_group"]["pct"], 100.0)
        self.assertNotIn("describe.moods", fields)

    def test_the_table_names_every_pack_and_what_is_short(self):
        report = cov.summarise(
            self.rows(("abstraction-music-loop-01", without(music_card(), "previews.clip"))), min_coverage=0.9
        )
        text = cov.render(report)
        self.assertIn("abstraction-music-loop-01", text)
        self.assertIn("below 90%", text)
        self.assertIn("music:previews.clip=0.0%", text)


class LoadTests(unittest.TestCase):
    def setUp(self):
        self.packs = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.packs, ignore_errors=True)

    def write(self, relative, card):
        path = self.packs / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(card))

    def test_cards_are_found_under_their_pack_and_collections_are_not(self):
        """A collection card lists a pack; counting it as an asset would put a kind-less row in the report."""
        self.write("pack-a/cards/weapons/sword-slice-01.card.json", sfx_card())
        self.write("pack-b/cards/track.card.json", music_card())
        self.write("pack-a/collection.card.json", {"card_type": "collection", "id": "t1:pack-a@v1"})
        rows = cov.load(self.packs)
        self.assertEqual([pack for pack, _, _ in rows], ["pack-a", "pack-b"])
        self.assertEqual([kind for _, _, kind in rows], ["sfx", "music"])

    def test_an_unreadable_card_is_skipped_not_fatal(self):
        """One half-written card must not cost the whole report."""
        self.write("pack-a/cards/track.card.json", music_card())
        broken = self.packs / "pack-a" / "cards" / "broken.card.json"
        broken.write_text("{not json")
        self.assertEqual(len(cov.load(self.packs)), 1)

    def test_an_empty_library_says_so(self):
        self.assertEqual(cov.load(self.packs), [])


class CalibrationTests(unittest.TestCase):
    def test_the_projection_multiplies_the_calibration(self):
        """C3 §13's cost guard: twenty timed files must price the whole run before it starts."""
        self.assertEqual(cov.project_run_hours(30.0, 10800), 90.0)
        self.assertEqual(cov.project_run_hours(0.5, 3600), 0.5)

    def test_no_calibration_is_reported_as_unknown(self):
        self.assertIsNone(cov.project_run_hours(None, 100))
        self.assertIsNone(cov.project_run_hours(1.0, 0))


if __name__ == "__main__":
    unittest.main()
