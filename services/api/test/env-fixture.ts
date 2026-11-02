import type { EnvKind } from '@ogm/config';

import { apiEnvSpec } from '../src/app/env.js';

type ApiEnvSource = Record<string, string | undefined>;

function placeholder(name: string, kind: EnvKind, index: number): string {
  const fixtureName = name.toLowerCase();
  switch (kind) {
    case 'string':
      return `test-${fixtureName}`;
    case 'secret':
      return `test-${fixtureName}-${'x'.repeat(32)}`;
    case 'port':
      return String(4_000 + index);
    case 'url':
      return `http://127.0.0.1:${4_400 + index}`;
    case 'path':
      return `/tmp/ogm-test/${fixtureName}`;
    case 'int':
      return String(index + 1);
    case 'bool':
      return 'false';
  }
}

export function makeApiEnv(overrides: ApiEnvSource = {}): ApiEnvSource {
  const source: ApiEnvSource = {};
  let index = 0;
  for (const [name, definition] of Object.entries(apiEnvSpec)) {
    if ('default' in definition || ('required' in definition && definition.required === false)) continue;
    source[name] = placeholder(name, definition.kind, index);
    index += 1;
  }
  return { ...source, ...overrides };
}
