"""Tests for measure.py on synthetic audio, where the right answer is known by construction."""
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
import measure as m

SR = 44100


def click_track(bpm, beats_per_bar, seconds, chord=(261.63, 329.63, 392.0)):
    """Clicks (accented downbeats) over a sustained chord: tempo, meter and key are all known."""
    t = np.arange(int(seconds * SR)) / SR
    pad = sum(np.sin(2 * np.pi * f * t) for f in chord) * 0.08
    y = pad.copy()
    period = 60 / bpm
    for i in range(int(seconds / period)):
        s = int(i * period * SR)
        n = min(int(0.03 * SR), len(y) - s)
        amp = 0.9 if i % beats_per_bar == 0 else 0.45
        burst = np.random.default_rng(i).standard_normal(n) * np.exp(-np.linspace(0, 8, n)) * amp
        y[s:s + n] += burst
    return np.stack([y, y], axis=1).astype(np.float32)


def write(tmp_path, name, y):
    p = tmp_path / name
    sf.write(p, y, SR)
    return p


@pytest.fixture(scope="module")
def c_major_120(tmp_path_factory):
    p = write(tmp_path_factory.mktemp("a"), "c120.wav", click_track(120, 4, 30))
    return m.measure(p)


def test_tempo_120_is_measured_not_guessed(c_major_120):
    """Agents filter by BPM; a 120 BPM click must read 120 (±1), with 60 and 240 kept as alternatives, not as the answer."""
    a = c_major_120["audio"]
    assert abs(a["tempo_bpm"] - 120) <= 1
    assert any(abs(x - 60) < 1 for x in a["tempo_alternatives"])


def test_key_c_major(c_major_120):
    """A C-E-G pad must read C major with usable strength: key is a search facet and a (weak) mood input."""
    a = c_major_120["audio"]
    assert (a["key"], a["mode"]) == ("C", "major") and a["key_strength"] > 0.5


def need_downbeats(res):
    if res["sidecar"].get("beats_source", "").startswith("essentia"):
        pytest.skip("beat_this weights unavailable (host HTTP 500); meter is left null by design until they are mirrored")


def test_meter_four(c_major_120):
    """Accented every 4th beat -> 4/4. Meter tells agents whether a cue can sit under a march or a waltz."""
    need_downbeats(c_major_120)
    assert c_major_120["audio"]["meter"] == 4


def test_waltz_meter_three(tmp_path):
    """3/4 must not be flattened to 4: waltz time is a real musical choice for town or ballroom scenes."""
    p = write(tmp_path, "w.wav", click_track(150, 3, 30))
    res = m.measure(p)
    need_downbeats(res)
    assert res["audio"]["meter"] == 3


def test_unaccented_clicks_get_no_meter():
    """With every beat equally loud there is no bar to find: the accent fallback must leave meter null rather than guess."""
    period, n = 0.5, 40
    y = np.zeros(int(n * period * SR), np.float32)
    for i in range(n):
        s = int(i * period * SR)
        y[s:s + 1000] += np.random.default_rng(0).standard_normal(1000).astype(np.float32) * 0.5
    assert m.accent_meter(y, np.arange(n) * period) is None


def test_short_stinger_has_no_integrated_loudness(tmp_path):
    """C3 rule: under 0.4 s EBU R128 has no reading, so the card stores null and relies on peak."""
    y = (np.sin(2 * np.pi * 440 * np.arange(int(0.3 * SR)) / SR) * 0.5).astype(np.float32)
    a = m.measure(write(tmp_path, "s.wav", np.stack([y, y], 1)))["audio"]
    assert a["loudness_lufs"] is None and a["peak_dbfs"] == pytest.approx(-6.0, abs=0.2)


def test_seam_check_detects_click():
    """loopable=true promises a gapless loop; a 50 ms click at the joint must break that promise."""
    f = 441.0  # whole number of cycles per second at 44.1 kHz -> a perfect loop over 2 s
    y = (np.sin(2 * np.pi * f * np.arange(2 * SR) / SR) * 0.5).astype(np.float32)
    assert m.seam_ok(y)
    clicked = y.copy(); clicked[-int(0.05 * SR):] = 0.0; clicked[-1] = 0.9
    assert not m.seam_ok(clicked)


def test_48k_file_is_resampled_for_loudness(tmp_path):
    """One Sidetrax track is 48 kHz; it must measure without error and report its native rate."""
    y = click_track(100, 4, 12)
    p = tmp_path / "48k.wav"
    import librosa
    sf.write(p, np.stack([librosa.resample(y[:, 0], orig_sr=SR, target_sr=48000)] * 2, 1), 48000)
    a = m.measure(p)["audio"]
    assert a["sample_rate"] == 48000 and a["loudness_lufs"] is not None


def test_sound_effect_mode_skips_music_fields(tmp_path):
    """Sound effects must not get a key or tempo: a 2 s door creak has neither, and a guessed one would mislead search."""
    r = m.measure(write(tmp_path, "fx.wav", click_track(120, 4, 3)), music=False)
    a = r["audio"]
    assert a["tempo_bpm"] is None and "key" not in a and a["loudness_lufs"] is not None
    assert set(r["sidecar"]["envelope"]) == {"peak_at_s", "attack_s", "tail_db", "active_share"}  # the kind words need it


def test_envelope_tells_a_hit_from_a_sustained_bed():
    """Kind words (one-shot, loop, ambience) rest on this: a decaying hit is loud briefly, a noise bed nearly throughout."""
    t = np.arange(SR * 2) / SR
    hit = np.sin(2 * np.pi * 440 * t) * np.exp(-t * 12)
    bed = np.random.default_rng(0).standard_normal(SR * 2) * 0.2
    h, b = m.envelope_of(hit.astype(np.float32)), m.envelope_of(bed.astype(np.float32))
    assert h["active_share"] < 0.3 and h["tail_db"] < -40 and h["peak_at_s"] < 0.05
    assert b["active_share"] > 0.9 and b["tail_db"] > -6


def test_more_than_two_channels_is_measured_from_a_downmix(tmp_path):
    """Sonniss ships ambisonic and surround ambiences; Essentia refuses them, so they must still get measured cards."""
    y = click_track(120, 4, 4)[:, :1]
    p = write(tmp_path, "quad.wav", np.repeat(y, 4, axis=1))
    r = m.measure(p, music=False)
    assert r["audio"]["channels"] == 4 and r["audio"]["loudness_lufs"] is not None
    assert r["sidecar"]["downmix"] == "mean of 4 channels"
