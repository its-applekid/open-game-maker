import { ConfigError, loadEnv } from '@ogm/config';

export const API_HOST = '127.0.0.1';

export const apiEnvSpec = {
  OGM_API_PORT: { kind: 'port' },
  OGM_ANALYTICS_RETENTION_DAYS: { kind: 'int', default: '90' },
  OGM_DATA_DIR: { kind: 'path' },
  OGM_INTERNAL_TOKEN: { kind: 'secret' },
  OGM_JOB_TOKEN_SECRET: { kind: 'secret' },
  OGM_BLOB_ROOT: { kind: 'path' },
  OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
  OGM_PUBLIC_ORIGIN: { kind: 'url' },
} as const;

export function loadApiEnv(source?: Record<string, string | undefined>) {
  const env = loadEnv('api', apiEnvSpec, source);
  if (env.OGM_ANALYTICS_RETENTION_DAYS <= 0) {
    throw new ConfigError('api', [], [{ name: 'OGM_ANALYTICS_RETENTION_DAYS', reason: 'must be a positive integer' }]);
  }
  return env;
}
