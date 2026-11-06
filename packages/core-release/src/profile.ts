import { ReleaseError } from './graph.js';

/** Where releases go. Every field is an operator input; nothing here names a real host or owner. */
export type RegistryProfile = {
  /** npm-compatible registry base URL, e.g. `https://registry.npmjs.org`. */
  readonly registry: string;
  /** Scope the destination registry accepts, e.g. an npm org the owner created. */
  readonly scope: string;
  readonly access: 'restricted' | 'public';
  /** dist-tag new versions are published under. Consumers pin exact versions, so this is a fallback. */
  readonly tag: string;
};

export type RegistryProfileInput = {
  readonly registry?: string;
  readonly scope?: string;
  readonly access?: string;
  readonly tag?: string;
};

/**
 * The public npm registry, the destination Kevin chose on #490 (2026-11-06: "we use npm.js for all
 * aiur packages, use that"). The scope is an npm org the owner creates; a different destination only
 * changes these inputs.
 */
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
export const DEFAULT_ACCESS = 'public';
export const DEFAULT_TAG = 'core';
/**
 * The only registry host that authenticates a publish with OIDC trusted publishing. A publish run to
 * another registry needs a token in the environment.
 */
export const TRUSTED_PUBLISHING_HOST = 'registry.npmjs.org';
/**
 * The npm org scope the releases publish under. `@gm` and `@ogm` are already owned by other accounts
 * on npm, so the releases take a scope the owner creates; see docs/ops/core-packages.md.
 */
export const DEFAULT_SCOPE = '@open-game-maker';

const SCOPE = /^@[a-z0-9][a-z0-9._-]{0,213}$/;
const TAG = /^[a-z][a-z0-9._-]{0,63}$/;

export function registryProfile(input: RegistryProfileInput): RegistryProfile {
  const registry = (input.registry ?? DEFAULT_REGISTRY).trim();
  let url: URL;
  try {
    url = new URL(registry);
  } catch {
    throw new ReleaseError(`registry ${registry} is not a URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ReleaseError(`registry ${registry} must be http or https`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new ReleaseError('registry URL must not carry credentials; the token comes from the environment');
  }
  if (url.search !== '' || url.hash !== '') {
    throw new ReleaseError('registry URL must not carry a query or fragment');
  }

  const scope = (input.scope ?? '').trim();
  if (!SCOPE.test(scope)) {
    throw new ReleaseError(`scope ${scope === '' ? '(empty)' : scope} is not an npm scope like @owner`);
  }

  const access = (input.access ?? DEFAULT_ACCESS).trim();
  if (access !== 'restricted' && access !== 'public') {
    throw new ReleaseError(`access ${access} must be restricted or public`);
  }

  const tag = (input.tag ?? DEFAULT_TAG).trim();
  if (!TAG.test(tag)) throw new ReleaseError(`tag ${tag} is not a valid dist-tag`);

  return { registry: url.href.replace(/\/$/, ''), scope, access, tag };
}

export function sourceBasename(name: string): string {
  const slash = name.indexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

/**
 * The name the destination registry will accept. A registry that only accepts its own scope (GitHub
 * Packages, or an npm org that does not own `@gm` / `@ogm`) republishes `@gm/sdk` as `<scope>/sdk`;
 * consumers keep importing `@gm/sdk` through an `npm:` alias.
 */
export function destinationName(source: string, profile: RegistryProfile): string {
  if (!source.startsWith('@')) throw new ReleaseError(`package name ${source} is not scoped`);
  const prefix = `${profile.scope}/`;
  if (source.startsWith(prefix)) return source;
  return `${prefix}${sourceBasename(source)}`;
}

/** Refuses a closure whose destination names collide or whose sources are not scoped. */
export function destinationNames(sources: readonly string[], profile: RegistryProfile): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Map<string, string>();
  for (const source of sources) {
    const destination = destinationName(source, profile);
    const previous = taken.get(destination);
    if (previous !== undefined && previous !== source) {
      throw new ReleaseError(`${source} and ${previous} would both publish as ${destination}`);
    }
    taken.set(destination, source);
    names.set(source, destination);
  }
  return names;
}

/** Host npm resolves the registry's auth token under, e.g. `registry.npmjs.org`. */
export function registryHost(profile: RegistryProfile): string {
  return new URL(profile.registry).host;
}

/**
 * The `.npmrc` lines an instance repository needs. The token is referenced through the environment,
 * so the file itself never holds a secret.
 */
export function npmrcLines(profile: RegistryProfile, tokenVariable = 'NODE_AUTH_TOKEN'): string[] {
  return [
    `${profile.scope}:registry=${profile.registry}`,
    `//${registryHost(profile)}/:_authToken=\${${tokenVariable}}`,
  ];
}
