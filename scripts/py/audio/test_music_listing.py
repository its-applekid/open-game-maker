"""The listing is what an agent skims to pick a loop by tempo and mood without opening 334 cards."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import music_listing as m


def _pack(packs, pid, set_id, tracks):
    d = packs / pid
    (d / "cards").mkdir(parents=True)
    (d / "collection.card.json").write_text(json.dumps({"describe": {"set": set_id} if set_id else {}}))
    for title, bpm, dur in tracks:
        card = {"id": f"t1:{pid}/{title.lower()}@1", "title": title, "source": {"files": [{"path": f"{title}.ogg"}]},
                "audio": {"duration_s": dur, "tempo_bpm": bpm, "key": "A", "mode": "minor", "key_strength": 0.9, "meter": 4,
                          "energy": 0.4, "loopable": True},
                "describe": {"moods": ["calm"], "genre": ["ambient"]}}
        (d / "cards" / f"{title.lower()}.card.json").write_text(json.dumps(card))


def test_listing_per_pack_and_set_index_by_tempo(tmp_path):
    packs, index = tmp_path / "packs", tmp_path / "index"
    _pack(packs, "loops-a", "loops", [("Fast", 140.0, 65.0), ("Slow", 70.0, 30.0)])
    _pack(packs, "loops-b", "loops", [("Middle", 92.0, 125.0)])
    _pack(packs, "other", None, [("Elsewhere", 100.0, 10.0)])
    rows = m.build(packs, index, "loops")
    listing = (packs / "loops-a" / "listing.txt").read_text().splitlines()
    assert listing[0].startswith("loops-a: 2 tracks")
    assert "1:05" in listing[1] and "140 BPM" in listing[1] and "A minor" in listing[1] and "seamless" in listing[1]
    assert [r["title"] for r in rows] == ["Slow", "Middle", "Fast"]  # by tempo, the other set left out
    assert json.loads((index / "sets" / "loops.json").read_text())["tracks"][1]["duration_s"] == 125.0
    assert not (packs / "other" / "listing.txt").exists()
