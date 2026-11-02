import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** Three joints in a column, the box skinned half to `hips` and half to `spine`. */
export const JOINTS = ['root', 'hips', 'spine'] as const;

/** Node has Blob but no FileReader, which GLTFExporter uses to read its own buffers. */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => this.#done(buffer));
  }
  readAsDataURL(blob: Blob) {
    void blob
      .arrayBuffer()
      .then((buffer) =>
        this.#done(`data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`),
      );
  }
  #done(result: ArrayBuffer | string) {
    this.result = result;
    this.onload?.();
    this.onloadend?.();
  }
}
(globalThis as { FileReader?: unknown }).FileReader ??= NodeFileReader;

export interface RigOptions {
  body?: string;
  /** Joint names; rename one to break the retarget. */
  joints?: readonly string[];
  /** Clips to embed: each turns `spine` about Z to `angle` radians over `duration` seconds. */
  clips?: readonly { name: string; duration: number; angle: number }[];
}

export function makeRig({ body = 'Rig_Medium', joints = JOINTS, clips = [] }: RigOptions = {}): Group {
  const bones = joints.map((name) => Object.assign(new Bone(), { name }));
  bones[1]!.position.y = 0.5;
  bones[2]!.position.y = 0.5;
  bones[0]!.add(bones[1]!);
  bones[1]!.add(bones[2]!);

  const geometry = new BoxGeometry(0.4, 1, 0.4, 1, 4, 1).translate(0, 1, 0);
  const position = geometry.getAttribute('position');
  const index: number[] = [];
  const weight: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    index.push(position.getY(vertex) > 1 ? 2 : 1, 0, 0, 0);
    weight.push(1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));

  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial({ color: 0xff8800 }));
  mesh.name = 'body';
  mesh.add(bones[0]!);
  mesh.bind(new Skeleton(bones));

  const rig = new Group();
  rig.name = body;
  rig.add(mesh);
  rig.animations = clips.map(({ name, duration, angle }) => {
    const turned = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle);
    const track = new QuaternionKeyframeTrack(
      `${joints[2]}.quaternion`,
      [0, duration],
      [0, 0, 0, 1, ...turned.toArray()],
    );
    return new AnimationClip(name, duration, [track]);
  });
  return rig;
}

export async function toGlb(rig: Group): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(rig, { binary: true, animations: rig.animations });
  return result as ArrayBuffer;
}
