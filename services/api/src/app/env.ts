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
  OGM_DATA_DIR: { kind: 'path' },
  OGM_GAMES_ROOT: { kind: 'path', required: false },
  OGM_INTERNAL_TOKEN: { kind: 'secret' },
  OGM_JOB_TOKEN_SECRET: { kind: 'secret' },
  OGM_BLOB_ROOT: { kind: 'path' },
  OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
  OGM_PUBLIC_ORIGIN: { kind: 'url' },
  OGM_APP_ORIGIN: { kind: 'url' },
  OGM_COMMIT_INTERNAL_URL: { kind: 'url' },
  OGM_COMMIT_SERVICE_TOKEN: { kind: 'secret' },
  OGM_GAME_TEMPLATE_REF: { kind: 'string', default: 'game-2d@1' },
  OGM_VAPID_KEY_FILE: { kind: 'path', default: join(homedir(), '.config', 'ogm', 'env', 'ogm-api.vapid.json') },
  OGM_VAPID_SUBJECT: { kind: 'string' },
  OGM_VOICE_TOKEN_SECRET: { kind: 'secret', required: false },
  OGM_VOICE_WS_URL: { kind: 'string', required: false },
  OGM_BUILDER_WORKSPACES_ROOT: { kind: 'path', required: false },
  OGM_CHAT_POLL_MS: { kind: 'int', default: '10000' },
} as const;

export function loadApiEnv(source?: Record<string, string | undefined>) {
  const env = loadEnv('api', apiEnvSpec, source);
  if (env.OGM_ANALYTICS_RETENTION_DAYS <= 0) {
    throw new ConfigError('api', [], [{ name: 'OGM_ANALYTICS_RETENTION_DAYS', reason: 'must be a positive integer' }]);
  }
  // The voice host's HMAC issuer refuses a shorter key, so tokens minted with one would never verify.
  if (env.OGM_VOICE_TOKEN_SECRET !== undefined && Buffer.byteLength(env.OGM_VOICE_TOKEN_SECRET) < 32) {
    throw new ConfigError('api', [], [{ name: 'OGM_VOICE_TOKEN_SECRET', reason: 'shorter than 32 bytes' }]);
  }
  if (env.OGM_VOICE_WS_URL !== undefined) {
    try {
      const protocol = new URL(env.OGM_VOICE_WS_URL).protocol;
      if (protocol !== 'ws:' && protocol !== 'wss:') throw new Error('wrong protocol');
    } catch {
      throw new ConfigError('api', [], [{ name: 'OGM_VOICE_WS_URL', reason: 'must be a ws or wss URL' }]);
    }
  }
  if (env.OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD <= 0) {
    throw new ConfigError(
      'api',
      [],
      [{ name: 'OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD', reason: 'must be a positive integer' }],
    );
  }
  return env;
}
