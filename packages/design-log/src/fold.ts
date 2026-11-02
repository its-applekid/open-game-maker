import type { DesignDoc, EntityOverride, OverrideEntry, WorkingSet } from '@ogm/contracts';

import { canonical } from './canonical.js';
import { sha256Canonical } from './hash.js';

export type FoldResult = {
  files: { path: string; content: string }[];
  doc: DesignDoc;
  sha256: string;
};

function cloneDoc(baseDoc: DesignDoc): DesignDoc {
  return JSON.parse(canonical(baseDoc)) as DesignDoc;
}

function applyEntityCreate(doc: DesignDoc, operation: Extract<EntityOverride, { kind: 'create' }>): void {
  doc.entities[operation.entityId] = {
    id: operation.entityId,
    prefab: operation.prefab,
    level: operation.parent,
    origin: 'creator',
    props: { ...operation.props },
  };
}

function applyEntry(doc: DesignDoc, entry: OverrideEntry): void {
  if (entry.status !== 'carried' && entry.status !== 'renamed') return;
  if (entry.targetId === 'global') {
    doc.globals[entry.controlId] = entry.value;
    return;
  }
  const entity = doc.entities[entry.targetId];
  if (entity !== undefined) entity.props[entry.controlId] = entry.value;
}

export function fold(baseDoc: DesignDoc, workingSet: WorkingSet): FoldResult {
  const doc = cloneDoc(baseDoc);
  const entityOps = Object.values(workingSet.entityOps).sort((left, right) =>
    left.entityId.localeCompare(right.entityId),
  );

  for (const operation of entityOps) {
    if (operation.kind === 'create') applyEntityCreate(doc, operation);
  }
  for (const operation of entityOps) {
    if (operation.kind === 'delete') delete doc.entities[operation.entityId];
  }
  const entries = Object.values(workingSet.entries).sort((left, right) => left.key.localeCompare(right.key));
  for (const entry of entries) applyEntry(doc, entry);

  return {
    files: [{ path: 'design/design.json', content: `${canonical(doc)}\n` }],
    doc,
    sha256: sha256Canonical({ entries: workingSet.entries, entityOps: workingSet.entityOps }),
  };
}
