"""Focused tests for the vendor-agnostic 3D preprocessor and its planning module."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import preprocess_3d as pipe  # noqa: E402
import three_d  # noqa: E402

FAMILIES = [
    {
        "id": "chunky-low-poly",
        "dimension": "3d",
        "packs": {"primary": ["kenney-a", "kenney-b"], "extras": []},
        "sets": [{"id": "kaykit", "packs": [{"id": "kaykit-x", "compatible_with": ["kenney-a"]}]}],
    },
    {
        "id": "pixel-art",
        "dimension": "2d",
        "packs": {"primary": ["limezu-a"], "extras": []},
        "sets": [],
    },
    {
        "id": "detailed-low-poly",
        "dimension": "3d",
        "packs": {"primary": [], "extras": []},
        "sets": [{"id": "synty-polygon", "packs": [{"id": "synty-y"}]}],
    },
]


class Planning(unittest.TestCase):
    def test_style_index_is_3d_only_and_keeps_set_compat_and_family_level_packs(self):
        index = three_d.style_index(FAMILIES)
        self.assertEqual(list(index), ["kenney-a", "kenney-b", "kaykit-x", "synty-y"])
        self.assertIsNone(index["kenney-a"].set_id)
        self.assertEqual(index["kaykit-x"].set_id, "kaykit")
        self.assertEqual(index["kaykit-x"].compat, ("kenney-a",))
        self.assertEqual(index["synty-y"].style_family, "detailed-low-poly")

    def test_pack_order_is_family_then_set_order(self):
        index = three_d.style_index(FAMILIES)
        self.assertEqual(three_d.pack_order(FAMILIES), list(index))

    def test_plans_a_conversion_target_only_for_a_source_without_gltf(self):
        with tempfile.TemporaryDirectory() as tmp:
            extracted = Path(tmp)
            (extracted / "Models" / "FBX").mkdir(parents=True)
            (extracted / "Models" / "FBX" / "Barrel.fbx").write_bytes(b"fbx")
            [plan] = three_d.plan_pack({"id": "kenney-a", "current": "1.0"}, extracted)
        self.assertEqual(plan.key, "barrel")
        self.assertTrue(plan.needs_conversion)
        self.assertEqual(plan.target.as_posix(), "glb/barrel.glb")
        self.assertEqual(plan.source.as_posix(), "Models/FBX/Barrel.fbx")

    def test_keeps_an_existing_gltf_canonical_and_lists_the_rest_as_alternates(self):
        with tempfile.TemporaryDirectory() as tmp:
            extracted = Path(tmp)
            (extracted / "gltf").mkdir()
            (extracted / "fbx").mkdir()
            (extracted / "gltf" / "Barrel.gltf").write_text("{}")
            (extracted / "fbx" / "Barrel.fbx").write_bytes(b"fbx")
            [plan] = three_d.plan_pack({"id": "kenney-a", "current": "1.0"}, extracted)
        self.assertFalse(plan.needs_conversion)
        self.assertEqual(plan.source.as_posix(), "gltf/Barrel.gltf")
        self.assertEqual([path.as_posix() for path in plan.alternates], ["fbx/Barrel.fbx"])

    def test_names_two_sources_that_collapse_to_one_key_instead_of_picking_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            extracted = Path(tmp)
            (extracted / "models").mkdir()
            (extracted / "models" / "Barrel.fbx").write_bytes(b"fbx")
            (extracted / "models" / "Barrel.obj").write_bytes(b"obj")
            [plan] = three_d.plan_pack({"id": "kenney-a", "current": "1.0"}, extracted)
        self.assertFalse(plan.needs_conversion)
        self.assertIn("barrel", plan.error)
        self.assertIn("Barrel.fbx", plan.error)
        self.assertIn("Barrel.obj", plan.error)

    def test_conversion_argv_sets_the_exit_code_before_python_and_forwards_scale(self):
        argv = three_d.conversion_argv(Path("convert.py"), Path("in.fbx"), Path("out.glb"),
                                       scale=0.01, normalize=True)
        self.assertEqual(argv[:5], ["blender", "--background", "--factory-startup",
                                    "--python-exit-code", "1"])
        self.assertLess(argv.index("--python-exit-code"), argv.index("--python"))
        self.assertIn("--normalize", argv)
        self.assertEqual(argv[argv.index("--scale") + 1], "0.01")

    def test_footprint_cells_rounds_up_to_whole_cells(self):
        bounds = {"min": [-0.6, 0.0, -0.4], "max": [0.6, 2.0, 0.4]}
        self.assertEqual(three_d.footprint_cells(bounds, 1.0), {"w": 2, "d": 1, "cell_m": 1.0})
        self.assertEqual(three_d.footprint_cells(bounds, 0.5)["w"], 3)

    def test_fits_mobile_uses_the_configured_budget(self):
        self.assertTrue(three_d.fits_mobile(three_d.MOBILE_TRIANGLES))
        self.assertFalse(three_d.fits_mobile(three_d.MOBILE_TRIANGLES + 1))

    def test_geometry_facts_call_a_model_normalized_only_when_it_stands_centred(self):
        analysis = {"triangles": 12, "vertices": 8, "bounds": {"min": [0, 0, 0], "max": [1, 1, 1]},
                    "pivot": "base-center", "materials": ["Atlas"]}
        facts = three_d.geometry_facts(analysis, ["atlas.png"])
        self.assertTrue(facts["normalized"])
        self.assertEqual(facts["footprint_cells"]["w"], 1)
        self.assertEqual(facts["texture_keys"], ["atlas.png"])
        analysis["pivot"] = "other"
        self.assertFalse(three_d.geometry_facts(analysis)["normalized"])

    def test_conversion_summary_counts_pending_formats_and_errors(self):
        plans = [three_d.SourcePlan("p", "1", "a", Path("a.fbx"), Path("glb/a.glb")),
                 three_d.SourcePlan("p", "1", "b", Path("b.glb"), None),
                 three_d.SourcePlan("p", "1", "c", None, None, (), "shared key")]
        summary = three_d.conversion_summary(plans)
        self.assertEqual(summary["to_convert"], 1)
        self.assertEqual(summary["already_gltf"], 1)
        self.assertEqual(summary["formats"], {"fbx": 1})
        self.assertEqual(summary["errors"], [{"uid": "p/c", "error": "shared key"}])


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.families = self.root / "style-families.json"
        self.families.write_text(json.dumps(FAMILIES))
        self.patch = mock.patch.object(pipe, "FAMILIES", self.families)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        glb_pack = self.pack("kenney-a", {"Models": {"Barrel.glb": b"glb"}})
        self.assertIsNotNone(glb_pack)
        self.pack("kaykit-x", {"Models": {"FBX": {"Chest.fbx": b"fbx"}}})

    def pack(self, pack_id, tree):
        pack = self.root / "packs" / pack_id
        extracted = pack / "1.0" / "extracted"
        extracted.mkdir(parents=True, exist_ok=True)
        for name, payload in tree.items():
            target = extracted / name
            if isinstance(payload, dict):
                self.nest(target, payload)
            else:
                target.write_bytes(payload)
        manifest = {"id": pack_id, "vendor": pack_id.split("-")[0], "title": f"{pack_id} pack",
                    "license": "CC0-1.0", "current": "1.0", "versions": {"1.0": {}}}
        (pack / "pack.json").write_text(json.dumps(manifest))
        return extracted

    def nest(self, directory, payload):
        directory.mkdir(parents=True, exist_ok=True)
        for name, value in payload.items():
            target = directory / name
            if isinstance(value, dict):
                self.nest(target, value)
            else:
                target.write_bytes(value)

    def run_main(self, *argv):
        out = io.StringIO()
        with mock.patch.object(sys, "argv", ["preprocess_3d.py", "--root", str(self.root), *argv]), \
                redirect_stdout(out):
            return pipe.main(), out.getvalue()

    def test_dry_run_reports_the_plan_without_running_blender(self):
        with mock.patch.object(pipe.subprocess, "run") as run:
            code, out = self.run_main("--dry-run")
        self.assertEqual(code, 0)
        plan = json.loads(out)
        self.assertEqual(plan["packs"], ["kenney-a", "kaykit-x"])
        self.assertEqual(plan["models"], 2)
        self.assertEqual(plan["to_convert"], 1)
        self.assertEqual(plan["already_gltf"], 1)
        run.assert_not_called()

    def test_conversion_writes_the_glb_through_the_blender_script(self):
        def fake_run(argv, **_kwargs):
            target = Path(argv[argv.index("--output") + 1])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"converted")
            return subprocess_completed(0)

        with mock.patch.object(pipe.subprocess, "run", side_effect=fake_run) as run:
            failures = pipe.convert(*self.plans(), blender="/opt/blender", scale=0.01, normalize=True)
        self.assertEqual(failures, [])
        argv = run.call_args.args[0]
        self.assertEqual(argv[0], "/opt/blender")
        self.assertEqual(argv[argv.index("--python") + 1], str(pipe.BLENDER_SCRIPT))
        self.assertTrue((self.root / "packs" / "kaykit-x" / "1.0" / "extracted" / "glb"
                         / "chest.glb").is_file())

    def test_a_target_newer_than_its_source_is_not_converted_again(self):
        plans, roots = self.plans()
        target = roots["kaykit-x"] / "glb" / "chest.glb"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"already converted")
        source = roots["kaykit-x"] / "Models" / "FBX" / "Chest.fbx"
        target.touch()
        source.touch()
        with mock.patch.object(pipe.subprocess, "run") as run:
            failures = pipe.convert(plans, roots, blender="/opt/blender", scale=1.0, normalize=True)
        self.assertEqual(failures, [])
        run.assert_not_called()

    def test_a_failed_conversion_is_reported_with_the_blender_output(self):
        completed = subprocess_completed(1)
        completed.stderr = "Error: no objects imported"
        with mock.patch.object(pipe.subprocess, "run", return_value=completed):
            failures = pipe.convert(*self.plans(), blender="/opt/blender", scale=1.0, normalize=False)
        self.assertEqual(failures, [{"uid": "kaykit-x/chest", "source": "Models/FBX/Chest.fbx",
                                     "error": "Error: no objects imported"}])

    def test_build_card_records_the_family_set_and_measured_facts(self):
        model = self.models()["kenney-a"]
        style = three_d.style_index(FAMILIES)["kenney-a"]
        analysis = {"triangles": 400_000, "vertices": 10, "bounds": {"min": [-1, 0, -1], "max": [1, 2, 1]},
                    "pivot": "base-center", "materials": ["Atlas"],
                    "rig": {"rig_type": "humanoid", "rig_id": "rig:abc", "joint_count": 2, "bones": []},
                    "clips": [{"name": "Running", "duration": 1.0}]}
        card = pipe.build_card(model, style, analysis, "2026-11-06T00:00:00+00:00", 1.0)
        self.assertEqual(card["describe"], {"style_family": "chunky-low-poly"})
        self.assertNotIn("describe.set", card["provenance"])
        self.assertEqual(card["geometry"]["triangles"], 400_000)
        self.assertEqual(card["geometry"]["footprint_cells"], {"w": 2, "d": 2, "cell_m": 1.0})
        self.assertTrue(card["geometry"]["normalized"])
        self.assertEqual(card["rig"]["rig_id"], "rig:abc")
        self.assertEqual(card["rig"]["clips"][0]["canonical"], "run")
        self.assertEqual(card["flags"], ["oversized-for-mobile"])
        self.assertEqual(card["source"]["files"][0]["role"], "primary")

    def test_a_pack_inside_a_curated_set_records_its_set(self):
        model = self.models()["kaykit-x"]
        style = three_d.style_index(FAMILIES)["kaykit-x"]
        analysis = {"triangles": 1, "vertices": 3, "bounds": {"min": [0, 0, 0], "max": [1, 1, 1]},
                    "pivot": "base-center", "materials": []}
        card = pipe.build_card(model, style, analysis, "2026-11-06T00:00:00+00:00", 1.0)
        self.assertEqual(card["describe"], {"style_family": "chunky-low-poly", "set": "kaykit"})
        self.assertIn("describe.set", card["provenance"])

    def test_write_cards_keeps_a_locked_human_field_and_writes_once(self):
        model = self.models()["kenney-a"]
        styles = three_d.style_index(FAMILIES)
        analysis = {"triangles": 1, "vertices": 3, "bounds": {"min": [0, 0, 0], "max": [1, 1, 0]},
                    "pivot": "base-center", "materials": []}
        output = self.root / "packs" / "kenney-a" / "cards" / f"{model.key}.card.json"
        output.parent.mkdir(parents=True)
        seeded = pipe.build_card(model, styles["kenney-a"], analysis, "2026-11-06T00:00:00+00:00", 1.0)
        seeded["describe"]["description"] = "Kevin's barrel"
        seeded["provenance"]["describe.description"] = {"by": "human", "locked": True}
        output.write_text(json.dumps(seeded))
        results = {model.uid: {"ok": True, "output": "packs/kenney-a/thumbnails/x.png", "analysis": analysis}}
        with mock.patch.object(pipe.kaykit, "validate") as validate:
            written = pipe.write_cards(self.root, [model], results, styles, "2026-11-07T00:00:00+00:00", 1.0)
        self.assertEqual(written, 1)
        validate.assert_called_once()
        card = json.loads(output.read_text())
        self.assertEqual(card["describe"]["description"], "Kevin's barrel")

    def test_qa_report_names_conversion_failures_and_models_over_the_mobile_budget(self):
        model = self.models()["kenney-a"]
        results = {model.uid: {"ok": True, "output": "packs/kenney-a/thumbnails/x.png",
                               "analysis": {"triangles": 400_000, "bounds": {"min": [0, 0, 0], "max": [1, 1, 1]},
                                            "pivot": "base-center"}}}
        failures = [{"uid": "kaykit-x/chest", "source": "Models/FBX/Chest.fbx", "error": "boom"}]
        report = pipe.qa_markdown(results, {"kenney-a": [model]}, three_d.style_index(FAMILIES),
                                  failures, "2026-11-06T00:00:00+00:00")
        self.assertIn("`kaykit-x/chest` (Models/FBX/Chest.fbx): boom", report)
        self.assertIn("over the mobile budget", report)
        self.assertIn("chunky-low-poly/None", report)

    def plans(self):
        chosen = pipe.selected(self.root, three_d.style_index(FAMILIES), [], [])
        return pipe.plan_all(chosen)

    def models(self):
        chosen = pipe.selected(self.root, three_d.style_index(FAMILIES), [], [])
        plans, roots = pipe.plan_all(chosen)
        return {model.pack_id: model for model in pipe.models_for(chosen, roots)}


def subprocess_completed(returncode):
    return mock.Mock(returncode=returncode, stdout="", stderr="")


if __name__ == "__main__":
    unittest.main()
