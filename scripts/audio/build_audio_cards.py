"""Turn analysis sidecars into C3 sound cards (plan U5): score CLAP labels, rank them against the library, write and validate.

usage: .venv/bin/python -I build_audio_cards.py [--packs DIR] [--no-validate]
reads  packs/<id>/<ver>/analysis/**/*.analysis.json (from analyze.py) and packs/<id>/collection.card.json
writes packs/<id>/cards/<path>.card.json, updates each audio collection card's counts, prints a summary.

Ranking: CLAP's raw softmax favours some labels on every track ("sunrise", "outer space"), so each label is judged by its
lift = p(label | track) / mean p(label) over the library (music and sound effects separately). A tag is kept only when its
lift is high; game_fit stores each situation's percentile across the music library (0-1)."""
import argparse, json, re, subprocess, sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import labels as L
from import_sidetrax import stem_key

REPO = HERE.parents[1]
ROOT = REPO / "assets-local"
SCHEMAS = REPO / "docs/research/v0.5/schemas"
VOCAB = "2026-10-27"
TOOL = "build_audio_cards@0.1"
CLAP_ID = "laion/clap-htsat-unfused"
NOW = datetime.now().astimezone().isoformat(timespec="seconds")
VOICE_PACKS = ("kenney-voiceover-pack", "kenney-voiceover-pack-fighter", "kenney-synth-voice-1", "kenney-synth-voice-2")
UI_PACKS = ("kenney-interface-sounds", "kenney-ui-audio", "kenney-ui-pack")
OPPOSED = {frozenset(x) for x in [("calm", "energetic"), ("calm", "tense"), ("calm", "epic"), ("calm", "triumphant"), ("cozy", "dark"),
           ("cozy", "tense"), ("cozy", "eerie"), ("cheerful", "dark"), ("cheerful", "sad"), ("cheerful", "eerie"), ("playful", "dark"),
           ("playful", "sad"), ("sad", "triumphant"), ("cozy", "epic"), ("playful", "epic")]}
# Filename words that name a material (C3 materials enum); trusted over CLAP, which hears synthetic sounds as anything.
MAT_WORDS = {"wood": "wood", "wooden": "wood", "plank": "wood", "metal": "metal", "metallic": "metal", "plate": "metal", "tin": "metal",
             "chain": "metal", "sword": "metal", "coin": "metal", "glass": "glass", "stone": "stone", "rock": "stone", "concrete": "stone",
             "carpet": "cloth", "cloth": "cloth", "leather": "leather", "paper": "paper", "book": "paper", "water": "water",
             "snow": "ice", "ice": "ice", "grass": "plant", "leaves": "plant", "bone": "bone", "fire": "fire", "plastic": "plastic"}
STOP = {"sfx", "sound", "audio", "the", "and", "small", "large", "big", "short", "long", "high", "low", "light", "medium", "heavy",
        "soft", "hard", "fast", "slow", "alt", "new", "var", "version"}
MUSIC_CONF = 0.5  # uncalibrated until Kevin's sample review (plan U6); below 0.6 the card carries low-confidence


def prompts():
    """Every label set as (key, labels, prompts)."""
    moods = L.MOODS + list(L.EXTRA_MOODS)
    return {
        "moods": (moods, [f"{m} music" for m in moods]),
        "genre": (L.GENRES, [f"{g} music" for g in L.GENRES]),
        "instruments": (list(L.INSTRUMENTS), [f"music featuring {v}" for v in L.INSTRUMENTS.values()]),
        "game_fit": (list(L.GAME_FIT), list(L.GAME_FIT.values())),
        "environments": (list(L.ENVIRONMENTS), [f"music that sounds like {v}" for v in L.ENVIRONMENTS.values()]),
        "settings": (list(L.SETTINGS), [f"{v} music" for v in L.SETTINGS.values()]),
        "vocals": (["vocals", "instrumental"], list(L.VOCALS)),
        "sfx_event": ([e[0] for e in L.SFX_EVENTS], [f"the sound of {e[0]}" for e in L.SFX_EVENTS]),
        "sfx_material": (L.MATERIALS, [f"the sound of {m}" for m in L.MATERIALS]),
    }


def text_embeddings(sets):
    import torch
    from transformers import ClapModel, ClapProcessor
    m = ClapModel.from_pretrained(CLAP_ID, use_safetensors=False).eval()
    p = ClapProcessor.from_pretrained(CLAP_ID)
    out = {}
    with torch.no_grad():
        for k, (_, texts) in sets.items():
            e = m.get_text_features(**p(text=texts, return_tensors="pt", padding=True))
            out[k] = torch.nn.functional.normalize(e, dim=-1).numpy()
        scale = float(m.logit_scale_a.exp())
    return out, scale


def softmax(x):
    x = x - x.max(-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(-1, keepdims=True)


def kebab(s):
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s)
    return re.sub(r"[^a-z0-9/]+", "-", s.lower()).strip("-").replace("/-", "/").replace("-/", "/")


def title_of(stem):
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", stem).replace("_", " ").replace("-", " ").split()
    words = [w for w in words if not re.fullmatch(r"\d{1,3}", w)] or words
    return " ".join(words).strip().capitalize()[:120] or stem


def pick(lift, p, names, min_lift, k):
    order = sorted(range(len(names)), key=lambda i: -lift[i])
    return [(names[i], float(lift[i]), float(p[i])) for i in order[:k] if lift[i] >= min_lift]


def settle_tempo(a, vendor):
    """Composer tempo picks between the measured tempo and its half/double readings."""
    v = vendor.get("tempo_bpm")
    if not v or a.get("tempo_bpm") is None:
        return None
    cands = [a["tempo_bpm"]] + list(a.get("tempo_alternatives", []))
    best = min(cands, key=lambda c: abs(c - v) / v)
    if abs(best - v) / v > 0.04:
        return None
    others = [c for c in cands if c != best]
    a["tempo_bpm"], a["tempo_alternatives"] = round(v, 2), [round(c, 2) for c in others][:3]
    return best


def load(packs: Path):
    rows = []
    for sc in sorted(packs.glob("*/*/analysis/**/*.analysis.json")):
        d = json.loads(sc.read_text())
        d["_sidecar"] = sc
        rel = sc.relative_to(packs)
        d["_pack"], d["_ver"] = rel.parts[0], rel.parts[1]
        rows.append(d)
    return rows


def score_all(rows, emb, scale, sets):
    """Per file and label set: softmax over the set for each excerpt, averaged over excerpts."""
    for d in rows:
        A = np.array([e["embedding"] for e in d["clap"]["excerpts"]], dtype=np.float32)
        keys = ["moods", "genre", "instruments", "game_fit", "environments", "settings", "vocals"] if d["music"] else ["sfx_event", "sfx_material"]
        d["_p"] = {k: softmax(scale * A @ emb[k].T).mean(0) for k in keys}


def library_means(rows):
    means = {}
    for music in (True, False):
        group = [d for d in rows if d["music"] == music]
        for k in (group[0]["_p"] if group else {}):
            means[(music, k)] = np.mean([d["_p"][k] for d in group], axis=0)
    return means


def percentiles(rows, key):
    group = [d for d in rows if d["music"]]
    if not group:
        return
    M = np.array([d["_p"][key] for d in group])
    ranks = M.argsort(0).argsort(0) / max(len(group) - 1, 1)
    for d, r in zip(group, ranks):
        d["_pct_" + key] = r


def music_describe(d, lift, sets, a, subkind):
    names = lambda k: sets[k][0]
    proposed = []
    moods = []
    for name, lf, p in pick(lift["moods"], d["_p"]["moods"], names("moods"), 1.3, 6):
        if name in L.MOODS:
            target = name
        else:
            target = L.EXTRA_MOODS[name]
            proposed.append({"field": "moods", "tag": name, "nearest": target, "reason": f"CLAP lift {lf:.1f} vs library"})
        if target not in moods and not any(frozenset((target, m)) in OPPOSED for m in moods):
            moods.append(target)
    if not moods:
        i = int(np.argmax(lift["moods"]))
        n = names("moods")[i]
        moods = [n if n in L.MOODS else L.EXTRA_MOODS[n]]
    moods = moods[:3]
    genre = [n for n, _, _ in pick(lift["genre"], d["_p"]["genre"], names("genre"), 1.3, 3)] or [names("genre")[int(np.argmax(lift["genre"]))]]
    instruments = [n for n, _, _ in pick(lift["instruments"], d["_p"]["instruments"], names("instruments"), 1.8, 4)]
    envs = [n for n, _, _ in pick(lift["environments"], d["_p"]["environments"], names("environments"), 2.0, 2)]
    settings = [n for n, _, _ in pick(lift["settings"], d["_p"]["settings"], names("settings"), 1.4, 2)]
    fit = {k: round(float(v), 2) for k, v in zip(names("game_fit"), d["_pct_game_fit"])}
    top_fit = sorted(fit, key=lambda k: -fit[k])[:2]
    pv = float(d["_p"]["vocals"][0])
    desc = {"description": "", "objects": [], "roles": ["music-bed"], "moods": moods, "genre": genre, "game_fit": fit,
            "style_family": "any"}
    if instruments:
        desc["instruments"] = instruments
    if envs:
        desc["environments"] = envs
    if settings:
        desc["settings"] = settings
    if pv > 0.75 or pv < 0.25:
        desc["has_vocals"] = pv > 0.75
    kind_word = {"music/loop": "loop", "music/stinger": "stinger"}.get(subkind, "track")
    dur = a["duration_s"]
    facts = []
    if a.get("tempo_bpm"):
        facts.append(f"{a['tempo_bpm']:.0f} BPM")
    if a.get("key") and a.get("key_strength", 0) >= 0.5:
        facts.append(f"{a['key']} {a['mode']}")
    facts.append(f"{int(dur // 60)}:{int(dur % 60):02d}" if dur >= 60 else f"{dur:.0f} s" if dur >= 10 else f"{dur:.1f} s")
    text = f"{moods[0].capitalize()}{', ' + moods[1] if len(moods) > 1 else ''} {genre[0]} {kind_word} ({', '.join(facts)}); suits {top_fit[0].replace('-', ' ')} and {top_fit[1].replace('-', ' ')}"
    if envs:
        text += f"; evokes {L.ENVIRONMENTS[envs[0]]}"
    desc["description"] = (text + ".")[:300]
    return desc, proposed


def sfx_describe(d, lift, sets, a, stem, pid):
    events = sets["sfx_event"][0]
    p = d["_p"]["sfx_event"]
    top = int(np.argmax(p))
    ev = L.SFX_EVENTS[top]
    words = [w.lower() for w in re.findall(r"[A-Za-z][a-z]+|[A-Z]+(?![a-z])", stem) if len(w) > 2 and w.lower() not in STOP]
    objects = []
    for w in words:
        w = w[:-1] if w.endswith("s") and not w.endswith("ss") else w
        if re.fullmatch(r"[a-z][a-z0-9-]*", w) and w not in objects:
            objects.append(w)
    noun_sub = {}
    for e in L.SFX_EVENTS:
        noun_sub.setdefault(e[1], e[2])
    named = [w for w in objects if w in noun_sub]  # the filename already says what makes the sound
    clap_obj = ev[1] if p[top] >= 0.3 and not named and pid not in VOICE_PACKS else None
    if clap_obj and clap_obj not in objects:
        objects.append(clap_obj)
    objects = objects[:12]
    mats = list(dict.fromkeys(MAT_WORDS[w] for w in words if w in MAT_WORDS))[:2]
    if not mats and pid not in UI_PACKS + VOICE_PACKS and (named and noun_sub[named[0]] or ev[2]) in ("sfx/foley", "sfx/impact", "sfx/footstep"):
        mats = [n for n, _, pp in pick(lift["sfx_material"], d["_p"]["sfx_material"], sets["sfx_material"][0], 1.5, 1) if pp >= 0.5]
    if pid in VOICE_PACKS:
        subkind, roles = "voice", ["voice-line"]
    elif pid in UI_PACKS:
        subkind, roles = "sfx/ui", ["feedback"]
    else:
        subkind = noun_sub[named[0]] if named else (ev[2] if p[top] >= 0.15 else "sfx/other")
        if subkind.startswith("music/") or subkind == "voice":  # voice only from the voice packs, never a CLAP guess
            subkind = "sfx/other"
        roles = {"ambience": ["ambience-bed"], "voice": ["voice-line"], "sfx/ui": ["feedback"]}.get(subkind, ["feedback", "effect"])
    title = title_of(stem)
    if subkind == "voice":
        text = f"Voice line: \"{title.lower()}\" ({a['duration_s']:.1f} s)."
    else:
        text = f"{title}: {a['duration_s']:.2f} s {subkind.split('/')[-1]} sound"
        if mats:
            text += f", {mats[0]}"
        if clap_obj:
            text += f"; sounds like {events[top]}"
        text += "."
    desc = {"description": text[:300], "objects": objects, "roles": roles, "style_family": "any"}
    if subkind == "voice":  # the words are the spoken line, not things in the scene
        desc["objects"], desc["keywords"] = ["voice"], [w for w in objects if w != "voice"][:12]
    if mats:
        desc["materials"] = mats
    conf = round(min(0.85, 0.35 + float(p[top])), 2)
    return desc, subkind, conf, events[top], float(p[top])


def build(rows, sets, means, packs: Path):
    by_pack = defaultdict(list)
    for d in rows:
        by_pack[d["_pack"]].append(d)
    same_name = defaultdict(list)  # same piece across Sidetrax packs (full track in one pack, loop in another)
    for d in rows:
        if d["_pack"].startswith("sidetrax-"):
            same_name[stem_key(Path(d["file"]).stem)].append(d)
    written, flags_count, counts = 0, defaultdict(int), defaultdict(lambda: defaultdict(int))
    for pid, items in by_pack.items():
        cc = json.loads((packs / pid / "collection.card.json").read_text())
        coll = cc["id"]
        ver = coll.rsplit("@", 1)[1]
        groups = defaultdict(list)
        for d in items:
            groups[(str(Path(d["file"]).parent), stem_key(Path(d["file"]).stem))].append(d)
        for _, g in groups.items():
            g.sort(key=lambda d: -d["measure"]["audio"]["duration_s"])
            d = g[0]
            a = dict(d["measure"]["audio"])
            a["analysis"] = d["_sidecar"].relative_to(packs / pid).as_posix()
            v = d.get("vendor", {})
            vend = {k: v[k] for k in ("title", "album", "composer") if v.get(k)}
            if v.get("catalog_no") is not None:
                vend["catalog_no"] = v["catalog_no"]
            if re.fullmatch(r"\d{4}", str(v.get("date", ""))):
                vend["year"] = int(v["date"])
            if v.get("tempo_bpm"):
                vend["tempo_bpm"] = v["tempo_bpm"]
            if vend:
                a["vendor"] = vend
            matched = settle_tempo(a, v) if d["music"] else None
            rel = Path(d["file"])
            stem = rel.stem
            path_id = kebab(rel.with_suffix("").as_posix())
            lift = {k: d["_p"][k] / means[(d["music"], k)] for k in d["_p"]}
            prov = {"*": {"by": "code", "tool": TOOL, "at": NOW, "input": "analyze.py: Essentia + librosa measures, sha256"}}
            flags = []
            proposed = []
            if d["music"]:
                subkind = ("music/loop" if "loop" in pid else "music/stinger" if a["duration_s"] < 15 or "jingle" in pid else "music/track")
                describe, proposed = music_describe(d, lift, sets, a, subkind)
                prov["describe"] = {"by": "model", "model": CLAP_ID, "tool": TOOL, "at": NOW, "confidence": MUSIC_CONF,
                                    "input": "CLAP embeddings of two 30 s excerpts vs label prompts, lift vs library; key/tempo not shown"}
                prov["describe.description"] = {"by": "code", "tool": TOOL, "at": NOW, "input": "template from CLAP tags + measured audio"}
                flags += ["low-confidence", "mood-unverified"]
            else:
                describe, subkind, conf, ev, pev = sfx_describe(d, lift, sets, a, stem, pid)
                prov["describe"] = {"by": "model", "model": CLAP_ID, "tool": TOOL, "at": NOW, "confidence": conf,
                                    "input": f"CLAP vs {len(L.SFX_EVENTS)} sound events (top: {ev} p={pev:.2f}) + {len(L.MATERIALS)} materials"}
                prov["describe.objects"] = {"by": "filename", "tool": TOOL, "at": NOW, "input": "filename words, plus the top CLAP event noun when p>=0.2"}
                prov["describe.description"] = {"by": "code", "tool": TOOL, "at": NOW, "input": "template from filename + CLAP event + measured duration"}
                if conf < 0.6:
                    flags.append("low-confidence")
            if subkind == "voice" or pid in VOICE_PACKS or pid in UI_PACKS:
                prov["subkind"] = {"by": "filename", "tool": TOOL, "at": NOW, "input": "pack name"}
            if a.get("vendor"):
                prov["audio.vendor"] = {"by": "vendor-metadata", "tool": TOOL, "at": NOW, "input": "ffprobe tags + RIFF adtl label"}
            if matched is not None:
                prov["audio.tempo_bpm"] = {"by": "vendor-metadata", "tool": TOOL, "at": NOW,
                                           "input": f"composer tempo {a['tempo_bpm']} matched measured candidate {matched}"}
            files = [{"path": x["file"], "sha256": "sha256:" + x["sha256"], "bytes": x["bytes"], "format": Path(x["file"]).suffix.lstrip(".").lower(),
                      "role": "primary" if x is d else "companion"} for x in g]
            card = {"schema": "ogm.asset-card/1.0", "vocab": VOCAB, "id": f"t1:{pid}/{path_id}@{ver}", "card_type": "asset", "status": "tagged",
                    "title": (v.get("title") or title_of(stem))[:120], "kind": "audio", "subkind": subkind, "collection": coll,
                    "source": {"files": files, "content_hash": "sha256:" + d["sha256"]},
                    "previews": {"waveform": d["preview"]["waveform"]}, "describe": describe, "audio": a, "provenance": prov}
            if len(g) > 1:
                card["audio"]["cuts"] = [{"path": x["file"], "role": "loop" if "loop" in x["file"].lower() else "alt-mix",
                                          "duration_s": x["measure"]["audio"]["duration_s"], "loudness_lufs": x["measure"]["audio"].get("loudness_lufs"),
                                          "peak_dbfs": x["measure"]["audio"]["peak_dbfs"]} for x in g[1:]]
            rel_ids = [o for o in same_name.get(stem_key(stem), []) if o["_pack"] != pid]
            if rel_ids:
                card["related"] = [{"rel": "same-set", "id": f"t1:{o['_pack']}/{kebab(Path(o['file']).with_suffix('').as_posix())}@{o['_ver']}"} for o in rel_ids][:10]
            if proposed:
                card["proposed_tags"] = proposed[:12]
            if flags:
                card["flags"] = flags
            for f in flags:
                flags_count[f] += 1
            out = packs / pid / "cards" / (path_id + ".card.json")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(card, indent=1) + "\n")
            counts[pid]["audio/" + subkind] += 1
            counts[pid]["audio"] += 1
            written += 1
        info = cc.setdefault("collection_info", {})
        info["counts"] = {**{k: v for k, v in info.get("counts", {}).items() if not k.startswith("audio")}, **dict(sorted(counts[pid].items()))}
        (packs / pid / "collection.card.json").write_text(json.dumps(cc, indent=1 if pid.startswith(("kenney-", "synty-")) else 2) + "\n")
    return written, dict(flags_count)


def validate(packs: Path):
    cards = sorted(str(p) for p in packs.glob("*/cards/**/*.card.json"))
    colls = sorted(str(p) for p in packs.glob("*/collection.card.json"))
    r = subprocess.run(["node", str(SCHEMAS / "tools/validate.mjs"), str(SCHEMAS), *colls, *cards], capture_output=True, text=True)
    fails = [l for l in r.stdout.splitlines() if l.startswith("FAIL")]
    return r.returncode, len(cards), fails, r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", type=Path, default=ROOT / "packs")
    ap.add_argument("--no-validate", action="store_true")
    a = ap.parse_args()
    rows = load(a.packs)
    sets = prompts()
    emb, scale = text_embeddings(sets)
    score_all(rows, emb, scale, sets)
    means = library_means(rows)
    percentiles(rows, "game_fit")
    n, flags = build(rows, sets, means, a.packs)
    print(json.dumps({"sidecars": len(rows), "music": sum(d["music"] for d in rows), "cards": n, "flags": flags}))
    if not a.no_validate:
        rc, nc, fails, out = validate(a.packs)
        print(json.dumps({"validated": nc, "fail_lines": len(fails), "rc": rc}))
        for l in fails[:30]:
            print(l)
        if rc and not fails:
            print(out[-3000:])


if __name__ == "__main__":
    main()
