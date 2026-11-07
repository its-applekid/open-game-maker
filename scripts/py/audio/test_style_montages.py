"""Tests for the audio-style montage builder: the plan without ffmpeg, the command shape through a seam.

The encode test needs a working ffmpeg and says so in its name. The rest run on a host whose ffmpeg cannot start, so the
slice selection and the crossfade argv are proven without encoding anything.
"""

import json
import math
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import style_montages as sm

HAVE_FFMPEG = sm.have_ffmpeg()


def card(collection, path, duration, genre, mood, group=None):
    """One audio card shaped like cards.index.json, carrying only the fields the builder reads."""
    audio = {"duration_s": duration}
    if group is not None:
        audio["variation_group"] = group
    return {
        "id": f"{collection}/{path}",
        "card_type": "asset",
        "kind": "audio",
        "collection": collection,
        "source": {"files": [{"path": path, "sha256": "sha256:" + "0" * 64, "bytes": 1, "format": "wav", "role": "primary"}]},
        "describe": {"genre": [genre], "moods": [mood]},
        "audio": audio,
    }


def write_tone(path, seconds=6.0, rate=8000, frequency=220):
    """A tiny fixture with no audio dependency: one sine tone of a known length."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        for index in range(int(rate * seconds)):
            out.writeframesraw(struct.pack("<h", int(12000 * math.sin(2 * math.pi * frequency * index / rate))))


def library(root):
    """A fake library: one pack per collection with a real WAV under its extracted folder."""
    packs = {
        "t2:chiptune/arcade@1.0": [("one.wav", 8.0), ("two.wav", 7.0), ("three.wav", 9.0), ("four.wav", 6.0)],
        "t2:chiptune/boss@1.0": [("five.wav", 10.0), ("six.wav", 7.5)],
    }
    cards = []
    for collection, files in packs.items():
        slug, version = sm.collection_slug(collection)
        for name, seconds in files:
            write_tone(Path(root) / "packs" / slug / version / "extracted" / name, seconds)
            cards.append(card(collection, name, seconds, "chiptune", "playful", group=name))
    return cards


class CollectionSlugTest(unittest.TestCase):
    def test_parses_the_folder_and_version(self):
        self.assertEqual(sm.collection_slug("t2:sidetrax/60-battle@1.0"), ("sidetrax", "1.0"))
        self.assertEqual(sm.collection_slug("t1:sidetrax-pack-60-battle@v1"), ("sidetrax-pack-60-battle", "v1"))
        self.assertIsNone(sm.collection_slug("no-version"))
        self.assertIsNone(sm.collection_slug(None))


class PairsTest(unittest.TestCase):
    def test_groups_cards_by_every_genre_and_mood_pair_they_carry(self):
        found = sm.pairs(
            [
                {**card("t2:a@1", "x.wav", 6.0, "chiptune", "playful"), "describe": {"genre": ["chiptune", "electronic"], "moods": ["playful", "energetic"]}},
                card("t2:a@1", "y.wav", 6.0, "chiptune", "playful"),
            ]
        )
        self.assertEqual(set(found), {("chiptune", "playful"), ("chiptune", "energetic"), ("electronic", "playful"), ("electronic", "energetic")})
        self.assertEqual(len(found[("chiptune", "playful")]), 2)


class PlanTest(unittest.TestCase):
    def test_plans_slices_spread_over_distinct_variations_and_packs(self):
        with tempfile.TemporaryDirectory() as root:
            cards = library(root)
            built = sm.plan("chiptune-playful", cards, root, total=24.0, crossfade=0.4, min_tracks=4)
            self.assertIsNotNone(built)
            self.assertEqual(len(built.slices), 6)
            # One slice per variation group: the same file never appears twice.
            self.assertEqual(len({str(cut.path) for cut in built.slices}), len(built.slices))
            self.assertEqual(sum(built.packs.values()), len(built.slices))
            self.assertEqual(set(built.packs), {"t2:chiptune/arcade@1.0", "t2:chiptune/boss@1.0"})
            # Each slice sits inside its track, and the length stays in the safe band.
            for cut in built.slices:
                self.assertGreater(cut.duration, 0)
                self.assertGreaterEqual(cut.start, 0)
            self.assertAlmostEqual(built.seconds, 6 * built.slices[0].duration, places=2)

    def test_skips_a_style_with_too_few_distinct_tracks(self):
        with tempfile.TemporaryDirectory() as root:
            cards = library(root)[:3]
            self.assertIsNone(sm.plan("chiptune-playful", cards, root, min_tracks=4))

    def test_plan_is_deterministic(self):
        with tempfile.TemporaryDirectory() as root:
            cards = library(root)
            first = sm.plan("chiptune-playful", cards, root, total=20.0, min_tracks=4)
            second = sm.plan("chiptune-playful", list(reversed(cards)), root, total=20.0, min_tracks=4)
            self.assertEqual(first.slices, second.slices)


class CommandTest(unittest.TestCase):
    def test_crossfades_every_slice_into_one_output(self):
        slices = (
            sm.Slice(Path("a.wav"), "t2:a@1", 0.5, 4.0),
            sm.Slice(Path("b.wav"), "t2:b@1", 1.0, 4.0),
            sm.Slice(Path("c.wav"), "t2:c@1", 2.0, 4.0),
        )
        argv = sm.command(slices, Path("out.mp3"), codec="mp3", total=11.2, crossfade=0.4)
        self.assertEqual(argv[0], "ffmpeg")
        joined = " ".join(argv)
        self.assertIn("acrossfade=d=0.4", joined)
        # Two joins for three slices, and the final output label is mapped.
        self.assertEqual(joined.count("acrossfade="), 2)
        self.assertEqual(argv[argv.index("-map") + 1], "[out]")
        self.assertIn("libmp3lame", argv)
        self.assertEqual(argv[-1], "out.mp3")

    def test_single_slice_skips_acrossfade(self):
        argv = sm.command((sm.Slice(Path("a.wav"), "t2:a@1", 0.0, 4.0),), Path("out.ogg"), codec="ogg")
        joined = " ".join(argv)
        self.assertNotIn("acrossfade", joined)
        self.assertIn("libvorbis", argv)

    def test_refuses_an_unknown_codec_and_an_empty_plan(self):
        with self.assertRaises(ValueError):
            sm.command((sm.Slice(Path("a.wav"), "t2:a@1", 0.0, 4.0),), Path("out.wav"), codec="wav")
        with self.assertRaises(ValueError):
            sm.command((), Path("out.mp3"))


class BuildTest(unittest.TestCase):
    def test_reports_ffmpeg_failure_with_its_last_stderr_lines(self):
        calls = []

        class Result:
            returncode = 1
            stderr = "line one\nline two\nline three\nline four\n"

        def run(argv, **kwargs):
            calls.append((argv, kwargs))
            return Result()

        built = sm.Plan("chiptune-playful", (sm.Slice(Path("a.wav"), "t2:a@1", 0.0, 4.0),), {})
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(RuntimeError) as caught:
                sm.build(built, Path(root) / "out.mp3", run=run)
        self.assertIn("line four", str(caught.exception))
        self.assertNotIn("line one", str(caught.exception))
        self.assertTrue(calls[0][1].get("capture_output"))

    def test_writes_into_a_missing_output_folder(self):
        seen = []

        class Result:
            returncode = 0
            stderr = ""

        def run(argv, **kwargs):
            seen.append(Path(argv[-1]))
            return Result()

        built = sm.Plan("chiptune-playful", (sm.Slice(Path("a.wav"), "t2:a@1", 0.0, 4.0),), {})
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "nested" / "out.mp3"
            sm.build(built, destination, run=run)
            self.assertEqual(seen, [destination])
            self.assertTrue(destination.parent.is_dir())


@unittest.skipUnless(HAVE_FFMPEG, "requires a working ffmpeg")
class EncodeTest(unittest.TestCase):
    def test_encodes_a_playable_montage_near_the_target_length(self):
        with tempfile.TemporaryDirectory() as root:
            cards = library(root)
            built = sm.plan("chiptune-playful", cards, root, total=12.0, crossfade=0.4, min_tracks=4)
            self.assertIsNotNone(built)
            destination = Path(root) / "out.mp3"
            sm.build(built, destination, "mp3", 12.0, 0.4)
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(destination)],
                capture_output=True,
                text=True,
            )
            duration = json.loads(probe.stdout)["format"]["duration"]
            self.assertAlmostEqual(float(duration), 12.0, delta=1.0)


if __name__ == "__main__":
    unittest.main()
