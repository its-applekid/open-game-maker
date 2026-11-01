"""Focused tests for the KayKit v7 card, preview, and QA preprocessor."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

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

    def test_discovers_only_gltf_as_canonical_and_attaches_dependencies_and_companions(self):
        [model] = kaykit.discover_models(self.root)
        self.assertEqual(model.key, "barrel")
        self.assertEqual(model.primary.as_posix(), "Models/gltf/Barrel.gltf")
        self.assertEqual(
            [(file.path.as_posix(), file.role) for file in model.files],
            [
                ("Models/fbx/Barrel.fbx", "companion"),
                ("Models/gltf/Barrel.bin", "metadata"),
                ("Models/gltf/Barrel.gltf", "primary"),
                ("Models/gltf/Textures/Barrel.png", "texture"),
                ("Models/obj/Barrel.mtl", "companion"),
                ("Models/obj/Barrel.obj", "companion"),
            ],
        )

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
