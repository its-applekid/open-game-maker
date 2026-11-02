import { createHash } from 'node:crypto';

import type { Node, Skin } from '@gltf-transform/core';
import type { Rig } from '@ogm/contracts';

export type JointPair = { name: string; parentJoint: string | null };

export function rigIdFromJoints(joints: JointPair[]): string {
  const stable = joints
    .map(({ name, parentJoint }) => ({ name, parentJoint }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || (left.parentJoint ?? '').localeCompare(right.parentJoint ?? ''),
    );
  return `rig:${createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 12)}`;
}

function nearestJointParent(joint: Node, joints: Set<Node>): Node | null {
  let parent = joint.getParentNode();
  while (parent && !joints.has(parent)) parent = parent.getParentNode();
  return parent;
}

function normalized(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function measureRig(skin: Skin): Rig {
  const nodes = skin.listJoints();
  const set = new Set(nodes);
  const pairs = nodes.map((joint) => ({
    name: joint.getName(),
    parentJoint: nearestJointParent(joint, set)?.getName() ?? null,
  }));
  const names = new Set(nodes.map((joint) => normalized(joint.getName())));
  const has = (part: string) => [...names].some((name) => name === part || name.endsWith(part));
  const humanoid = has('hips') && has('spine') && has('head');

  return {
    rig_type: humanoid ? 'humanoid' : 'creature',
    rig_id: rigIdFromJoints(pairs),
    joint_count: nodes.length,
  };
}
