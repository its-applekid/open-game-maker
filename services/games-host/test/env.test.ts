import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadGamesHostEnv } from '../src/env.js';

const validEnvironment = {
  OGM_GAMES_PORT: '3400',
  OGM_GAMES_ROOT: './games',
  OGM_APP_ORIGIN: 'https://ogm2000.netlify.app',
};

describe('games-host environment', () => {
  it('loads the loopback-only service configuration', () => {
    expect(loadGamesHostEnv(validEnvironment)).toEqual({
      appOrigin: 'https://ogm2000.netlify.app',
      host: '127.0.0.1',
      port: 3400,
      root: resolve('./games'),
    });
  });

  it('accepts multiple explicit frame ancestors', () => {
    expect(
      loadGamesHostEnv({
        ...validEnvironment,
        OGM_APP_ORIGIN: 'https://ogm2000.netlify.app http://127.0.0.1:5173',
      }).appOrigin,
    ).toBe('https://ogm2000.netlify.app http://127.0.0.1:5173');
  });

  it.each(['0', '65536', '3.5', 'port'])('rejects invalid port %s', (port) => {
    expect(() => loadGamesHostEnv({ ...validEnvironment, OGM_GAMES_PORT: port })).toThrow(
      'OGM_GAMES_PORT must be an integer from 1 to 65535',
    );
  });

  it.each(['ftp://example.test', 'https://example.test/path', 'https://example.test; script-src *'])(
    'rejects invalid app origin %s',
    (appOrigin) => {
      expect(() => loadGamesHostEnv({ ...validEnvironment, OGM_APP_ORIGIN: appOrigin })).toThrow(
        'OGM_APP_ORIGIN must contain HTTP(S) origins',
      );
    },
  );
});
