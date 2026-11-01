import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { ConfigError, loadEnv, redact } from '../src/index.js';

describe('loadEnv', () => {
  it('returns frozen, typed values for all supported kinds', () => {
    const values = loadEnv(
      'api',
      {
        OGM_API_PORT: { kind: 'port' },
        OGM_PUBLIC_ORIGIN: { kind: 'url' },
        OGM_DATA_DIR: { kind: 'path' },
        OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
        GITHUB_APP_ID: { kind: 'string' },
        OGM_BACKUP_TARGET: { kind: 'string' },
      } as const,
      {
        OGM_API_PORT: '3000',
        OGM_PUBLIC_ORIGIN: 'https://example.test',
        OGM_DATA_DIR: '~/.local/share/ogm/data',
        OGM_BLOB_SIGNING_KEY: 'hunter2-hunter2-hunter2-hunter2',
        GITHUB_APP_ID: '12345',
        OGM_BACKUP_TARGET: 'local:/srv/backup',
      },
    );

    expect(values).toEqual({
      OGM_API_PORT: 3000,
      OGM_PUBLIC_ORIGIN: 'https://example.test',
      OGM_DATA_DIR: `${homedir()}/.local/share/ogm/data`,
      OGM_BLOB_SIGNING_KEY: 'hunter2-hunter2-hunter2-hunter2',
      GITHUB_APP_ID: '12345',
      OGM_BACKUP_TARGET: 'local:/srv/backup',
    });
    expect(typeof values.OGM_API_PORT).toBe('number');
    expect(Object.isFrozen(values)).toBe(true);
  });

  it('uses defaults and parses integers and booleans', () => {
    const values = loadEnv(
      'example',
      {
        OGM_API_PORT: { kind: 'int', default: '42' },
        GITHUB_APP_ID: { kind: 'bool', default: '1' },
      } as const,
      {},
    );

    expect(values).toEqual({ OGM_API_PORT: 42, GITHUB_APP_ID: true });
  });

  it('collects missing names without revealing another value', () => {
    const secret = 'hunter2-hunter2-hunter2-hunter2';

    expect(() =>
      loadEnv(
        'api',
        {
          OGM_API_PORT: { kind: 'port' },
          OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
        } as const,
        { OGM_BLOB_SIGNING_KEY: secret },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ConfigError>>({
        missing: ['OGM_API_PORT'],
        invalid: [],
      }),
    );

    try {
      loadEnv(
        'api',
        {
          OGM_API_PORT: { kind: 'port' },
          OGM_BLOB_SIGNING_KEY: { kind: 'secret' },
        } as const,
        { OGM_BLOB_SIGNING_KEY: secret },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(String(error)).toContain('OGM_API_PORT');
      expect(String(error)).not.toContain(secret);
    }
  });

  it.each([
    ['bad port', 'OGM_API_PORT', 'port', 'abc', 'port'],
    ['out-of-range port', 'OGM_API_PORT', 'port', '65536', 'port'],
    ['non-integer', 'OGM_API_PORT', 'int', '1.5', 'int'],
    ['non-http URL', 'OGM_PUBLIC_ORIGIN', 'url', 'file:///tmp/secret', 'url'],
    ['short secret', 'OGM_BLOB_SIGNING_KEY', 'secret', 'hunter2', 'secret'],
    ['invalid bool', 'GITHUB_APP_ID', 'bool', 'yes', 'bool'],
    ['empty string', 'GITHUB_APP_ID', 'string', '', 'string'],
  ] as const)('rejects a %s without revealing the raw value', (_case, name, kind, raw, reason) => {
    try {
      loadEnv('api', { [name]: { kind } }, { [name]: raw });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).invalid).toEqual([name]);
      expect(String(error)).toContain(reason);
      if (raw.length > 0) {
        expect(String(error)).not.toContain(raw);
      }
    }
  });

  it('rejects an unregistered spec key before reading its value', () => {
    const source = new Proxy<Record<string, string>>(
      {},
      {
        get() {
          throw new Error('source was read');
        },
      },
    );

    expect(() => loadEnv('api', { NOT_REGISTERED: { kind: 'string' } }, source)).toThrowError(
      expect.objectContaining<Partial<ConfigError>>({
        missing: [],
        invalid: ['NOT_REGISTERED'],
      }),
    );
  });

  it('reports whether a name is set without returning its value', () => {
    const source = { OGM_SESSION_SECRET: 'never-return-me' };

    expect(redact('OGM_SESSION_SECRET', source)).toBe('<set>');
    expect(redact('OGM_API_PORT', source)).toBe('<unset>');
  });
});
