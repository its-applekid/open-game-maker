import type { EnvKind } from './kinds.js';

export const OGM_ENV_UNITS = [
  'api',
  'rooms',
  'games',
  'commit',
  'voice-host',
  'intake',
  'drive-sync',
  'aiur',
  'backup',
] as const;

export type EnvUnit = (typeof OGM_ENV_UNITS)[number] | 'shared';

export type EnvName = {
  readonly name: string;
  readonly unit: EnvUnit;
  readonly kind: EnvKind;
  readonly doc: string;
};

export const OGM_ENV_NAMES: readonly EnvName[] = [
  { name: 'OGM_API_PORT', unit: 'api', kind: 'port', doc: 'loopback port of the API' },
  { name: 'OGM_ROOMS_PORT', unit: 'rooms', kind: 'port', doc: 'loopback port of the Colyseus relay' },
  { name: 'OGM_GAMES_PORT', unit: 'games', kind: 'port', doc: 'loopback port of the games origin host' },
  { name: 'OGM_COMMIT_PORT', unit: 'commit', kind: 'port', doc: 'loopback port of the commit service' },
  { name: 'OGM_VOICE_PORT', unit: 'voice-host', kind: 'port', doc: 'loopback port of the voice host' },
  { name: 'OGM_PUBLIC_ORIGIN', unit: 'shared', kind: 'url', doc: 'https://applekid.tailee0e71.ts.net:8443' },
  { name: 'OGM_GAMES_ORIGIN', unit: 'shared', kind: 'url', doc: 'https://applekid.tailee0e71.ts.net:10000' },
  { name: 'OGM_APP_ORIGIN', unit: 'shared', kind: 'url', doc: 'https://ogm2000.netlify.app (frame-ancestors, CORS)' },
  { name: 'OGM_DATA_DIR', unit: 'shared', kind: 'path', doc: '~/.local/share/ogm/data (SQLite, state)' },
  { name: 'OGM_BLOB_ROOT', unit: 'shared', kind: 'path', doc: '~/.local/share/ogm/blobs' },
  { name: 'OGM_GAMES_ROOT', unit: 'games', kind: 'path', doc: '~/.local/share/ogm/games (release directories)' },
  { name: 'OGM_BLOB_SIGNING_KEY', unit: 'api', kind: 'secret', doc: 'HMAC key for signed blob URLs' },
  { name: 'OGM_SESSION_SECRET', unit: 'api', kind: 'secret', doc: 'Better Auth secret' },
  { name: 'OGM_WS_TOKEN_SECRET', unit: 'shared', kind: 'secret', doc: 'HS256 key for room/chat grants (api, rooms)' },
  {
    name: 'OGM_VOICE_TOKEN_SECRET',
    unit: 'shared',
    kind: 'secret',
    doc: 'HMAC key for voice tokens (api, voice-host)',
  },
  { name: 'OGM_COMMIT_SERVICE_TOKEN', unit: 'shared', kind: 'secret', doc: 'backend -> commit service bearer' },
  { name: 'AIUR_API_URL', unit: 'api', kind: 'url', doc: 'http://127.0.0.1:4001 (platform) or the daemon in question' },
  { name: 'AIUR_API_TOKEN', unit: 'api', kind: 'secret', doc: 'one write token per daemon; never in the sandbox' },
  { name: 'AIUR_ERLANG_COOKIE', unit: 'aiur', kind: 'secret', doc: 'aiur run --container cookie (>= 16 chars)' },
  { name: 'GITHUB_TOKEN', unit: 'aiur', kind: 'secret', doc: 'machine-user bot PAT for game repos (aiur name)' },
  { name: 'GITHUB_APP_ID', unit: 'commit', kind: 'string', doc: 'OGM GitHub App id' },
  { name: 'GITHUB_APP_INSTALLATION_ID', unit: 'commit', kind: 'string', doc: "installation id on Kevin's account" },
  { name: 'GITHUB_APP_PRIVATE_KEY_PATH', unit: 'commit', kind: 'path', doc: 'PEM path under ~/.config/ogm' },
  { name: 'OGM_BACKUP_TARGET', unit: 'backup', kind: 'string', doc: 'ssh:<host>:<path> or local:<path>' },
];
