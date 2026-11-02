import type { AssetLoader } from '@gm/sdk/assets';
import type { GltfHandle } from '@gm/sdk/three';
import { AnimationMixer, PropertyBinding, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { clipLoops, conventions, type Body } from './conventions.js';
import { isRole, vocabulary } from './vocabulary.js';

export interface RiggedCharacterState {
  pos: readonly [number, number, number];
  /** Radians about +Y; 0 faces +Z. */
  yaw: number;
  /** A role (`idle`, `attack.melee.1`) or one of the set's clip names (`Jump_Start`). */
  action: string;
  /** Seconds since the action started. */
  t: number;
}

export interface RiggedCharacter {
  readonly root: Object3D;
  /** Clip names this character can play, in library order. */
  readonly clips: readonly string[];
  sync(state: RiggedCharacterState): void;
  /** Seconds into the action's clip where it lands, once a still has verified it. */
  contactFrame(action: string): number | undefined;
}

export interface RiggedCharacterOptions {
  clipLibraryIds: readonly string[];
  /** Seconds a new action takes to fade in over the last one; 0 cuts. */
  crossFade: number;
}

const decoded = new WeakMap<GltfHandle, Map<string, Promise<GLTF>>>();

/** Each file is fetched and decoded once per glTF handle, so libraries shared by many characters load once. */
function loadGltf(loader: AssetLoader, gltf: GltfHandle, id: string): Promise<GLTF> {
  const { url, file } = loader.resolve(id);
  const files = decoded.get(gltf) ?? new Map<string, Promise<GLTF>>();
  decoded.set(gltf, files);
  const existing = files.get(url);
  if (existing) return existing;
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Failed to fetch asset file ${url}: HTTP ${response.status}`);
      return gltf.decode(await response.arrayBuffer(), file, new URL('.', url).toString());
    })
    .catch((error: unknown) => {
      files.delete(url);
      throw error;
    });
  files.set(url, request);
  return request;
}

function bodyOf(gltf: GLTF, id: string): Body {
  const body = gltf.scene.children
    .map((child) => child.name)
    .find((name) => conventions.bodies.value.includes(name as Body));
  if (!body) throw new Error(`Asset ${id} has no ${conventions.bodies.value.join(' or ')} root node`);
  return body as Body;
}

function nodeNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((object) => names.add(object.name));
  return names;
}

/** Clips transfer by name: refuse a library whose tracks drive a joint the character lacks, naming the joint. */
function retarget(libraryId: string, library: GLTF, characterId: string, joints: Set<string>): AnimationClip[] {
  for (const clip of library.animations) {
    for (const track of clip.tracks) {
      const joint = PropertyBinding.parseTrackName(track.name).nodeName;
      if (!joints.has(joint)) {
        throw new Error(
          `Cannot retarget ${libraryId} onto ${characterId}: clip ${clip.name} drives joint ${joint}, which the character lacks`,
        );
      }
    }
  }
  return library.animations;
}

/**
 * Binds one KayKit character: its `.glb` plus the clip libraries it may play, retargeted by rig id (the libraries
 * all target the shared rig; same joint names mean the clips play unchanged). Loop clips repeat; the rest play once
 * and hold their last pose.
 */
export async function createRiggedCharacter(
  loader: AssetLoader,
  gltf: GltfHandle,
  id: string,
  options: RiggedCharacterOptions,
): Promise<RiggedCharacter> {
  const rigId = loader.resolve(id).meta?.rig?.rig_id;
  if (rigId !== conventions.rigs.value.shared) {
    throw new Error(
      `Asset ${id} is on ${rigId ?? 'no rig'}; KayKit clip libraries target ${conventions.rigs.value.shared}`,
    );
  }

  const [character, ...libraries] = await Promise.all(
    [id, ...options.clipLibraryIds].map((asset) => loadGltf(loader, gltf, asset)),
  );
  const body = bodyOf(character!, id);
  const root = clone(character!.scene);
  const joints = nodeNames(root);

  const clips = new Map<string, AnimationClip>();
  libraries.forEach((library, index) => {
    const libraryId = options.clipLibraryIds[index]!;
    const libraryBody = bodyOf(library, libraryId);
    if (libraryBody !== body) throw new Error(`Clip library ${libraryId} is for ${libraryBody}; ${id} is ${body}`);
    for (const clip of retarget(libraryId, library, id, joints)) {
      if (!clips.has(clip.name)) clips.set(clip.name, clip);
    }
  });

  const mixer = new AnimationMixer(root);
  const actions = new Map<AnimationClip, AnimationAction>();
  const actionFor = (clip: AnimationClip) => {
    let action = actions.get(clip);
    if (!action) {
      action = mixer.clipAction(clip);
      action.play();
      actions.set(clip, action);
    }
    return action;
  };

  const lookup = (action: string): AnimationClip => {
    const names: readonly string[] = isRole(action) ? vocabulary[action] : [action];
    for (const name of names) {
      const clip = clips.get(name);
      if (clip) return clip;
    }
    throw new Error(`Asset ${id} has no clip for ${action} (tried ${names.join(', ') || 'none: the set has none'})`);
  };

  const clipTime = (clip: AnimationClip, t: number) => {
    if (!clipLoops(clip.name)) return Math.min(Math.max(t, 0), clip.duration);
    return clip.duration > 0 ? ((t % clip.duration) + clip.duration) % clip.duration : 0;
  };

  let current: AnimationClip | undefined;
  let lastT = 0;
  let fading: { clip: AnimationClip; t: number } | undefined;

  return {
    root,
    clips: [...clips.keys()],
    sync({ pos, yaw, action, t }) {
      const clip = lookup(action);
      if (clip !== current) {
        fading = current ? { clip: current, t: lastT } : undefined;
        current = clip;
      }
      lastT = t;

      const weight = fading && options.crossFade > 0 ? Math.min(Math.max(t / options.crossFade, 0), 1) : 1;
      if (weight >= 1) fading = undefined;
      for (const other of actions.values()) other.setEffectiveWeight(0);
      const next = actionFor(clip);
      next.time = clipTime(clip, t);
      next.setEffectiveWeight(weight);
      if (fading) {
        const last = actionFor(fading.clip);
        last.time = clipTime(fading.clip, fading.t + t);
        last.setEffectiveWeight(1 - weight);
      }

      root.position.set(pos[0], pos[1], pos[2]);
      root.rotation.y = yaw;
      mixer.update(0);
    },
    contactFrame(action) {
      return conventions.contactFrames.value[lookup(action).name];
    },
  };
}
