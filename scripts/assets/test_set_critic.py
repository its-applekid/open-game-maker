"""Synthetic coverage for the set-level critic.

Run: python3 -I scripts/assets/test_set_critic.py -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import set_critic  # noqa: E402

GOOD = {
    "cohesion": 7,
    "reference_fidelity": 7,
    "brief": 8,
    "mesh_quality": 7,
    "texture_quality": 7,
    "assembly": 8,
    "scale": 7,
    "labels": 7,
}


def scores(**overrides: int) -> dict:
    return {**GOOD, **overrides}


class ScoreRoundTest(unittest.TestCase):
    def test_a_solid_set_passes_at_the_bar(self) -> None:
        result = set_critic.score_round(GOOD)
        self.assertTrue(result["passed"])
        self.assertEqual(result["failures"], [])
        self.assertEqual(result["average"], 7.25)

    def test_a_weak_category_fails_the_round(self) -> None:
        result = set_critic.score_round(scores(assembly=4))
        self.assertFalse(result["passed"])
        self.assertEqual(result["lowest"], ["assembly"])
        self.assertIn("assembly is below 6", " ".join(result["failures"]))

    def test_sixes_need_a_seven_average(self) -> None:
        self.assertTrue(set_critic.score_round(scores(cohesion=6, brief=8))["passed"])
        flat = set_critic.score_round({category: 6 for category in set_critic.CATEGORIES})
        self.assertFalse(flat["passed"])
        self.assertIn("average 6.0 is below 7", " ".join(flat["failures"]))

    def test_a_malformed_critique_never_passes(self) -> None:
        missing = {key: value for key, value in GOOD.items() if key != "labels"}
        self.assertIn("missing score for labels", " ".join(set_critic.score_round(missing)["failures"]))
        self.assertIn("a whole score from 1 to 10", " ".join(set_critic.score_round(scores(scale=11))["failures"]))
        self.assertIn("a whole score from 1 to 10", " ".join(set_critic.score_round(scores(scale=7.5))["failures"]))
        self.assertIn("a whole score from 1 to 10", " ".join(set_critic.score_round(scores(scale=True))["failures"]))
        self.assertFalse(set_critic.score_round({})["passed"])


class FixesTest(unittest.TestCase):
    def test_at_most_five_fixes_survive_most_damaging_first(self) -> None:
        result = set_critic.fixes_to_do(
            ["a floating handset", " ", "garbled label", "wrong world", "untextured", "bad scale", "sixth"]
        )
        self.assertEqual(
            result["fixes"],
            ["a floating handset", "garbled label", "wrong world", "untextured", "bad scale"],
        )
        self.assertEqual(result["dropped"], 1)
        self.assertEqual(set_critic.fixes_to_do([])["fixes"], [])


class RoundVerdictTest(unittest.TestCase):
    def test_a_failing_early_round_keeps_working(self) -> None:
        verdict = set_critic.round_verdict({"round": 1, "scores": scores(cohesion=5), "fixes": ["fix cohesion"]})
        self.assertFalse(verdict["passed"])
        self.assertFalse(verdict["stop_iterating"])
        self.assertEqual(verdict["next"], "fix and render again")
        self.assertEqual(verdict["fixes"], ["fix cohesion"])

    def test_the_round_cap_delivers_rather_than_looping(self) -> None:
        verdict = set_critic.round_verdict({"round": set_critic.MAX_ROUNDS, "scores": scores(cohesion=5)})
        self.assertTrue(verdict["stop_iterating"])
        self.assertEqual(verdict["next"], "deliver the best version")
        passing = set_critic.round_verdict({"round": 2, "scores": GOOD})
        self.assertEqual(passing["next"], "deliver")

    def test_three_rounds_without_beating_the_best_is_a_stall(self) -> None:
        self.assertFalse(set_critic.stalled([6.1, 6.4]))
        self.assertTrue(set_critic.stalled([6.9, 6.4, 6.2, 6.3]))
        self.assertFalse(set_critic.stalled([6.1, 6.4, 6.5, 6.9]))
        verdict = set_critic.round_verdict(
            {"round": 4, "scores": scores(cohesion=5), "history": [{"average": 6.9}, 6.4, 6.2, 6.3]}
        )
        self.assertTrue(verdict["stop_iterating"])


class DeliverablesTest(unittest.TestCase):
    def test_a_set_is_not_done_until_every_deliverable_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self.assertEqual(
                set_critic.missing_deliverables(work), ["manifest.json", "lineup.png", "thumbs"]
            )
            (work / "manifest.json").write_text("{}")
            (work / "lineup.png").write_bytes(b"png")
            (work / "thumbs").mkdir()
            self.assertEqual(set_critic.missing_deliverables(work), ["thumbs is empty"])
            (work / "thumbs" / "a.png").write_bytes(b"png")
            self.assertEqual(set_critic.missing_deliverables(work), [])


class CommandTest(unittest.TestCase):
    def test_the_command_fails_an_unfinished_set_and_passes_a_finished_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            document = work / "round.json"
            document.write_text(json.dumps({"round": 1, "scores": GOOD, "fixes": []}))
            self.assertEqual(set_critic.main([str(document), "--work", str(work)]), 1)
            (work / "manifest.json").write_text("{}")
            (work / "lineup.png").write_bytes(b"png")
            (work / "thumbs").mkdir()
            (work / "thumbs" / "a.png").write_bytes(b"png")
            self.assertEqual(set_critic.main([str(document), "--work", str(work)]), 0)


if __name__ == "__main__":
    unittest.main()
