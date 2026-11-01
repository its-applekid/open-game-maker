"""Tests for build_collection_cards.py and install_itch_pack.py over a temp library (one pack per vendor class).

Needs the contracts validator built: pnpm --filter @ogm/contracts build.
Run: python3 -I scripts/assets/test_build_collection_cards.py
"""
import json
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "py" / "audio"))
import build_collection_cards as bcc  # noqa: E402
import import_sidetrax  # noqa: E402
import install_itch_pack  # noqa: E402

KENNEY = "kenney-1-bit-pack"  # ids with rows in data/collection_tags.jsonl
SYNTY = "synty-animation-goblin-locomotion"


def add_pack(root: Path, pid: str, vendor: str, license: str, files: dict, ver: str = "1.0") -> Path:
    d = root / "packs" / pid
    for name, data in files.items():
        f = d / ver / "extracted" / name
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
    m = {"id": pid, "vendor": vendor, "title": pid.split("-", 1)[1].replace("-", " ").title(), "license": license,
         "requires": [], "current": ver, "versions": {ver: {"extracted_files": len(files), "added": "2026-10-30"}}}
    (d / "pack.json").write_text(json.dumps(m))
    return d


def card_of(root: Path, pid: str) -> dict:
    return json.loads((root / "packs" / pid / "collection.card.json").read_text())


def validator_ok(*files: Path) -> bool:
    r = subprocess.run(["node", str(bcc.VALIDATOR), "--no-fixtures", *map(str, files)], capture_output=True, text=True)
    return r.returncode == 0 and "all checks passed" in r.stdout


class Library(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        add_pack(self.root, KENNEY, "kenney", "CC0-1.0", {"Tiles/a.png": b"p", "License.txt": b"cc0"})
        add_pack(self.root, SYNTY, "synty", "synty-personal", {"Anim/run.fbx": b"f"}, ver="v1")
        add_pack(self.root, "limezu-test-pack", "limezu", "LimeZu-commercial", {"a.png": b"p"}, ver="2026-10-30")
        side = add_pack(self.root, "sidetrax-pack-60-battle", "sidetrax", "sidetrax-royalty-free", {"Charge.wav": b"RIFF"}, ver="v1")
        (side / "collection.card.json").write_text(json.dumps(import_sidetrax.draft_card("sidetrax-pack-60-battle", "Pack 60: Battle", 1, True)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_vendor_gets_a_valid_card_with_the_processing_default(self):
        """Packs the old script skipped (LimeZu) were invisible to search; vendor-licensed bytes must stay local."""
        rep = bcc.run(self.root)
        self.assertEqual(rep["failures"], {})
        pids = [KENNEY, SYNTY, "limezu-test-pack", "sidetrax-pack-60-battle"]
        self.assertTrue(validator_ok(*(self.root / "packs" / p / "collection.card.json" for p in pids)))
        processing = {p: card_of(self.root, p)["rights"]["processing"] for p in pids}
        self.assertEqual(processing, {KENNEY: "any", SYNTY: "local-only", "limezu-test-pack": "local-only",
                                      "sidetrax-pack-60-battle": "local-only"})
        self.assertEqual(card_of(self.root, SYNTY)["license"], "LicenseRef-synty-personal")
        self.assertEqual(card_of(self.root, KENNEY)["status"], "tagged")
        self.assertEqual(card_of(self.root, KENNEY)["describe"]["set"], "kenney-1-bit")
        set_provenance = card_of(self.root, KENNEY)["provenance"]["describe.set"]
        self.assertEqual(set_provenance["by"], "code")
        self.assertEqual(set_provenance["input"], "packages/asset-cards/data/style-families.json")

    def test_untagged_pack_is_a_draft_seeded_from_its_title(self):
        """No describe tags are invented for packs the tags file does not cover."""
        bcc.run(self.root)
        c = card_of(self.root, "limezu-test-pack")
        self.assertEqual(c["status"], "draft")
        self.assertEqual(c["describe"], {"description": "Test Pack (Limezu)"})
        self.assertEqual(c["provenance"]["describe"]["by"], "filename")
        self.assertEqual(c["rights"]["attribution"], "LimeZu")

    def test_sidetrax_gets_the_confirmed_licence_and_keeps_kevins_interpretation(self):
        """Kevin confirmed the Sidetrax licence: in-game opens, vision-input stays through his interpretation."""
        bcc.run(self.root)
        c = card_of(self.root, "sidetrax-pack-60-battle")
        self.assertEqual(sorted(c["rights"]["uses"]), ["in-game", "vision-input"])
        self.assertEqual(c["rights"]["redistribution"], "in-build")
        interp = [b for b in c["rights"]["basis"] if b["type"] == "interpretation"]
        self.assertEqual(interp[0]["note"], import_sidetrax.INTERPRETATION_NOTE)
        self.assertEqual(c["status"], "draft")

    def test_sidetrax_with_description_objects_and_roles_is_tagged(self):
        """The C3 rule: tagged only once the descriptive core exists."""
        cc = self.root / "packs" / "sidetrax-pack-60-battle" / "collection.card.json"
        old = json.loads(cc.read_text())
        old["describe"].update(description="Battle music", objects=["drum"], roles=["music-bed"])
        cc.write_text(json.dumps(old))
        bcc.run(self.root)
        self.assertEqual(card_of(self.root, "sidetrax-pack-60-battle")["status"], "tagged")

    def test_second_run_is_byte_identical(self):
        """Re-running the migration must not churn timestamps on cards whose content did not change."""
        bcc.run(self.root)
        files = sorted((self.root / "packs").glob("*/collection.card.json"))
        before = {f: (f.read_bytes(), f.stat().st_mtime_ns) for f in files}
        time.sleep(1.1)  # NOW has one-second resolution; a rebuilt card would differ
        import importlib
        importlib.reload(bcc)
        rep = bcc.run(self.root)
        self.assertEqual(sum(v["written"] for v in rep["vendors"].values()), 0)
        self.assertEqual({f: (f.read_bytes(), f.stat().st_mtime_ns) for f in files}, before)

    def test_locked_describe_field_survives(self):
        """A field Kevin locked is never overwritten by the tags file."""
        bcc.run(self.root)
        cc = self.root / "packs" / KENNEY / "collection.card.json"
        c = json.loads(cc.read_text())
        c["describe"]["pov_fit"] = ["iso"]
        c["provenance"]["describe.pov_fit"] = {"by": "human", "at": "2026-10-31T00:00:00-07:00", "locked": True}
        cc.write_text(json.dumps(c))
        bcc.run(self.root)
        after = card_of(self.root, KENNEY)
        self.assertEqual(after["describe"]["pov_fit"], ["iso"])
        self.assertTrue(after["provenance"]["describe.pov_fit"]["locked"])

    def test_locked_describe_drives_status(self):
        """Status is derived from what is written, so a locked full describe on an untagged pack makes it tagged."""
        bcc.run(self.root)
        cc = self.root / "packs" / "limezu-test-pack" / "collection.card.json"
        c = json.loads(cc.read_text())
        c["describe"] = {"description": "Modern rooms", "objects": ["sofa"], "roles": ["furniture"]}
        c["provenance"]["describe"] = {"by": "human", "at": "2026-10-31T00:00:00-07:00", "locked": True}
        cc.write_text(json.dumps(c))
        bcc.run(self.root)
        self.assertEqual(card_of(self.root, "limezu-test-pack")["status"], "tagged")

    def test_interpretation_is_dropped_when_the_licence_changes(self):
        """Kevin's reading of one licence must not widen a different licence's rights."""
        cc = self.root / "packs" / "sidetrax-pack-60-battle" / "collection.card.json"
        old = json.loads(cc.read_text())
        old["license"] = "LicenseRef-itch-custom"
        old["rights"]["basis"][2]["uses"] = ["vision-input", "derive-layout"]
        cc.write_text(json.dumps(old))
        bcc.run(self.root)
        c = card_of(self.root, "sidetrax-pack-60-battle")
        self.assertEqual([b["type"] for b in c["rights"]["basis"]], ["license"])
        self.assertNotIn("derive-layout", c["rights"]["uses"])

    def test_admin_decision_survives_and_narrows(self):
        """A decision Kevin recorded on a card is kept across rebuilds and still narrows the rights."""
        bcc.run(self.root)
        cc = self.root / "packs" / KENNEY / "collection.card.json"
        c = json.loads(cc.read_text())
        c["rights"]["basis"].append({"type": "decision", "uses": ["in-game"], "audience": "private", "redistribution": "none",
                                     "set_by": {"role": "admin", "name": "kevin"}, "date": "2026-10-31"})
        cc.write_text(json.dumps(c))
        self.assertEqual(bcc.run(self.root)["failures"], {})
        r = card_of(self.root, KENNEY)["rights"]
        self.assertEqual((r["uses"], r["audience"], r["redistribution"]), (["in-game"], "private", "none"))

    def test_audio_counts_from_the_audio_tagger_survive(self):
        """build_audio_cards.py owns the audio counts; rebuilding the collection card must not reset them."""
        bcc.run(self.root)
        cc = self.root / "packs" / KENNEY / "collection.card.json"
        c = json.loads(cc.read_text())
        c["collection_info"]["counts"].update({"audio": 3, "audio/music/stinger": 3})
        cc.write_text(json.dumps(c))
        bcc.run(self.root)
        counts = card_of(self.root, KENNEY)["collection_info"]["counts"]
        self.assertEqual((counts["audio"], counts["audio/music/stinger"], counts["sprite"]), (3, 3, 1))

    def test_unknown_licence_fails_loudly_and_writes_nothing(self):
        """An unmapped licence must not silently get someone else's ceiling."""
        add_pack(self.root, "acme-mystery", "acme", "made-up", {"a.png": b"p"})
        self.assertEqual(bcc.main(["--root", str(self.root)]), 1)
        self.assertIn("acme-mystery", bcc.run(self.root)["failures"])
        self.assertFalse((self.root / "packs" / "acme-mystery" / "collection.card.json").exists())

    def test_dry_run_writes_nothing(self):
        bcc.run(self.root, dry_run=True)
        self.assertFalse((self.root / "packs" / KENNEY / "collection.card.json").exists())


class ItchInstaller(unittest.TestCase):
    def test_installer_writes_rights_the_schema_accepts(self):
        """The old installer wrote redistribution 'not-allowed' and a string basis, which the schema rejects."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            src = tmp / "dl"
            src.mkdir()
            (src / "sources.json").write_text(json.dumps({"page": "https://example.itch.io/ufo"}))
            with zipfile.ZipFile(src / "ufo.zip", "w") as z:
                z.writestr("ufo/ship.png", b"p")
            root = tmp / "lib"
            install_itch_pack.main([str(src), "acme-ufo", "UFO pack", "Store page: commercial use ok.", "--extract", "ufo",
                                    "--root", str(root)])
            pj = json.loads((root / "packs" / "acme-ufo" / "pack.json").read_text())
            self.assertEqual(pj["license"], "LicenseRef-itch-custom")
            rights = pj["usage_rights"]
            self.assertEqual(rights["redistribution"], "none")  # unconfirmed row: strict default until Kevin confirms
            self.assertEqual(rights["basis"][0]["type"], "license")
            rep = bcc.run(root)
            self.assertEqual(rep["failures"], {})
            self.assertEqual(card_of(root, "acme-ufo")["rights"], rights)


if __name__ == "__main__":
    unittest.main()
