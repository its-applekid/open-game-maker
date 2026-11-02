import { loadEnv } from '@ogm/config';

const SPEC = {
  OGM_API_INTERNAL_URL: { kind: 'url' },
  OGM_INTERNAL_TOKEN: { kind: 'secret' },
  OGM_GAMES_ROOT: { kind: 'path' },
} as const;

export function loadRepairEnv(source?: Record<string, string | undefined>) {
  const values = loadEnv('repair', SPEC, source);
  return {
    apiInternalUrl: values.OGM_API_INTERNAL_URL,
    internalToken: values.OGM_INTERNAL_TOKEN,
    gamesRoot: values.OGM_GAMES_ROOT,
  };
}
