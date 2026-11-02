import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const siteDir = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'ogm-site-freshness-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/* a checkout where apps/site and SETUP.md are real copies (safe to edit) and everything else links to this checkout,
   so the build still finds cited paths, apps/web/src/tokens.css and the installed node_modules */
function scratchCheckout(): string {
  const root = join(scratch, 'repo');
  mkdirSync(join(root, 'apps'), { recursive: true });
  for (const name of readdirSync(repositoryRoot)) {
    if (name !== 'apps' && name !== 'SETUP.md' && name !== '.git')
      symlinkSync(join(repositoryRoot, name), join(root, name));
  }
  for (const name of readdirSync(join(repositoryRoot, 'apps'))) {
    if (name !== 'site') symlinkSync(join(repositoryRoot, 'apps', name), join(root, 'apps', name));
  }
  cpSync(siteDir, join(root, 'apps/site'), {
    recursive: true,
    filter: (source) => !source.startsWith(join(siteDir, 'node_modules')),
  });
  symlinkSync(join(siteDir, 'node_modules'), join(root, 'apps/site/node_modules'));
  cpSync(join(repositoryRoot, 'SETUP.md'), join(root, 'SETUP.md'));
  return root;
}

function check(root: string) {
  return spawnSync(process.execPath, ['tools/build.mts', '--check'], {
    cwd: join(root, 'apps/site'),
    encoding: 'utf8',
  });
}

describe('tools/build.mts --check', () => {
  it('passes on the committed tree and fails after a one-character YAML change', () => {
    const root = scratchCheckout();

    const fresh = check(root);
    expect(fresh.stderr).toBe('');
    expect(fresh.status).toBe(0);

    const yamlPath = join(root, 'apps/site/content/setup.yaml');
    const yaml = readFileSync(yamlPath, 'utf8');
    expect(yaml).toContain('title: Host an instance\n');
    writeFileSync(yamlPath, yaml.replace('title: Host an instance\n', 'title: Host an instancf\n'));

    const stale = check(root);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Generated SETUP.md is stale');
    /* --check never rewrites SETUP.md */
    expect(readFileSync(join(root, 'SETUP.md'), 'utf8')).toBe(readFileSync(join(repositoryRoot, 'SETUP.md'), 'utf8'));
  }, 60_000);
});
