"""Convert one 3D source file to a self-contained GLB with headless Blender.

Run through Blender, not the host Python:

    blender -b --factory-startup --python-exit-code 1 \
        --python scripts/assets/blender_fbx_to_glb.py -- \
        --input <file.fbx> --output <model.glb> [--scale 1.0] [--normalize] [--report <facts.json>]

`--python-exit-code 1` must come before `--python`, or Blender can still exit zero after a Python
exception. The exporter embeds materials, textures and animations in one GLB so the card pipeline
can measure and render a model without external .bin/.png siblings. Synty packs ship a shared atlas
next to the FBX; Blender finds it relative to the source file (`use_image_search`), and nothing
leaves this host.

`--normalize` moves each root object so the model stands on Y = 0 and is centred on X and Z, which
is the B11 origin the cards and the runtime expect. It translates roots rather than mesh data so a
rigged hierarchy moves with its skeleton. Source units are the operator's call: Synty SourceFiles
are centimetres for some packs and metres for others, so `--scale` is explicit and the pipeline's QA
report flags a pack whose models disagree with their neighbours.
"""
import argparse
import json
import pathlib
import sys

import bpy
from mathutils import Vector


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--normalize", action="store_true")
    parser.add_argument("--report")
    return parser.parse_args(argv)


def blender_argv():
    # Blender forwards host arguments after a bare `--`.
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(path, scale):
    suffix = path.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(
            filepath=str(path),
            global_scale=scale,
            use_image_search=True,
            ignore_leaf_bones=False,
        )
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path), global_scale=scale)
    elif suffix == ".dae":
        bpy.ops.wm.collada_import(filepath=str(path))
    elif suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        raise SystemExit(f"unsupported 3D source: {suffix or path.name}")


def roots():
    return [obj for obj in bpy.data.objects if obj.parent is None]


def normalize_origin():
    """Stand the model on Y = 0 and centre it on X and Z by moving each root object."""
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        return False
    minimum = Vector((float("inf"),) * 3)
    maximum = Vector((float("-inf"),) * 3)
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum = Vector((min(minimum[i], point[i]) for i in range(3)))
            maximum = Vector((max(maximum[i], point[i]) for i in range(3)))
    offset = Vector((-(minimum.x + maximum.x) / 2, -minimum.y, -(minimum.z + maximum.z) / 2))
    if max(abs(value) for value in offset) < 1e-6:
        return True
    for obj in roots():
        obj.location = obj.location + offset
    bpy.context.view_layer.update()
    return True


def count_facts():
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    return {
        "objects": len(bpy.data.objects),
        "meshes": len(meshes),
        "materials": sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
        "images": sorted({image.name for image in bpy.data.images if image.source != "GENERATED"}),
        "actions": sorted({action.name for action in bpy.data.actions}),
        "armatures": len([obj for obj in bpy.data.objects if obj.type == "ARMATURE"]),
    }


def export_glb(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_texcoords=True,
        export_normals=True,
        export_cameras=False,
        export_lights=False,
    )


def main():
    args = parse_args(blender_argv())
    source = pathlib.Path(args.input).resolve()
    output = pathlib.Path(args.output).resolve()
    if not source.is_file():
        raise SystemExit(f"missing source: {source}")
    reset_scene()
    import_source(source, args.scale)
    if not bpy.data.objects:
        raise SystemExit(f"no objects imported: {source}")
    facts = count_facts()
    if not facts["meshes"] and not facts["armatures"]:
        raise SystemExit(f"no meshes or armatures imported: {source}")
    facts["normalized"] = normalize_origin() if args.normalize else False
    export_glb(output)
    if not output.is_file() or output.stat().st_size == 0:
        raise SystemExit(f"exporter wrote no file: {output}")
    facts.update({"input": str(source), "output": str(output), "bytes": output.stat().st_size})
    if args.report:
        report = pathlib.Path(args.report)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(facts, indent=2) + "\n", encoding="utf-8")
    print(f"converted {source} -> {output} ({facts['bytes']} bytes)")


main()
