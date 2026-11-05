"""Synthetic coverage for the exported-GLB gate.

Every case is a GLB built in the test, so the gate is exercised on exactly the container and bounds it reads.

Run: python3 -I scripts/assets/test_check_glb.py -v
"""

from __future__ import annotations

import json
import os
import struct
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_glb  # noqa: E402


def png_header(width: int, height: int) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height)


def glb(
    path: Path,
    *,
    lo: tuple[float, float, float] = (-0.05, 0.0, -0.04),
    hi: tuple[float, float, float] = (0.05, 0.32, 0.04),
    tris: int = 3000,
    texture: tuple[int, int] | None = (512, 512),
) -> Path:
    """Write a minimal binary glTF: one mesh node, one POSITION accessor with bounds, one optional texture."""
    binary = b""
    buffer_views: list[dict] = []
    images: list[dict] = []
    if texture:
        binary = png_header(*texture)
        buffer_views.append({"bufferView": 0, "byteOffset": 0, "byteLength": len(binary)})
        images.append({"name": "basecolour", "bufferView": 0, "mimeType": "image/png"})
    document = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "item"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [
            {
                "bufferView": 0 if not buffer_views else len(buffer_views),
                "componentType": 5126,
                "count": tris * 3,
                "type": "VEC3",
                "min": list(lo),
                "max": list(hi),
            }
        ],
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary)}],
    }
    if images:
        document["images"] = images
    body = json.dumps(document).encode("utf-8")
    body += b" " * (-len(body) % 4)
    chunk = binary + b"\x00" * (-len(binary) % 4)
    total = 12 + 8 + len(body) + (8 + len(chunk) if chunk else 0)
    data = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(body), 0x4E4F534A) + body
    if chunk:
        data += struct.pack("<II", len(chunk), 0x004E4942) + chunk
    path.write_bytes(data)
    return path


class CheckModelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_a_prepared_item_passes_every_gate(self) -> None:
        report = check_glb.check_model(glb(self.dir / "mug.glb"), height=0.32)
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["dims_m"], [0.1, 0.32, 0.08])
        self.assertEqual(report["tris"], 3000)
        self.assertEqual(report["textures"][0]["width"], 512)

    def test_a_model_standing_off_its_origin_fails(self) -> None:
        report = check_glb.check_model(glb(self.dir / "float.glb", lo=(-0.05, 0.1, -0.04), hi=(0.05, 0.42, 0.04)))
        self.assertTrue(any("not on the origin" in failure for failure in report["failures"]), report["failures"])

    def test_a_model_off_centre_fails(self) -> None:
        report = check_glb.check_model(glb(self.dir / "wide.glb", lo=(-0.2, 0.0, -0.04), hi=(0.0, 0.32, 0.04)))
        self.assertTrue(any("not centred on x" in failure for failure in report["failures"]), report["failures"])

    def test_triangles_over_the_detail_budget_fail(self) -> None:
        report = check_glb.check_model(glb(self.dir / "hero.glb", tris=150_000), budget="medium")
        self.assertTrue(any("over the medium budget of 100000" in f for f in report["failures"]), report["failures"])
        hero = glb(self.dir / "hero2.glb", tris=150_000)
        self.assertEqual(check_glb.check_model(hero, budget="high")["failures"], [])

    def test_an_oversized_texture_fails_the_cap(self) -> None:
        report = check_glb.check_model(glb(self.dir / "sharp.glb", texture=(4096, 4096)))
        self.assertTrue(any("cap is 2048" in failure for failure in report["failures"]), report["failures"])

    def test_a_height_that_misses_the_looked_up_size_fails(self) -> None:
        report = check_glb.check_model(glb(self.dir / "tall.glb"), height=0.2)
        self.assertTrue(any("off the looked-up" in f for f in report["failures"]), report["failures"])
        near = check_glb.check_model(glb(self.dir / "near.glb"), height=0.31)
        self.assertEqual(near["failures"], [])

    def test_a_missing_lod1_fails_only_when_it_is_required(self) -> None:
        item = glb(self.dir / "lamp.glb")
        self.assertEqual(check_glb.check_model(item)["failures"], [])
        self.assertTrue(any("no LOD1" in f for f in check_glb.check_model(item, require_lod1=True)["failures"]))

    def test_a_lod1_must_be_about_a_quarter_of_the_triangles(self) -> None:
        item = glb(self.dir / "chair.glb", tris=8000)
        glb(self.dir / "chair_lod1.glb", tris=2000)
        report = check_glb.check_model(item, require_lod1=True)
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["lod1"]["ratio"], 0.25)
        glb(self.dir / "chair_lod1.glb", tris=6000)
        heavy = check_glb.check_model(item, require_lod1=True)
        self.assertTrue(any("expected about a quarter" in f for f in heavy["failures"]), heavy["failures"])

    def test_a_file_that_is_not_a_glb_fails(self) -> None:
        plain = self.dir / "notes.glb"
        plain.write_text("not a model")
        self.assertTrue(any("not a GLB" in f for f in check_glb.check_model(plain)["failures"]))


class BatchStatusTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.items = self.dir / "items"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_a_finished_item_is_never_redone(self) -> None:
        for name in ("done", "pending", "unmade"):
            (self.dir / f"{name}.glb").write_bytes(b"x")
        (self.items / "done").mkdir(parents=True)
        (self.items / "pending").mkdir()
        jobs = self.dir / "prep.json"
        jobs.write_text(
            json.dumps(
                {
                    "items": [
                        {"id": "done", "glb": str(self.dir / "done.glb")},
                        {"id": "pending", "glb": str(self.dir / "pending.glb")},
                        {"id": "unmade", "glb": str(self.dir / "gone.glb")},
                    ]
                }
            )
        )
        (self.items / "done" / "stats.json").write_text("{}")
        (self.items / "pending" / "stats.json").write_text("{}")
        stamp = time.time() - 10
        os.utime(self.dir / "done.glb", (stamp, stamp))
        os.utime(self.dir / "pending.glb", (stamp + 20, stamp + 20))
        os.utime(jobs, (stamp - 30, stamp - 30))
        os.utime(self.items / "done" / "stats.json", (stamp + 5, stamp + 5))
        status = check_glb.batch_status(jobs, self.items)
        self.assertEqual(status, {"done": ["done"], "pending": ["pending"], "unmade": ["unmade"]})

    def test_a_stats_file_older_than_the_jobs_spec_is_redone(self) -> None:
        (self.dir / "mug.glb").write_bytes(b"x")
        (self.items / "mug").mkdir(parents=True)
        (self.items / "mug" / "stats.json").write_text("{}")
        jobs = self.dir / "prep.json"
        jobs.write_text(json.dumps({"items": [{"id": "mug", "glb": str(self.dir / "mug.glb")}]}))
        stamp = time.time() - 30
        os.utime(self.items / "mug" / "stats.json", (stamp, stamp))
        self.assertEqual(check_glb.batch_status(jobs, self.items)["pending"], ["mug"])


class LineupTest(unittest.TestCase):
    def test_the_bar_is_a_round_length_about_a_fifth_of_the_lineup(self) -> None:
        self.assertEqual(check_glb.scale_bar(3.24), {"length_m": 0.5, "step_m": 0.1, "label": "50 cm"})
        self.assertEqual(check_glb.scale_bar(0.4)["step_m"], 0.01)
        self.assertEqual(check_glb.scale_bar(20)["label"], "5 m")

    def test_items_are_laid_out_to_scale_with_a_gap(self) -> None:
        items = [{"name": f"box{i}", "dims_m": [1.0, 1.0, 1.0]} for i in range(3)]
        layout = check_glb.lineup_layout(items)
        self.assertEqual(layout["gap_m"], 0.12)
        self.assertEqual([item["x_centre_m"] for item in layout["items"]], [0.5, 1.62, 2.74])
        self.assertEqual(layout["width_m"], 3.24)
        self.assertEqual(layout["scale_bar"]["label"], "50 cm")

    def test_small_items_use_a_smaller_gap(self) -> None:
        items = [{"name": "mug", "dims_m": [0.09, 0.09, 0.1]}]
        self.assertEqual(check_glb.lineup_layout(items)["gap_m"], 0.06)


if __name__ == "__main__":
    unittest.main()
