import sand3d as s3d

s3d.units("m")

WOOD = "#8a5a2b"
STONE = "#8d8d86"
STEEL = "#4c4f52"


def well():
    # stone kerb: a hollow ring, 1.6 m across, 0.9 m high
    ring = s3d.revolve("kerb", [(0.56, 0), (0.80, 0), (0.80, 0.90), (0.56, 0.90)])
    s3d.material(ring, "concrete", color=STONE, roughness=0.95)

    # two posts just outside the kerb, a beam across them
    post = s3d.box("post", 0.12, 0.12, 2.20)
    s3d.material(post, "oak", color=WOOD, roughness=0.8)
    s3d.at(post, x=-0.88)
    right = s3d.transform(s3d.copy(post), mirror="x")

    beam = s3d.at(s3d.cylinder("beam", 0.12, 1.88), x=-0.94, z=2.20, ry=90)
    s3d.material(beam, "oak", color=WOOD, roughness=0.8)

    # the winding drum and its handle turn on one axle between the posts
    drum = s3d.at(s3d.cylinder("drum", 0.22, 1.56), x=-0.78, z=2.00, ry=90)
    s3d.material(drum, "oak", color=WOOD, roughness=0.8)
    arm = s3d.at(s3d.box("arm", 0.06, 0.06, 0.34), x=0.78, y=0.0, z=2.17)
    grip = s3d.at(s3d.cylinder("grip", 0.06, 0.22), x=0.89, y=-0.11, z=2.34, ry=90)
    s3d.material(arm, "steel", color=STEEL, roughness=0.5, metallic=0.8)
    s3d.material(grip, "oak", color=WOOD, roughness=0.8)
    winder = s3d.group("winder", drum, arm, grip)

    # a bucket resting on the kerb
    bucket = s3d.at(s3d.cylinder("bucket", 0.26, 0.28), z=0.90)
    s3d.shell(bucket, 0.02, open="top")
    s3d.material(bucket, "oak", color=WOOD, roughness=0.85)

    w = s3d.assembly("well", ring, post, right, beam, winder, bucket,
                     axle=s3d.Frame((0, 0, 2.00)))
    s3d.joint("crank", winder, w.axle, kind="continuous", axis="+X")
    s3d.export(w, "well.glb")
    return w


well()
print("well exported")
