import sand3d as s3d

s3d.units("m")

WOOD = "#8a5a2b"
STONE = "#8d8d86"
STEEL = "#4c4f52"


def cellar_hatch():
    # stone surround, cut out to leave a 1.10 m opening in a 1.30 m frame
    frame = s3d.box("frame", 1.30, 1.30, 0.14)
    s3d.material(frame, "concrete", color=STONE, roughness=0.95)
    s3d.pocket(frame, s3d.rect(1.10, 1.10), depth=0.13, on=frame.face("top"))

    # the lid: three boards and two steel straps, hinged on the -Y edge
    board = s3d.box("board", 1.16, 0.36, 0.06)
    s3d.material(board, "oak", color=WOOD, roughness=0.8)
    s3d.at(board, y=-0.40, z=0.14)
    mid = s3d.at(s3d.copy(board), y=0.0, z=0.14)
    back = s3d.at(s3d.copy(board), y=0.40, z=0.14)
    strap = s3d.at(s3d.box("strap", 1.20, 0.06, 0.075), x=0.0, y=-0.40, z=0.14)
    s3d.material(strap, "steel", color=STEEL, roughness=0.45, metallic=0.85)
    strap2 = s3d.transform(s3d.copy(strap), x=0.0)
    s3d.at(strap2, y=0.40, z=0.14)
    ring = s3d.at(s3d.torus("ring", 0.16, 0.025), y=-0.42, z=0.22, rx=90)
    s3d.material(ring, "steel", color=STEEL, roughness=0.45, metallic=0.85)
    lid = s3d.group("lid", board, mid, back, strap, strap2, ring)

    h = s3d.assembly("cellar_hatch", frame, lid)
    s3d.joint("hatch_lid", lid, s3d.bbox(frame, "-Y+Z"), axis="+X", range=(0, 100))
    s3d.export(h, "hatch.glb")
    return h


cellar_hatch()
print("hatch exported")
