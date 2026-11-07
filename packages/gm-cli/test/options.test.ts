import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FEEDBACK_FILE } from '../src/ledger/index.js';
import { gm, tempDir } from './helpers.js';

const JOB_ID = 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f';

function game(): string {
  const root = tempDir('gm-options-');
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'provenance'), { recursive: true });
  return root;
}

describe('gm options check', () => {
  it('passes every option in a game that has never recorded a rejection', async () => {
    const result = await gm(['options', 'check', '--option', 'a=Chunky', '--option', 'b=Flat'], { cwd: game() });
    expect(result).toMatchObject({ code: 0, err: [] });
    expect(result.out[0]).toContain('options ok');
  });

  it('fails an option with no provenance once a rule applies to it', async () => {
    const root = game();
    await gm(
      [
        'options',
        'reject',
        '--words',
        'looks are KayKit only',
        '--rule',
        'looks are KayKit only',
        '--scope',
        'look',
        '--must',
        '{"packs":["kaykit"]}',
      ],
      { cwd: root },
    );
    const result = await gm(['options', 'check', '--option', 'a=Chunky', '--option', 'b=Flat'], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.err.join('\n')).toContain('missing-provenance a');
  });

  it('refuses a provenance that is not JSON and an unknown option id', async () => {
    const root = game();
    const bad = await gm(
      ['options', 'check', '--option', 'a=Chunky', '--option', 'b=Flat', '--provenance', 'a=not-json'],
      {
        cwd: root,
      },
    );
    expect(bad.code).toBe(2);
    expect(bad.err.join('\n')).toContain('is not valid JSON');

    const unknown = await gm(
      [
        'options',
        'check',
        '--option',
        'a=Chunky',
        '--option',
        'b=Flat',
        '--provenance',
        'z={"packs":["kaykit"],"assets":[],"generator":"blender 4.2","built_at":"2026-11-07T16:00:00.000Z"}',
      ],
      {
        cwd: root,
      },
    );
    expect(unknown.code).toBe(2);
    expect(unknown.err.join('\n')).toContain('unknown option "z"');
  });

  it('refuses to run without an option', async () => {
    const result = await gm(['options', 'check'], { cwd: game() });
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain('at least one --option');
  });
});

describe('gm options reject', () => {
  it('creates the ledger on the first rejection and records the words, rule, scope and Command', async () => {
    const root = game();
    const result = await gm(
      [
        'options',
        'reject',
        '--job',
        JOB_ID,
        '--words',
        'those are not characters',
        '--rule',
        'characters are rigged KayKit models',
        '--scope',
        'characters',
        '--must',
        '{"packs":["kaykit"]}',
        '--option',
        'a=Stand-in A',
        '--media',
        'm_01',
        '--design-version',
        '1.2.3',
        '--command',
        'cp_01',
      ],
      { cwd: root },
    );
    expect(result).toMatchObject({ code: 0, err: [] });
    expect(result.out.join('\n')).toContain('characters are rigged KayKit models (characters)');

    const ledger = JSON.parse(readFileSync(join(root, FEEDBACK_FILE), 'utf8')) as {
      schemaVersion: number;
      entries: {
        words: string;
        rule: string;
        scope: string;
        design_version: string;
        rejected: { options: { id: string; label: string }[]; command: string; media: string[] };
        withdrawn: { options: string[]; commands: string[] };
      }[];
    };
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      words: 'those are not characters',
      rule: 'characters are rigged KayKit models',
      scope: 'characters',
      design_version: '1.2.3',
      rejected: { options: [{ id: 'a', label: 'Stand-in A' }], command: 'cp_01', media: ['m_01'] },
      withdrawn: { options: [], commands: [] },
    });
  });

  it('refuses a rejection without the creator’s words or a rule', async () => {
    const root = game();
    const noWords = await gm(['options', 'reject', '--rule', 'looks are KayKit only', '--scope', 'look'], {
      cwd: root,
    });
    expect(noWords.code).toBe(2);
    expect(noWords.err.join('\n')).toContain('--words is required');

    const noRule = await gm(['options', 'reject', '--words', 'nope', '--scope', 'look'], { cwd: root });
    expect(noRule.code).toBe(2);
    expect(noRule.err.join('\n')).toContain('--rule is required');

    const badScope = await gm(['options', 'reject', '--words', 'nope', '--rule', 'nope', '--scope', 'everything'], {
      cwd: root,
    });
    expect(badScope.code).toBe(2);
    expect(badScope.err.join('\n')).toContain('--scope needs characters, look, or options');
  });

  it('keeps prior entries when a second rejection arrives', async () => {
    const root = game();
    writeFileSync(
      join(root, 'provenance', 'stand-in.json'),
      JSON.stringify({ packs: ['stand-in'], assets: [], generator: 'stand-in', built_at: '2026-11-06T10:00:00.000Z' }),
    );
    await gm(
      [
        'options',
        'reject',
        '--words',
        'those are not characters',
        '--rule',
        'characters are rigged KayKit models',
        '--scope',
        'characters',
        '--option',
        'a=Stand-in A',
      ],
      { cwd: root },
    );
    await gm(
      [
        'options',
        'reject',
        '--words',
        'never off-camera',
        '--rule',
        'options are player-view mockups',
        '--scope',
        'options',
      ],
      {
        cwd: root,
      },
    );
    const ledger = JSON.parse(readFileSync(join(root, FEEDBACK_FILE), 'utf8')) as { entries: unknown[] };
    expect(ledger.entries).toHaveLength(2);
  });
});
