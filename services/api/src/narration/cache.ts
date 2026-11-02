import type { BlobHash, BlobStore } from '@ogm/blob-store';
import type { Sqlite } from '@ogm/db';

export type NarrationCacheEntry = {
  audioHash: BlobHash;
  alignmentHash: BlobHash;
};

const blobHash = /^sha256:[0-9a-f]{64}$/;
const paths = (key: string) => ({ audio: `narration/${key}.opus`, alignment: `narration/${key}.json` });

export class NarrationCache {
  constructor(
    private readonly sqlite: Sqlite,
    private readonly blobs: BlobStore,
  ) {}

  async get(key: string): Promise<NarrationCacheEntry | null> {
    const names = paths(key);
    const rows = this.sqlite
      .prepare<[string, string], { key: string; value: string }>('SELECT key, value FROM app_meta WHERE key IN (?, ?)')
      .all(names.audio, names.alignment);
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const audioHash = values.get(names.audio);
    const alignmentHash = values.get(names.alignment);
    if (!audioHash || !alignmentHash || !blobHash.test(audioHash) || !blobHash.test(alignmentHash)) return null;

    const entry = { audioHash: audioHash as BlobHash, alignmentHash: alignmentHash as BlobHash };
    const [audio, alignment] = await Promise.all([
      this.blobs.head(entry.audioHash),
      this.blobs.head(entry.alignmentHash),
    ]);
    if (audio && alignment) return entry;
    this.delete(key);
    return null;
  }

  put(key: string, entry: NarrationCacheEntry): void {
    const names = paths(key);
    this.sqlite.transaction(() => {
      const write = this.sqlite.prepare(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      );
      write.run(names.audio, entry.audioHash);
      write.run(names.alignment, entry.alignmentHash);
    })();
  }

  private delete(key: string): void {
    const names = paths(key);
    this.sqlite.prepare('DELETE FROM app_meta WHERE key IN (?, ?)').run(names.audio, names.alignment);
  }
}
