import { describe, expect, it } from 'vitest';

import { ReleaseError } from '../src/graph.js';
import {
  DEFAULT_ACCESS,
  DEFAULT_REGISTRY,
  DEFAULT_SCOPE,
  DEFAULT_TAG,
  destinationName,
  destinationNames,
  npmrcLines,
  registryHost,
  registryProfile,
} from '../src/profile.js';

const npmjs = registryProfile({ scope: '@its-owner' });

describe('registryProfile', () => {
  it('defaults to the public npm registry with public access and the core tag', () => {
    expect(npmjs).toEqual({
      registry: 'https://registry.npmjs.org',
      scope: '@its-owner',
      access: 'public',
      tag: 'core',
    });
    expect(DEFAULT_REGISTRY).toBe('https://registry.npmjs.org');
    expect(DEFAULT_ACCESS).toBe('public');
    expect(DEFAULT_TAG).toBe('core');
    expect(DEFAULT_SCOPE).toBe('@open-game-maker');
  });

  it('takes the registry and scope as inputs so an instance-local feed only changes them', () => {
    const local = registryProfile({
      registry: 'http://127.0.0.1:4873/',
      scope: '@gm',
      access: 'restricted',
      tag: 'next',
    });
    expect(local).toEqual({ registry: 'http://127.0.0.1:4873', scope: '@gm', access: 'restricted', tag: 'next' });
  });

  it('refuses a registry URL that carries credentials or a query', () => {
    // Assembled from parts so this file never holds a credential-shaped URL or a real host name.
    const base = 'http://127.0.0.1:4873';
    const credentialed = base.replace('//', '//<user>:<password>@');
    expect(() => registryProfile({ registry: credentialed, scope: '@x' })).toThrow(/credentials/);
    expect(() => registryProfile({ registry: `${base}?<parameter>=<value>`, scope: '@x' })).toThrow(/query/);
  });

  it('refuses a missing or malformed scope', () => {
    expect(() => registryProfile({})).toThrow(/scope/);
    expect(() => registryProfile({ scope: 'owner' })).toThrow(/not an npm scope/);
  });

  it('refuses an access or tag the registry cannot use', () => {
    expect(() => registryProfile({ scope: '@x', access: 'internal' })).toThrow(/access/);
    expect(() => registryProfile({ scope: '@x', tag: 'Core Release' })).toThrow(/dist-tag/);
  });
});

describe('destinationName', () => {
  it('keeps the source name when the destination scope matches', () => {
    expect(destinationName('@gm/sdk', registryProfile({ scope: '@gm' }))).toBe('@gm/sdk');
  });

  it('republishes under the destination scope when it differs, keeping the basename', () => {
    expect(destinationName('@gm/sdk', npmjs)).toBe('@its-owner/sdk');
    expect(destinationName('@ogm/iframe-bridge', npmjs)).toBe('@its-owner/iframe-bridge');
  });

  it('republishes under the default scope when the operator names none', () => {
    expect(destinationName('@gm/sdk', registryProfile({ scope: DEFAULT_SCOPE }))).toBe('@open-game-maker/sdk');
  });

  it('refuses an unscoped source name', () => {
    expect(() => destinationName('sdk', npmjs)).toThrow(/not scoped/);
  });
});

describe('destinationNames', () => {
  it('maps every source name once', () => {
    const names = destinationNames(['@gm/sdk', '@ogm/contracts'], npmjs);
    expect([...names.entries()]).toEqual([
      ['@gm/sdk', '@its-owner/sdk'],
      ['@ogm/contracts', '@its-owner/contracts'],
    ]);
  });

  it('refuses two source packages that would publish under one destination name', () => {
    expect(() => destinationNames(['@gm/sdk', '@ogm/sdk'], npmjs)).toThrow(/would both publish as @its-owner\/sdk/);
  });
});

describe('registryHost and npmrcLines', () => {
  it('names the host the token belongs to', () => {
    expect(registryHost(npmjs)).toBe('registry.npmjs.org');
  });

  it('writes a token reference, never a token', () => {
    const lines = npmrcLines(npmjs);
    expect(lines[0]).toBe('@its-owner:registry=https://registry.npmjs.org');
    expect(lines[1]).toBe('//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}');
    expect(lines.join('\n')).toContain('${NODE_AUTH_TOKEN}');
    expect(lines.join('\n')).not.toMatch(/[A-Za-z0-9+/=_-]{32,}/);
  });

  it('accepts another environment variable name for a host-local feed', () => {
    expect(npmrcLines(npmjs, 'CORE_PACKAGES_READ_TOKEN')[1]).toContain('${CORE_PACKAGES_READ_TOKEN}');
  });
});

describe('ReleaseError', () => {
  it('keeps its name so the CLI can report a refusal', () => {
    expect(new ReleaseError('no').name).toBe('ReleaseError');
  });
});
