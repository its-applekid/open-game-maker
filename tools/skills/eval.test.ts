import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentEnvironment } from './eval/agent.js';
import { calculateM1 } from './eval/m1.js';
import { detectUnaskedMechanics } from './eval/m4.js';
import { calculateM5 } from './eval/m5.js';
import { collectM6Signature, compareM6 } from './eval/m6.js';
import { renderBenchmark } from './eval/report.js';
import { evaluateRun, parseOptions, runEvaluation } from './eval/runner.js';
import type { EvalRun, ProcessResult } from './eval/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const evalRoot = join(root, 'evals/skills');

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

async function temp(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function run(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    brief: '01-lantern-leap',
    config: 'with_skill',
    agent: 'codex',
    dir: 'evals/skills/.runs/2026-11-02/01-lantern-leap-with_skill',
    startedAt: '2026-11-02T00:00:00.000Z',
    durationMs: 1_000,
    gates: { check: true, test: true, run: 'pass' },
    m1: { duplicatedPct: 0 },
    m4: { unasked: [] },
    m5: { total: 3, equalToCardExample: 0 },
    m6: { adapterCalls: ['@gm/pack-pixel#sprite'], renderKeys: ['state.player', 'state.score'] },
    passed: true,
    ...overrides,
  };
}

describe('eval data', () => {
  it('keeps twelve briefs in sync with their expected mechanics', () => {
    const manifest = JSON.parse(readFileSync(join(evalRoot, 'evals.json'), 'utf8')) as {
      evals: { id: string; promptFile: string; expectedMechanics: string[] }[];
    };
    expect(manifest.evals).toHaveLength(12);
    for (const entry of manifest.evals) {
      const brief = readFileSync(join(evalRoot, entry.promptFile), 'utf8').toLowerCase();
      expect(entry.expectedMechanics.length).toBeGreaterThan(0);
      for (const mechanic of entry.expectedMechanics) expect(brief).toContain(mechanic.toLowerCase());
    }
    const all = manifest.evals.map((entry) => readFileSync(join(evalRoot, entry.promptFile), 'utf8')).join('\n');
    expect(all).toContain('cooking rhythm game');
    expect(all).toContain('lighthouse-keeper puzzle');
  });
});

describe('M1 leakage', () => {
  it('reports a planted card copy and subtracts fresh-scaffold clones', async () => {
    const base = await temp('ogm-eval-m1-');
    const game = join(base, 'game');
    const cards = join(base, 'cards');
    const fresh = join(base, 'fresh');
    const scaffold = `export const boot = () => {\n  const canvas = document.querySelector('canvas');\n  if (!canvas) throw new Error('missing canvas');\n  return canvas.getContext('2d');\n};\n`;
    const copied = `export function forgivingJump(tick: number, pressedAt: number) {\n  const jumpBufferMs = 120;\n  const coyoteMs = 100;\n  const buffered = tick - pressedAt <= jumpBufferMs;\n  const groundedRecently = tick <= coyoteMs;\n  return buffered && groundedRecently;\n}\n`;
    write(join(game, 'src/main.ts'), `${scaffold}\n${copied}`);
    write(join(cards, 'jump.ts'), copied);
    write(join(fresh, 'src/main.ts'), scaffold);

    const result = await calculateM1({
      gameDir: game,
      referenceDirs: [cards],
      freshDir: fresh,
      workDir: join(base, 'work'),
    });

    expect(result.duplicatedPct).toBeGreaterThan(0);
    expect(result.largestClone?.file).toMatch(/cards\/jump\.ts$/);
  });
});

describe('M4 unasked mechanics', () => {
  it('finds a double jump in text-state keys unless the brief asks for it', async () => {
    const game = await temp('ogm-eval-m4-');
    write(join(game, 'src/main.ts'), 'export const ordinaryJump = true;\n');
    const checklist = [{ id: 'double jump', keys: ['doubleJump', 'jumpsLeft'], grep: ['doubleJump', 'double jump'] }];

    await expect(
      detectUnaskedMechanics({
        gameDir: game,
        expectedMechanics: [],
        renderState: { doubleJump: true },
        checklist,
      }),
    ).resolves.toEqual({ unasked: ['double jump'] });
    await expect(
      detectUnaskedMechanics({
        gameDir: game,
        expectedMechanics: ['double jump'],
        renderState: { doubleJump: true },
        checklist,
      }),
    ).resolves.toEqual({ unasked: [] });
  });

  it('does not treat a forbidden mechanic as requested just because the brief names it', async () => {
    const game = await temp('ogm-eval-m4-forbidden-');
    write(join(game, 'src/main.ts'), 'export const doubleJump = true;\n');

    await expect(
      detectUnaskedMechanics({
        gameDir: game,
        expectedMechanics: [],
        renderState: {},
        checklist: [{ id: 'double jump', keys: ['doubleJump'], grep: ['doubleJump'] }],
      }),
    ).resolves.toEqual({ unasked: ['double jump'] });
  });
});

describe('M5 card-default fingerprint', () => {
  it('matches the worked example: two copied values out of three', async () => {
    const base = await temp('ogm-eval-m5-');
    const game = join(base, 'game');
    const cards = join(base, 'cards');
    write(
      join(game, 'src/tunables.ts'),
      'export const tunables = { jumpBufferMs: 120, coyoteMs: 100, apexSeconds: 0.35 } as const;\n',
    );
    write(
      join(cards, 'jump.md'),
      `---\ntunables:\n  - { name: jumpBufferMs, range: [100, 150] }\n  - { name: coyoteMs, range: [80, 120] }\n  - { name: apexSeconds, range: [0.3, 0.4] }\n---\n\n## Test\n\n\`\`\`ts\nconst examples = { jumpBufferMs: 120, coyoteMs: 100 };\n\`\`\`\n`,
    );

    await expect(calculateM5(game, [cards])).resolves.toEqual({ total: 3, equalToCardExample: 2 });

    write(
      join(game, 'src/tunables.ts'),
      'export const tunables = { jumpBufferMs: 110, coyoteMs: 90, apexSeconds: 0.35 };\n',
    );
    await expect(calculateM5(game, [cards])).resolves.toEqual({ total: 3, equalToCardExample: 0 });
  });
});

describe('M6 adapter and text-state sameness', () => {
  it('collects pack adapter calls and nested renderGameToText keys', async () => {
    const game = await temp('ogm-eval-m6-');
    write(
      join(game, 'src/main.ts'),
      `import { sprite as makeSprite } from '@gm/pack-pixel-town';\nimport * as dungeon from '@gm/pack-dungeon';\nmakeSprite('hero');\ndungeon.tile('floor');\n`,
    );

    await expect(collectM6Signature(game, { state: { player: { x: 1 }, score: 2 } })).resolves.toEqual({
      adapterCalls: ['@gm/pack-dungeon#tile', '@gm/pack-pixel-town#sprite'],
      renderKeys: ['state', 'state.player', 'state.player.x', 'state.score'],
    });
  });

  it('fails a set when two games have identical adapter or render-key sets', () => {
    const first = run({ brief: 'first' });
    const second = run({ brief: 'second' });
    const result = compareM6([first, second]);
    expect(result.passed).toBe(false);
    expect(result.adapterCollisions).toEqual([['first', 'second']]);
    expect(result.renderKeyCollisions).toEqual([['first', 'second']]);
  });
});

describe('run verdict and report', () => {
  it('requires green gates, low leakage, no extras, and fewer than half copied defaults', () => {
    expect(evaluateRun(run(), { m1Pct: 15 })).toBe(true);
    expect(evaluateRun(run({ m1: { duplicatedPct: 15 } }), { m1Pct: 15 })).toBe(false);
    expect(evaluateRun(run({ m4: { unasked: ['dash'] } }), { m1Pct: 15 })).toBe(false);
    expect(evaluateRun(run({ m5: { total: 3, equalToCardExample: 2 } }), { m1Pct: 15 })).toBe(false);
  });

  it('renders a benchmark and an explicit no-baseline ship gate', () => {
    const markdown = renderBenchmark(
      [run(), run({ brief: 'second', m6: { adapterCalls: ['@gm/pack-pixel#map'], renderKeys: ['state.level'] } })],
      { m1Pct: 15 },
    );
    expect(markdown).toContain('| Brief | Gates | Time | Tokens | M1 | M4 | M5 | Result |');
    expect(markdown).toContain('No previous baseline');
    expect(markdown).toContain('M6 variety: pass');
  });
});

describe('runner guard and dry run', () => {
  it('returns exit 2 before doing work when confirmation is absent', () => {
    expect(() => parseOptions([])).toThrowError(/--confirm/);
  });

  it('accepts the pnpm script separator used by the documented command', () => {
    expect(parseOptions(['--', '--dry-run']).dryRun).toBe(true);
  });

  it('uses gm new, removes genre skills for baseline, and records a skipped agent', async () => {
    const out = await temp('ogm-eval-dry-out-');
    const calls: string[][] = [];
    const process = async (_command: string, args: string[]): Promise<ProcessResult> => {
      calls.push(args);
      if (args.includes('new')) {
        const destination = args.at(-1)!;
        write(join(destination, 'package.json'), '{"name":"fixture","dependencies":{"@gm/sdk":"workspace:*"}}\n');
        write(join(destination, '.claude/skills/gm-core/SKILL.md'), 'core\n');
        write(join(destination, '.claude/skills/gm-genre-platformer/SKILL.md'), 'genre\n');
        write(join(destination, '.agents/skills/gm-genre-platformer/SKILL.md'), 'genre\n');
        write(join(destination, '.codex/skills/gm-genre-platformer/SKILL.md'), 'genre\n');
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await runEvaluation(
      { configs: ['baseline'], briefs: ['01'], agent: 'codex', maxParallel: 1, dryRun: true, confirm: false, out },
      { process, now: () => new Date('2026-11-02T01:02:03.000Z') },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('new');
    const recordedDir = result.runs[0]!.dir;
    const scratch = isAbsolute(recordedDir) ? recordedDir : resolve(root, recordedDir);
    expect(readdirSync(join(scratch, '.claude/skills'))).not.toContain('gm-genre-platformer');
    expect(readFileSync(join(scratch, 'pnpm-workspace.yaml'), 'utf8')).toBe(
      "packages:\n  - '.'\n  - '.ogm-packages/*'\n",
    );
    expect(readFileSync(join(scratch, 'pnpm-lock.yaml'), 'utf8')).toContain("lockfileVersion: '9.0'");
    const scratchPackage = JSON.parse(readFileSync(join(scratch, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(scratchPackage.dependencies['@gm/sdk']).toBe('workspace:*');
    expect(scratchPackage.devDependencies.typescript).toBe('6.0.3');
    expect(scratchPackage.devDependencies['@types/node']).toBe('26.6.6');
    expect(readFileSync(join(scratch, '.ogm-packages/gm__sdk/package.json'), 'utf8')).not.toContain('devDependencies');
    const grading = JSON.parse(readFileSync(join(out, '01-lantern-leap-baseline/grading.json'), 'utf8')) as EvalRun;
    expect(grading.agent).toBe('skipped');
  });

  it('refuses a run when every selected config is unavailable', async () => {
    const out = await temp('ogm-eval-no-config-');
    await expect(
      runEvaluation(
        {
          configs: ['full_reference'],
          briefs: ['01'],
          agent: 'codex',
          maxParallel: 1,
          dryRun: true,
          confirm: false,
          out,
        },
        { process: async () => ({ code: 0, stdout: '', stderr: '' }) },
      ),
    ).rejects.toThrow(/no selected configs are available/);
  });

  it('runs a fake agent pipeline through gates and all metrics', async () => {
    const out = await temp('ogm-eval-fake-out-');
    let gameDir = '';
    const newTemplates: string[] = [];
    const runFrames: string[] = [];
    let installArgs: string[] = [];
    let runAttempts = 0;
    const process = async (command: string, args: string[]): Promise<ProcessResult> => {
      if (args.includes('new')) {
        const destination = args.at(-1)!;
        newTemplates.push(args.at(-2)!);
        write(join(destination, 'package.json'), '{"name":"fixture"}\n');
        write(join(destination, 'src/main.ts'), 'export const scaffold = true;\n');
        if (!destination.endsWith('/.fresh')) gameDir = destination;
      } else if (command === 'codex') {
        const card = readFileSync(
          join(root, 'skills/gm-genre-platformer/references/cards/jump-buffer-coyote.md'),
          'utf8',
        );
        const snippet = /^```ts\s*\n([\s\S]*?)^```\s*$/m.exec(card)?.[1] ?? '';
        write(
          join(gameDir, 'src/main.ts'),
          `${snippet}\nimport { sprite } from '@gm/pack-pixel-town';\nsprite('hero');\n`,
        );
        write(
          join(gameDir, 'src/tunables.ts'),
          'export const tunables = { jumpBufferMs: 100, coyoteMs: 80, apexSeconds: 0.35 };\n',
        );
      } else if (command === 'pnpm') {
        installArgs = args;
      } else if (args.includes('run')) {
        runAttempts += 1;
        runFrames.push(args[args.indexOf('--frames') + 1]!);
        if (runAttempts === 1) return { code: 1, stdout: '', stderr: 'capture busy' };
        write(
          join(gameDir, 'shots/report.json'),
          JSON.stringify({ verdict: 'pass', probes: { playerX: 1, beacons: 2 } }),
        );
        write(join(gameDir, 'shots/state.json'), JSON.stringify({ state: { player: { x: 1 }, beacons: 2 } }));
      }
      return { code: 0, stdout: command === 'codex' ? 'input tokens: 10\noutput tokens: 20\n' : '', stderr: '' };
    };

    const result = await runEvaluation(
      { configs: ['with_skill'], briefs: ['11'], agent: 'codex', maxParallel: 1, dryRun: false, confirm: true, out },
      { process, now: () => new Date('2026-11-03T01:02:03.000Z') },
    );

    expect(result.runs[0]).toMatchObject({
      agent: 'codex',
      gates: { check: true, test: true, run: 'pass' },
      tokens: { input: 10, output: 20 },
    });
    expect(result.runs[0]!.m1.duplicatedPct).toBeGreaterThan(0);
    expect(result.runs[0]!.m5).toEqual({ total: 3, equalToCardExample: 0 });
    expect(result.runs[0]!.m6.adapterCalls).toEqual(['@gm/pack-pixel-town#sprite']);
    expect(result.runs[0]!.m6.renderKeys).toContain('state.player.x');
    expect(result.benchmark).toContain('11-orbital-tow');
    expect(newTemplates).toEqual(['game-3d', 'game-3d']);
    expect(installArgs).toEqual(['install', '--offline', '--frozen-lockfile']);
    expect(runFrames).toEqual(['60,300', '60,300']);
    expect(runAttempts).toBe(2);
  });
});

describe('agent sandbox environment', () => {
  it('removes credential-shaped variables but preserves local subscription paths', () => {
    expect(
      agentEnvironment({
        PATH: '/bin',
        CODEX_HOME: '/config/codex',
        OPENAI_API_KEY: 'secret',
        GITHUB_TOKEN: 'secret',
        AIUR_GITHUB_CREDENTIAL_FILE: '/secret/file',
      }),
    ).toEqual({ PATH: '/bin', CODEX_HOME: '/config/codex' });
  });
});

describe('CI isolation', () => {
  it('does not invoke the on-demand eval from a workflow or another package script', () => {
    const workflows = readdirSync(join(root, '.github/workflows'))
      .map((name) => readFileSync(join(root, '.github/workflows', name), 'utf8'))
      .join('\n');
    expect(workflows).not.toMatch(/tools-skills\s+eval|evals\/skills/);
    const packageFiles = [
      'package.json',
      ...readdirSync(join(root, 'tools'))
        .map((name) => `tools/${name}/package.json`)
        .filter((path) => {
          try {
            readFileSync(join(root, path));
            return true;
          } catch {
            return false;
          }
        }),
    ];
    for (const path of packageFiles.filter((path) => path !== 'tools/skills/package.json')) {
      expect(readFileSync(join(root, path), 'utf8')).not.toMatch(/"eval"\s*:/);
    }
  });
});
