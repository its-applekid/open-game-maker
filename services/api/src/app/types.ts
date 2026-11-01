import type { BlobStore } from '@ogm/blob-store';
import type { AiurClient } from '@ogm/aiur-client';
import type { Principal } from '@ogm/contracts';
import type { Db, Sqlite } from '@ogm/db';

import type { AppEvents } from './events.js';
import type { Registry } from './registry.js';

export type LogLine = Record<string, unknown>;

export interface AppDeps {
  db: Db;
  sqlite: Sqlite;
  config: {
    internalToken: string;
    jobTokenSecret: string;
    blobSigningKey: string;
    appOrigin: string;
    commitInternalUrl: string;
    commitServiceToken: string;
    gameTemplateRef: string;
    gamesRoot: string;
    vapidKeyFile: string;
    vapidSubject: string;
    analyticsRetentionDays: number;
    defaultDailyAllowanceMicroUsd: number;
    resetZoneDefault: string;
  };
  blobStore: BlobStore;
  events: AppEvents;
  registry: Registry;
  aiurClientForRepo: (repo: string) => Promise<AiurClient>;
  version: string;
  startedAtMs: number;
  log: (line: LogLine) => void;
}

export type ApiBindings = {
  Variables: { deps: AppDeps; principal: Principal; requestId: string };
};
