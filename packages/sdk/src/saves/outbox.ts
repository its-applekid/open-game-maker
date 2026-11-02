import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type SaveSlotId = 'auto' | '1' | '2' | '3';

export type OutboxEntry = {
  key: string;
  gameId: string;
  slotId: SaveSlotId;
  headers: Record<string, string>;
  body: Uint8Array;
  hidden?: boolean;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
};

export type LocalSaveCopy = {
  key: string;
  gameId: string;
  slotId: SaveSlotId;
  label: string;
  body: Uint8Array;
  createdAt: number;
};

interface SavesDatabase extends DBSchema {
  pending: { key: string; value: OutboxEntry };
  copies: { key: string; value: LocalSaveCopy };
}

export class Outbox {
  private constructor(
    readonly name: string,
    private readonly database: IDBPDatabase<SavesDatabase>,
  ) {}

  static async open(name = 'ogm-saves'): Promise<Outbox> {
    const database = await openDB<SavesDatabase>(name, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('copies')) db.createObjectStore('copies', { keyPath: 'key' });
      },
    });
    return new Outbox(name, database);
  }

  static async deleteDatabase(name = 'ogm-saves'): Promise<void> {
    await deleteDB(name);
  }

  async enqueue(entry: OutboxEntry): Promise<void> {
    await this.database.put('pending', entry);
  }

  async pending(): Promise<OutboxEntry[]> {
    return (await this.database.getAll('pending')).sort((left, right) => left.createdAt - right.createdAt);
  }

  async remove(key: string): Promise<void> {
    await this.database.delete('pending', key);
  }

  async keepLocalCopy(copy: LocalSaveCopy): Promise<void> {
    await this.database.put('copies', copy);
  }

  async localCopies(): Promise<LocalSaveCopy[]> {
    return (await this.database.getAll('copies')).sort((left, right) => left.createdAt - right.createdAt);
  }

  close(): void {
    this.database.close();
  }
}
