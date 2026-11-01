import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import { preflight } from '../../src/policy/preflight.js';
import { renderCodexProfile } from '../../src/policy/profile.js';
import { renderAiurConfig } from '../../src/policy/render.js';
import { workedInput } from './fixtures.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('preflight', () => {
  it('passes when the config and profile match their renders', async () => {
    const setup = await writeRenderedFiles();

    await expect(preflight(setup.daemonDir, setup.input)).resolves.toEqual({ ok: true });
  });

  it.each([
    ['agent.codex', 'agent.codex', {}],
    ['agent.priority', 'agent.priority', []],
    ['agent.accounts', 'agent.accounts', {}],
    ['instance', 'instance', {}],
    ['workspace.root', 'workspace.root', '/tmp/other-workspace'],
    ['tracker.github.repo', 'tracker.github.repo', 'other/repository'],
    ['tracker.github.allowed_users', 'tracker.github.allowed_users', []],
    ['hooks_file', 'hooks_file', 'other-hooks'],
    ['prompt_file', 'prompt_file', 'other-prompt.md'],
    ['events.export.enabled', 'events.export.enabled', false],
  ])('reports drift in %s without throwing', async (_name, path, replacement) => {
    const setup = await writeRenderedFiles();
    const config: unknown = parse(renderAiurConfig(setup.input));
    setValueAt(config, path, replacement);
    await writeFile(join(setup.daemonDir, '.aiur/config'), stringify(config), 'utf8');

    const result = await preflight(setup.daemonDir, setup.input);

    expect(result).toEqual({
      ok: false,
      reasons: expect.arrayContaining([`config drift: ${path}`]),
    });
  });

  it('reports unsafe unguarded Claude and remote route settings', async () => {
    const setup = await writeRenderedFiles();
    const config: unknown = parse(renderAiurConfig(setup.input));
    setValueAt(config, 'agent.claude', { permission_mode: 'bypassPermissions' });
    setValueAt(config, 'agent.routing', ['codex+remote']);
    await writeFile(join(setup.daemonDir, '.aiur/config'), stringify(config), 'utf8');

    await expect(preflight(setup.daemonDir, setup.input)).resolves.toEqual({
      ok: false,
      reasons: expect.arrayContaining([
        'unsafe config: agent.claude.permission_mode',
        'unsafe config: remote agent route',
      ]),
    });
  });

  it('reports invalid YAML instead of throwing', async () => {
    const setup = await writeRenderedFiles();
    await writeFile(join(setup.daemonDir, '.aiur/config'), '[invalid', 'utf8');

    const result = await preflight(setup.daemonDir, setup.input);

    expect(result).toEqual({
      ok: false,
      reasons: [expect.stringMatching(/^invalid \.aiur\/config:/)],
    });
  });

  it('reports a profile hash mismatch', async () => {
    const setup = await writeRenderedFiles();
    await writeFile(join(setup.codexHome, 'config.toml'), '# drifted\n', 'utf8');

    await expect(preflight(setup.daemonDir, setup.input)).resolves.toEqual({
      ok: false,
      reasons: ['codex profile hash mismatch'],
    });
  });

  it('flags an installed profile that lacks the environment filter', async () => {
    const setup = await writeRenderedFiles();
    const unfiltered = renderCodexProfile(setup.input).replace(/\[shell_environment_policy\]\n[^[]*/, '');
    await writeFile(join(setup.codexHome, 'config.toml'), unfiltered, 'utf8');

    await expect(preflight(setup.daemonDir, setup.input)).resolves.toEqual({
      ok: false,
      reasons: ['codex profile hash mismatch'],
    });
  });

  it('returns reasons for missing files instead of throwing', async () => {
    const daemonDir = await createTemporaryDirectory();
    const codexHome = join(daemonDir, 'codex-home');

    await expect(preflight(daemonDir, { ...workedInput, codexHome })).resolves.toEqual({
      ok: false,
      reasons: ['missing .aiur/config', 'missing Codex profile'],
    });
  });
});

async function writeRenderedFiles() {
  const daemonDir = await createTemporaryDirectory();
  const codexHome = join(daemonDir, 'codex-home');
  const input = { ...workedInput, codexHome };
  await mkdir(join(daemonDir, '.aiur'), { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(daemonDir, '.aiur/config'), renderAiurConfig(input), 'utf8');
  await writeFile(join(codexHome, 'config.toml'), renderCodexProfile(input), 'utf8');
  return { codexHome, daemonDir, input };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ogm-builder-'));
  temporaryDirectories.push(directory);
  return directory;
}

function setValueAt(root: unknown, path: string, replacement: unknown): void {
  const parts = path.split('.');
  const finalPart = parts.pop();
  let current = root;

  for (const part of parts) {
    if (!isRecord(current)) throw new Error(`missing object at ${part}`);
    current = current[part];
  }

  if (!isRecord(current) || finalPart === undefined) throw new Error(`cannot set ${path}`);
  current[finalPart] = replacement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
