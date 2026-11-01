import { homedir } from 'node:os';
import { join } from 'node:path';

import { ConfigError, loadEnv } from '@ogm/config';

export const API_HOST = '127.0.0.1';
const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const apiEnvSpec = {
  OGM_API_PORT: { kind: 'port' },
  OGM_ANALYTICS_RETENTION_DAYS: { kind: 'int', default: '90' },
  OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD: { kind: 'int', default: '5000000' },
  OGM_RESET_ZONE_DEFAULT: { kind: 'string', default: hostTimeZone },
  OGM_INTAKE_DIR: { kind: 'path', required: false },
  OGM_REPORT_BUNDLE_MAX_BYTES: { kind: 'int', default: '2097152' },
  OGM_DATA_DIR: { kind: 'path' },
  OGM_GAMES_ROOT: { kind: 'path', required: false },
  OGM_INTERNAL_TOKEN: { kind: 'secret' },
  OGM_JOB_TOKEN_SECRET: { kind: 'secret' },
  OGM_BLOB_ROOT: { kind: 'path' },
  OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
  OGM_PUBLIC_ORIGIN: { kind: 'url' },
  OGM_APP_ORIGIN: { kind: 'url' },
  OGM_ROOMS_INTERNAL_URL: { kind: 'url' },
  OGM_ROOMS_INTERNAL_SECRET: { kind: 'secret' },
  OGM_WS_TOKEN_SECRET: { kind: 'secret' },
  OGM_COMMIT_INTERNAL_URL: { kind: 'url' },
  OGM_COMMIT_SERVICE_TOKEN: { kind: 'secret' },
  OGM_GAME_TEMPLATE_REF: { kind: 'string', default: 'game-2d@1' },
  OGM_VAPID_KEY_FILE: { kind: 'path', default: join(homedir(), '.config', 'ogm', 'env', 'ogm-api.vapid.json') },
  OGM_VAPID_SUBJECT: { kind: 'string' },
  OGM_VOICE_HOST_INTERNAL_URL: { kind: 'url', required: false },
  OGM_VOICE_INTERNAL_SECRET: { kind: 'secret', required: false },
  OGM_BUILDER_WORKSPACES_ROOT: { kind: 'path', required: false },
  OGM_CHAT_POLL_MS: { kind: 'int', default: '10000' },
} as const;

export function loadApiEnv(source?: Record<string, string | undefined>) {
  const env = loadEnv('api', apiEnvSpec, source);
  if (env.OGM_ANALYTICS_RETENTION_DAYS <= 0) {
    throw new ConfigError('api', [], [{ name: 'OGM_ANALYTICS_RETENTION_DAYS', reason: 'must be a positive integer' }]);
  }
  if (env.OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD <= 0) {
    throw new ConfigError(
      'api',
      [],
      [{ name: 'OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD', reason: 'must be a positive integer' }],
    );
  }
  const voiceUrl = env.OGM_VOICE_HOST_INTERNAL_URL;
  if (voiceUrl !== undefined && !['127.0.0.1', 'localhost'].includes(new URL(voiceUrl).hostname)) {
    throw new ConfigError('api', [], [{ name: 'OGM_VOICE_HOST_INTERNAL_URL', reason: 'must be a loopback URL' }]);
  }
  if (voiceUrl !== undefined && env.OGM_VOICE_INTERNAL_SECRET === undefined) {
    throw new ConfigError('api', ['OGM_VOICE_INTERNAL_SECRET'], []);
  }
  if (env.OGM_REPORT_BUNDLE_MAX_BYTES <= 0) {
    throw new ConfigError('api', [], [{ name: 'OGM_REPORT_BUNDLE_MAX_BYTES', reason: 'must be a positive integer' }]);
  }
  return env;
}
