import type { EnvKind, ParsedEnvValue } from './kinds.js';
import { parseKind } from './kinds.js';
import { OGM_ENV_NAMES } from './names.js';

export type { EnvKind } from './kinds.js';
export type { EnvName, EnvUnit } from './names.js';
export { OGM_ENV_NAMES, OGM_ENV_UNITS } from './names.js';

export type EnvSpec = Record<
  string,
  { readonly kind: EnvKind; readonly required?: boolean; readonly default?: string }
>;

type EnvValue<D extends EnvSpec[string]> = D['kind'] extends 'port' | 'int'
  ? number
  : D['kind'] extends 'bool'
    ? boolean
    : string;

export type EnvValues<S extends EnvSpec> = {
  readonly [K in keyof S]: S[K] extends { readonly default: string }
    ? EnvValue<S[K]>
    : S[K] extends { readonly required: false }
      ? EnvValue<S[K]> | undefined
      : EnvValue<S[K]>;
};

type InvalidDetail = { readonly name: string; readonly reason: string };

export class ConfigError extends Error {
  readonly service: string;
  readonly missing: string[];
  readonly invalid: string[];

  constructor(service: string, missing: readonly string[], invalid: readonly InvalidDetail[]) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      invalid.length > 0 ? `invalid ${invalid.map(({ name, reason }) => `${name} (${reason})`).join(', ')}` : '',
    ].filter(Boolean);

    super(`config(${service}): ${details.join('; ')}`);
    this.name = 'ConfigError';
    this.service = service;
    this.missing = [...missing];
    this.invalid = invalid.map(({ name }) => name);
  }
}

const registeredNames = new Set(OGM_ENV_NAMES.map(({ name }) => name));

export function loadEnv<S extends EnvSpec>(
  service: string,
  spec: S,
  source: Record<string, string | undefined> = process.env,
): EnvValues<S> {
  const unregistered = Object.keys(spec)
    .filter((name) => !registeredNames.has(name))
    .map((name) => ({ name, reason: 'unregistered env name' }));

  if (unregistered.length > 0) {
    throw new ConfigError(service, [], unregistered);
  }

  const missing: string[] = [];
  const invalid: InvalidDetail[] = [];
  const values: Record<string, ParsedEnvValue | undefined> = {};

  for (const [name, definition] of Object.entries(spec)) {
    const raw = source[name] ?? definition.default;

    if (raw === undefined) {
      if (definition.required ?? true) missing.push(name);
      else values[name] = undefined;
      continue;
    }

    const parsed = parseKind(definition.kind, raw);
    if (parsed.ok) values[name] = parsed.value;
    else invalid.push({ name, reason: parsed.reason });
  }

  if (missing.length > 0 || invalid.length > 0) {
    throw new ConfigError(service, missing, invalid);
  }

  return Object.freeze(values) as EnvValues<S>;
}

export function redact(name: string, source: Record<string, string | undefined> = process.env): '<set>' | '<unset>' {
  return source[name] === undefined ? '<unset>' : '<set>';
}
