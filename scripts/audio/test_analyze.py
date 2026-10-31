"""Tests for the excerpt windows: card tags average CLAP over excerpts, so every music track needs two distinct views."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import analyze as a


def test_short_music_gets_two_excerpts():
    """A 40 s stinger or a 12 s jingle must still be judged on two excerpts (its halves), not one window."""
    for dur in (12.0, 40.0, 60.0):
        spans = a.excerpts([-20.0] * int(dur), dur, music=True)
        assert [s[0] for s in spans] == ["first-half", "second-half"]
        assert spans[0][1] == 0.0 and spans[0][2] == spans[1][1] == dur / 2 and spans[1][2] == dur


def test_long_music_gets_typical_and_loudest_without_overlap():
    """Long tracks: the median-energy 30 s and the loudest 30 s, kept apart so they show different parts."""
    curve = [-30.0] * 60 + [-10.0] * 30 + [-30.0] * 60
    spans = a.excerpts(curve, 150.0, music=True)
    assert len(spans) == 2 and {s[0] for s in spans} == {"typical", "loudest"}
    (_, s1, e1), (_, s2, _) = spans
    assert e1 <= s2


def test_sound_effects_keep_one_whole_file_excerpt():
    """Short SFX are embedded whole; splitting a 0.3 s click would only add noise."""
    assert a.excerpts([], 0.3, music=False) == [("whole", 0.0, 0.3)]
