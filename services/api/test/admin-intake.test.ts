import { mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readIntake } from '../src/admin/intake-status.js';
import { X } from './admin-fixture.js';
import { asUser, installUsers, makeApp, makeDeps } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/intake/', import.meta.url));
const line = (dropId: string, manifest: string) =>
  JSON.stringify({ queued_at: '2026-10-31T00:00:00+00:00', drop_id: dropId, name: dropId, manifest });

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ogm-intake-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

// Modification times of every fixture file, to prove the reader never writes.
function stamps(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.name}:${statSync(join(entry.parentPath, entry.name)).mtimeMs}`);
}

describe('intake status reader', () => {
  it('joins the queue with intake.json and the manifest problems, newest first', () => {
    const before = stamps(FIXTURE);
    expect(readIntake(FIXTURE)).toEqual({
      parseErrors: 0,
      drops: [
        {
          dropId: 'drive-b',
          name: 'Door sounds',
          time: '2026-10-31T09:00:00+00:00',
          status: 'queued',
          collection: null,
          license: null,
          confirmedBy: null,
          date: null,
          problems: 0,
        },
        {
          dropId: 'drive-a',
          name: 'Forest tiles',
          time: '2026-10-30T09:00:00+00:00',
          status: 'imported',
          collection: 'drive-forest-tiles',
          license: 'CC0-1.0',
          confirmedBy: 'kevin',
          date: '2026-10-30',
          problems: 2,
        },
      ],
    });
    expect(stamps(FIXTURE)).toEqual(before);
  });

  it('is empty when the directory or the queue is missing', () => {
    expect(readIntake(undefined)).toEqual({ drops: [], parseErrors: 0 });
    expect(readIntake(join(tmpdir(), 'ogm-intake-does-not-exist'))).toEqual({ drops: [], parseErrors: 0 });
    expect(readIntake(tree({ 'other.txt': '' }))).toEqual({ drops: [], parseErrors: 0 });
  });

  it('counts corrupt lines and files and skips manifests outside the directory', () => {
    const outside = tree({ 'drop/manifest.json': '{"problems":[1,2,3]}', 'drop/intake.json': '{"status":"imported"}' });
    const root = tree({
      'queue.jsonl': [
        'not json',
        JSON.stringify({ drop_id: 'no-time', name: 'x', manifest: 'q/a/manifest.json' }),
        line('escape', '../../../../../../etc/manifest.json'),
        line('symlink', 'link/manifest.json'),
        line('bad-intake', 'q/bad/manifest.json'),
        line('ok', 'q/ok/manifest.json'),
      ].join('\n'),
      'q/bad/intake.json': '{"status":"lost"}',
      'q/ok/intake.json': '{"status":"awaiting-license","license":{"id":"NOASSERTION"}}',
    });
    symlinkSync(join(outside, 'drop'), join(root, 'link'));
    const result = readIntake(root);
    expect(result.parseErrors).toBe(5);
    expect(result.drops.map((drop) => [drop.dropId, drop.status, drop.license])).toEqual([
      ['bad-intake', 'queued', null],
      ['ok', 'awaiting-license', 'NOASSERTION'],
    ]);
  });

  it('is served read-only to admins from OGM_INTAKE_DIR', async () => {
    const deps = makeDeps();
    deps.config.intakeDir = FIXTURE;
    installUsers(deps, [X.owner]);
    const { app } = await makeApp(deps);
    const response = await app.request('/api/v1/admin/intake', { headers: asUser(X.owner.userId) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { drops: { dropId: string; problems: number }[] };
    expect(body.drops.map(({ dropId, problems }) => ({ dropId, problems }))).toEqual([
      { dropId: 'drive-b', problems: 0 },
      { dropId: 'drive-a', problems: 2 },
    ]);
  });
});
