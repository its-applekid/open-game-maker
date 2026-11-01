import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { PolicyViolation, renderAiurConfig } from '../../src/policy/render.js';
import { workedInput } from './fixtures.js';

describe('renderAiurConfig', () => {
  it('matches the reviewed config fixture byte-for-byte', async () => {
    const fixture = await readFile(new URL('../fixtures/config.expected.yaml', import.meta.url), 'utf8');

    expect(renderAiurConfig(workedInput)).toBe(fixture);
  });

  it('is deterministic and gives new-game jobs a 90 minute cap', () => {
    const first = renderAiurConfig(workedInput);

    expect(renderAiurConfig(workedInput)).toBe(first);
    expect(first).toContain('max_agent_duration_minutes: 90');
  });

  it('inherits the daemon CODEX_HOME instead of selecting a shared account profile', () => {
    expect(renderAiurConfig(workedInput)).toContain('accounts:\n    codex: []\n');
  });

  it('rejects an unsupported concurrency value', () => {
    expect(() => renderAiurConfig({ ...workedInput, maxConcurrentAgents: 3 as never })).toThrow(ZodError);
  });

  it.each([
    ['network access', { networkAccess: true }],
    ['slash tmp inclusion', { excludeSlashTmp: false }],
    ['an extra writable root', { writableRoots: [workedInput.workspaceRoot, '/tmp/build'] }],
    ['slash tmp as a writable root', { writableRoots: ['/tmp'] }],
    ['approval bypass', { approvalPolicy: 'never' }],
    ['Claude bypass', { permissionMode: 'bypassPermissions' }],
    ['a Claude backend', { claude: { permission_mode: 'default' } }],
    ['hosted mode', { instanceMode: 'hosted' }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => renderAiurConfig({ ...workedInput, overrides })).toThrow(PolicyViolation);
  });
});
