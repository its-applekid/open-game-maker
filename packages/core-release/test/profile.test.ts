import { describe, expect, it } from 'vitest';

import { ReleaseError } from '../src/graph.js';
import {
  DEFAULT_REGISTRY,
  destinationName,
  destinationNames,
  npmrcLines,
  registryHost,
  registryProfile,
} from '../src/profile.js';

const github = registryProfile({ scope: '@its-owner' });

describe('registryProfile', () => {
  it('defaults to GitHub Packages with the access and tag the plan names', () => {
    expect(github).toEqual({
      registry: 'https://npm.pkg.github.com',
      scope: '@its-owner',
      access: 'restricted',
      tag: 'core',
    });
    expect(DEFAULT_REGISTRY).toBe('https://npm.pkg.github.com');
  });

  it('takes the registry and scope as inputs so an instance-local feed only changes them', () => {
    const local = registryProfile({ registry: 'http://127.0.0.1:4873/', scope: '@gm', access: 'public', tag: 'next' });
    expect(local).toEqual({ registry: 'http://127.0.0.1:4873', scope: '@gm', access: 'public', tag: 'next' });
  });

  it('refuses a registry URL that carries credentials or a query', () => {
    expect(() => registryProfile({ registry: 'https://user:pw@npm.pkg.github.com', scope: '@x' })).toThrow(
      /credentials/,
    );
    expect(() => registryProfile({ registry: 'https://npm.pkg.github.com?token=x', scope: '@x' })).toThrow(/query/);
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
    expect(destinationName('@gm/sdk', github)).toBe('@its-owner/sdk');
    expect(destinationName('@ogm/iframe-bridge', github)).toBe('@its-owner/iframe-bridge');
  });

  it('refuses an unscoped source name', () => {
    expect(() => destinationName('sdk', github)).toThrow(/not scoped/);
  });
});

describe('destinationNames', () => {
  it('maps every source name once', () => {
    const names = destinationNames(['@gm/sdk', '@ogm/contracts'], github);
    expect([...names.entries()]).toEqual([
      ['@gm/sdk', '@its-owner/sdk'],
      ['@ogm/contracts', '@its-owner/contracts'],
    ]);
  });

  it('refuses two source packages that would publish under one destination name', () => {
    expect(() => destinationNames(['@gm/sdk', '@ogm/sdk'], github)).toThrow(/would both publish as @its-owner\/sdk/);
  });
});

describe('registryHost and npmrcLines', () => {
  it('names the host the token belongs to', () => {
    expect(registryHost(github)).toBe('npm.pkg.github.com');
  });

  it('writes a token reference, never a token', () => {
    const lines = npmrcLines(github);
    expect(lines[0]).toBe('@its-owner:registry=https://npm.pkg.github.com');
    expect(lines[1]).toBe('//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}');
    expect(lines.join('\n')).not.toMatch(/ghp_|github_pat_/);
  });

  it('accepts another environment variable name for a host-local feed', () => {
    expect(npmrcLines(github, 'CORE_PACKAGES_READ_TOKEN')[1]).toContain('${CORE_PACKAGES_READ_TOKEN}');
  });
});

describe('ReleaseError', () => {
  it('keeps its name so the CLI can report a refusal', () => {
    expect(new ReleaseError('no').name).toBe('ReleaseError');
  });
});
