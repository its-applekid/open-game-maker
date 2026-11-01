import { homedir } from 'node:os';
import { join } from 'node:path';

import { serve } from '@hono/node-server';

import { FsBlobStore } from '@ogm/blob-store';
import { startFeedConsumers } from '@ogm/builder';
import { migrate, openDb } from '@ogm/db';

import { createApp } from './app/app.js';
import { API_HOST, loadApiEnv } from './app/env.js';
import { createAppEvents } from './app/events.js';
import { createRegistry } from './app/registry.js';
import { scanRoutes } from './app/routes-scan.js';
import type { AppDeps, LogLine } from './app/types.js';
import { readGitVersion } from './app/version.js';
import { startAnalyticsRetention } from './analytics/retention.js';
import { createChatJobDirectory } from './build-chat/job-directory.js';
import { createDaemonDirectory } from './jobs/daemons.js';
import { activeJobs, byTicket } from './jobs/repo.js';
import { applyAiurEvent, applyIssueSnapshot, applyProgress } from './jobs/projection.js';
import { startScheduler } from './jobs/scheduler.js';
import { markPaused, markRunning, markTerminal } from './jobs/spend-cap.js';

const log = (line: LogLine) => console.log(JSON.stringify({ service: 'api', ...line }));

const env = loadApiEnv();
const { sqlite, db } = openDb(join(env.OGM_DATA_DIR, 'ogm.sqlite3'));
log({ event: 'migrated', ...migrate({ sqlite }) });
const daemonDirectory = createDaemonDirectory(db, homedir());

const deps: AppDeps = {
  db,
  sqlite,
  config: {
    internalToken: env.OGM_INTERNAL_TOKEN,
    jobTokenSecret: env.OGM_JOB_TOKEN_SECRET,
    blobSigningKey: env.OGM_BLOB_SIGNING_KEY,
    appOrigin: env.OGM_APP_ORIGIN,
    commitInternalUrl: env.OGM_COMMIT_INTERNAL_URL,
    commitServiceToken: env.OGM_COMMIT_SERVICE_TOKEN,
    gameTemplateRef: env.OGM_GAME_TEMPLATE_REF,
    gamesRoot: env.OGM_GAMES_ROOT ?? join(env.OGM_DATA_DIR, '..', 'games'),
    vapidKeyFile: env.OGM_VAPID_KEY_FILE,
    vapidSubject: `mailto:${env.OGM_VAPID_SUBJECT}`,
    builderWorkspacesRoot: env.OGM_BUILDER_WORKSPACES_ROOT,
    chatPollMs: env.OGM_CHAT_POLL_MS,
    analyticsRetentionDays: env.OGM_ANALYTICS_RETENTION_DAYS,
    defaultDailyAllowanceMicroUsd: env.OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD,
    resetZoneDefault: env.OGM_RESET_ZONE_DEFAULT,
    intakeDir: env.OGM_INTAKE_DIR,
    reportBundleMaxBytes: env.OGM_REPORT_BUNDLE_MAX_BYTES,
  },
  blobStore: new FsBlobStore({
    root: env.OGM_BLOB_ROOT,
    signingKey: env.OGM_BLOB_SIGNING_KEY,
    publicOrigin: env.OGM_PUBLIC_ORIGIN,
  }),
  events: createAppEvents(log),
  registry: createRegistry(),
  aiurClientForRepo: daemonDirectory.clientForRepo,
  version: readGitVersion(),
  startedAtMs: Date.now(),
  log,
};
deps.registry.chatJobs = createChatJobDirectory(db);
deps.registry.aiurClientFor = daemonDirectory.clientForSlug;

const budgetDefaults = {
  dailyAllowanceMicroUsd: deps.config.defaultDailyAllowanceMicroUsd,
  resetZone: deps.config.resetZoneDefault,
};
const lifecycleDeps = { db, sqlite, events: deps.events, defaults: budgetDefaults };
const projectionDeps = {
  db,
  events: deps.events,
  jobs: { byTicket: (daemonSlug: string, ticket: string) => byTicket(db, daemonSlug, ticket) },
  lifecycle: {
    markRunning: (jobId: string) => void markRunning(lifecycleDeps, jobId),
    markPaused: (jobId: string, reason: 'over_reservation' | 'budget_exhausted' | 'admin') =>
      void markPaused(lifecycleDeps, jobId, reason),
    markTerminal: (jobId: string, state: 'done' | 'failed' | 'cancelled') =>
      void markTerminal(lifecycleDeps, jobId, state),
  },
};

const stopAnalyticsRetention = startAnalyticsRetention({
  sqlite,
  retentionDays: deps.config.analyticsRetentionDays,
  log,
});
const stopScheduler = startScheduler({ ...lifecycleDeps, log });
const feed = startFeedConsumers({
  fleet: daemonDirectory.fleet,
  db,
  activeJobs: (daemonSlug) => activeJobs(db, daemonSlug),
  apply: {
    record: (daemonSlug, record) => void applyAiurEvent(projectionDeps, daemonSlug, record),
    issue: (daemonSlug, ticket, issue) => void applyIssueSnapshot(projectionDeps, daemonSlug, ticket, issue),
    progress: (daemonSlug, ticket, progress) => void applyProgress(projectionDeps, daemonSlug, ticket, progress),
  },
  log,
});

const app = createApp(deps);
for (const { prefix, file } of (await scanRoutes(app, { deps })).mounted) log({ event: 'mounted', prefix, file });

const server = serve({ fetch: app.fetch, hostname: API_HOST, port: env.OGM_API_PORT });
server.once('listening', () => log({ event: 'listening', host: API_HOST, port: env.OGM_API_PORT }));
process.once('SIGTERM', () => {
  stopAnalyticsRetention();
  stopScheduler();
  void feed.stop().finally(() => server.close(() => sqlite.close()));
});
