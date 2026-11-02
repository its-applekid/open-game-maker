"""Contact listings for music cards: one line per track in each pack, and one index per style set (C3 §9 preprocess).

usage: python3 -I music_listing.py --set SET [--packs DIR] [--index DIR]
writes packs/<id>/listing.txt (title, duration, tempo, key, meter, energy, seam, moods, genre) for every pack in the set,
and index/sets/<set>.json + .txt with the same rows across the set, sorted by tempo, for agents choosing music by mood
and tempo words. Reads the cards build_audio_cards.py wrote; standard library only."""
import argparse, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2] / "assets-local"


def row(card, pid):
    a, d = card.get("audio", {}), card.get("describe", {})
    return {"id": card["id"], "pack": pid, "title": card["title"], "path": card["source"]["files"][0]["path"],
            "duration_s": a.get("duration_s"), "tempo_bpm": a.get("tempo_bpm"),
            "key": f"{a['key']} {a['mode']}" if a.get("key") and a.get("key_strength", 0) >= 0.5 else None,
            "meter": a.get("meter"), "energy": a.get("energy"), "loopable": a.get("loopable"),
            "moods": d.get("moods", []), "genre": d.get("genre", []), "instruments": d.get("instruments", []),
            "game_fit": list(d.get("game_fit", {})), "keywords": d.get("keywords", []),
            "variants": [r["id"] for r in card.get("related", [])]}


def line(r):
    dur = r["duration_s"] or 0
    bpm = f"{r['tempo_bpm']:.0f} BPM" if r["tempo_bpm"] else "- BPM"
    meter = f"{r['meter']}/4" if r["meter"] else "-"
    energy = f"e{r['energy']:.2f}" if r["energy"] is not None else "e-"
    seam = "seamless" if r["loopable"] else "seam?" if r["loopable"] is False else "-"
    return (f"{r['title'][:44]:<44} {int(dur // 60)}:{int(dur % 60):02d}  {bpm:>7}  {r['key'] or '-':<9} {meter:<4} {energy}  "
            f"{seam:<8}  {', '.join(r['moods'])}; {', '.join(r['genre'])}")


def packs_in_set(packs: Path, set_id: str):
    out = []
    for cc in sorted(packs.glob("*/collection.card.json")):
        if json.loads(cc.read_text()).get("describe", {}).get("set") == set_id:
            out.append(cc.parent.name)
    return out


def build(packs: Path, index: Path, set_id: str):
    rows = []
    for pid in packs_in_set(packs, set_id):
        mine = [row(json.loads(f.read_text()), pid) for f in sorted((packs / pid / "cards").rglob("*.card.json"))]
        mine.sort(key=lambda r: r["title"].lower())
        head = f"{pid}: {len(mine)} tracks, {sum(r['duration_s'] or 0 for r in mine) / 60:.0f} min"
        (packs / pid / "listing.txt").write_text("\n".join([head, *map(line, mine)]) + "\n")
        rows += mine
    rows.sort(key=lambda r: (r["tempo_bpm"] or 0, r["title"].lower()))
    out = index / "sets"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{set_id}.json").write_text(json.dumps({"set": set_id, "tracks": rows}, indent=1) + "\n")
    (out / f"{set_id}.txt").write_text("\n".join([f"{set_id}: {len(rows)} tracks by tempo",
                                                  *(f"{r['pack'].removeprefix(set_id + '-'):<11} {line(r)}" for r in rows)]) + "\n")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", required=True)
    ap.add_argument("--packs", type=Path, default=ROOT / "packs")
    ap.add_argument("--index", type=Path, default=ROOT / "index")
    a = ap.parse_args(argv)
    rows = build(a.packs, a.index, a.set)
    print(json.dumps({"set": a.set, "tracks": len(rows), "packs": len({r["pack"] for r in rows})}))


if __name__ == "__main__":
    main()
