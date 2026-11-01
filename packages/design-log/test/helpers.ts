import type { Branch, DesignDoc, EditorCommand, Patch, Transaction } from '@ogm/contracts';

export const ids = {
  actor: 'u_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  branch: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  branchB: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ',
  build: 'build_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  entity: 'e_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  game: 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  tx: 'tx_01ARZ3NDEKTSV4RRFFQ69G5FAV',
} as const;

export function baseDoc(props: Record<string, unknown> = { 'door.locked': false }): DesignDoc {
  return {
    schemaVersion: 1,
    globals: { 'world.gravity': 9.8 },
    entities: {
      [ids.entity]: {
        id: ids.entity,
        prefab: 'door',
        level: 'level_1',
        origin: 'creator',
        props,
      },
    },
  };
}

export function transaction(
  rev: number,
  commands: EditorCommand[],
  patches: Patch[],
  branchId = ids.branch,
): Transaction {
  return {
    id: `tx_01ARZ3NDEKTSV4RRFFQ69G5FA${String(rev % 32).padStart(1, '0')}`,
    gameId: ids.game,
    branchId,
    rev,
    baseRev: Math.max(0, rev - 1),
    leaseToken: 1,
    actor: ids.actor,
    kind: 'manual',
    label: `revision ${rev}`,
    baseBuildId: ids.build,
    commands,
    patches,
    inverse: [],
    createdAt: '2026-11-01T12:00:00.000Z',
  };
}

export function setTx(rev: number, value: unknown, branchId = ids.branch): Transaction {
  return transaction(
    rev,
    [{ op: 'set', control: 'door.locked', targets: [ids.entity], value }],
    [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value }],
    branchId,
  );
}

export function branch(id: string, headRev: number, forkPoint: Branch['forkPoint'] = null): Branch {
  return {
    id,
    gameId: ids.game,
    name: id === ids.branch ? 'main' : 'branch-b',
    gitRef: `refs/heads/${id}`,
    forkPoint,
    headRev,
    latestBuildId: ids.build,
    status: 'active',
    createdBy: ids.actor,
    createdAt: '2026-11-01T12:00:00.000Z',
  };
}
