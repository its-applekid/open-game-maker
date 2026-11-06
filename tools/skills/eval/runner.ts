import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '@ogm/config';

import { agentCommand, agentEnvironment, parseTokens, runProcess } from './agent.js';
import { filesUnder } from './files.js';
import { calculateM1 } from './m1.js';
import { detectUnaskedMechanics, type MechanicCheck } from './m4.js';
import { calculateM5 } from './m5.js';
import { collectM6Signature } from './m6.js';
import { renderBenchmark } from './report.js';
import type {
  EvalBrief,
  EvalConfig,
  EvalConfigName,
  EvalOptions,
  EvalRun,
  ProcessRunner,
  Thresholds,
} from './types.js';
import { isolateGameWorkspace } from './workspace.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const dataRoot = join(repoRoot, 'evals/skills');
const configNames: EvalConfigName[] = ['with_skill', 'baseline', 'full_reference'];
const SYSTEM_LINE = 'Build the game described; finish with gm check, gm test, gm run.';
const evalEnvironment = loadEnv('skills-eval', {
  OGM_EVAL_CORPUS: { kind: 'path', required: false },
});

export class EvalUsageError extends Error {
  readonly exitCode = 2;
}

export interface RunnerDependencies {
  process?: ProcessRunner;
  now?: () => Date;
}

function value(args: string[], index: number, flag: string): string {
  const found = args[index + 1];
  if (!found || found.startsWith('--')) throw new EvalUsageError(`${flag} needs a value`);
  return found;
}

function list(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseOptions(args: string[]): EvalOptions {
  const options: EvalOptions = {
    configs: ['with_skill', 'baseline'],
    briefs: [],
    agent: 'codex',
    maxParallel: 1,
    dryRun: false,
    confirm: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--confirm') options.confirm = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--config') {
      const selected = list(value(args, index, arg));
      index += 1;
      if (selected.some((name) => !configNames.includes(name as EvalConfigName))) {
        throw new EvalUsageError(`--config must use ${configNames.join(', ')}`);
      }
      options.configs = selected as EvalConfigName[];
    } else if (arg === '--briefs') {
      options.briefs = list(value(args, index, arg));
      index += 1;
    } else if (arg === '--agent') {
      const agent = value(args, index, arg);
      index += 1;
      if (agent !== 'codex' && agent !== 'claude') throw new EvalUsageError('--agent must be codex or claude');
      options.agent = agent;
    } else if (arg === '--max-parallel') {
      options.maxParallel = Number(value(args, index, arg));
      index += 1;
      if (!Number.isSafeInteger(options.maxParallel) || options.maxParallel < 1 || options.maxParallel > 8) {
        throw new EvalUsageError('--max-parallel must be an integer from 1 to 8');
      }
    } else if (arg === '--out') {
      options.out = value(args, index, arg);
      index += 1;
    } else throw new EvalUsageError(`unknown option ${arg}`);
  }
  if (!options.dryRun && !options.confirm) {
    throw new EvalUsageError('refusing to call an agent without --confirm (use --dry-run to inspect setup only)');
  }
  return options;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function selectBriefs(all: EvalBrief[], selected: string[]): EvalBrief[] {
  if (selected.length === 0) return all;
  const found = all.filter((brief) =>
    selected.some((wanted) => brief.id === wanted || brief.id.startsWith(`${wanted}-`)),
  );
  const missing = selected.filter(
    (wanted) => !found.some((brief) => brief.id === wanted || brief.id.startsWith(`${wanted}-`)),
  );
  if (missing.length > 0) throw new EvalUsageError(`unknown brief: ${missing.join(', ')}`);
  return found;
}

function glob(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}

function applyConfig(gameDir: string, config: EvalConfig): void {
  const excluded = config.excludeSkills.map(glob);
  for (const parent of ['.claude/skills', '.codex/skills', '.agents/skills']) {
    const skills = join(gameDir, parent);
    if (!statSync(skills, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const name of readdirSync(skills)) {
      if (excluded.some((pattern) => pattern.test(name))) rmSync(join(skills, name), { recursive: true, force: true });
    }
  }
}

function relativePath(path: string): string {
  const nested = relative(repoRoot, path);
  return !nested.startsWith('..') && !isAbsolute(nested) ? nested.split('\\').join('/') : path;
}

function gmArgs(...args: string[]): string[] {
  return [join(repoRoot, 'packages/gm-cli/dist/index.js'), ...args];
}

async function gmNew(
  commandRunner: ProcessRunner,
  instanceDir: string,
  template: 'game-2d' | 'game-3d',
  prepareWorkspace = true,
): Promise<string> {
  rmSync(instanceDir, { recursive: true, force: true });
  const initialized = await commandRunner(process.execPath, gmArgs('instance', 'init', instanceDir), {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });
  if (initialized.code !== 0) {
    throw new Error(`gm instance init failed: ${(initialized.stderr || initialized.stdout).trim()}`);
  }
  const slug = 'eval-game';
  const result = await commandRunner(process.execPath, gmArgs('new', template, slug), {
    cwd: instanceDir,
    timeoutMs: 120_000,
  });
  if (result.code !== 0) throw new Error(`gm new failed: ${(result.stderr || result.stdout).trim()}`);
  const gameDir = join(instanceDir, 'games', slug);
  if (prepareWorkspace) isolateGameWorkspace(gameDir, template);
  return gameDir;
}

function cardRoots(): string[] {
  const skills = join(repoRoot, 'skills');
  return readdirSync(skills)
    .filter((name) => name.startsWith('gm-genre-'))
    .map((name) => join(skills, name, 'references/cards'))
    .filter((path) => statSync(path, { throwIfNoEntry: false })?.isDirectory());
}

function extractCardSnippets(roots: string[], destination: string): void {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  let index = 0;
  for (const file of roots.flatMap((root) => filesUnder(root, (name) => name.endsWith('.md')))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^```(?:ts|tsx|typescript|js|jsx|javascript)\s*\n([\s\S]*?)^```\s*$/gm)) {
      index += 1;
      writeFileSync(join(destination, `${String(index).padStart(3, '0')}.ts`), `${match[1].trimEnd()}\n`);
    }
  }
}

function readRenderState(gameDir: string): unknown {
  const state = join(gameDir, 'shots/state.json');
  if (statSync(state, { throwIfNoEntry: false })?.isFile()) return json<unknown>(state);
  const report = join(gameDir, 'shots/report.json');
  if (!statSync(report, { throwIfNoEntry: false })?.isFile()) return {};
  const parsed = json<{ probes?: Record<string, unknown> }>(report);
  return { state: parsed.probes ?? {} };
}

function runVerdict(gameDir: string, result: { code: number }): EvalRun['gates']['run'] {
  const report = join(gameDir, 'shots/report.json');
  if (!statSync(report, { throwIfNoEntry: false })?.isFile()) return result.code === 0 ? 'pass' : 'error';
  const verdict = json<{ verdict?: unknown }>(report).verdict;
  return verdict === 'pass' || verdict === 'fail' || verdict === 'error' ? verdict : 'error';
}

function oneLine(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- command diagnostics must stay on one result line
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 500)
  );
}

function corpusPath(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (name !== 'OGM_EVAL_CORPUS') throw new EvalUsageError(`unsupported corpus environment name ${name}`);
  return evalEnvironment.OGM_EVAL_CORPUS;
}

function grading(run: EvalRun): object {
  return {
    text: `${run.brief} with ${run.config}`,
    ...run,
    evidence: {
      gates: run.gates,
      metrics: { m1: run.m1, m4: run.m4, m5: run.m5, m6: run.m6 },
      ...(run.error ? { error: run.error } : {}),
    },
  };
}

function writeGrading(outDir: string, run: EvalRun): void {
  const dir = join(outDir, `${run.brief}-${run.config}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'grading.json'), `${JSON.stringify(grading(run), null, 2)}\n`);
}

export function evaluateRun(run: EvalRun, thresholds: Thresholds): boolean {
  return (
    run.gates.check &&
    run.gates.test &&
    run.gates.run === 'pass' &&
    run.m1.duplicatedPct < thresholds.m1Pct &&
    run.m4.unasked.length === 0 &&
    (run.m5.total === 0 || run.m5.equalToCardExample < run.m5.total / 2)
  );
}

async function runPool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

function previousRuns(outDir: string): EvalRun[] | undefined {
  const parent = dirname(outDir);
  if (!statSync(parent, { throwIfNoEntry: false })?.isDirectory()) return undefined;
  const previous = readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((path) => path !== outDir && statSync(path, { throwIfNoEntry: false })?.isDirectory())
    .sort()
    .at(-1);
  if (!previous) return undefined;
  const runs = readdirSync(previous).flatMap((name) => {
    const path = join(previous, name, 'grading.json');
    return statSync(path, { throwIfNoEntry: false })?.isFile() ? [json<EvalRun>(path)] : [];
  });
  return runs.length > 0 ? runs : undefined;
}

export async function runEvaluation(
  options: EvalOptions,
  dependencies: RunnerDependencies = {},
): Promise<{ runs: EvalRun[]; outDir: string; benchmark: string }> {
  if (!options.dryRun && !options.confirm) throw new EvalUsageError('refusing to call an agent without --confirm');
  const commandRunner = dependencies.process ?? runProcess;
  const now = dependencies.now ?? (() => new Date());
  const date = now().toISOString().slice(0, 10);
  const outDir = resolve(options.out ?? join(dataRoot, 'results', date));
  const scratchRoot = join(dataRoot, '.runs', date);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(scratchRoot, { recursive: true });

  const manifest = json<{ evals: EvalBrief[] }>(join(dataRoot, 'evals.json'));
  const briefs = selectBriefs(manifest.evals, options.briefs);
  const thresholds = json<Thresholds>(join(dataRoot, 'thresholds.json'));
  const checklist = json<MechanicCheck[]>(join(dataRoot, 'checklists/unasked-mechanics.json'));
  const configs = options.configs
    .map((name) => json<EvalConfig>(join(dataRoot, `configs/${name}.json`)))
    .filter((config) => !config.corpusEnv || corpusPath(config.corpusEnv));
  if (configs.length === 0) throw new EvalUsageError('no selected configs are available in this environment');
  const cards = cardRoots();
  const snippets = join(scratchRoot, '.m1/cards');
  extractCardSnippets(cards, snippets);

  const tasks = configs.flatMap((config) =>
    briefs.map((brief) => {
      const prompt = readFileSync(join(dataRoot, brief.promptFile), 'utf8').trim();
      return { config, brief, prompt, template: /\b3D\b/i.test(prompt) ? ('game-3d' as const) : ('game-2d' as const) };
    }),
  );
  const freshDirs = new Map<'game-2d' | 'game-3d', string>();
  if (!options.dryRun) {
    for (const template of new Set(tasks.map((task) => task.template))) {
      const freshDir = join(scratchRoot, `.fresh-${template}`);
      freshDirs.set(template, await gmNew(commandRunner, freshDir, template, false));
    }
  }

  const runs = await runPool(tasks, options.maxParallel, async ({ config, brief, prompt, template }) => {
    const started = now();
    const instanceDir = join(scratchRoot, `${brief.id}-${config.name}`);
    const gameDir = await gmNew(commandRunner, instanceDir, template);
    applyConfig(gameDir, config);

    if (options.dryRun) {
      const dry: EvalRun = {
        brief: brief.id,
        config: config.name,
        agent: 'skipped',
        dir: relativePath(gameDir),
        startedAt: started.toISOString(),
        durationMs: now().getTime() - started.getTime(),
        gates: { check: false, test: false, run: 'error' },
        m1: { duplicatedPct: 0 },
        m4: { unasked: [] },
        m5: { total: 0, equalToCardExample: 0 },
        m6: await collectM6Signature(gameDir, {}),
        passed: false,
      };
      writeGrading(outDir, dry);
      return dry;
    }

    let error: string | undefined;
    const install = await commandRunner('pnpm', ['install', '--offline', '--frozen-lockfile'], {
      cwd: gameDir,
      timeoutMs: 10 * 60_000,
    });
    if (install.code !== 0) error = `pnpm install failed: ${oneLine(install.stderr || install.stdout)}`;

    let tokens: EvalRun['tokens'];
    if (!error) {
      const command = agentCommand(options.agent, gameDir, `${SYSTEM_LINE}\n\n${prompt}`);
      const agent = await commandRunner(command.command, command.args, {
        cwd: gameDir,
        timeoutMs: 45 * 60_000,
        // eslint-disable-next-line no-restricted-properties -- filter the complete inherited environment before the untrusted build agent sees it
        env: agentEnvironment(process.env),
      });
      writeFileSync(join(gameDir, 'agent.log'), `${agent.stdout}\n${agent.stderr}`);
      tokens = parseTokens(`${agent.stdout}\n${agent.stderr}`);
      if (agent.code !== 0)
        error = `agent failed${agent.timedOut ? ' (timeout)' : ''}: ${oneLine(agent.stderr || agent.stdout)}`;
    }

    const gate = async (name: 'check' | 'test' | 'run', extra: string[] = []) =>
      error
        ? { code: 1, stdout: '', stderr: error }
        : commandRunner(process.execPath, gmArgs(name, '--json', ...extra), {
            cwd: gameDir,
            timeoutMs: name === 'check' ? 5 * 60_000 : 15 * 60_000,
          });
    const check = await gate('check');
    const test = await gate('test', ['--inputs', join(dataRoot, 'inputs/basic.json')]);
    const runArgs = [
      '--headless',
      '--viewport',
      'phone',
      '--inputs',
      join(dataRoot, 'inputs/basic.json'),
      '--frames',
      '60,300',
      '--out',
      'shots',
    ];
    let captured = await gate('run', runArgs);
    if (!error && captured.code !== 0) captured = await gate('run', runArgs);
    const renderState = readRenderState(gameDir);
    const corpus = corpusPath(config.corpusEnv);
    const m1 = await calculateM1({
      gameDir,
      referenceDirs: [snippets, ...(corpus ? [corpus] : [])],
      freshDir: freshDirs.get(template),
      workDir: join(gameDir, '.m1'),
    });
    const m4 = await detectUnaskedMechanics({
      gameDir,
      expectedMechanics: brief.expectedMechanics,
      renderState,
      checklist,
    });
    const m5 = await calculateM5(gameDir, cards);
    const run: EvalRun = {
      brief: brief.id,
      config: config.name,
      agent: options.agent,
      dir: relativePath(gameDir),
      startedAt: started.toISOString(),
      durationMs: now().getTime() - started.getTime(),
      ...(tokens ? { tokens } : {}),
      gates: { check: check.code === 0, test: test.code === 0, run: runVerdict(gameDir, captured) },
      m1,
      m4,
      m5,
      m6: await collectM6Signature(gameDir, renderState),
      passed: false,
      ...(error ? { error } : {}),
    };
    run.passed = evaluateRun(run, thresholds);
    writeGrading(outDir, run);
    return run;
  });

  const benchmark = renderBenchmark(runs, thresholds, previousRuns(outDir));
  writeFileSync(join(outDir, 'benchmark.md'), benchmark);
  return { runs, outDir, benchmark };
}

export async function runEvalMain(args: string[], dependencies: RunnerDependencies = {}): Promise<number> {
  try {
    const result = await runEvaluation(parseOptions(args), dependencies);
    process.stdout.write(`${join(result.outDir, 'benchmark.md')}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return error instanceof EvalUsageError ? error.exitCode : 1;
  }
}
