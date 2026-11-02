"""Analyse every audio file in assets-local/packs once (plan U2/U5): code facts, vendor tags, a CLAP embedding, a waveform preview.

usage: .venv/bin/python -I analyze.py [--workers N] [--packs DIR] [--only PACK_GLOB] [--limit N]
writes, per file, packs/<id>/<ver>/analysis/<path without ext>.analysis.json:
  {"file", "sha256", "bytes", "music", "measure": {audio, sidecar, timing_s}, "vendor": {...}, "clap": {"model", "windows": [...],
   "excerpts": [{"name", "start_s", "end_s", "embedding": [512 floats]}]}, "preview": bucket key}
Labels are not scored here: the card step scores any label set against the stored embeddings, so labels can change without
re-listening. Re-runs skip files whose sidecar already has the same sha256."""
import argparse, fnmatch, hashlib, json, os, re, struct, subprocess, sys, time
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2] / "assets-local"
AUDIO_EXT = {".wav", ".ogg", ".mp3", ".flac", ".m4a", ".aif", ".aiff"}
MUSIC_PACKS = ("sidetrax-*", "kenney-music-*", "abstraction-music-loop-*")
CLAP_ID = "laion/clap-htsat-unfused"
CLAP_SR = 48000
WIN_S = 10  # CLAP's native window; whole windows only, so its random-crop path never runs
PRIVATE_VENDORS = ("sidetrax-", "synty-", "abstraction-")  # redistribution none/in-build: previews under private/


def preview_prefix(pack: str) -> str:
    """Packs Kevin may not redistribute keep their waveform previews out of the shareable previews/ tree."""
    return "private/previews" if pack.startswith(PRIVATE_VENDORS) else "previews"


def is_music(pack: str) -> bool:
    return any(fnmatch.fnmatch(pack, g) for g in MUSIC_PACKS)


def audio_files(packs: Path, only: str):
    """(pack id, version dir, file) for every audio file, one format per stem (ogg preferred over wav/mp3 copies)."""
    out = []
    for pj in sorted(packs.glob("*/pack.json")):
        pid = pj.parent.name
        if not fnmatch.fnmatch(pid, only):
            continue
        cur = json.loads(pj.read_text())["current"]
        ext = pj.parent / cur / "extracted"
        seen = {}
        for f in sorted(ext.rglob("*")):
            if f.suffix.lower() in AUDIO_EXT and f.is_file() and not f.name.startswith("._"):
                key = f.with_suffix("").relative_to(ext).as_posix().lower()
                rank = [".ogg", ".wav", ".flac", ".aiff", ".aif", ".mp3", ".m4a"].index(f.suffix.lower())
                if key not in seen or rank < seen[key][0]:
                    seen[key] = (rank, f)
        out += [(pid, pj.parent / cur, f) for _, f in sorted(seen.values(), key=lambda x: str(x[1]))]
    return out


def sidecar_path(vdir: Path, f: Path) -> Path:
    rel = f.relative_to(vdir / "extracted").with_suffix("")
    return vdir / "analysis" / (rel.as_posix() + ".analysis.json")


def sha256(f: Path) -> str:
    h = hashlib.sha256()
    with open(f, "rb") as r:
        for b in iter(lambda: r.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def vendor_tags(f: Path) -> dict:
    """Container tags (ffprobe) plus the DAW tempo label Sidetrax WAVs carry in a RIFF adtl/labl chunk ("Tempo: 120.0")."""
    out = {}
    try:
        p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(f)], capture_output=True, text=True, timeout=60)
        tags = {k.lower(): v for k, v in json.loads(p.stdout or "{}").get("format", {}).get("tags", {}).items()}
    except (subprocess.SubprocessError, json.JSONDecodeError):
        tags = {}
    for k in ("title", "album", "artist", "composer", "date", "genre", "track"):
        if tags.get(k):
            out[k] = tags[k].strip()
    m = re.match(r"^(\d{1,4})\s+(.+)$", out.get("title", ""))
    if m:
        out["catalog_no"], out["title"] = int(m.group(1)), m.group(2)
    if f.suffix.lower() == ".wav":
        b = f.read_bytes()
        i = 12
        while i + 8 <= len(b):
            cid, n = b[i:i + 4], struct.unpack("<I", b[i + 4:i + 8])[0]
            if cid == b"LIST" and b[i + 8:i + 12] == b"adtl":
                t = re.search(rb"Tempo:\s*([0-9.]+)", b[i + 8:i + 8 + n])
                if t:
                    out["tempo_bpm"] = float(t.group(1))
            i += 8 + n + (n & 1)
    return out


def excerpts(curve, dur, music):
    """Windows to embed. Music: the median-energy 30 s and the loudest 30 s (non-overlapping), each as 3 x 10 s.
    Music of 60 s or less: its two halves, so every track still gets two excerpts.
    Short sound effects: the whole file, cut into 10 s windows (at most 3)."""
    import numpy as np
    if not music:
        n = max(1, min(3, int(dur // WIN_S)))
        return [("whole", 0.0, min(dur, n * WIN_S) if dur >= WIN_S else dur)]
    if dur <= 60:
        return [("first-half", 0.0, dur / 2), ("second-half", dur / 2, dur)]
    c = np.array(curve, float)
    w = 30
    sums = np.convolve(np.where(c > -70, c, -70), np.ones(w) / w, "valid")
    loud = int(np.argmax(sums))
    med = int(np.argmin(np.abs(sums - np.median(sums))))
    if abs(med - loud) < w:
        far = [i for i in range(len(sums)) if abs(i - loud) >= w]
        med = min(far, key=lambda i: abs(sums[i] - np.median(sums))) if far else med
    return sorted([("typical", float(med), float(med + w)), ("loudest", float(loud), float(loud + w))], key=lambda x: x[1])


_M = None


def clap():
    global _M
    if _M is None:
        import torch
        from transformers import ClapModel, ClapProcessor
        torch.set_num_threads(int(os.environ.get("OGM_TORCH_THREADS", "2")))
        _M = (ClapModel.from_pretrained(CLAP_ID, use_safetensors=False).eval(), ClapProcessor.from_pretrained(CLAP_ID))
    return _M


def embed(y, spans):
    """One L2-normalised embedding per excerpt: mean of its 10 s windows' embeddings."""
    import numpy as np, torch
    m, p = clap()
    out = []
    for name, a, b in spans:
        seg = y[int(a * CLAP_SR):int(b * CLAP_SR)]
        wins = [seg[i:i + WIN_S * CLAP_SR] for i in range(0, max(len(seg) - CLAP_SR, 1), WIN_S * CLAP_SR)][:3] or [seg]
        wins = [w for w in wins if len(w) >= CLAP_SR // 10] or [seg]
        with torch.no_grad():
            e = m.get_audio_features(**p(audio=wins, sampling_rate=CLAP_SR, return_tensors="pt", padding=True))
        e = torch.nn.functional.normalize(e, dim=-1).mean(0)
        e = torch.nn.functional.normalize(e, dim=0)
        out.append({"name": name, "start_s": round(a, 2), "end_s": round(b, 2), "windows": len(wins), "embedding": [round(float(x), 5) for x in e]})
    return out


def waveform_png(y, out: Path):
    """800x120 min/max waveform, grey on white; enough to see dynamics and silence at a glance."""
    import numpy as np
    from PIL import Image, ImageDraw
    W, H = 800, 120
    img = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(img)
    if len(y):
        cols = np.array_split(y, W)
        for x, c in enumerate(cols):
            if len(c):
                lo, hi = float(c.min()), float(c.max())
                d.line([(x, int(H / 2 - hi * H / 2)), (x, int(H / 2 - lo * H / 2))], fill=90)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)


def analyse(job):
    pid, vdir, f = job
    sc = sidecar_path(vdir, f)
    h = sha256(f)
    if sc.exists():
        try:
            if json.loads(sc.read_text()).get("sha256") == h:
                return {"file": str(f), "status": "skip"}
        except json.JSONDecodeError:
            pass
    t0 = time.time()
    try:
        import librosa
        sys.path.insert(0, str(HERE))
        import measure
        music = is_music(pid)
        meas = measure.measure(f, loop_search=music and pid.startswith("sidetrax-"), music=music)
        dur = meas["audio"]["duration_s"]
        y, _ = librosa.load(str(f), sr=CLAP_SR, mono=True)
        spans = excerpts(meas["sidecar"].get("loudness_short_term_1hz", []), dur, music)
        key = f"{preview_prefix(pid)}/{h[:2]}/{h[:16]}-waveform.png"
        waveform_png(y, ROOT / key)
        res = {"file": f.relative_to(vdir / "extracted").as_posix(), "pack": pid, "sha256": h, "bytes": f.stat().st_size, "music": music,
               "measure": meas, "vendor": vendor_tags(f), "clap": {"model": CLAP_ID, "excerpts": embed(y, spans)},
               "preview": {"waveform": key}, "analysed_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "secs": round(time.time() - t0, 1)}
    except Exception as e:  # one bad file must not stop the batch; reported, retried on the next run
        return {"file": str(f), "status": "fail", "error": f"{type(e).__name__}: {e}"[:300]}
    sc.parent.mkdir(parents=True, exist_ok=True)
    tmp = sc.with_name(sc.name + ".part")
    tmp.write_text(json.dumps(res))
    tmp.rename(sc)
    return {"file": str(f), "status": "ok", "secs": res["secs"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--packs", type=Path, default=ROOT / "packs")
    ap.add_argument("--only", default="*")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    jobs = audio_files(a.packs, a.only)
    jobs = jobs[:a.limit] if a.limit else jobs
    print(json.dumps({"files": len(jobs), "workers": a.workers}), flush=True)
    counts = {}
    with Pool(a.workers, maxtasksperchild=200) as pool:
        for i, r in enumerate(pool.imap_unordered(analyse, jobs, chunksize=1), 1):
            counts[r["status"]] = counts.get(r["status"], 0) + 1
            if r["status"] != "skip":
                print(json.dumps({"n": i, **r}), flush=True)
    print(json.dumps({"done": counts}), flush=True)


if __name__ == "__main__":
    main()
