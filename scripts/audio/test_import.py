"""Tests for import_sidetrax: why each matters is in the test name and docstring."""
import json, subprocess, sys, zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import import_sidetrax as imp

VALIDATOR = Path(__file__).parents[2] / "packages/contracts/bin/validate-cards.mjs"


def make_zip(path: Path, members: dict):
    with zipfile.ZipFile(path, "w") as z:
        for name, data in members.items():
            z.writestr(name, data)
    return path


def test_keeps_only_wav_and_strips_wrapper_and_format_folders(tmp_path):
    """Vendor zips ship WAV+MP3+AAC copies of each track; only the master format should land, at a flat path."""
    zp = make_zip(tmp_path / "pack60_battle.zip", {
        "60 Battle/WAV/Charge.wav": b"RIFF", "60 Battle/WAV/Destiny.wav": b"RIFF",
        "60 Battle/MP3/Charge.mp3": b"ID3", "60 Battle/AAC/Charge.m4a": b"x",
        "60 Battle/.DS_Store": b"", "__MACOSX/60 Battle/WAV/._Charge.wav": b""})
    packs = tmp_path / "packs"; packs.mkdir()
    row = imp.import_product("Pack 60: Battle", zp, packs)
    pdir = packs / "sidetrax-pack-60-battle"
    assert row["status"] == "ok" and row["tracks"] == 2 and row["format"] == "wav"
    assert sorted(p.name for p in (pdir / "v1/extracted").iterdir()) == ["Charge.wav", "Destiny.wav"]
    assert (pdir / "v1/originals/pack60_battle.zip").exists() and not zp.exists()
    assert json.loads((pdir / "pack.json").read_text())["versions"]["v1"]["extracted_files"] == 2


def test_mp3_only_product_is_imported_and_flagged(tmp_path):
    """A product without lossless files must still be usable, but marked so nobody mistakes MP3s for masters."""
    zp = make_zip(tmp_path / "x.zip", {"Loops/a.mp3": b"ID3", "Loops/b.mp3": b"ID3"})
    packs = tmp_path / "packs"; packs.mkdir()
    row = imp.import_product("Loop pack #11", zp, packs)
    card = json.loads((packs / "sidetrax-loop-pack-11/collection.card.json").read_text())
    assert row["lossless"] is False and card["flags"] == ["needs-review"]


def test_rerun_is_a_no_op(tmp_path):
    """The downloader and importer are re-run as files arrive; an imported pack must not be touched again."""
    zp = make_zip(tmp_path / "x.zip", {"A/WAV/a.wav": b"RIFF"})
    packs = tmp_path / "packs"; packs.mkdir()
    imp.import_product("Pack 1", zp, packs)
    assert imp.import_product("Pack 1", tmp_path / "missing.zip", packs)["status"] == "skip"


def test_corrupt_zip_leaves_no_pack(tmp_path):
    """A truncated download must be reported, not half-imported."""
    zp = tmp_path / "bad.zip"; zp.write_bytes(b"not a zip")
    packs = tmp_path / "packs"; packs.mkdir()
    assert imp.import_product("Pack 2", zp, packs)["status"] == "bad-zip"
    assert list(packs.iterdir()) == [] and zp.exists()


def test_zip_without_audio_is_reported(tmp_path):
    """Some listings are readmes or link stubs; they are reported and the run goes on."""
    zp = make_zip(tmp_path / "s.zip", {"readme.txt": b"hi"})
    packs = tmp_path / "packs"; packs.mkdir()
    assert imp.import_product("Pack 38 - Echoes", zp, packs)["status"] == "no-audio"


def test_unsafe_member_path_is_refused(tmp_path):
    """Vendor archives are untrusted: a ../ path must never be written outside the pack."""
    zp = make_zip(tmp_path / "e.zip", {"../evil.wav": b"RIFF"})
    packs = tmp_path / "packs"; packs.mkdir()
    with pytest.raises(ValueError):
        imp.import_product("Evil", zp, packs)
    assert not (tmp_path / "evil.wav").exists()


def test_stem_key_groups_cut_names():
    """Variant grouping (U3) starts from names: '_30s', 'Loop', 'Sting' cuts must share the main track's key."""
    assert imp.stem_key("Charge_30s") == imp.stem_key("Charge") == imp.stem_key("Charge Loop") == imp.stem_key("charge - sting")
    assert imp.stem_key("Charge") != imp.stem_key("Charged")


@pytest.mark.skipif(not (VALIDATOR.parents[1] / "dist/bin/validate-cards.js").exists(), reason="build @ogm/contracts first")
def test_draft_collection_card_validates(tmp_path):
    """The draft card must pass C3 rights=basis: default rights until Kevin confirms the license."""
    f = tmp_path / "card.json"
    f.write_text(json.dumps(imp.draft_card("sidetrax-pack-60-battle", "Pack 60: Battle", 10, True)))
    r = subprocess.run(["node", str(VALIDATOR), str(f)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-2000:]
