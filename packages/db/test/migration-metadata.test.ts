import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Journal = {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

type Snapshot = {
  id: string;
  prevId: string;
};

const migrationsDir = new URL('../migrations/', import.meta.url);
const metadataDir = new URL('../migrations/meta/', import.meta.url);

describe('migration metadata', () => {
  it('keeps migrations journaled in timestamp order with chained snapshots', () => {
    const sqlTags = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.slice(0, -'.sql'.length));
    const journal = JSON.parse(readFileSync(new URL('_journal.json', metadataDir), 'utf8')) as Journal;
    const journalTags = journal.entries.map(({ tag }) => tag);

    expect([...journalTags].sort()).toEqual([...sqlTags].sort());
    expect(journal.entries.map(({ idx }) => idx)).toEqual(journal.entries.map((_, idx) => idx));

    const timestamps = journalTags.map((tag) => {
      const match = /^(\d{14})_/.exec(tag);
      expect(match, `migration tag ${tag} must start with a 14-digit timestamp`).not.toBeNull();
      return match![1];
    });
    expect(timestamps).toEqual([...timestamps].sort());

    const newestTimestamp = timestamps.at(-1);
    expect(newestTimestamp).toBeDefined();
    for (const timestamp of timestamps.slice(0, -1)) {
      expect(newestTimestamp!.localeCompare(timestamp)).toBeGreaterThan(0);
    }

    let previousSnapshot: Snapshot | undefined;
    for (const [index, tag] of journalTags.entries()) {
      const snapshotPath = new URL(`${timestamps[index]}_snapshot.json`, metadataDir);
      expect(existsSync(snapshotPath), `missing snapshot for ${tag}`).toBe(true);
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot;

      if (previousSnapshot) expect(snapshot.prevId).toBe(previousSnapshot.id);
      previousSnapshot = snapshot;
    }
  });
});
