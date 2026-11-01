import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FsBlobStore } from '@ogm/blob-store';
import { migrate, openDb } from '@ogm/db';

import { createApp } from '../src/app/app.js';
import { createAppEvents } from '../src/app/events.js';
import { createRegistry } from '../src/app/registry.js';
import { scanRoutes } from '../src/app/routes-scan.js';
import type { AppDeps, LogLine } from '../src/app/types.js';

export const INTERNAL_TOKEN = 'internal-token-for-tests-0123456789';
export const JOB_SECRET = 'job-token-secret-for-tests-0123456789';
export const BLOB_KEY = 'blob-signing-key-for-tests-with-32-bytes';

export function makeDeps(): AppDeps & { lines: LogLine[] } {
  const { sqlite, db } = openDb(':memory:');
  migrate({ sqlite });
  const lines: LogLine[] = [];
  const privateDirectory = mkdtempSync(join(tmpdir(), 'ogm-api-private-'));
  const log = (line: LogLine) => {
    lines.push(line);
  };
  return {
    db,
    sqlite,
    config: {
      internalToken: INTERNAL_TOKEN,
      jobTokenSecret: JOB_SECRET,
      blobSigningKey: BLOB_KEY,
      vapidKeyFile: join(privateDirectory, 'ogm-api.vapid.json'),
      vapidSubject: 'mailto:operator@example.test',
    },
    blobStore: new FsBlobStore({
      root: mkdtempSync(join(tmpdir(), 'ogm-api-blobs-')),
      signingKey: BLOB_KEY,
      publicOrigin: 'https://api.example.test:8443',
    }),
    events: createAppEvents(log),
    registry: createRegistry(),
    version: 'test-version',
    startedAtMs: Date.now() - 5_000,
    log,
    lines,
  };
}

// The production app: middleware plus every context under src/.
export async function makeApp(deps = makeDeps()) {
  const app = createApp(deps);
  const { mounted } = await scanRoutes(app, { deps });
  return { app, deps, mounted };
}
