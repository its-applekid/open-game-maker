"""Tests for the card step's rules: each encodes a promise the cards make to agents searching them."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import build_audio_cards as b


def test_repo_root_tracks_the_worker_layout():
    """The worker must resolve repository paths correctly from scripts/py/audio."""
    assert (b.REPO / "scripts/py/audio").is_dir()


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


def test_fast_situations_need_fast_loud_tracks():
    """Kevin: a slow, desolate track was tagged 'chase'. Chase, combat and boss need high measured energy and a quick tempo."""
    assert not b.fits("chase", eq=0.19, bpm=100, minor=False)
    assert b.fits("chase", eq=0.89, bpm=128, minor=False)


def test_stealth_never_goes_on_a_loud_track():
    """Kevin flagged 'stealth' on energetic songs again and again; sneaking music is quiet."""
    assert not b.fits("stealth", eq=0.9, bpm=80, minor=True) and b.fits("stealth", eq=0.2, bpm=80, minor=True)


def test_defeat_needs_minor_or_slow():
    """A cheerful 140 BPM major-key track is not game-over music."""
    assert not b.fits("defeat", eq=0.7, bpm=140, minor=False) and b.fits("defeat", eq=0.7, bpm=140, minor=True)


def test_vendor_genre_comes_from_the_pack_name():
    """CLAP's genre agreed with the pack's own genre only ~30% of the time; the vendor's pack name wins when it names one."""
    assert b.pack_genre("sidetrax-pack-16-orchestral-music-02") == ["orchestral", "cinematic"]
    assert b.pack_genre("sidetrax-pack-30-crimson") is None


def test_synth_coin_is_not_metal():
    """Kevin: a retro 'coin' blip is not metal sounding. In synth packs only a word naming the material outright counts."""
    desc, *_ = _sfx("coin4", "kenney-retro-sounds-2")
    assert "materials" not in desc
    desc, *_ = _sfx("impactMetal_000", "kenney-sci-fi-sounds")
    assert desc.get("materials") == ["metal"]


def test_plate_is_not_a_material_word():
    """Kevin: 'plates slide' sounds like a blade on a whetstone; 'plate' says nothing reliable about the material."""
    assert "plate" not in b.MAT_WORDS


def test_voice_lines_have_no_material():
    """'We need wood' is a spoken line, not a wooden sound."""
    desc, *_ = _sfx("we_need_wood", "kenney-synth-voice-2")
    assert "materials" not in desc


def test_piece_key_joins_layers_but_not_separate_tracks():
    """Abstraction ships a piece as layers (_L01, _L02) and intensities (BASE, MELODY 2, _CUTE); those are variants of one
    piece, while numbered jam tracks (Ludum Dare 28 01, 02) are different pieces."""
    assert b.piece_key("Sketchbook 2024-02-14_L01") == b.piece_key("Sketchbook 2024-02-14_L03")
    assert b.piece_key("Week 10 - Mischief MELODY 2") == b.piece_key("Week 10 - Mischief BASE")
    assert b.piece_key("Interior Birdecorator Explore_CUTE") == b.piece_key("Interior Birdecorator Explore_FESTIVE")
    assert b.piece_key("Ludum Dare 28 01") != b.piece_key("Ludum Dare 28 02")


def test_tempo_band_keywords_let_search_find_near_tempos():
    """'calm loop 90 bpm' must find a 92 BPM loop: search matches whole words, so the band word carries 90."""
    assert b.music_keywords({"tempo_bpm": 92.4, "loopable": True}) == ["bpm-90", "moderate", "seamless"]
    assert b.music_keywords({"tempo_bpm": 70.0, "loopable": False}) == ["bpm-70", "slow"]
    assert b.music_keywords({"tempo_bpm": None}) == []


def _music(mode, strength=0.8):
    sets = b.prompts()
    names = sets["moods"][0]
    p = {k: np.full(len(sets[k][0]), 1 / len(sets[k][0])) for k in ("moods", "genre", "instruments", "game_fit", "environments", "vocals")}
    p["vocals"] = np.array([0.5, 0.5])
    lift = {k: np.ones(len(v)) for k, v in p.items()}
    lift["moods"][names.index("calm")] = 1.4
    lift["moods"][names.index("tense")] = 1.35  # calm and tense are opposed: only the stronger survives
    d = {"_p": p, "_eq": 0.5, "_pack": "abstraction-music-loop-2024-q1"}
    a = {"duration_s": 30.0, "tempo_bpm": 92.0, "key": "A", "mode": mode, "key_strength": strength, "loopable": True}
    return b.music_describe(d, lift, sets, a, "music/loop")[0]


def test_key_is_a_weak_mood_prior():
    """A strong minor key tips a near-tie towards the darker mood; a major key or an unsure key leaves CLAP's pick."""
    assert _music("major")["moods"][0] == "calm"
    assert _music("minor")["moods"][0] == "tense"
    assert _music("minor", strength=0.3)["moods"][0] == "calm"


def test_cards_carry_the_collection_rights_set_and_piece_variants(tmp_path):
    """Every Abstraction card must state its rights and set itself, and layers of one piece link to each other."""
    import json
    pid = "abstraction-music-loop-2024-q1"
    rights = {"uses": ["in-game"], "audience": "private", "redistribution": "none", "processing": "local-only",
              "basis": [{"type": "license", "license": "CC0-1.0"}]}
    (tmp_path / pid).mkdir()
    (tmp_path / pid / "collection.card.json").write_text(json.dumps({"id": f"t1:{pid}@2026-11-02", "rights": rights}))
    sets = b.prompts()
    rows = []
    for i, stem in enumerate(["Sketchbook 2024-02-14_L01", "Sketchbook 2024-02-14_L02", "Sketchbook 2024-03-06_01"]):
        sc = tmp_path / pid / "2026-11-02" / "analysis" / f"{stem}.analysis.json"
        p = {k: np.full(len(sets[k][0]), 1 / len(sets[k][0])) for k in ("moods", "genre", "instruments", "game_fit", "environments")}
        p["vocals"] = np.array([0.5, 0.5])
        rows.append({"file": f"{stem}.ogg", "sha256": f"{i:064x}", "bytes": 1, "music": True, "_p": p, "_eq": 0.5, "_sidecar": sc,
                     "_pack": pid, "_ver": "2026-11-02", "preview": {"waveform": f"private/previews/00/{i:016x}-waveform.png"},
                     "measure": {"audio": {"duration_s": 30.0, "sample_rate": 44100, "channels": 2, "peak_dbfs": -1.0,
                                           "tempo_bpm": 92.0, "loopable": True}}})
    means = {(True, k): np.ones(len(v)) / len(v) for k, v in rows[0]["_p"].items()}
    n, _ = b.build(rows, sets, means, tmp_path, style_sets={pid: "abstraction-music-loop"})
    assert n == 3
    cards = [json.loads(f.read_text()) for f in (tmp_path / pid / "cards").glob("*.card.json")]
    first = next(c for c in cards if c["source"]["files"][0]["path"].endswith("_L01.ogg"))
    assert first["rights"] == rights and first["describe"]["set"] == "abstraction-music-loop"
    assert first["subkind"] == "music/loop" and "bpm-90" in first["describe"]["keywords"]
    assert [r["id"] for r in first["related"]] == [f"t1:{pid}/sketchbook-2024-02-14-l02@2026-11-02"]
    other = next(c for c in cards if "03-06" in c["source"]["files"][0]["path"])
    assert "related" not in other
