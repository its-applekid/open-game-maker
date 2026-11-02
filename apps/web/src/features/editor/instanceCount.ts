import type { StoreApi } from 'zustand/vanilla';

import type { Entity, GameManifest, PlacementResult, Pose } from '@ogm/contracts';

import { poseFromProps } from './canvas';
import type { GameFrameController } from './frame';
import type { EditorSessionState } from './session';
import { createEntityIntent, createStableId, deleteEntityIntent } from './transactions';

export type InstanceCountChange = {
  direction: -1 | 1;
  prefab: string;
  targetIds: readonly string[];
};

export async function changeInstanceCount(
  change: InstanceCountChange,
  manifest: GameManifest,
  frame: GameFrameController,
  session: StoreApi<EditorSessionState>,
  validationTimeoutMs = 3_000,
): Promise<PlacementResult> {
  const state = session.getState();
  if (state.readOnly) return { ok: false, reason: 'Editing is read only.' };

  if (change.direction === -1) {
    const entity = lastTarget(state.doc.entities, change.targetIds);
    if (entity === undefined) return { ok: false, reason: 'There is no instance to remove.' };
    await state.submit(deleteEntityIntent(state.doc, entity.id, `Removed ${change.prefab}`));
    return { ok: true };
  }

  const anchor = lastTarget(state.doc.entities, change.targetIds);
  const pose = adjacentPose(anchor, manifest.grid?.size ?? 1);
  const result = await validatePlacement(frame, change.prefab, pose, validationTimeoutMs);
  if (!result.ok) return result;

  const entity: Entity = {
    id: createStableId('e_'),
    prefab: change.prefab,
    level: anchor?.level ?? manifest.view,
    origin: 'creator',
    props: { pose },
  };
  await session.getState().submit(createEntityIntent(session.getState().doc, entity, `Added ${change.prefab}`));
  return { ok: true };
}

function validatePlacement(
  frame: GameFrameController,
  prefab: string,
  pose: Pose,
  timeoutMs: number,
): Promise<PlacementResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stop: () => void = () => undefined;
    const finish = (result: PlacementResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'Placement validation timed out.' }), timeoutMs);
    stop = frame.onPlacement(finish);
    frame.validatePlacement(prefab, pose);
  });
}

function adjacentPose(anchor: Entity | undefined, step: number): Pose {
  const pose = poseFromProps(anchor?.props.pose);
  return { ...pose, position: [pose.position[0] + step, pose.position[1], pose.position[2]] };
}

function lastTarget(entities: Record<string, Entity>, targetIds: readonly string[]): Entity | undefined {
  return [...targetIds]
    .reverse()
    .map((id) => entities[id])
    .find((entity) => entity !== undefined);
}
