import sand3d as s3d

s3d.units("m")

WOOD = "#8a5a2b"
CLOTH = "#d9cbb2"
ROPE = "#c8b48a"


def market_stall():
    # four posts on a 2.0 x 0.7 m footprint
    post = s3d.box("post", 0.08, 0.08, 2.15)
    s3d.material(post, "oak", color=WOOD, roughness=0.8)
    s3d.at(post, x=-0.95, y=-0.32)
    p2 = s3d.at(s3d.copy(post), x=0.95, y=-0.32)
    p3 = s3d.at(s3d.copy(post), x=-0.95, y=0.32)
    p4 = s3d.at(s3d.copy(post), x=0.95, y=0.32)

    # counter top with a front board and two trestles
    top = s3d.box("counter", 1.98, 0.64, 0.07)
    s3d.material(top, "oak", color=WOOD, roughness=0.75)
    s3d.at(top, z=0.93)
    front = s3d.at(s3d.box("front", 1.98, 0.03, 0.30), y=0.325, z=0.63)
    s3d.material(front, "oak", color=WOOD, roughness=0.8)
    rail = s3d.at(s3d.box("rail", 1.94, 0.05, 0.05), y=-0.28, z=0.60)
    s3d.material(rail, "oak", color=WOOD, roughness=0.8)

    # awning: one cloth panel sloping down to the front, a valance hanging off its edge
    panel = s3d.at(s3d.box("awning", 2.20, 0.86, 0.03), y=-0.02, z=2.13, rx=12)
    s3d.material(panel, "fabric", color=CLOTH, roughness=0.95)
    valance = s3d.at(s3d.box("valance", 2.20, 0.03, 0.16), y=0.42, z=2.02)
    s3d.material(valance, "fabric", color=CLOTH, roughness=0.95)
    tie = s3d.at(s3d.cylinder("tie", 0.02, 0.22), x=-1.02, y=0.40, z=1.90, ry=90)
    s3d.material(tie, "fabric", color=ROPE, roughness=0.95)

    s = s3d.assembly("market_stall", post, p2, p3, p4, top, front, rail, panel, valance, tie)
    s3d.export(s, "stall.glb")
    return s


market_stall()
print("stall exported")
