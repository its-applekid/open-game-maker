"""Focused tests for the ffmpeg-only game-audio preparation path."""

import json
import math
import shutil
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import prepare_game_audio as prepare


GROUPS = ("village", "travel", "forest", "cave", "dungeon", "combat", "boss", "victory")
HAVE_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def write_tone(path: Path, frequency: float, duration_s: float = 21.0) -> None:
    """Write a tiny mono fixture without adding a Python audio dependency."""
    sample_rate = 8_000
    frame_count = int(sample_rate * duration_s)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        for index in range(frame_count):
            envelope = 0.65 + 0.2 * math.sin(2 * math.pi * index / sample_rate)
            value = int(16_000 * envelope * math.sin(2 * math.pi * frequency * index / sample_rate))
            out.writeframesraw(struct.pack("<h", value))


def fake_row(source: str, group: str, energy: float, loop_score: float = 0.0) -> dict:
    """The part of a prepared row that preview selection reads."""
    return {
        "source": source,
        "title": source,
        "likely_use": group,
        "energy": {"score": energy},
        "loop": {"score": loop_score},
    }


class PrepareGameAudioTests(unittest.TestCase):
    def test_group_and_mood_suggestions_cover_the_game_uses(self):
        cases = {
            "Anvil of Lore (Barbarian Village Theme)": "village",
            "Lumbering Across Barbaric Wilderlands": "travel",
            "Night Forest of the Wolf": "forest",
            "Hidden Cavern of the Seer": "cave",
            "Dungeon Crawl": "dungeon",
            "Massive Brawl vs Swamp Orc Hordes": "combat",
            "Battle vs Lord Deathskull": "boss",
            "Heroic Victory": "victory",
        }
        for title, expected in cases.items():
            group = prepare.suggest_group(title)
            self.assertEqual(group, expected)
            self.assertGreaterEqual(len(prepare.GROUP_MOODS[group]), 1)

    def test_loop_points_are_only_published_for_good_candidates(self):
        good = prepare.loop_card(0.98, 4.0, 44.0)
        possible = prepare.loop_card(0.94, 4.0, 44.0)
        poor = prepare.loop_card(0.70, 4.0, 44.0)
        self.assertEqual(good["suitability"], "good")
        self.assertEqual(good["points"], {"start_s": 4.0, "end_s": 44.0})
        self.assertFalse(good["verified"])
        self.assertFalse(possible["verified"])
        self.assertFalse(poor["verified"])
        self.assertNotIn("points", possible)
        self.assertNotIn("points", poor)

    def test_pack_title_falls_back_to_the_manifest_id(self):
        self.assertEqual(prepare.pack_title({"title": "Dark retro soundtrack"}), "Dark retro soundtrack")
        self.assertEqual(prepare.pack_title({"id": "drive-barbarian-chiptune"}), "Drive Barbarian Chiptune")

    def test_readme_cells_escape_pipes(self):
        self.assertEqual(prepare.markdown_cell("Smite | Clean"), "Smite \\| Clean")

    def test_every_use_group_previews_a_different_track(self):
        # Only "travel" and "combat" are matched by a title, so six groups fall
        # back to the general pool; without a no-reuse rule they all collapse
        # onto the same track and the eight previews stop being eight.
        rows = [fake_row(f"extracted/Travel {index}.wav", "travel", 0.5) for index in range(8)]
        rows.append(fake_row("extracted/Battle Theme.wav", "combat", 0.85))
        selected = prepare.select_previews(rows)
        self.assertEqual(set(selected), set(GROUPS))
        self.assertEqual(len({row["source"] for row in selected.values()}), len(GROUPS))
        self.assertEqual(selected["combat"]["source"], "extracted/Battle Theme.wav")

    @unittest.skipUnless(HAVE_FFMPEG, "ffmpeg and ffprobe are required")
    def test_prepare_pack_renders_cards_formats_previews_and_readme(self):
        with tempfile.TemporaryDirectory() as temp:
            pack = Path(temp) / "drive-test-music"
            extracted = pack / "v1" / "extracted"
            extracted.mkdir(parents=True)
            titles = {
                "village": "Village Theme",
                "travel": "Across the Wilderlands",
                "forest": "Night Forest",
                "cave": "Hidden Cavern",
                "dungeon": "Dungeon Crawl",
                "combat": "Battle Theme",
                "boss": "Lord Deathskull",
                "victory": "Heroic Victory",
            }
            for index, (group, title) in enumerate(titles.items()):
                write_tone(extracted / f"{title}.wav", 180 + index * 30)
            (pack / "pack.json").write_text(
                json.dumps({"id": "drive-test-music", "current": "v1"}) + "\n"
            )

            processed = Path(temp) / "staged-processed"
            result = prepare.prepare_pack(pack, output=processed)

            self.assertEqual(result["tracks"], 8)
            self.assertEqual(len(list((processed / "cards").glob("*.json"))), 8)
            self.assertEqual(len(list((processed / "audio").glob("*.ogg"))), 8)
            self.assertEqual(len(list((processed / "audio").glob("*.mp3"))), 8)
            self.assertEqual(len(list((processed / "previews").glob("*.ogg"))), 8)
            self.assertEqual(len(list((processed / "previews").glob("*.mp3"))), 8)
            self.assertIn("Village Theme", (processed / "README.md").read_text())
            self.assertTrue((processed / "README.md").read_text().startswith("# Drive Test Music"))

            report = prepare.validate_processed(pack, processed)
            self.assertEqual(report["groups"], list(GROUPS))
            self.assertEqual(report["tracks"], 8)
            self.assertTrue(all(19.9 <= seconds <= 20.1 for seconds in report["preview_durations_s"].values()))

            card = json.loads(next((processed / "cards").glob("*.json")).read_text())
            self.assertFalse(card["curation"]["auditioned"])
            self.assertIn(card["likely_use"], GROUPS)
            self.assertEqual(set(card["web"]), {"ogg", "mp3"})

            # A copy away from the library still validates on its own, and a
            # loop point past the end of its track is rejected.
            self.assertEqual(prepare.validate_processed(None, processed)["tracks"], 8)
            card_path = sorted((processed / "cards").glob("*.json"))[0]
            card = json.loads(card_path.read_text())
            card["loop"]["points"] = {"start_s": 5.0, "end_s": card["duration_s"] + 10.0}
            card_path.write_text(json.dumps(card))
            with self.assertRaisesRegex(ValueError, "loop points"):
                prepare.validate_processed(None, processed)


if __name__ == "__main__":
    unittest.main()
