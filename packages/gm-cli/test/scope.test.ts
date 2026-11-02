import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AgentOutboxLine } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { gm, tempDir } from './helpers.js';

const JOB_ID = 'j_88000000-0000-4000-8000-000000000001';
const agreed = JSON.parse(
  readFileSync(new URL('../../contracts/fixtures/scope/agreed.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function workspace(): string {
  const root = tempDir('gm-scope-');
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

describe('gm scope done', () => {
  it('validates the agreed scope and appends one scope.agreed outbox line', async () => {
    const root = workspace();
    const directory = join(root, '.gm', 'scope');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, `${agreed.session_id}.json`);
    writeFileSync(file, `${JSON.stringify(agreed, null, 2)}\n`);

    const result = await gm(['scope', 'done', '--job', JOB_ID, '--file', file], { cwd: root });

    expect(result).toEqual({ code: 0, out: [agreed.session_id as string], err: [] });
    const raw = readFileSync(join(root, '.gm', 'outbox', 'scope.jsonl'), 'utf8').trim();
    const line = AgentOutboxLine.parse(JSON.parse(raw));
    expect(line).toMatchObject({ job_id: JOB_ID, type: 'scope.agreed', payload: agreed });
  });

  it('exits 2 naming the first invalid field', async () => {
    const root = workspace();
    const file = join(root, 'invalid.json');
    const { tickets: _tickets, ...invalid } = agreed;
    writeFileSync(file, JSON.stringify(invalid));

    const result = await gm(['scope', 'done', '--job', JOB_ID, '--file', file], { cwd: root });

    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('tickets');
  });

  it('refuses a scope file outside the workspace', async () => {
    const root = workspace();
    const outside = join(tempDir('gm-scope-outside-'), 'agreed.json');
    writeFileSync(outside, JSON.stringify(agreed));

    const result = await gm(['scope', 'done', '--job', JOB_ID, '--file', outside], { cwd: root });

    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('inside the workspace');
  });
});
