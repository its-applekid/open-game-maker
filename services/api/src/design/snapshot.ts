import type { DesignDoc } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';
import { replay } from '@ogm/design-log';

import type { BaseDocSource } from './base-doc.js';
import { readChain } from './store.js';

export const EMPTY_DESIGN_DOC: DesignDoc = {
  schemaVersion: 1,
  globals: {},
  entities: {},
};

export async function snapshotAt(
  sqlite: Sqlite,
  source: BaseDocSource,
  branchId: string,
  requestedRev?: number,
): Promise<{ rev: number; buildId: string | null; doc: DesignDoc }> {
  const chain = readChain(sqlite, branchId);
  const leaf = chain.at(-1)?.branch;
  if (!leaf) throw new Error('design branch has no replay chain');
  const rev = requestedRev === undefined ? leaf.headRev : Math.min(requestedRev, leaf.headRev);
  const baseDoc = leaf.latestBuildId ? await source.load(leaf.gameId, leaf.latestBuildId) : EMPTY_DESIGN_DOC;
  const result = replay({ baseDoc: structuredClone(baseDoc), chain }, rev);
  return { rev: result.headRev, buildId: leaf.latestBuildId, doc: result.doc };
}
