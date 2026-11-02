"""Sound-effect library cards: each test is a promise an agent relies on when it searches 347 bundle files by word."""
import json
import re
import sys
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import build_audio_cards as b
import sfx_library as s
import sfx_listing

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
UCS_FILE = "344 Audio - Antique Clocks/CLOCKTick_Mantel Clock Slow_344 Audio_Antique Clocks.wav"


def _xlsx(path, rows):
    """A minimal Filelist.xlsx: inline strings in the first sheet, a URL column the reader must drop."""
    def cell(ref, v):
        return f'<c r="{ref}" t="inlineStr"><is><t>{v}</t></is></c>'
    body = "".join(f'<row r="{i}">' + "".join(cell(f"{c}{i}", v) for c, v in zip("ABCD", r)) + "</row>"
                   for i, r in enumerate(rows, 1))
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {NS}><sheetData>{body}</sheetData></worksheet>")
    return path


def test_filelist_gives_library_and_supplier_but_never_the_link(tmp_path):
    """The Filelist names the library a file belongs to; its shop URL must not leak into cards (no links in assets)."""
    x = _xlsx(tmp_path / "Filelist.xlsx", [("FILENAME", "LIBRARY NAME", "SUPPLIER", "URL"),
                                           (Path(UCS_FILE).name, "Antique Clocks", "344 Audio", "https://example.invalid/x")])
    rows = s.read_filelist(x)
    assert rows == {Path(UCS_FILE).name: {"library": "Antique Clocks", "supplier": "344 Audio"}}


def test_ucs_name_splits_into_category_effect_and_library():
    """`CatID_FXName_Creator_Source`: the effect's own words make the title, not the vendor's."""
    info = s.parse(UCS_FILE)
    assert info == {"vendor": "344 Audio", "library": "Antique Clocks", "ucs_category": "CLOCKTick",
                    "ucs_cat_id": "CLOCKTick", "fx_name": "Mantel Clock Slow"}


def test_category_the_schema_pattern_cannot_hold_still_sets_the_kind():
    """`UIAlert` fails the card schema's CatID pattern, so it is not written as ucs_cat_id, but it still makes a UI sound."""
    info = s.parse("Sonic Bat - UI/UIAlert_Soft Ping_Sonic Bat_UI.wav")
    assert info["ucs_cat_id"] is None
    assert s.classify(info, {"duration_s": 0.4}, {"active_share": 0.2})["subkind"] == "sfx/ui"


def test_plain_names_fall_back_to_their_words():
    info = s.parse("SoundBits - Interface/Interface Accept Glassy Snap.wav")
    assert info["ucs_category"] is None and info["fx_name"] == "Interface Accept Glassy Snap"
    assert s.classify(info, {"duration_s": 0.3}, {"active_share": 0.1})["subkind"] == "sfx/ui"


def test_impact_subcategory_beats_its_material_category():
    """METLImpt is a metal hit: an agent asking for impacts must find it, not only one asking for foley."""
    info = s.parse("V - Metal/METLImpt_Pipe Hit_V_Metal.wav")
    c = s.classify(info, {"duration_s": 1.0}, {"active_share": 0.1})
    assert c["subkind"] == "sfx/impact" and c["shape"] == "one-shot"


def test_short_crowd_cheer_is_not_an_ambience_bed():
    """CRWD is an ambience category, but a 4 s cheer that decays cannot sit under a scene as a bed."""
    info = s.parse("V - Crowds/CRWDCheer_Stadium Goal_V_Crowds.wav")
    assert s.classify(info, {"duration_s": 4.0}, {"active_share": 0.3})["subkind"] == "sfx/other"


def test_long_sustained_unnamed_sound_is_an_ambience_and_says_if_it_loops():
    """A 60 s rain bed with no category in its name is still an ambience; the seam test tells an agent it can loop it."""
    info = s.parse("V - Weather/Heavy Rain On Roof.wav")
    c = s.classify(info, {"duration_s": 60.0, "loopable": True}, {"active_share": 0.95})
    assert c["subkind"] == "ambience" and c["keywords"][:2] == ["ambience", "seamless"]
    assert {"weather"} <= set(c["keywords"])  # the library's words make the library findable


def test_card_takes_title_kind_catid_and_library_keywords(tmp_path):
    """End to end through build(): a Sonniss file's card says what it is in words `gm assets search` matches."""
    pid, ver = "sonniss-gdc2026-part9-1of5", "2026-11-02"
    (tmp_path / pid / ver / "extracted").mkdir(parents=True)
    rights = {"uses": ["in-game"], "audience": "private", "redistribution": "in-build", "processing": "local-only",
              "basis": [{"type": "license", "license": "LicenseRef-Sonniss-GDC"}]}
    (tmp_path / pid / "collection.card.json").write_text(json.dumps({"id": f"t1:{pid}@{ver}", "rights": rights}))
    sets = b.prompts()
    p = {k: np.full(len(sets[k][0]), 1 / len(sets[k][0])) for k in ("sfx_event", "sfx_material")}
    row = {"file": UCS_FILE, "sha256": "0" * 64, "bytes": 1, "music": False, "_p": p, "_pack": pid, "_ver": ver,
           "vendor": {"title": "A vendor title tag far longer than the card schema allows " * 4},
           "_sidecar": tmp_path / pid / ver / "analysis" / "x.analysis.json",
           "preview": {"waveform": "private/previews/00/0000000000000000-waveform.png"},
           "measure": {"audio": {"duration_s": 12.0, "sample_rate": 48000, "channels": 2, "peak_dbfs": -3.0, "loopable": True},
                       "sidecar": {"envelope": {"active_share": 0.9}}}}
    means = {(False, k): np.ones(len(v)) / len(v) for k, v in p.items()}
    assert b.build([row], sets, means, tmp_path, style_sets={pid: "sonniss-gdc2026-part9"})[0] == 1
    card = json.loads(next((tmp_path / pid / "cards").rglob("*.card.json")).read_text())
    assert card["title"] == "Mantel Clock Slow" and card["subkind"] == "sfx/foley"
    assert card["audio"]["ucs_cat_id"] == "CLOCKTick" and card["provenance"]["audio.ucs_cat_id"]["by"] == "filename"
    assert {"loop", "clock", "antique"} <= set(card["describe"]["keywords"])
    assert "Antique Clocks" in card["describe"]["description"] and card["rights"] == rights
    assert card["describe"]["set"] == "sonniss-gdc2026-part9"
    assert len(card["audio"]["vendor"]["title"]) == 120  # the schema caps vendor strings; one long BWF title failed a card


def _card(packs, pid, folder, title, dur, kw, subkind="sfx/foley"):
    d = packs / pid / "cards"
    d.mkdir(parents=True, exist_ok=True)
    card = {"id": f"t1:{pid}/{title.lower()}@1", "title": title, "subkind": subkind,
            "source": {"files": [{"path": f"{folder}/{title}.wav"}]}, "audio": {"duration_s": dur}, "describe": {"keywords": kw}}
    (d / f"{title.lower()}.card.json").write_text(json.dumps(card))


def test_listing_is_one_line_per_library_and_the_index_counts_kinds(tmp_path):
    """An agent skims one line per library, then picks a library from the set index by vendor, size and kinds."""
    packs, index = tmp_path / "packs", tmp_path / "index"
    for pid in ("sfx-1of2", "sfx-2of2"):
        (packs / pid).mkdir(parents=True)
        (packs / pid / "collection.card.json").write_text(json.dumps({"describe": {"set": "sfx"}}))
    _card(packs, "sfx-1of2", "344 Audio - Antique Clocks", "Tick", 2.5, ["one-shot", "clock"])
    _card(packs, "sfx-1of2", "344 Audio - Antique Clocks", "Chime", 70.0, ["loop", "clock"])
    _card(packs, "sfx-2of2", "Epic Stock Media - Rain", "Downpour", 65.0, ["ambience"], subkind="ambience")
    libs = sfx_listing.build(packs, index, "sfx")
    listing = (packs / "sfx-1of2" / "listing.txt").read_text().splitlines()
    assert listing[0] == "sfx-1of2: 1 libraries, 2 sounds"
    assert listing[1] == "344 Audio - Antique Clocks (2, 1:12): Chime 70.0 s foley loop; Tick 2.5 s foley one-shot"
    assert [(r["vendor"], r["library"], r["files"]) for r in libs] == [("344 Audio", "Antique Clocks", 2), ("Epic Stock Media", "Rain", 1)]
    assert libs[1]["kinds"] == {"ambience": 1}
    assert json.loads((index / "sets" / "sfx.json").read_text())["libraries"][0]["minutes"] == 1.2


def test_filelist_reads_shared_string_cells(tmp_path):
    """Excel usually stores text in sharedStrings.xml (t="s"); the reader must resolve those indexes, not return numbers."""
    strings = ["FILENAME", "LIBRARY NAME", "SUPPLIER", "a.wav", "Rain", "Epic Stock Media"]
    sst = "".join(f"<si><t>{v}</t></si>" for v in strings)
    rows = "".join(f'<row r="{r}">' + "".join(f'<c r="{c}{r}" t="s"><v>{i}</v></c>' for c, i in zip("ABC", idx)) + "</row>"
                   for r, idx in ((1, (0, 1, 2)), (2, (3, 4, 5))))
    x = tmp_path / "Filelist.xlsx"
    with zipfile.ZipFile(x, "w") as z:
        z.writestr("xl/sharedStrings.xml", f"<sst {NS}>{sst}</sst>")
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {NS}><sheetData>{rows}</sheetData></worksheet>")
    assert s.read_filelist(x) == {"a.wav": {"library": "Rain", "supplier": "Epic Stock Media"}}


def test_filelist_row_names_the_library_over_the_folder(tmp_path):
    """The Filelist is the vendor's own record ("Anime Fight Voices Vol. 2"); it wins over a shortened folder name."""
    vdir = tmp_path / "v"
    (vdir / "extracted").mkdir(parents=True)
    _xlsx(vdir / "extracted" / "Bundle Filelist.xlsx", [("FILENAME", "LIBRARY NAME", "SUPPLIER"),
                                                       ("VOXFem_Yell 2_344 Audio_AFV.wav", "Anime Fight Voices Vol. 2", "344 Audio")])
    h = s.hints_for(vdir, "344 - AFV/VOXFem_Yell 2_344 Audio_AFV.wav", {"duration_s": 1.0}, {"envelope": {"active_share": 0.3}})
    assert (h["vendor"], h["library"], h["subkind"]) == ("344 Audio", "Anime Fight Voices Vol. 2", "voice")


def test_long_sustained_sound_keeps_the_kind_its_name_gives():
    """A 45 s engine hum named as a vehicle is still a vehicle sound (and a loop), not an ambience bed."""
    c = s.classify(s.parse("V - Ships/Spaceship Engine Hum.wav"), {"duration_s": 45.0, "loopable": True}, {"active_share": 0.95})
    assert c["subkind"] == "sfx/vehicle" and c["shape"] == "loop"


def test_all_caps_plain_name_is_not_a_category_but_unknown_catid_still_splits():
    """AMBULANCE_Siren_Passby is a plain name (not ambience, title kept whole); DESTCrsh_ is a real CatID our table lacks."""
    plain = s.parse("V - Sirens/AMBULANCE_Siren_Passby_01.wav")
    assert plain["ucs_category"] is None and plain["fx_name"] == "AMBULANCE_Siren_Passby_01"
    dest = s.parse("V - Debris/DESTCrsh_Wall Collapse_V_Debris.wav")
    assert (dest["ucs_cat_id"], dest["fx_name"]) == ("DESTCrsh", "Wall Collapse")


def test_keywords_fit_the_card_schema():
    """describe.keywords: at most 12 tags matching ^[a-z][a-z0-9-]*$; a vendor named "Mike's" must not break the card."""
    info = {"vendor": "Mike's Sound Lab", "library": "Children's Toys Bells Whistles Rattles Drums Horns Spinners Tops Blocks",
            "ucs_category": "TOONMisc", "ucs_cat_id": "TOONMisc", "fx_name": "Squeak"}
    kw = s.classify(info, {"duration_s": 0.5, "loopable": True}, {"active_share": 0.1})["keywords"]
    assert len(kw) <= 12 and all(re.fullmatch(r"[a-z][a-z0-9-]*", k) for k in kw) and "mikes" in kw
