"""Measure one music file with code only (plan U2): the C3 `audio` block plus an analysis sidecar.

usage: .venv/bin/python -I measure.py AUDIO_FILE OUT_PREFIX [--loop-search]
writes OUT_PREFIX.measure.json = {"audio": {...C3 audio fields...}, "sidecar": {...}, "tools": {...}, "timing_s": {...}}

Tools (all permissive or AGPL-run-locally; no non-commercial weights):
  Essentia KeyExtractor (3 profiles), RhythmExtractor2013, LoudnessEBUR128; beat_this (MIT) beats/downbeats;
  librosa novelty for section boundaries; pymusiclooper for loop points (only with --loop-search)."""
import json, sys, time
from pathlib import Path

import numpy as np

KEY_PROFILES = ("edma", "krumhansl", "temperley")
PITCH = {"A#": "Bb", "D#": "Eb", "G#": "Ab", "Db": "C#", "Gb": "F#"}  # normalise to the C3 pitchClass spelling
SR = 44100
SHORT_S = 0.4  # EBU R128 gate needs at least 400 ms (C3 §3 note)


def key_of(mono):
    """Key by majority of three profiles; strength is the agreeing profiles' mean, lowered when they disagree."""
    import essentia.standard as es
    votes = []
    for prof in KEY_PROFILES:
        k, scale, strength = es.KeyExtractor(profileType=prof, sampleRate=SR)(mono)
        votes.append((PITCH.get(k, k), scale, float(strength)))
    tally = {}
    for k, s, st in votes:
        tally.setdefault((k, s), []).append(st)
    (k, s), sts = max(tally.items(), key=lambda kv: (len(kv[1]), sum(kv[1])))
    agree = len(sts)
    strength = float(np.mean(sts)) * (1.0 if agree >= 2 else 0.5)
    return {"key": k, "mode": s, "key_strength": round(strength, 3), "votes": votes, "agree": agree}


def tempo_of(mono):
    import essentia.standard as es
    bpm, beats, conf, estimates, _ = es.RhythmExtractor2013(method="multifeature")(mono)
    bpm = float(bpm)
    alts = [round(x, 2) for x in (bpm / 2, bpm * 2) if 40 <= x <= 240]
    return {"tempo_bpm": round(bpm, 2), "tempo_alternatives": alts, "tempo_confidence": float(conf), "beats": [float(b) for b in beats]}


def loudness_of(stereo):
    """Integrated loudness, range and a 1 Hz short-term curve (EBU R128)."""
    import essentia.standard as es
    if stereo.shape[0] / SR < SHORT_S:
        return {"loudness_lufs": None, "loudness_range_lu": None}, []
    momentary, short, integrated, lra = es.LoudnessEBUR128(sampleRate=SR, hopSize=0.1, startAtZero=True)(stereo)
    curve = [round(float(x), 1) for x in short[::10]]  # 0.1 s hop (the maximum) -> keep 1 Hz
    return {"loudness_lufs": round(float(integrated), 1), "loudness_range_lu": round(float(lra), 1)}, curve


def beats_of(path):
    """Beats, downbeats and meter from beat_this. Meter = median beats between downbeats."""
    from beat_this.inference import File2Beats
    global _F2B
    if globals().get("_F2B_ERR"):  # the weights failed to load once in this process: don't pay the retry on every file
        raise _F2B_ERR
    if "_F2B" not in globals():
        try:
            _F2B = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)
        except Exception as e:
            globals()["_F2B_ERR"] = e
            raise
    beats, downbeats = _F2B(str(path))
    beats, downbeats = np.asarray(beats, float), np.asarray(downbeats, float)
    meter = None
    if len(downbeats) >= 3 and len(beats):
        # snap downbeats to beat indices; beat_this sometimes flags the beat after a downbeat too (bars of 1), so skip those
        idx = sorted({int(np.abs(beats - d).argmin()) for d in downbeats})
        kept = idx[:1]
        for i in idx[1:]:
            if i - kept[-1] >= 2:
                kept.append(i)
        counts = [c for c in np.diff(kept).tolist() if 2 <= c <= 12]
        # trust the downbeats only when most bars agree (on some 3/4 input beat_this flags nearly every beat)
        ones = float(np.mean(np.diff(idx) == 1)) if len(idx) > 1 else 0.0  # extra after each downbeat gives 0.5
        if counts and ones <= 0.55 and counts.count(int(np.median(counts))) >= 0.6 * len(counts):
            meter = int(np.median(counts))
    return beats, downbeats, meter


def accent_meter(mono, beats):
    """3 or 4 from where the accents fall: the bar length whose best phase stands out most from the other beats.
    None when the beats are too few or neither length clearly wins (no guessing)."""
    w = int(0.07 * SR)
    idx = (np.asarray(beats) * SR).astype(int)
    idx = idx[(idx >= w) & (idx + w <= len(mono))]
    if len(idx) < 12:
        return None
    e = np.array([np.sqrt(np.mean(mono[i:i + w] ** 2)) - np.sqrt(np.mean(mono[i - w:i] ** 2)) for i in idx])
    sd = float(np.std(e))
    if sd <= 0.05 * float(np.mean(np.abs(e))):  # beats all about equally loud: no accent pattern to read
        return None
    score = {m: max(float(np.mean(e[p::m]) - np.mean(np.delete(e, np.s_[p::m]))) for p in range(m)) / sd for m in (3, 4)}
    best, other = sorted(score, key=score.get, reverse=True)
    return best if score[best] > 0.5 and score[best] > 1.5 * max(score[other], 0) else None


def sections_of(mono, curve, duration):
    """Section boundaries: novelty peaks on beat-agnostic chroma+MFCC, at least 8 s apart, labelled by energy rank."""
    import librosa
    y = librosa.resample(mono, orig_sr=SR, target_sr=22050)
    hop = 2048
    feat = np.vstack([librosa.util.normalize(librosa.feature.chroma_cqt(y=y, sr=22050, hop_length=hop), axis=0),
                      librosa.util.normalize(librosa.feature.mfcc(y=y, sr=22050, hop_length=hop, n_mfcc=13), axis=1)])
    fps = 22050 / hop
    width = max(4, int(4 * fps))  # 4 s checkerboard half-width
    ssm = librosa.segment.recurrence_matrix(feat, mode="affinity", sym=True, width=1).astype(float)
    n = ssm.shape[0]
    if n < 4 * width:
        return [{"start_s": 0.0, "end_s": round(duration, 2), "label": "A", "energy": 1.0}]
    g = np.outer(np.r_[np.ones(width), -np.ones(width)], np.r_[np.ones(width), -np.ones(width)])
    nov = np.array([(ssm[i - width:i + width, i - width:i + width] * g).sum() if width <= i < n - width else 0 for i in range(n)])
    peaks = librosa.util.peak_pick(np.ascontiguousarray(nov, dtype=np.float64), pre_max=int(width), post_max=int(width), pre_avg=int(width), post_avg=int(width), delta=float(np.std(nov) * 0.5), wait=int(8 * fps))
    bounds = [0.0] + [round(p / fps, 2) for p in peaks] + [round(duration, 2)]
    secs = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        seg = [x for x in curve[int(a):max(int(a) + 1, int(b))] if x > -70] or [-70.0]
        secs.append({"start_s": a, "end_s": b, "loudness": round(float(np.mean(seg)), 1)})
    ranks = np.argsort(np.argsort([s["loudness"] for s in secs]))
    top = len(secs) - 1
    for i, s in enumerate(secs):
        s["energy"] = round(float(ranks[i] / max(top, 1)), 2)
        s["label"] = "peak" if ranks[i] == top and top > 0 else ("outro" if i == top and top > 1 and s["energy"] < 0.5 else chr(65 + min(i, 25)))
    return secs


def energy_of(loud, mono):
    """0-1 from integrated loudness (-30..-5 LUFS) and onset rate (0..8/s), fixed ranges so values compare across packs."""
    import librosa
    lufs = loud.get("loudness_lufs")
    l = 0.0 if lufs is None else min(max((lufs + 30) / 25, 0), 1)
    onsets = librosa.onset.onset_detect(y=librosa.resample(mono, orig_sr=SR, target_sr=22050), sr=22050, units="time")
    rate = len(onsets) / max(len(mono) / SR, 1e-6)
    return round(0.6 * l + 0.4 * min(rate / 8, 1), 3)


def centroid_of(mono):
    import librosa
    c = librosa.feature.spectral_centroid(y=mono, sr=SR)[0]
    return round(float(np.mean(c)), 0)


def seam_ok(mono, ms=50):
    """True when the end flows into the start: similar level and no click across the joint."""
    n = int(SR * ms / 1000)
    if len(mono) < 4 * n:
        return False
    a, b = mono[-n:], mono[:n]
    ra, rb = np.sqrt(np.mean(a ** 2)) + 1e-9, np.sqrt(np.mean(b ** 2)) + 1e-9
    level_db = abs(20 * np.log10(ra / rb))
    jump = abs(float(mono[-1]) - float(mono[0]))
    return bool(level_db < 3 and jump < 4 * max(np.mean(np.abs(np.diff(a))), 1e-4))


def envelope_of(mono, frame_s=0.01):
    """Sound effects: when it peaks, how fast it rises, how loud it ends (dB re peak), and the share of 10 ms frames within
    20 dB of the peak (high = sustained bed or loop, low = a hit that decays)."""
    n = max(1, int(SR * frame_s))
    k = len(mono) // n
    if k < 2:
        return {"peak_at_s": 0.0, "attack_s": 0.0, "tail_db": 0.0, "active_share": 1.0}
    rms = np.sqrt(np.mean(np.asarray(mono[:k * n], dtype=np.float64).reshape(k, n) ** 2, axis=1)) + 1e-9
    db = 20 * np.log10(rms / rms.max())
    top = int(np.argmax(rms))
    start = int(np.argmax(db > -40))
    tail = db[-max(1, int(0.05 / frame_s)):]
    return {"peak_at_s": round(top * frame_s, 3), "attack_s": round(max(0, top - start) * frame_s, 3),
            "tail_db": round(float(np.mean(tail)), 1), "active_share": round(float(np.mean(db > -20)), 3)}


def loop_points_of(path):
    from pymusiclooper.core import MusicLooper
    ml = MusicLooper(str(path))
    try:
        pairs = ml.find_loop_pairs()
    except Exception as e:  # pymusiclooper raises LoopNotFoundError when no pair passes its threshold: no loop, not a failure
        if type(e).__name__ != "LoopNotFoundError":
            raise
        return None
    if not pairs:
        return None
    p = pairs[0]
    rate = ml.mlaudio.rate
    return {"start_s": round(p.loop_start / rate, 3), "end_s": round(p.loop_end / rate, 3), "score": round(float(p.score), 3)}


def measure(path: Path, loop_search=False, music=True):
    """music=False (sound effects): only the shared audio facts, no key, tempo, beats or sections."""
    import essentia.standard as es
    t, timing = time.time(), {}
    def lap(k):
        nonlocal t
        timing[k] = round(time.time() - t, 2); t = time.time()
    stereo, sr, channels, _, _, _ = es.AudioLoader(filename=str(path))()
    if sr != SR:  # e.g. 48 kHz files: resample each channel so loudness runs at one rate
        rs = es.Resample(inputSampleRate=float(sr), outputSampleRate=float(SR))
        stereo = np.stack([rs(np.ascontiguousarray(stereo[:, c])) for c in range(stereo.shape[1])], axis=1).astype(np.float32)
    mono = es.MonoLoader(filename=str(path), sampleRate=SR)()
    duration = len(mono) / SR
    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    audio = {"duration_s": round(duration, 3), "sample_rate": int(sr), "channels": int(channels),
             "peak_dbfs": round(20 * np.log10(peak), 1) if peak > 0 else -120.0}
    lap("load")
    loud, curve = loudness_of(stereo); audio.update(loud); lap("loudness")
    sidecar = {"loudness_short_term_1hz": curve}
    if music and duration >= 2:
        k = key_of(mono); audio.update({x: k[x] for x in ("key", "mode", "key_strength")}); sidecar["key_votes"] = k["votes"]; lap("key")
        tp = tempo_of(mono); audio.update({x: tp[x] for x in ("tempo_bpm", "tempo_alternatives")}); sidecar["tempo_confidence"] = tp["tempo_confidence"]; lap("tempo")
        try:
            beats, downbeats, meter = beats_of(path); sidecar["beats_source"] = "beat_this final0"
        except Exception as e:  # weights host down (HTTP 500 seen 2026-10-27): fall back visibly, no downbeats -> no meter
            beats, downbeats, meter = np.asarray(tp["beats"]), np.asarray([]), None
            sidecar["beats_source"] = f"essentia RhythmExtractor2013 (beat_this unavailable: {type(e).__name__})"
        if meter is None:
            meter = accent_meter(mono, beats); sidecar["meter_source"] = "beat accents" if meter else None
        audio["meter"] = meter; lap("beats")
        sidecar.update({"beats_s": [round(x, 3) for x in beats], "downbeats_s": [round(x, 3) for x in downbeats]})
        sidecar["sections"] = sections_of(mono, curve, duration); lap("sections")
        audio["energy"] = energy_of(loud, mono)
    else:
        audio.update({"tempo_bpm": None, "meter": None})
    audio["spectral_centroid_hz"] = centroid_of(mono)
    audio["loopable"] = seam_ok(mono)
    if not music:
        sidecar["envelope"] = envelope_of(mono)
    lap("energy+centroid+seam")
    if loop_search:
        lp = loop_points_of(path)
        if lp:
            audio["loop_points"] = lp
        lap("loop_search")
    return {"audio": audio, "sidecar": sidecar, "timing_s": timing}


def main():
    path, out = Path(sys.argv[1]), Path(sys.argv[2])
    res = measure(path, loop_search="--loop-search" in sys.argv)
    tmp = out.with_name(out.name + ".measure.json.part")
    tmp.write_text(json.dumps(res, indent=1))
    tmp.rename(out.with_name(out.name + ".measure.json"))
    print(json.dumps({"file": path.name, **{k: res["audio"].get(k) for k in ("key", "mode", "key_strength", "tempo_bpm", "meter", "loudness_lufs", "energy", "loopable")}, "timing_s": res["timing_s"]}))


if __name__ == "__main__":
    main()
