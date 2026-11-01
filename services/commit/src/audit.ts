import { constants } from 'node:fs';
import { chmod, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import type { BoundaryVerdict, OperationName } from './types.js';

export type AuditEntry = {
  at: string;
  op: OperationName;
  gameId: string;
  repo: string;
  result: 'allowed' | 'refused' | 'error';
  sha?: string;
  verdict?: BoundaryVerdict;
  actor: 'api';
};

export interface AuditWriter {
  append(entry: AuditEntry): Promise<void>;
}

export class JsonlAuditWriter implements AuditWriter {
  private readonly directory: string;
  private readonly file: string;

  constructor(dataDirectory: string) {
    this.directory = path.join(dataDirectory, 'commit');
    this.file = path.join(this.directory, 'audit.jsonl');
  }

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const handle = await open(this.file, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY, 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(`${JSON.stringify(entry)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
  }
}
