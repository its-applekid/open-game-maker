"""Prepare an owned music pack for game use with local ffmpeg only.

The script writes cards, OGG/MP3 renditions, eight 20-second game-use
previews, and a browsable README under ``<version>/processed``.  It never
uploads audio and deliberately keeps judgment fields in a separate curation
file so a later listening pass can correct suggestions without losing edits.

Usage:
  python3 -I scripts/py/audio/prepare_game_audio.py \
    --pack assets-local/packs/drive-barbarian-chiptune

Use ``--output`` to stage results when the pack library is mounted read-only,
``--validate-only`` to re-check a prepared pack, and ``--processed DIR
--validate-only`` to check a copy of the output far from the library.
"""

import argparse
import array
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path


AUDIO_EXTENSIONS = {".wav", ".flac", ".aif", ".aiff", ".ogg", ".mp3", ".m4a"}
GROUPS = ("village", "travel", "forest", "cave", "dungeon", "combat", "boss", "victory")
GROUP_MOODS = {
    "village": ("cozy", "cheerful"),
    "travel": ("energetic", "epic"),
    "forest": ("mysterious", "calm"),
    "cave": ("eerie", "mysterious"),
    "dungeon": ("dark", "tense"),
    "combat": ("energetic", "tense"),
    "boss": ("epic", "dark"),
    "victory": ("triumphant", "cheerful"),
}
GROUP_PATTERNS = (
    ("victory", r"\b(victory|triumph|champion|reclamation|reforging)\b"),
    ("boss", r"\b(deathskull|serpent lord|warlord|lord doom|storm giants?|ever-burning rift)\b"),
    ("village", r"\b(village|anvil|streets?|stronghold|castle|citadel|armed to the teeth)\b"),
    ("forest", r"\b(forests?|woods?|sylvan)\b"),
    ("cave", r"\b(caves?|caverns?)\b"),
    ("dungeon", r"\b(dungeons?|infiltration|necromantic)\b"),
    ("travel", r"\b(wilderlands?|mountains?|swamplands?|morass|lumbering|stomping|darkstone)\b"),
    ("combat", r"\b(battle|brawl|smit(?:e|es|ing)|hordes?|confrontation|reavers?|orcs?|goblins?)\b"),
)
SAMPLE_RATE = 8_000
BLOCK_SECONDS = 0.25
PREVIEW_SECONDS = 20
PREVIEW_CODECS = (("ogg", ["-c:a", "libvorbis", "-q:a", "4"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "5"]))


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def slugify(value: str) -> str:
    value = re.sub(r"^(?:dark age\s+)?\d+(?:x\d+)?\s+", "", value, flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "track"


def display_title(path: Path) -> str:
    return re.sub(r"^(?:dark age\s+)?\d+(?:x\d+)?\s+", "", path.stem, flags=re.I).strip()


def suggest_group(title: str) -> str:
    lowered = title.lower().replace("_", "-")
    for group, pattern in GROUP_PATTERNS:
        if re.search(pattern, lowered):
            return group
    return "travel"


def loop_card(score: float, start_s: float, end_s: float) -> dict:
    score = round(clamp(score), 3)
    result = {
        "score": score,
        "verified": False,
        "basis": "phase-insensitive signal candidate; operator audition pending",
    }
    # Coarse phase-insensitive signal matching is useful for finding candidates,
    # but only exceptionally strong matches are safe enough to publish as points.
    if score >= 0.97:
        result.update(
            suitability="good",
            points={"start_s": round(start_s, 3), "end_s": round(end_s, 3)},
        )
        return result
    if score >= 0.85:
        result["suitability"] = "possible"
        return result
    result["suitability"] = "poor"
    return result


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise RuntimeError(f"{command[0]} failed: {' '.join(detail)}") from error


def probe(path: Path) -> dict:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "format=duration:stream=sample_rate,channels",
            "-of",
            "json",
            str(path),
        ],
        capture=True,
    )
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    return {
        "duration_s": float(data["format"]["duration"]),
        "sample_rate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
    }


def decode_pcm(path: Path) -> array.array:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-map_metadata",
            "-1",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "s16le",
            "-",
        ],
        capture=True,
    )
    samples = array.array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def block_features(samples: array.array) -> list[tuple[float, float, float]]:
    block_size = int(SAMPLE_RATE * BLOCK_SECONDS)
    features = []
    previous_rms = 0.0
    for offset in range(0, len(samples) - block_size + 1, block_size):
        block = samples[offset : offset + block_size]
        rms = math.sqrt(sum(value * value for value in block) / len(block)) / 32768.0
        crossings = sum((a < 0) != (b < 0) for a, b in zip(block, block[1:])) / max(len(block) - 1, 1)
        flux = abs(rms - previous_rms)
        features.append((rms, crossings, flux))
        previous_rms = rms
    return features


def feature_distance(left: list[tuple[float, float, float]], right: list[tuple[float, float, float]]) -> float:
    distances = []
    for a, b in zip(left, right):
        rms_distance = abs(20 * math.log10(max(a[0], 1e-5)) - 20 * math.log10(max(b[0], 1e-5))) / 30
        crossing_distance = abs(a[1] - b[1]) / 0.3
        flux_distance = abs(a[2] - b[2]) / 0.25
        distances.append(0.55 * rms_distance + 0.3 * crossing_distance + 0.15 * flux_distance)
    return sum(distances) / max(len(distances), 1)


def loop_candidate(samples: array.array, features: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    """Find a conservative structural match near the beginning and ending.

    The comparison is phase-insensitive: it matches two seconds of RMS,
    zero-crossing rate, and level movement.  The score is only a candidate;
    cards publish points when it reaches the deliberately high ``good`` bar.
    """
    window = max(2, int(2 / BLOCK_SECONDS))
    minimum_span = int(20 / BLOCK_SECONDS)
    if len(features) < minimum_span + 2 * window:
        return 0.0, 0.0, len(samples) / SAMPLE_RATE

    start_stop = min(len(features) // 3, int(45 / BLOCK_SECONDS))
    end_start = max(start_stop + minimum_span, len(features) - int(45 / BLOCK_SECONDS))
    best = (float("inf"), window, len(features) - window)
    for start in range(window, max(window + 1, start_stop - window), 2):
        left = features[start : start + window]
        for end in range(max(end_start, start + minimum_span), len(features) - window, 2):
            right = features[end - window : end]
            distance = feature_distance(left, right)
            start_sample = min(int(start * BLOCK_SECONDS * SAMPLE_RATE), len(samples) - 1)
            end_sample = min(int(end * BLOCK_SECONDS * SAMPLE_RATE), len(samples) - 1)
            boundary = abs(samples[start_sample] - samples[end_sample]) / 65535.0
            distance += boundary * 0.35
            if distance < best[0]:
                best = (distance, start, end)
    score = clamp(math.exp(-2.4 * best[0]))
    return score, best[1] * BLOCK_SECONDS, best[2] * BLOCK_SECONDS


def measure(path: Path) -> dict:
    info = probe(path)
    samples = decode_pcm(path)
    if not samples:
        raise ValueError(f"decoded no audio samples: {path}")
    features = block_features(samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768.0
    peak = max(abs(value) for value in samples) / 32768.0
    rms_dbfs = 20 * math.log10(max(rms, 1e-9))
    peak_dbfs = 20 * math.log10(max(peak, 1e-9))
    crossing_rate = sum(item[1] for item in features) / max(len(features), 1)
    movement = sum(item[2] for item in features) / max(len(features), 1)
    raw_energy = clamp(
        0.6 * clamp((rms_dbfs + 35) / 25)
        + 0.25 * clamp(crossing_rate / 0.25)
        + 0.15 * clamp(movement / 0.12)
    )
    loop_score, loop_start, loop_end = loop_candidate(samples, features)
    return {
        **info,
        "peak_dbfs": round(peak_dbfs, 3),
        "rms_dbfs": round(rms_dbfs, 3),
        "zero_crossing_rate": round(crossing_rate, 5),
        "energy_score": round(raw_energy, 3),
        "loop": loop_card(loop_score, loop_start, loop_end),
    }


def energy_label(score: float) -> str:
    if score >= 0.67:
        return "high"
    if score >= 0.38:
        return "medium"
    return "low"


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def render(
    source: Path,
    destination: Path,
    codec_args: list[str],
    *,
    start_s: float | None = None,
    duration_s: float | None = None,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if duration_s is None and destination.exists() and destination.stat().st_mtime >= source.stat().st_mtime:
        return
    temporary = destination.with_name(destination.stem + ".part" + destination.suffix)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if start_s is not None:
        command += ["-ss", f"{start_s:.3f}"]
    command += ["-i", str(source), "-map_metadata", "-1", "-vn"]
    if duration_s is not None:
        tail = PREVIEW_SECONDS - 0.25
        command += [
            "-af",
            f"apad=whole_dur={PREVIEW_SECONDS},afade=t=in:st=0:d=0.05,afade=t=out:st={tail}:d=0.25",
            "-t",
            f"{duration_s:.3f}",
        ]
    command += codec_args + [str(temporary)]
    run(command)
    temporary.replace(destination)


def preview_start(duration_s: float) -> float:
    return round(max(0.0, min(duration_s * 0.35, duration_s - PREVIEW_SECONDS)), 3)


def source_files(pack: Path, version: str) -> list[Path]:
    extracted = pack / version / "extracted"
    return sorted(
        path
        for path in extracted.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS and not path.name.startswith("._")
    )


def load_curation(path: Path) -> dict:
    if not path.exists():
        return {"tracks": {}}
    value = json.loads(path.read_text())
    if not isinstance(value.get("tracks"), dict):
        raise ValueError(f"curation file needs a tracks object: {path}")
    return value


def select_previews(rows: list[dict]) -> dict[str, dict]:
    """Pick one track per use group, preferring a different track for each.

    A group that no track suits falls back to the best remaining track so all
    eight previews always exist; a track is only reused when the pack holds
    fewer tracks than groups.
    """
    chosen = {}
    used: set[str] = set()
    target_energy = {
        "village": 0.4,
        "travel": 0.6,
        "forest": 0.35,
        "cave": 0.3,
        "dungeon": 0.5,
        "combat": 0.8,
        "boss": 0.85,
        "victory": 0.75,
    }
    order = list(GROUPS)
    matched_first = [group for group in order if any(row["likely_use"] == group for row in rows)]
    for group in matched_first + [group for group in order if group not in matched_first]:
        matching = [row for row in rows if row["likely_use"] == group and row["source"] not in used]
        remaining = [row for row in rows if row["source"] not in used]
        pool = matching or remaining or rows
        pick = min(
            pool,
            key=lambda row: (
                abs(row["energy"]["score"] - target_energy[group])
                - 0.15 * row["loop"].get("score", 0),
                row["title"],
            ),
        )
        chosen[group] = pick
        used.add(pick["source"])
    return {group: chosen[group] for group in GROUPS}


def markdown_cell(value: str) -> str:
    """Keep a title from breaking the README's table."""
    return value.replace("|", "\\|")


def markdown_time(seconds: float) -> str:
    total = round(seconds)
    return f"{total // 60}:{total % 60:02d}"


def pack_title(manifest: dict) -> str:
    """A readable pack name for the README heading, without shipping a host name."""
    if manifest.get("title"):
        return str(manifest["title"])
    return " ".join(word.capitalize() for word in str(manifest.get("id", "soundtrack")).split("-"))


def write_readme(processed: Path, rows: list[dict], selected: dict[str, dict], pack_name: str) -> None:
    lines = [
        f"# {pack_name}",
        "",
        "Local-only game-ready renditions. Mood, likely-use, and loop suggestions stay provisional "
        "until the operator listening pass; edit `curation.json` and rerun this script to keep corrections.",
        "",
        "## 20-second use previews",
        "",
    ]
    for group in GROUPS:
        row = selected[group]
        lines.append(
            f"- **{group}** — [{row['title']}](previews/{group}.mp3) ([OGG](previews/{group}.ogg))"
        )
    lines += [
        "",
        "## Tracks",
        "",
        "| Track | Duration | Mood | Energy | Likely use | Loop | Web files |",
        "|---|---:|---|---|---|---|---|",
    ]
    for row in sorted(rows, key=lambda item: item["source"].lower()):
        loop = row["loop"]["suitability"]
        if row["loop"].get("points"):
            points = row["loop"]["points"]
            loop += f" ({points['start_s']:.1f}–{points['end_s']:.1f}s)"
        lines.append(
            f"| {markdown_cell(row['title'])} | {markdown_time(row['duration_s'])} | {', '.join(row['mood'])} | "
            f"{row['energy']['label']} ({row['energy']['score']:.2f}) | {row['likely_use']} | {loop} | "
            f"[OGG]({row['web']['ogg']}) · [MP3]({row['web']['mp3']}) · [card](cards/{row['_card_name']}) |"
        )
    (processed / "README.md").write_text("\n".join(lines) + "\n")


def prepare_pack(pack: Path, *, output: Path | None = None, heading: str | None = None) -> dict:
    pack = pack.resolve()
    manifest = json.loads((pack / "pack.json").read_text())
    version = manifest["current"]
    processed = output.resolve() if output else pack / version / "processed"
    files = source_files(pack, version)
    if not files:
        raise ValueError(f"no audio files found under {pack / version / 'extracted'}")

    curation_path = processed / "curation.json"
    curation = load_curation(curation_path)
    tracks = curation["tracks"]
    rows = []
    used_slugs = set()
    for index, source in enumerate(files, 1):
        relative_source = source.relative_to(pack / version).as_posix()
        title = display_title(source)
        metrics = measure(source)
        group = suggest_group(title)
        suggestion = {
            "auditioned": False,
            "mood": list(GROUP_MOODS[group]),
            "likely_use": group,
            "preview_start_s": preview_start(metrics["duration_s"]),
        }
        current = tracks.setdefault(relative_source, {})
        for key, value in suggestion.items():
            current.setdefault(key, value)
        if current["likely_use"] not in GROUPS:
            raise ValueError(f"invalid likely_use for {relative_source}: {current['likely_use']}")

        slug = slugify(title)
        if slug in used_slugs:
            slug += "-" + hashlib.sha256(relative_source.encode()).hexdigest()[:8]
        used_slugs.add(slug)
        ogg = processed / "audio" / f"{slug}.ogg"
        mp3 = processed / "audio" / f"{slug}.mp3"
        render(source, ogg, ["-c:a", "libvorbis", "-q:a", "5"])
        render(source, mp3, ["-c:a", "libmp3lame", "-q:a", "4"])
        card = {
            "source": relative_source,
            "title": title,
            "duration_s": round(metrics.pop("duration_s"), 3),
            "mood": list(current["mood"]),
            "energy": {
                "label": energy_label(metrics["energy_score"]),
                "score": metrics.pop("energy_score"),
            },
            "likely_use": current["likely_use"],
            "loop": metrics.pop("loop"),
            "web": {"ogg": f"audio/{slug}.ogg", "mp3": f"audio/{slug}.mp3"},
            "signal": metrics,
            "curation": {
                "auditioned": bool(current.get("auditioned")),
                "basis": (
                    "operator audition"
                    if current.get("auditioned")
                    else "title plus measured signal; operator audition pending"
                ),
                "preview_start_s": float(current["preview_start_s"]),
            },
        }
        card_name = f"{slug}.json"
        atomic_json(processed / "cards" / card_name, card)
        rows.append({**card, "_card_name": card_name})
        print(json.dumps({"n": index, "track": relative_source, "status": "prepared"}), flush=True)

    atomic_json(curation_path, curation)
    selected = select_previews(rows)
    source_by_relative = {path.relative_to(pack / version).as_posix(): path for path in files}
    for group, row in selected.items():
        source = source_by_relative[row["source"]]
        start = row["curation"]["preview_start_s"]
        for extension, codec in PREVIEW_CODECS:
            render(
                source,
                processed / "previews" / f"{group}.{extension}",
                codec,
                start_s=start,
                duration_s=PREVIEW_SECONDS,
            )

    write_readme(processed, rows, selected, heading or pack_title(manifest))
    report = validate_processed(pack, processed)
    report["processed"] = str(processed)
    return report


def validate_processed(pack: Path | None, processed: Path | None = None) -> dict:
    """Check a prepared tree, against its pack when the pack is reachable.

    ``pack`` is ``None`` for a tree copied away from the library: the tree then
    only has to be self-consistent (as many renditions as cards, every link and
    preview present, every loop point inside its track).
    """
    problems: list[str] = []
    expected = None
    if pack is not None:
        pack = pack.resolve()
        manifest = json.loads((pack / "pack.json").read_text())
        processed = processed or pack / manifest["current"] / "processed"
        expected = len(source_files(pack, manifest["current"]))
    if processed is None:
        raise ValueError("validation needs a pack or a processed folder")
    processed = processed.resolve()
    cards = sorted((processed / "cards").glob("*.json"))
    oggs = sorted((processed / "audio").glob("*.ogg"))
    mp3s = sorted((processed / "audio").glob("*.mp3"))
    if not cards:
        raise ValueError(f"no cards found under {processed / 'cards'}")
    if expected is None:
        expected = len(cards)
    for label, paths in (("cards", cards), ("OGG renditions", oggs), ("MP3 renditions", mp3s)):
        if len(paths) != expected:
            stale = " (stale files left by a renamed track?)" if len(paths) > expected else ""
            problems.append(f"expected {expected} {label}, found {len(paths)}{stale}")
    for path in cards:
        card = json.loads(path.read_text())
        for field in ("duration_s", "mood", "energy", "likely_use", "loop", "web", "curation"):
            if field not in card:
                problems.append(f"{path.name}: missing {field}")
        for web_path in card.get("web", {}).values():
            if not (processed / web_path).is_file():
                problems.append(f"{path.name}: missing web file {web_path}")
        points = card.get("loop", {}).get("points")
        if points and not 0.0 <= points["start_s"] < points["end_s"] <= float(card.get("duration_s", 0)):
            problems.append(f"{path.name}: loop points {points} fall outside a {card.get('duration_s')}s track")
    preview_durations = {}
    for group in GROUPS:
        for extension in ("ogg", "mp3"):
            path = processed / "previews" / f"{group}.{extension}"
            if not path.is_file():
                problems.append(f"missing {group}.{extension} preview")
                continue
            duration = probe(path)["duration_s"]
            # MP3 reports encoder delay/padding in its container duration.
            tolerance = 0.25 if extension == "mp3" else 0.1
            if not PREVIEW_SECONDS - tolerance <= duration <= PREVIEW_SECONDS + tolerance:
                problems.append(f"{path.name}: expected 20 seconds, found {duration:.3f}")
            if extension == "ogg":
                preview_durations[group] = round(duration, 3)
    readme = processed / "README.md"
    if not readme.is_file():
        problems.append("missing README.md")
    else:
        for link in re.findall(r"\]\(([^)]+)\)", readme.read_text()):
            if not (processed / link).is_file():
                problems.append(f"README.md links to a missing file: {link}")
    if problems:
        raise ValueError("processed audio validation failed:\n- " + "\n- ".join(problems))
    return {"tracks": expected, "groups": list(GROUPS), "preview_durations_s": preview_durations}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pack", type=Path, help="pack folder holding pack.json and <version>/extracted")
    parser.add_argument("--output", type=Path, help="stage processed output outside a read-only pack")
    parser.add_argument("--title", help="README heading; defaults to the pack manifest title or id")
    parser.add_argument("--processed", type=Path, help="check a prepared folder on its own, without the pack")
    parser.add_argument("--validate-only", action="store_true", help="check what is already prepared")
    args = parser.parse_args()
    if args.processed is None and args.pack is None:
        parser.error("--pack or --processed is required")
    if args.processed is not None and args.output is not None:
        parser.error("--processed already points at the output; drop --output")
    if args.processed is not None:
        if not args.validate_only:
            parser.error("--processed validates an existing folder; add --validate-only")
        report = validate_processed(args.pack, args.processed)
    elif args.validate_only:
        report = validate_processed(args.pack, args.output)
    else:
        report = prepare_pack(args.pack, output=args.output, heading=args.title)
    print(json.dumps({"status": "ok", **report}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
