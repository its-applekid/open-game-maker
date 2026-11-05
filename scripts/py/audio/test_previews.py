"""Tests for the two-second preview: the one small file an agent may open to check a search hit.

The command shape is tested through the `run` seam so these pass on a host with no usable ffmpeg; the end-to-end clip
test needs a working encoder and says so in its name.
"""

import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import previews

HAVE_FFMPEG = previews.have_ffmpeg()


def write_tone(path, seconds=6.0, rate=8000):
    """A tiny fixture with no audio dependency: one sine tone of a known length."""
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        for index in range(int(rate * seconds)):
            out.writeframesraw(struct.pack("<h", int(12000 * math.sin(2 * math.pi * 220 * index / rate))))


def duration_of(path):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True,
        text=True,
    )
    return float(json.loads(probe.stdout)["format"]["duration"])


class Recorder:
    """Stands in for subprocess.run: keeps the command and answers with a chosen result."""

    def __init__(self, returncode=0, stderr=""):
        self.command = None
        self.returncode = returncode
        self.stderr = stderr

    def __call__(self, command, **kwargs):
        self.command = command
        return subprocess.CompletedProcess(command, self.returncode, stdout="", stderr=self.stderr)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_the_command_cuts_two_seconds_of_video_free_audio(self):
        """The preview must be two seconds, silent on the terminal, and never carry a video stream onto a card."""
        run = Recorder()
        out = previews.clip(self.dir / "track.wav", self.dir / "previews" / "clip.ogg", run=run)
        self.assertEqual(out.parent, self.dir / "previews")
        self.assertTrue(out.parent.is_dir(), "the preview bucket must exist before ffmpeg writes into it")
        command = run.command
        self.assertIn("-nostdin", command)
        self.assertIn("-vn", command)
        self.assertEqual(command[command.index("-t") + 1], "2.000")
        self.assertIn("libvorbis", command)
        self.assertEqual(command[-1], str(self.dir / "previews" / "clip.ogg"))

    def test_a_failing_encoder_names_the_file_and_the_reason(self):
        """A batch of ten thousand files must not stop with `CalledProcessError` and ffmpeg's stderr thrown away."""
        run = Recorder(returncode=1, stderr="Invalid data found when processing input")
        with self.assertRaises(RuntimeError) as raised:
            previews.clip(self.dir / "broken.ogg", self.dir / "out.ogg", run=run)
        message = str(raised.exception)
        self.assertIn("broken", message)
        self.assertIn("Invalid data found", message)

    def test_the_mp3_fallback_is_chosen_explicitly(self):
        """A host whose ffmpeg has no libvorbis writes MP3, and the key it returns has to match the file on disk."""
        run = Recorder()
        out = previews.clip(self.dir / "track.wav", self.dir / "clip.mp3", codec="mp3", run=run)
        self.assertIn("libmp3lame", run.command)
        self.assertEqual(out.suffix, ".mp3")

    def test_an_unknown_codec_is_refused_before_ffmpeg_runs(self):
        """The codec list is the contract with the card schema; an unknown one must not write a file no player reads."""
        run = Recorder()
        with self.assertRaises(ValueError):
            previews.clip(self.dir / "missing.wav", self.dir / "out.xyz", codec="xyz", run=run)
        self.assertIsNone(run.command)

    def test_a_clip_key_is_content_addressed(self):
        """Two packs holding the same sound cut the same key, so one shared file serves both cards."""
        sha = "0123456789abcdef" * 4
        self.assertEqual(previews.clip_key("previews", sha), "previews/01/0123456789abcdef-clip.ogg")
        self.assertEqual(previews.clip_key("private/previews", sha), "private/previews/01/0123456789abcdef-clip.ogg")

    def test_have_ffmpeg_answers_a_bool(self):
        """The caller asks instead of catching an exception to find out that nothing can be cut."""
        self.assertIsInstance(previews.have_ffmpeg(), bool)

    @unittest.skipIf(not HAVE_FFMPEG, "ffmpeg is not installed or cannot start")
    def test_a_real_clip_is_two_seconds_long(self):
        """The delivered file, not just the command: two seconds of a six-second source, in a format a browser plays."""
        source = self.dir / "track.wav"
        write_tone(source, 6.0)
        out = previews.clip(source, self.dir / "previews" / "track-clip.ogg")
        self.assertTrue(out.is_file())
        self.assertGreater(out.stat().st_size, 0)
        self.assertAlmostEqual(duration_of(out), previews.CLIP_SECONDS, delta=0.3)


if __name__ == "__main__":
    unittest.main()
