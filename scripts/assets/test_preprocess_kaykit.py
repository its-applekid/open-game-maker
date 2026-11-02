"""Focused tests for the KayKit v7 card, preview, and QA preprocessor."""
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime as RealDatetime
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import preprocess_kaykit as kaykit  # noqa: E402


class KayKitPreprocessor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.pack = self.root / "packs" / "kaykit-test-pack"
        extracted = self.pack / "1.0" / "extracted"
        (extracted / "Models" / "gltf" / "Textures").mkdir(parents=True)
        (extracted / "Models" / "fbx").mkdir(parents=True)
        (extracted / "Models" / "obj").mkdir(parents=True)
        gltf = {
            "asset": {"version": "2.0"},
            "buffers": [{"uri": "Barrel.bin", "byteLength": 4}],
            "images": [{"uri": "Textures/Barrel.png"}],
        }
        (extracted / "Models" / "gltf" / "Barrel.gltf").write_text(json.dumps(gltf))
        (extracted / "Models" / "gltf" / "Barrel.bin").write_bytes(b"data")
        (extracted / "Models" / "gltf" / "Textures" / "Barrel.png").write_bytes(b"png")
        (extracted / "Models" / "fbx" / "Barrel.fbx").write_bytes(b"fbx")
        (extracted / "Models" / "obj" / "Barrel.obj").write_bytes(b"obj")
        (extracted / "Models" / "obj" / "Barrel.mtl").write_bytes(b"mtl")
        manifest = {
            "id": "kaykit-test-pack",
            "vendor": "kaykit",
            "title": "KayKit Test Pack",
            "license": "kaykit",
            "requires": [],
            "current": "1.0",
            "versions": {"1.0": {"extracted_files": 6}},
        }
        (self.pack / "pack.json").write_text(json.dumps(manifest))

    def tearDown(self):
        self.tmp.cleanup()

    def add_glb(self, relative: str) -> Path:
        path = self.pack / "1.0" / "extracted" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"fixture glb")
        return path

    def add_empty_pack(self, pack_id: str) -> None:
        empty_pack = self.root / "packs" / pack_id
        (empty_pack / "1.0" / "extracted").mkdir(parents=True)
        (empty_pack / "pack.json").write_text(json.dumps({
            "id": pack_id, "vendor": "kaykit", "title": "KayKit Empty Pack", "license": "kaykit",
            "requires": [], "current": "1.0", "versions": {"1.0": {"extracted_files": 0}},
        }))

    def test_prefers_gltf_as_canonical_and_attaches_glb_dependencies_and_companions(self):
        self.add_glb("Models/glb/Barrel.glb")
        [model] = kaykit.discover_models(self.root)
        self.assertEqual(model.key, "barrel")
        self.assertEqual(model.primary.as_posix(), "Models/gltf/Barrel.gltf")
        self.assertEqual(
            [(file.path.as_posix(), file.role) for file in model.files],
            [
                ("Models/fbx/Barrel.fbx", "companion"),
                ("Models/glb/Barrel.glb", "companion"),
                ("Models/gltf/Barrel.bin", "metadata"),
                ("Models/gltf/Barrel.gltf", "primary"),
                ("Models/gltf/Textures/Barrel.png", "texture"),
                ("Models/obj/Barrel.mtl", "companion"),
                ("Models/obj/Barrel.obj", "companion"),
            ],
        )

    def test_glb_only_character_prop_and_clip_library_emit_their_contract_cards(self):
        self.add_glb("Models/glb/Skeleton_Warrior.glb")
        self.add_glb("Models/glb/Orc_Axe.gltf.glb")
        self.add_glb("Models/glb/Rig_Medium_General.glb")
        models = {model.key: model for model in kaykit.discover_models(self.root)}
        self.assertEqual(models["orc_axe"].primary.as_posix(), "Models/glb/Orc_Axe.gltf.glb")

        rig = {"rig_type": "humanoid", "rig_id": "rig:0123456789ab", "joint_count": 23, "bones": []}
        geometry = {"triangles": 10, "vertices": 20, "bounds": {"min": [0, 0, 0], "max": [1, 2, 1]},
                    "pivot": "base-center", "materials": [], "textureNames": []}
        character = kaykit.build_card(
            models["skeleton_warrior"], {**geometry, "rig": rig, "clips": []}, "2026-11-01T00:00:00+00:00"
        )
        prop = kaykit.build_card(
            models["orc_axe"], {**geometry, "rig": None, "clips": []}, "2026-11-01T00:00:00+00:00"
        )
        library = kaykit.build_card(
            models["rig_medium_general"],
            {**geometry, "rig": rig, "clips": [{"name": "Idle_A", "duration": 1.5},
                                                  {"name": "Melee_1H_Attack", "duration": 0.4}]},
            "2026-11-01T00:00:00+00:00",
        )

        self.assertEqual((character["kind"], character["subkind"]), ("model", "character"))
        self.assertEqual(character["rig"]["rig_id"], rig["rig_id"])
        self.assertEqual((prop["kind"], prop["subkind"]), ("model", "weapon"))
        self.assertEqual((library["kind"], library["subkind"]), ("anim", "humanoid"))
        self.assertEqual(library["anim"]["target_rig_id"], rig["rig_id"])
        self.assertEqual(library["anim"]["clips"], [
            {"name": "Idle_A", "duration_s": 1.5, "canonical": "idle", "loop": True},
            {"name": "Melee_1H_Attack", "duration_s": 0.4, "canonical": "attack-melee", "loop": False},
        ])
        kaykit.validate([character, prop, library])

    def test_skeleton_missing_library_joints_retargets_to_that_library_rig(self):
        # The medium mannequin ships without the hand-slot joints: its own rig id matches no library,
        # but every joint it has sits under the same parent in the shared rig, so those clips still play.
        for name in ("Mannequin_Medium", "Knight", "Odd_Golem", "Rig_Medium_General"):
            self.add_glb(f"Models/glb/{name}.glb")
        models = {model.key: model for model in kaykit.discover_models(self.root)}
        body = [{"name": "root", "parent": None}, {"name": "hips", "parent": "root"},
                {"name": "hand.r", "parent": "hips"}]
        shared = {"rig_type": "humanoid", "rig_id": "rig:89200673d97d", "joint_count": 4,
                  "bones": [*body, {"name": "handslot.r", "parent": "hand.r"}]}
        subset = {"rig_type": "humanoid", "rig_id": "rig:a83c5e75e523", "joint_count": 3, "bones": body}
        foreign = {"rig_type": "humanoid", "rig_id": "rig:0123456789ab", "joint_count": 3,
                   "bones": [*body[:2], {"name": "hand.r", "parent": "root"}]}
        geometry = {"triangles": 10, "vertices": 20, "bounds": {"min": [0, 0, 0], "max": [1, 2, 1]},
                    "pivot": "base-center", "materials": [], "textureNames": []}
        analyses = {"mannequin_medium": {**geometry, "rig": subset, "clips": []},
                    "knight": {**geometry, "rig": shared, "clips": []},
                    "odd_golem": {**geometry, "rig": foreign, "clips": []},
                    "rig_medium_general": {**geometry, "rig": shared, "clips": [{"name": "Idle_A", "duration": 1}]}}
        results = {models[key].uid: {"ok": True, "analysis": analysis} for key, analysis in analyses.items()}

        retargets = kaykit.retarget_rigs(list(models.values()), results)

        self.assertEqual(retargets, {models["mannequin_medium"].uid: "rig:89200673d97d"})
        mannequin = kaykit.build_card(models["mannequin_medium"], analyses["mannequin_medium"],
                                      "2026-11-01T00:00:00+00:00", retarget_rig_id=retargets[models["mannequin_medium"].uid])
        self.assertEqual(mannequin["rig"]["rig_id"], "rig:a83c5e75e523")
        self.assertEqual(mannequin["rig"]["retarget_rig_id"], "rig:89200673d97d")
        kaykit.validate([mannequin])

    def test_rejects_two_gltfs_that_collapse_to_the_same_canonical_key(self):
        extracted = self.pack / "1.0" / "extracted"
        duplicate = extracted / "Models" / "glTF format" / "Barrel.gltf"
        duplicate.parent.mkdir(parents=True)
        duplicate.write_text((extracted / "Models" / "gltf" / "Barrel.gltf").read_text())
        with self.assertRaisesRegex(ValueError, "canonical model key.*Barrel.gltf"):
            kaykit.discover_models(self.root)

    def test_records_invalid_gltf_metadata_and_keeps_discovering(self):
        extracted = self.pack / "1.0" / "extracted"
        bad = extracted / "Models" / "gltf" / "Bad.gltf"
        bad.write_text("{not json")
        models = kaykit.discover_models(self.root)
        self.assertEqual([model.key for model in models], ["bad", "barrel"])
        self.assertIn("invalid glTF metadata", models[0].error)
        document = kaykit.renderer_document(self.root, {"kaykit-test-pack": models})
        self.assertEqual([job["id"] for job in document["jobs"]], ["kaykit-test-pack/barrel"])

    def test_records_missing_gltf_resources_instead_of_aborting(self):
        extracted = self.pack / "1.0" / "extracted"
        missing = extracted / "Models" / "gltf" / "Missing.gltf"
        missing.write_text(json.dumps({"asset": {"version": "2.0"}, "buffers": [{"uri": "absent.bin"}]}))
        models = kaykit.discover_models(self.root)
        failed = next(model for model in models if model.key == "missing")
        self.assertIn("glTF resource is missing: absent.bin", failed.error)

    def test_builds_measured_model_card_with_rig_clips_and_mobile_budget_flag(self):
        [model] = kaykit.discover_models(self.root)
        analysis = {
            "triangles": 300001,
            "vertices": 123,
            "bounds": {"min": [-1, 0, -1], "max": [1, 2, 1]},
            "pivot": "base-center",
            "materials": ["KayKit Material"],
            "textureNames": ["Barrel.png"],
            "rig": {"rig_type": "humanoid", "rig_id": "rig:0123456789ab", "joint_count": 22, "bones": []},
            "clips": [{"name": "Attack", "duration": 0.5}, {"name": "Running", "duration": 1.25},
                      {"name": "Idle", "duration": 2}],
        }
        card = kaykit.build_card(model, analysis, "2026-11-01T00:00:00+00:00")
        self.assertEqual(card["kind"], "model")
        self.assertEqual(card["subkind"], "character")
        self.assertEqual(card["flags"], ["oversized-for-mobile"])
        self.assertEqual(card["rig"]["rig_id"], "rig:0123456789ab")
        self.assertEqual(card["rig"]["clips"][0]["canonical"], "attack-melee")
        self.assertFalse(card["rig"]["clips"][0]["loop"])
        self.assertEqual(card["rig"]["clips"][1]["canonical"], "idle")
        self.assertEqual(card["rig"]["clips"][2]["canonical"], "run")
        self.assertEqual(card["source"]["files"][0]["role"], "companion")
        self.assertEqual(card["geometry"]["texture_keys"], ["Models/gltf/Textures/Barrel.png"])
        kaykit.validate([card])
        later = kaykit.build_card(model, analysis, "2026-11-02T00:00:00+00:00")
        self.assertEqual(kaykit.preserve_unchanged(card, later), card)

    def test_preserves_locked_human_fields_when_measurements_change(self):
        [model] = kaykit.discover_models(self.root)
        analysis = {"triangles": 1, "vertices": 3, "bounds": {"min": [0, 0, 0], "max": [1, 1, 0]},
                    "pivot": "base-corner", "materials": [], "rig": None, "clips": []}
        old = kaykit.build_card(model, analysis, "2026-11-01T00:00:00+00:00")
        old["describe"]["description"] = "Kevin's barrel"
        old["provenance"]["describe.description"] = {"by": "human", "locked": True, "at": "2026-11-01"}
        analysis["triangles"] = 2
        new = kaykit.build_card(model, analysis, "2026-11-02T00:00:00+00:00")
        merged = kaykit.preserve_unchanged(old, new)
        self.assertEqual(merged["describe"]["description"], "Kevin's barrel")
        self.assertEqual(merged["geometry"]["triangles"], 2)

    def test_reuses_source_hashes_within_one_generation_run(self):
        [model] = kaykit.discover_models(self.root)
        cache = {}
        calls = []
        original = kaykit.sha256
        kaykit.sha256 = lambda path: calls.append(path) or original(path)
        try:
            kaykit.source_entry(model, model.files[0], cache)
            kaykit.source_entry(model, model.files[0], cache)
        finally:
            kaykit.sha256 = original
        self.assertEqual(len(calls), 1)

    def test_qa_report_is_stable_and_calls_out_failures_pivots_and_scale_outliers(self):
        [model] = kaykit.discover_models(self.root)
        analyses = {
            model.uid: {"ok": True, "analysis": {"pivot": "other", "bounds": {"min": [0, 0, 0], "max": [120, 1, 1]}}},
            "kaykit-test-pack/missing": {"ok": False, "error": "bad glTF"},
        }
        report = kaykit.qa_markdown(analyses, {"kaykit-test-pack": [model]}, generated="2026-11-01")
        self.assertIn("1 load failures", report)
        self.assertIn("`kaykit-test-pack/missing`: bad glTF", report)
        self.assertIn("`kaykit-test-pack/barrel`: pivot `other`", report)
        self.assertIn("`kaykit-test-pack/barrel`: largest bound 120", report)

    def test_qa_report_flags_pack_relative_scale_outliers(self):
        [model] = kaykit.discover_models(self.root)
        models = [
            kaykit.Model(model.pack_id, model.version, model.title, model.extracted, model.primary, key, model.files)
            for key in ("normal-a", "normal-b", "small")
        ]
        analyses = {
            item.uid: {"ok": True, "output": "thumb.png", "analysis": {
                "pivot": "base-center", "bounds": {"min": [0, 0, 0], "max": [0.02 if item.key == "small" else 1, 1, 1]}}}
            for item in models
        }
        analyses[models[-1].uid]["analysis"]["bounds"]["max"] = [0.02, 0.02, 0.02]
        report = kaykit.qa_markdown(analyses, {model.pack_id: models}, generated="2026-11-01")
        self.assertIn("`kaykit-test-pack/small`: largest bound 0.02 (pack median 1)", report)

    def test_main_records_the_generation_timestamp_in_the_qa_report(self):
        [model] = kaykit.discover_models(self.root)
        self.add_empty_pack("kaykit-character-animations")
        generated = RealDatetime(2026, 11, 1, 12, 34, 56).astimezone()

        class FixedDatetime(RealDatetime):
            @classmethod
            def now(cls, tz=None):
                return generated

        analysis = {"triangles": 1, "vertices": 3, "bounds": {"min": [0, 0, 0], "max": [1, 1, 1]},
                    "pivot": "base-center", "materials": [], "rig": None, "clips": []}
        qa = self.root / "qa.md"
        argv = ["preprocess_kaykit.py", "--root", str(self.root), "--qa", str(qa), "--expected-packs", "2"]
        with mock.patch.object(sys, "argv", argv), \
             mock.patch.object(kaykit, "datetime", FixedDatetime), \
             mock.patch.object(kaykit.subprocess, "run"), \
             mock.patch.object(kaykit, "run_renderer", return_value=({model.uid: {"ok": True, "analysis": analysis}}, [])), \
             mock.patch.object(kaykit, "write_cards", return_value=1):
            self.assertEqual(kaykit.main(), 0)
        self.assertIn(f"Generated: {generated.isoformat(timespec='seconds')}", qa.read_text())

    def test_main_rejects_an_unexpected_pack_without_models(self):
        self.add_empty_pack("kaykit-empty-pack")
        argv = ["preprocess_kaykit.py", "--root", str(self.root), "--expected-packs", "2"]
        with mock.patch.object(sys, "argv", argv), \
             mock.patch.object(kaykit.argparse.ArgumentParser, "error", side_effect=RuntimeError) as error:
            with self.assertRaises(RuntimeError):
                kaykit.main()
        error.assert_called_once_with("KayKit packs contain no glTF or GLB assets: kaykit-empty-pack")

    def test_catalog_rebuild_honors_the_selected_asset_root(self):
        completed = subprocess.run(
            [sys.executable, "-I", str(kaykit.CATALOG_BUILDER), "--root", str(self.root)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        catalog = json.loads((self.root / "catalog.json").read_text())
        self.assertEqual([pack["id"] for pack in catalog["packs"]], ["kaykit-test-pack"])

    def test_catalog_rebuild_rejects_a_missing_asset_root(self):
        missing = self.root / "typo"
        completed = subprocess.run(
            [sys.executable, "-I", str(kaykit.CATALOG_BUILDER), "--root", str(missing)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("must contain an existing packs directory", completed.stderr)
        self.assertFalse(missing.exists())

    def test_package_index_builder_writes_generated_kaykit_card(self):
        collection = subprocess.run(
            [sys.executable, "-I", str(kaykit.COLLECTION_BUILDER), "--root", str(self.root), "--only", "kaykit-*"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(collection.returncode, 0, collection.stderr)
        [model] = kaykit.discover_models(self.root)
        analysis = {"triangles": 1, "vertices": 3, "bounds": {"min": [0, 0, 0], "max": [1, 1, 0]},
                    "pivot": "base-corner", "materials": [], "rig": None, "clips": []}
        card = kaykit.build_card(model, analysis, "2026-11-01T00:00:00+00:00")
        output = self.pack / "cards" / "barrel.card.json"
        output.parent.mkdir()
        output.write_text(json.dumps(card))
        completed = subprocess.run(
            ["pnpm", "--filter", "@ogm/asset-cards", "index:build", "--", str(self.root)],
            cwd=kaykit.REPO,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, f"{completed.stdout}\n{completed.stderr}")
        index = json.loads((self.root / "index" / "cards.index.json").read_text())
        self.assertIn(card["id"], [row["id"] for row in index["cards"]])


if __name__ == "__main__":
    unittest.main()
