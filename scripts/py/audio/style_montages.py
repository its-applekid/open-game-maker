"""Build one 60-second audio-style montage per (style, mood) pair the audio cards carry (#357).

usage: python3 -I style_montages.py [--assets-root DIR] [--index FILE] [--out DIR] [--style ID ...]
       [--total-seconds 60] [--crossfade 0.4] [--min-tracks 6] [--codec mp3|ogg] [--dry-run]

Reads `cards.index.json` — the document `gm packs index` writes today. The ticket expects `assets.db` (#509), but its
researched schema carries neither the `moods`/`describe.genre` axes nor `audio.variation_group`, so the builder reads the
index until #509 adds those columns; `plan()` takes plain card dicts, so the source is one adapter away. Keeps the audio
cards, and for every (genre, mood) pair with enough distinct tracks slices a few
seconds from each track, spread over `variation_group` so a run of four sword impacts contributes once. The slices are
crossfaded into one file named `<genre>-<mood>.<ext>`, and the run prints how many slices came from each pack. A style
whose audio is not carded gets no file; the picker offers only the styles that have one.

The plan (which slices, from which files) is pure and tested without ffmpeg; the encode shells out to ffmpeg and its
command shape is tested through a seam. The audio worker already owns ffmpeg analysis (`measure.py`, `previews.py`), so
this script sits beside it rather than starting a new toolchain.
"""
import argparse
import json
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ASSETS_ROOT = "assets-local"
DEFAULT_INDEX = "index/cards.index.json"
DEFAULT_OUT = "audio-styles"
DEFAULT_TOTAL_SECONDS = 60.0
DEFAULT_CROSSFADE = 0.4
DEFAULT_MIN_TRACKS = 6
MIN_SLICE_SECONDS = 2.5
MAX_SLICE_SECONDS = 8.0
# Deterministic fractions into a track so a montage samples more than each file's first seconds.
OFFSETS = (0.15, 0.45, 0.75, 0.3, 0.6)
CODECS = {
    "mp3": ["-c:a", "libmp3lame", "-q:a", "4"],
    "ogg": ["-c:a", "libvorbis", "-q:a", "4"],
}

_HAVE = None


def have_ffmpeg():
    """True only when ffmpeg actually starts: it can be on PATH and still fail to load its shared libraries."""
    global _HAVE
    if _HAVE is None:
        try:
            _HAVE = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).returncode == 0
        except OSError:
            _HAVE = False
    return _HAVE


@dataclass(frozen=True)
class Slice:
    """One cut from one track: where to start, how long, and the card's collection for the pack count."""

    path: Path
    collection: str
    start: float
    duration: float


@dataclass(frozen=True)
class Plan:
    """A montage's slices in play order, plus the pack tally the run prints."""

    style: str
    slices: tuple
    packs: dict

    @property
    def seconds(self):
        """Total play time of the slices before the crossfades overlap the consecutive pairs."""
        return round(sum(s.duration for s in self.slices), 2)


def load_index(path):
    """Parse a cards.index.json document; return the top-level object."""
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def audio_cards(index):
    """The asset cards of kind audio from the index, each a plain dict."""
    cards = index.get("cards", []) if isinstance(index, dict) else index
    return [card for card in cards if card.get("kind") == "audio" and card.get("card_type", "asset") == "asset"]


def collection_slug(collection_id):
    """`t2:sidetrax/60-battle@1.0` → (`sidetrax`, `1.0`); the folder name and version inside the library."""
    if not collection_id or "@" not in collection_id:
        return None
    version = collection_id.rsplit("@", 1)[1]
    name = collection_id.split(":", 1)[-1].split("@", 1)[0]
    slug = name.split("/", 1)[0]
    return (slug, version) if slug and version else None


def source_path(card):
    """The primary file path a card points at, relative to its pack's extracted folder."""
    files = card.get("source", {}).get("files", [])
    primary = next((f for f in files if f.get("role") == "primary"), None)
    chosen = primary or (files[0] if files else None)
    return chosen.get("path") if chosen else None


def track_file(assets_root, card):
    """The file on disk a card's primary source resolves to, or None when the pack folder is absent."""
    relative = source_path(card)
    parts = collection_slug(card.get("collection"))
    if relative is None or parts is None:
        return None
    slug, version = parts
    candidates = [Path(assets_root) / "packs" / slug / version / "extracted" / relative]
    manifest = card.get("collection_info", {}).get("pack_manifest")
    if isinstance(manifest, str):
        trimmed = manifest.replace("assets-local/", "", 1)
        candidates.insert(0, Path(assets_root) / Path(trimmed).parent / version / "extracted" / relative)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def audio_duration(card):
    """The measured length in seconds, or None when the card has no audio analysis."""
    value = card.get("audio", {}).get("duration_s")
    return float(value) if isinstance(value, (int, float)) and value > 0 else None


def variation_key(card):
    """A card's variation group, falling back to its id so ungrouped tracks still count once each."""
    group = card.get("audio", {}).get("variation_group")
    return group if isinstance(group, str) and group else card.get("id")


def pairs(cards):
    """Every (genre, mood) pair the cards carry, each with the cards matching both axes."""
    found = {}
    for card in cards:
        describe = card.get("describe", {})
        genres = [g for g in describe.get("genre", []) if isinstance(g, str)]
        moods = [m for m in describe.get("moods", []) if isinstance(m, str)]
        for genre in genres:
            for mood in moods:
                found.setdefault((genre, mood), []).append(card)
    return found


def _slice_length(cards, total, crossfade):
    """A per-slice length that fills `total` after the crossfades overlap, within the safe band."""
    count = len(cards)
    if count == 0:
        return 0.0
    target = (total + crossfade * (count - 1)) / count
    return max(MIN_SLICE_SECONDS, min(MAX_SLICE_SECONDS, target))


def plan(style, cards, assets_root, total=DEFAULT_TOTAL_SECONDS, crossfade=DEFAULT_CROSSFADE,
         min_tracks=DEFAULT_MIN_TRACKS):
    """Pick slices spread over variation groups and packs; None when the style has too few distinct tracks."""
    resolved = []
    seen = set()
    for card in cards:
        duration = audio_duration(card)
        path = track_file(assets_root, card)
        key = variation_key(card)
        if duration is None or path is None or key in seen:
            continue
        seen.add(key)
        resolved.append((card, path, duration))
    resolved.sort(key=lambda item: (str(item[1]), str(item[0].get("id", ""))))
    if len(resolved) < min_tracks:
        return None
    length = _slice_length(resolved, total, crossfade)
    slices = []
    packs = Counter()
    for index, (card, path, duration) in enumerate(resolved):
        start = round(max(0.0, min(duration - length, duration * OFFSETS[index % len(OFFSETS)])), 3)
        slices.append(Slice(path=path, collection=str(card.get("collection", "")), start=start, duration=round(length, 3)))
        packs[str(card.get("collection", "unknown"))] += 1
    return Plan(style=style, slices=tuple(slices), packs=dict(packs))


def command(slices, destination, codec="mp3", total=DEFAULT_TOTAL_SECONDS, crossfade=DEFAULT_CROSSFADE):
    """The ffmpeg argv that crossfades `slices` into `destination`, normalising each slice to 48 kHz stereo first."""
    if codec not in CODECS:
        raise ValueError(f"unknown codec {codec!r}; expected one of {sorted(CODECS)}")
    if not slices:
        raise ValueError("a montage needs at least one slice")
    argv = ["ffmpeg", "-nostdin", "-v", "error", "-y"]
    for cut in slices:
        argv += ["-ss", f"{cut.start:.3f}", "-t", f"{cut.duration:.3f}", "-i", str(cut.path)]
    normalise = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS"
    chains = [f"[{i}:a]{normalise}[a{i}]" for i in range(len(slices))]
    if len(slices) == 1:
        chains.append("[a0]anull[out]")
    else:
        previous = "a0"
        for i in range(1, len(slices)):
            label = "out" if i == len(slices) - 1 else f"x{i}"
            chains.append(f"[{previous}][a{i}]acrossfade=d={crossfade}:c1=tri:c2=tri[{label}]")
            previous = label
    argv += ["-filter_complex", ";".join(chains), "-map", "[out]", "-t", f"{total:.3f}", *CODECS[codec], str(destination)]
    return argv


def build(plan_, destination, codec="mp3", total=DEFAULT_TOTAL_SECONDS, crossfade=DEFAULT_CROSSFADE, run=None):
    """Encode one plan to `destination`; returns the argv that ran. `run` is the subprocess seam."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    argv = command(plan_.slices, destination, codec=codec, total=total, crossfade=crossfade)
    result = (run or subprocess.run)(argv, capture_output=True, text=True)
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-3:]
        raise RuntimeError(f"ffmpeg failed ({result.returncode}): {' | '.join(tail)}")
    return argv


def style_id(genre, mood):
    """The file stem the picker looks up: `<genre>-<mood>`, matching the contract's AUDIO_STYLES ids."""
    return f"{genre}-{mood}"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build 60 s audio-style montages from the audio cards.")
    parser.add_argument("--assets-root", default=DEFAULT_ASSETS_ROOT)
    parser.add_argument("--index", default=None, help=f"card index JSON (default <assets-root>/{DEFAULT_INDEX})")
    parser.add_argument("--out", default=None, help=f"output folder (default <assets-root>/{DEFAULT_OUT})")
    parser.add_argument("--style", action="append", default=[], help="build only this <genre>-<mood> (repeatable)")
    parser.add_argument("--total-seconds", type=float, default=DEFAULT_TOTAL_SECONDS)
    parser.add_argument("--crossfade", type=float, default=DEFAULT_CROSSFADE)
    parser.add_argument("--min-tracks", type=int, default=DEFAULT_MIN_TRACKS)
    parser.add_argument("--codec", choices=sorted(CODECS), default="mp3")
    parser.add_argument("--dry-run", action="store_true", help="print the plans without encoding")
    args = parser.parse_args(argv)

    assets_root = Path(args.assets_root)
    index_path = Path(args.index) if args.index else assets_root / DEFAULT_INDEX
    out = Path(args.out) if args.out else assets_root / DEFAULT_OUT
    if not index_path.is_file():
        print(f"no card index at {index_path}; run `gm packs index` first", file=sys.stderr)
        return 2
    wanted = set(args.style)
    plans = []
    for (genre, mood), cards in sorted(pairs(audio_cards(load_index(index_path))).items()):
        stem = style_id(genre, mood)
        if wanted and stem not in wanted:
            continue
        built = plan(stem, cards, assets_root, args.total_seconds, args.crossfade, args.min_tracks)
        if built is not None:
            plans.append(built)
    if not plans:
        print("no style had enough distinct tracks to build a montage", file=sys.stderr)
        return 1
    for built in plans:
        destination = out / f"{built.style}.{args.codec}"
        if args.dry_run:
            print(f"{built.style}: {len(built.slices)} slices, {built.seconds:.1f} s -> {destination}")
        elif have_ffmpeg():
            build(built, destination, args.codec, args.total_seconds, args.crossfade)
            print(f"{built.style}: {len(built.slices)} slices, {built.seconds:.1f} s -> {destination}")
        else:
            print(f"ffmpeg is not usable; skipping {built.style}", file=sys.stderr)
        packs = ", ".join(f"{name} {count}" for name, count in sorted(built.packs.items()))
        print(f"  slices per pack: {packs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
