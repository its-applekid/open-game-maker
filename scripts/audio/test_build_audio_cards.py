"""Tests for the card step's rules: each encodes a promise the cards make to agents searching them."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import build_audio_cards as b


def test_composer_tempo_settles_the_octave():
    """Beat trackers often read half or double time; the composer's own tempo picks the right reading and keeps the others."""
    a = {"tempo_bpm": 150.0, "tempo_alternatives": [75.0]}
    assert b.settle_tempo(a, {"tempo_bpm": 75.0}) == 75.0
    assert a["tempo_bpm"] == 75.0 and a["tempo_alternatives"] == [150.0]


def test_composer_tempo_far_from_every_reading_is_ignored():
    """A vendor label that matches nothing measured (wrong project tempo, rubato) must not overwrite the measurement."""
    a = {"tempo_bpm": 120.0, "tempo_alternatives": [60.0, 240.0]}
    assert b.settle_tempo(a, {"tempo_bpm": 97.0}) is None and a["tempo_bpm"] == 120.0


def test_ids_are_kebab_paths():
    """C3 ids are lowercase kebab paths; camelCase Kenney names must split (bookOpen -> book-open) to match the examples."""
    assert b.kebab("Audio/bookOpen") == "audio/book-open"
    assert b.kebab("Audio (Hit)/jingles_HIT00") == "audio-hit/jingles-hit00"


def test_lift_keeps_only_labels_above_threshold():
    """A label CLAP likes everywhere must not be tagged on every track: only lift >= threshold survives, best first."""
    names = ["sunrise", "cave", "forest"]
    picked = b.pick(np.array([1.0, 2.5, 1.6]), np.array([0.5, 0.2, 0.3]), names, 1.5, 2)
    assert [n for n, _, _ in picked] == ["cave", "forest"]


def test_opposed_moods_never_share_a_card():
    """'calm' and 'energetic' on one track is a contradiction a search filter would surface; the weaker one is dropped."""
    assert frozenset(("calm", "energetic")) in b.OPPOSED


def _sfx(stem, pid, top_event="a scream"):
    i = [e[0] for e in b.L.SFX_EVENTS].index(top_event)
    p = np.full(len(b.L.SFX_EVENTS), 0.001)
    p[i] = 0.9
    d = {"_p": {"sfx_event": p / p.sum(), "sfx_material": np.full(len(b.L.MATERIALS), 1 / len(b.L.MATERIALS))}}
    lift = {"sfx_event": np.ones(len(p)), "sfx_material": np.ones(len(b.L.MATERIALS))}
    return b.sfx_describe(d, lift, b.prompts(), {"duration_s": 0.5}, stem, pid)


def test_voice_subkind_only_comes_from_voice_packs():
    """A retro 'lose' blip that CLAP hears as a scream is not a voice line; only the voiceover packs are voice."""
    desc, subkind, *_ = _sfx("lose8", "kenney-retro-sounds-2")
    assert subkind != "voice" and not desc["description"].startswith("Voice line")
    desc, subkind, *_ = _sfx("objective_complete", "kenney-voiceover-pack")
    assert subkind == "voice" and desc["keywords"] == ["objective", "complete"]


def test_filename_names_the_source_before_clap():
    """Kenney filenames say what the sound is; 'footstep_carpet' is a footstep on cloth even if CLAP hears a kick."""
    desc, subkind, *_ = _sfx("footstep_carpet_000", "kenney-impact-sounds", top_event="a kick")
    assert subkind == "sfx/footstep" and desc["materials"] == ["cloth"] and "kick" not in desc["objects"]


def test_album_series_number_is_the_catalog_number():
    """Sidetrax files have no title or composer tag; the only catalog number they carry is the series number in the album."""
    assert b.album_no("07 Rock Follies") == 7
    assert b.album_no("SideTrax 2024") is None and b.album_no(None) is None
