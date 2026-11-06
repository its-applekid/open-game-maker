"""Short previews: a two-second clip of a sound file, written next to the waveform a card already carries.

The searchability plan (`docs/research/asset-searchability-2026-11-05.md` §4) lets an agent open exactly one preview
per decision, and prices it at ~24 KB: long enough to check that a hit is the footstep on gravel and not the door, short
enough that a library of ten thousand files is still a few hundred megabytes. ffmpeg does the cut, so this runs on any
host that already measures audio — no torch, no model weights, no upload.
"""
import subprocess
from pathlib import Path

CLIP_SECONDS = 2.0

# OGG Vorbis at -q 3 is the same shape the game-audio prep step uses for its previews; MP3 is the fallback for a host
# whose ffmpeg was built without libvorbis.
CLIP_CODECS = (("ogg", ["-c:a", "libvorbis", "-q:a", "3"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "6"]))

_HAVE = None


def have_ffmpeg():
    """True when a clip can be cut at all, by actually starting ffmpeg: the binary can be on PATH and still fail to load
    (a sandbox missing its shared libraries), and a run that discovers that per file pays for it ten thousand times."""
    global _HAVE
    if _HAVE is None:
        try:
            _HAVE = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).returncode == 0
        except OSError:
            _HAVE = False
    return _HAVE


def clip(source, destination, seconds=CLIP_SECONDS, codec="ogg", run=None):
    """Write `seconds` of `source` to `destination` and return the path that was written.

    The clip starts at the beginning of the file rather than at its loudest moment: a preview is how a caller checks that
    a search hit is the sound it asked for, and an attack that the file itself put first is part of that answer. Progress
    output is discarded and `-nostdin` stops ffmpeg from reading the caller's terminal, so a batch of ten thousand files
    never blocks on its own prompt. A failing ffmpeg raises RuntimeError with its last stderr lines: a traceback from
    subprocess tells a long batch's operator nothing. `run` is the subprocess seam, so the command shape is tested on a
    host with no usable ffmpeg.
    """
    codec = codec.lower().lstrip(".")
    args = dict(CLIP_CODECS).get(codec)
    if args is None:
        raise ValueError(f"unknown preview codec {codec!r}; expected one of {[c for c, _ in CLIP_CODECS]}")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        str(source),
        "-t",
        f"{float(seconds):.3f}",
        "-vn",
        *args,
        str(destination),
    ]
    result = (run or subprocess.run)(command, capture_output=True, text=True)
    if result.returncode != 0:
        tail = " / ".join(result.stderr.strip().splitlines()[-3:]) or "no error output"
        raise RuntimeError(f"ffmpeg failed to cut {Path(source).name} ({result.returncode}): {tail}")
    return destination


def clip_key(prefix, sha256, codec="ogg"):
    """Where a clip lives in the library: the same content-addressed fan-out the waveform uses, so re-cutting the same
    file twice writes the same key and two packs that hold the same sound share one clip."""
    return f"{prefix}/{sha256[:2]}/{sha256[:16]}-clip.{codec.lower().lstrip('.')}"
