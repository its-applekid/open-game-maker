import { describe, expect, it } from 'vitest';

import { registryProfile } from '../src/profile.js';
import {
  CORE_RELEASE_SET_PATH,
  coreReleaseSetText,
  isCorePackageName,
  readCoreReleaseSet,
  releasedSpecifier,
} from '../src/release-set.js';

const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';
const npmjs = registryProfile({ scope: '@open-game-maker' });

const versions = new Map([
  ['@ogm/contracts', '0.0.0-core.3cef9ec65caa'],
  ['@gm/sdk', '0.0.0-core.3cef9ec65caa'],
  ['@gm/pack-kaykit', '0.0.0-core.3cef9ec65caa'],
]);

function document(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: 1, core: { sha: SHA, registry: npmjs.registry, scope: npmjs.scope, ...overrides } });
}

describe('releasedSpecifier', () => {
  it('aliases a source name to the destination scope so imports keep working', () => {
    expect(releasedSpecifier('@gm/sdk', '0.0.0-core.3cef9ec65caa', npmjs)).toBe(
      'npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa',
    );
  });

  it('keeps the bare version when the destination registry accepts the source scope', () => {
    expect(releasedSpecifier('@gm/sdk', '0.0.0-core.3cef9ec65caa', registryProfile({ scope: '@gm' }))).toBe(
      '0.0.0-core.3cef9ec65caa',
    );
  });
});

describe('coreReleaseSetText', () => {
  it('writes a deterministic set keyed by source name', () => {
    const text = coreReleaseSetText({ sha: SHA, profile: npmjs, versions });
    expect(text.endsWith('\n')).toBe(true);
    expect(coreReleaseSetText({ sha: SHA.toUpperCase(), profile: npmjs, versions })).toBe(text);
    expect(JSON.parse(text)).toEqual({
      v: 1,
      core: {
        sha: SHA,
        registry: 'https://registry.npmjs.org',
        scope: '@open-game-maker',
        packages: {
          '@gm/pack-kaykit': 'npm:@open-game-maker/pack-kaykit@0.0.0-core.3cef9ec65caa',
          '@gm/sdk': 'npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa',
          '@ogm/contracts': 'npm:@open-game-maker/contracts@0.0.0-core.3cef9ec65caa',
        },
      },
    });
  });

  it('refuses an empty set or a commit that is not a full sha', () => {
    expect(() => coreReleaseSetText({ sha: SHA, profile: npmjs, versions: new Map() })).toThrow(/empty/);
    expect(() => coreReleaseSetText({ sha: '3cef9ec', profile: npmjs, versions })).toThrow(/40-character/);
  });
});

describe('readCoreReleaseSet', () => {
  it('round-trips what coreReleaseSetText writes', () => {
    const read = readCoreReleaseSet(coreReleaseSetText({ sha: SHA, profile: npmjs, versions }));
    expect(read).toMatchObject({
      ok: true,
      set: {
        sha: SHA,
        registry: 'https://registry.npmjs.org',
        scope: '@open-game-maker',
        packages: { '@gm/sdk': 'npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa' },
      },
    });
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '[]'],
    ['a newer schema', JSON.stringify({ v: 2, core: {} })],
    ['no core object', JSON.stringify({ v: 1 })],
    ['a short sha', document({ sha: 'abc123' })],
    ['a non-http registry', document({ registry: 'registry.npmjs.org' })],
    ['a scope without @', document({ scope: 'open-game-maker' })],
    ['an empty package map', document({ packages: {} })],
    ['an unscoped key', document({ packages: { sdk: '0.0.0-core.3cef9ec65caa' } })],
    ['a range instead of a version', document({ packages: { '@gm/sdk': '^0.0.0-core.3cef9ec65caa' } })],
    ['an alias without a version', document({ packages: { '@gm/sdk': 'npm:@open-game-maker/sdk' } })],
  ])('refuses %s', (_label, text) => {
    expect(readCoreReleaseSet(text).ok).toBe(false);
  });

  it('names the file in every refusal so an operator knows what to fix', () => {
    const read = readCoreReleaseSet('{}');
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toContain(CORE_RELEASE_SET_PATH);
  });
});

describe('isCorePackageName', () => {
  it('recognises the core scopes and leaves instance packages alone', () => {
    expect(isCorePackageName('@gm/sdk')).toBe(true);
    expect(isCorePackageName('@ogm/contracts')).toBe(true);
    expect(isCorePackageName('@game/my-game')).toBe(false);
  });
});
