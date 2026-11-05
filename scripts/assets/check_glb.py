"""Gate an exported GLB the way a kit item has to ship: real metres, bottom-centre origin, budget, LOD1.

Reads the GLB container directly (JSON chunk plus BIN chunk), so it runs anywhere Python runs: no Blender, no
three.js, no network. It answers the questions a generator's raw output always gets wrong, and that nothing else in
this repository checks without opening a browser:

- is the model a real-world size in metres (``--height`` compares the measured height to the looked-up height);
- does it stand on its own origin (bottom-centre: ``min y`` at 0 in glTF's Y-up space, centred on x and z);
- is the triangle count inside a detail budget (``low`` 20k, ``medium`` 100k, ``high`` 200k);
- are the textures at or below the cap (2K by default);
- is there a LOD1 beside it, at roughly a quarter of the triangles;
- does the whole set line up to scale, with a scale bar, for the lineup still.

The technique is adapted from AnyKit's ``kit/tools/normalize.py`` and ``present.py`` (MIT, see
https://github.com/apekshik/anykit and ``docs/research/anykit-lessons-2026-11.md`` for what was adopted and why).

Run:

    python3 -I scripts/assets/check_glb.py [--budget low|medium|high] [--texture-cap 2048] \\
        [--height 0.32] [--require-lod1] item.glb [item.glb ...]
    python3 -I scripts/assets/check_glb.py --jobs ../scenes/kit/prep.json [--items out/items]
    python3 -I scripts/assets/check_glb.py --lineup item.glb [item.glb ...]

The first form exits 1 when any gate fails and prints one JSON report. ``--jobs`` prints what a batch prep still has
to do, so a rebuild never redoes an item whose ``stats.json`` is newer than its GLB and than the jobs file. ``--lineup``
prints the to-scale x position of every item plus the scale bar to draw under them.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

GLB_MAGIC = b"glTF"
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942
TRIANGLE_MODES = {4}  # glTF primitive mode TRIANGLES; anything else is not counted as tris here
DETAIL_BUDGET = {"low": 20_000, "medium": 100_000, "high": 200_000}
UP_AXIS = 1  # glTF is Y-up: height is Y, and a model stands on its min Y
WIDTH_AXIS = 0
DEPTH_AXIS = 2
ORIGIN_TOLERANCE_M = 0.002  # 2 mm: a bottom-centre origin is exact, this only allows float round-off
CENTRE_TOLERANCE_M = 0.01
HEIGHT_TOLERANCE = 0.05  # 5%: a looked-up real height is a judgement, not a measurement
LOD1_MIN, LOD1_MAX = 0.15, 0.40  # "about a quarter of the triangles"
NICE_BAR_LENGTHS_M = (0.05, 0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 5.0)


class GlbError(Exception):
    """The file is not a GLB this gate can read."""


def read_glb(path: Path) -> tuple[dict, bytes]:
    """Return ``(gltf_json, bin_chunk)`` for a binary glTF container."""
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != GLB_MAGIC:
        raise GlbError(f"{path.name}: not a GLB (no glTF magic)")
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise GlbError(f"{path.name}: glTF version {version}, expected 2")
    if length > len(data):
        raise GlbError(f"{path.name}: header says {length} bytes, file has {len(data)}")
    offset = 12
    doc: dict | None = None
    binary = b""
    while offset + 8 <= length:
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        body = data[offset + 8 : offset + 8 + chunk_length]
        if len(body) != chunk_length:
            raise GlbError(f"{path.name}: truncated chunk at {offset}")
        if chunk_type == CHUNK_JSON and doc is None:
            doc = json.loads(body.decode("utf-8"))
        elif chunk_type == CHUNK_BIN and not binary:
            binary = body
        offset += 8 + chunk_length
    if doc is None:
        raise GlbError(f"{path.name}: no JSON chunk")
    return doc, binary


def image_size(blob: bytes) -> tuple[int, int] | None:
    """Width and height from a PNG or JPEG header, or ``None`` for a format this gate cannot size."""
    if blob[:8] == b"\x89PNG\r\n\x1a\n" and len(blob) >= 24 and blob[12:16] == b"IHDR":
        width, height = struct.unpack_from(">II", blob, 16)
        return int(width), int(height)
    if blob[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(blob):
            if blob[i] != 0xFF:
                i += 1
                continue
            marker = blob[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height, width = struct.unpack_from(">HH", blob, i + 5)
                return int(width), int(height)
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            segment = struct.unpack_from(">H", blob, i + 2)[0]
            i += 2 + segment
    return None


def _identity() -> list[float]:
    return [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]


def _multiply(a: list[float], b: list[float]) -> list[float]:
    """Column-major 4x4 product, glTF order."""
    out = [0.0] * 16
    for column in range(4):
        for row in range(4):
            out[column * 4 + row] = sum(a[k * 4 + row] * b[column * 4 + k] for k in range(4))
    return out


def _trs(node: dict) -> list[float]:
    if isinstance(node.get("matrix"), list) and len(node["matrix"]) == 16:
        return [float(v) for v in node["matrix"]]
    tx, ty, tz = (node.get("translation") or [0.0, 0.0, 0.0])[:3]
    qx, qy, qz, qw = (node.get("rotation") or [0.0, 0.0, 0.0, 1.0])[:4]
    sx, sy, sz = (node.get("scale") or [1.0, 1.0, 1.0])[:3]
    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz
    return [
        (1 - 2 * (yy + zz)) * sx,
        2 * (xy + wz) * sx,
        2 * (xz - wy) * sx,
        0.0,
        2 * (xy - wz) * sy,
        (1 - 2 * (xx + zz)) * sy,
        2 * (yz + wx) * sy,
        0.0,
        2 * (xz + wy) * sz,
        2 * (yz - wx) * sz,
        (1 - 2 * (xx + yy)) * sz,
        0.0,
        float(tx),
        float(ty),
        float(tz),
        1.0,
    ]


def _apply(matrix: list[float], point: list[float]) -> list[float]:
    x, y, z = point
    return [
        matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ]


def _corners(lo: list[float], hi: list[float]) -> list[list[float]]:
    return [[lo[0] if i & 1 else hi[0], lo[1] if i & 2 else hi[1], lo[2] if i & 4 else hi[2]] for i in range(8)]


def geometry(doc: dict) -> dict:
    """World bounds, triangle count and texture sizes for a parsed glTF document."""
    meshes = doc.get("meshes") or []
    accessors = doc.get("accessors") or []
    nodes = doc.get("nodes") or []
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    tris = 0
    placed = 0

    def visit(index: int, parent: list[float]) -> None:
        nonlocal tris, placed, lo, hi
        node = nodes[index]
        world = _multiply(parent, _trs(node))
        mesh_index = node.get("mesh")
        if isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes):
            placed += 1
            for primitive in meshes[mesh_index].get("primitives") or []:
                mode = primitive.get("mode", 4)
                position = (primitive.get("attributes") or {}).get("POSITION")
                if not isinstance(position, int) or position >= len(accessors):
                    continue
                accessor = accessors[position]
                bounds = accessor.get("min"), accessor.get("max")
                if isinstance(bounds[0], list) and isinstance(bounds[1], list):
                    for corner in _corners([float(v) for v in bounds[0][:3]], [float(v) for v in bounds[1][:3]]):
                        point = _apply(world, corner)
                        for axis in range(3):
                            lo[axis] = min(lo[axis], point[axis])
                            hi[axis] = max(hi[axis], point[axis])
                count = 0
                indices = primitive.get("indices")
                if isinstance(indices, int) and indices < len(accessors):
                    count = int(accessors[indices].get("count") or 0)
                elif not isinstance(indices, int):
                    count = int(accessor.get("count") or 0)
                if mode in TRIANGLE_MODES:
                    tris += count // 3
        for child in node.get("children") or []:
            if isinstance(child, int) and 0 <= child < len(nodes):
                visit(child, world)

    roots = [i for i in (doc.get("scenes") or [{}])[0].get("nodes", []) if isinstance(i, int)]
    if not roots:
        roots = list(range(len(nodes)))
    children = {c for node in nodes for c in (node.get("children") or [])}
    roots = [i for i in roots if i not in children]
    for root in roots:
        visit(root, _identity())

    textures: list[dict] = []
    for image in doc.get("images") or []:
        view = image.get("bufferView")
        textures.append({"name": image.get("name", ""), "bufferView": view, "mimeType": image.get("mimeType", "")})
    return {
        "min": lo if placed else None,
        "max": hi if placed else None,
        "tris": tris,
        "texture_refs": textures,
        "meshes_placed": placed,
    }


def texture_sizes(doc: dict, binary: bytes) -> list[dict]:
    """Measured pixel size for every embedded image this gate can read."""
    views = doc.get("bufferViews") or []
    sizes = []
    for image in doc.get("images") or []:
        name = image.get("name") or image.get("mimeType") or "image"
        view = image.get("bufferView")
        if not isinstance(view, int) or view >= len(views):
            sizes.append({"name": name, "width": None, "height": None, "note": "external image not measured"})
            continue
        entry = views[view]
        start = int(entry.get("byteOffset") or 0)
        blob = binary[start : start + int(entry.get("byteLength") or 0)]
        measured = image_size(blob)
        if measured is None:
            sizes.append({"name": name, "width": None, "height": None, "note": "format not measured"})
        else:
            sizes.append({"name": name, "width": measured[0], "height": measured[1], "note": ""})
    return sizes


def check_model(
    path: Path,
    *,
    budget: str = "medium",
    texture_cap: int = 2048,
    height: float | None = None,
    require_lod1: bool = False,
) -> dict:
    """Gate one exported item. Returns a report whose ``failures`` list is empty when the item may ship."""
    failures: list[str] = []
    report: dict = {"path": str(path), "name": path.name, "failures": failures}
    try:
        doc, binary = read_glb(path)
    except GlbError as error:
        failures.append(str(error))
        return report
    shape = geometry(doc)
    report["tris"] = shape["tris"]
    report["meshes"] = shape["meshes_placed"]
    limit = DETAIL_BUDGET[budget]
    report["budget"] = {"detail": budget, "max_tris": limit}
    if not shape["meshes_placed"]:
        failures.append("no mesh nodes: nothing to place in a game")
    if shape["tris"] > limit:
        failures.append(f"{shape['tris']} triangles over the {budget} budget of {limit}")
    sizes = texture_sizes(doc, binary)
    report["textures"] = sizes
    for size in sizes:
        largest = max(v for v in (size["width"], size["height"]) if isinstance(v, int)) if size["width"] else 0
        if largest > texture_cap:
            failures.append(f"texture {size['name']!r} is {size['width']}x{size['height']}, cap is {texture_cap}")
    if shape["min"] and shape["max"]:
        lo, hi = shape["min"], shape["max"]
        dims = [round(hi[axis] - lo[axis], 4) for axis in range(3)]
        report["dims_m"] = dims
        report["height_m"] = dims[UP_AXIS]
        if abs(lo[UP_AXIS]) > ORIGIN_TOLERANCE_M:
            failures.append(f"bottom of the model sits at y={lo[UP_AXIS]:.4f} m, not on the origin")
        for axis in (WIDTH_AXIS, DEPTH_AXIS):
            centre = (lo[axis] + hi[axis]) / 2
            if abs(centre) > CENTRE_TOLERANCE_M:
                failures.append(f"not centred on {'x' if axis == WIDTH_AXIS else 'z'}: centre is {centre:.4f} m")
        if height is not None and dims[UP_AXIS] > 0:
            drift = abs(dims[UP_AXIS] - height) / height
            report["expected_height_m"] = height
            if drift > HEIGHT_TOLERANCE:
                failures.append(
                    f"height {dims[UP_AXIS]:.3f} m is {drift * 100:.0f}% off the looked-up {height:.3f} m"
                )
    else:
        report["dims_m"] = None
        failures.append("no POSITION bounds: cannot check scale or origin")
    report["facing"] = "unchecked: there is no glTF facing convention, so pick one for the set and look at it"
    if require_lod1:
        lod1 = path.with_name(f"{path.stem}_lod1.glb")
        if not lod1.exists():
            failures.append(f"no LOD1 beside it (expected {lod1.name})")
        else:
            try:
                lod_shape = geometry(read_glb(lod1)[0])
            except GlbError as error:
                failures.append(str(error))
            else:
                ratio = lod_shape["tris"] / max(1, shape["tris"])
                report["lod1"] = {"name": lod1.name, "tris": lod_shape["tris"], "ratio": round(ratio, 3)}
                if not LOD1_MIN <= ratio <= LOD1_MAX:
                    failures.append(
                        f"LOD1 is {ratio * 100:.0f}% of LOD0 ({lod_shape['tris']} of {shape['tris']} tris),"
                        f" expected about a quarter ({LOD1_MIN * 100:.0f}-{LOD1_MAX * 100:.0f}%)"
                    )
    return report


def batch_status(jobs: Path, items_dir: Path) -> dict:
    """Which items a batch prep still has to do: an item is done when its stats are newer than its GLB and the jobs file."""
    document = json.loads(jobs.read_text())
    jobs_time = jobs.stat().st_mtime
    done, pending, unmade = [], [], []
    for item in document.get("items") or []:
        item_id = item.get("id", "?")
        glb = Path(item.get("glb") or "")
        stats = items_dir / item_id / "stats.json"
        if not glb.exists():
            unmade.append(item_id)
        elif stats.exists() and stats.stat().st_mtime > glb.stat().st_mtime and stats.stat().st_mtime > jobs_time:
            done.append(item_id)
        else:
            pending.append(item_id)
    return {"done": done, "pending": pending, "unmade": unmade}


def scale_bar(width_m: float) -> dict:
    """A readable bar for a lineup this wide: a round length about a fifth of it, in 10 cm or 1 cm blocks."""
    nice = min(NICE_BAR_LENGTHS_M, key=lambda value: abs(value - width_m / 5))
    step = nice / 10 if nice <= 0.25 else 0.1
    label = f"{nice * 100:.0f} cm" if nice < 1 else f"{nice:g} m"
    return {"length_m": nice, "step_m": round(step, 4), "label": label}


def lineup_layout(items: list[dict]) -> dict:
    """To-scale x positions for a lineup, and the scale bar to draw under it. ``items`` carry measured ``dims_m``."""
    gap = max(0.06, 0.12 * max((item["dims_m"][UP_AXIS] for item in items), default=0.0))
    placed, x = [], 0.0
    for item in items:
        width = item["dims_m"][WIDTH_AXIS]
        placed.append(
            {
                "name": item.get("name", ""),
                "x_centre_m": round(x + width / 2, 4),
                "width_m": round(width, 4),
                "height_m": item["dims_m"][UP_AXIS],
            }
        )
        x += width + gap
    total = max(0.0, x - gap)
    return {"width_m": round(total, 4), "gap_m": round(gap, 4), "items": placed, "scale_bar": scale_bar(total)}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Gate exported GLBs: metres, origin, budgets, LOD1, lineup.")
    parser.add_argument("models", nargs="*", type=Path, help="GLB files to gate")
    parser.add_argument("--budget", choices=sorted(DETAIL_BUDGET), default="medium")
    parser.add_argument("--texture-cap", type=int, default=2048)
    parser.add_argument("--height", type=float, default=None, help="looked-up real height in metres")
    parser.add_argument("--require-lod1", action="store_true", help="fail an item with no <name>_lod1.glb beside it")
    parser.add_argument("--jobs", type=Path, default=None, help="prep jobs JSON: report what still needs doing")
    parser.add_argument("--items", type=Path, default=Path("out/items"), help="batch output directory")
    parser.add_argument("--lineup", action="store_true", help="print the to-scale lineup layout and scale bar")
    args = parser.parse_args(argv)

    if args.jobs:
        print(json.dumps(batch_status(args.jobs, args.items), indent=1))
        return 0
    if not args.models:
        parser.error("give at least one GLB, or --jobs")
    reports = []
    for model in args.models:
        if not model.exists():
            reports.append({"path": str(model), "failures": [f"missing: {model}"]})
            continue
        reports.append(
            check_model(
                model,
                budget=args.budget,
                texture_cap=args.texture_cap,
                height=args.height,
                require_lod1=args.require_lod1,
            )
        )
    failed = [report for report in reports if report["failures"]]
    if args.lineup:
        placed = [report for report in reports if report.get("dims_m")]
        print(json.dumps({"lineup": lineup_layout(placed)}, indent=1))
    else:
        print(json.dumps(reports, indent=1))
    for report in failed:
        for failure in report["failures"]:
            print(f"FAIL {report['path']}: {failure}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
