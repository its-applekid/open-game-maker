import { describe, expect, it } from 'vitest';

import { coreVersion, readCorePin, shortCoreSha } from '../src/version.js';

const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';

describe('shortCoreSha', () => {
  it('takes the first twelve characters, lower case', () => {
    expect(shortCoreSha(SHA.toUpperCase())).toBe('3cef9ec65caa');
  });

  it('refuses anything that is not a 40-character commit id', () => {
    expect(() => shortCoreSha('3cef9ec6')).toThrow(/not a 40-character commit id/);
  });
});

describe('coreVersion', () => {
  it('carries the pinned core commit so one commit can only produce one version', () => {
    expect(coreVersion('0.0.0', SHA)).toBe('0.0.0-core.3cef9ec65caa');
  });

  it('gives a different version for a different commit', () => {
    expect(coreVersion('0.0.0', 'a'.repeat(40))).not.toBe(coreVersion('0.0.0', SHA));
  });

  it('keeps a manifest prerelease and adds the core identifier', () => {
    expect(coreVersion('1.2.3-beta.1', SHA)).toBe('1.2.3-beta.1.core.3cef9ec65caa');
  });

  it('drops a build number from the base version', () => {
    expect(coreVersion('1.2.3+4', SHA)).toBe('1.2.3-core.3cef9ec65caa');
  });

  it('refuses a base version that is not semantic', () => {
    expect(() => coreVersion('latest', SHA)).toThrow(/not a semantic version/);
  });
});

describe('readCorePin', () => {
  it('reads the pin the instance repository keeps in vendor/core.json', () => {
    expect(readCorePin(JSON.stringify({ core: { sha: SHA.toUpperCase() } }))).toEqual({ ok: true, pin: { sha: SHA } });
  });

  it('reports why a pin file cannot be used', () => {
    expect(readCorePin('not json')).toEqual({ ok: false, reason: 'vendor/core.json is not JSON' });
    expect(readCorePin('[]')).toEqual({ ok: false, reason: 'vendor/core.json is not an object' });
    expect(readCorePin('{}')).toEqual({ ok: false, reason: 'vendor/core.json has no core object' });
    expect(readCorePin('{"core":{"sha":"abc"}}')).toEqual({
      ok: false,
      reason: 'core.sha is not a 40-character commit id',
    });
  });
});
