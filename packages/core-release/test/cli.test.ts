import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { main } from '../src/cli.js';
import type { RunCommand } from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** A core workspace on disk whose closure is contracts → sdk. */
async function coreWorkspace(): Promise<{ root: string; list: string }> {
  const root = await mkdtemp(join(tmpdir(), 'core-release-cli-core-'));
  dirs.push(root);
  const packages = [
    {
      name: '@ogm/contracts',
      folder: 'contracts',
      manifest: { name: '@ogm/contracts', version: '0.0.0', exports: { '.': './dist/index.js' } },
    },
    {
      name: '@gm/sdk',
      folder: 'sdk',
      manifest: {
        name: '@gm/sdk',
        version: '0.0.0',
        exports: { '.': './dist/index.js' },
        dependencies: { '@ogm/contracts': 'workspace:*' },
      },
    },
  ];
  for (const pkg of packages) {
    const dir = join(root, 'packages', pkg.folder);
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist/index.js'), 'export const x = 1;\n');
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkg.manifest));
  }
  const list = JSON.stringify(packages.map((pkg) => ({ name: pkg.name, path: join(root, 'packages', pkg.folder) })));
  return { root, list };
}

async function instanceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-cli-instance-'));
  dirs.push(dir);
  await cp(join(here, 'fixtures', 'instance-vendored'), dir, { recursive: true });
  await mkdir(join(dir, 'vendor'), { recursive: true });
  for (const tarball of [
    'gm-sdk-3cef9ec65caa.tgz',
    'ogm-contracts-3cef9ec65caa.tgz',
    'gm-pack-kaykit-3cef9ec65caa.tgz',
  ]) {
    await writeFile(join(dir, 'vendor', tarball), 'placeholder\n');
  }
  return dir;
}

const run: RunCommand = async (file, args, options) => {
  if (file === 'pnpm' && args[0] === '-r') {
    const workspace = await coreWorkspace();
    return { code: 0, stdout: workspace.list, stderr: '' };
  }
  if (file === 'git' && args[0] === 'rev-parse') return { code: 0, stdout: `${SHA}\n`, stderr: '' };
  if (file === 'pnpm' && args[0] === 'pack') {
    const destination = args[args.indexOf('--pack-destination') + 1] as string;
    const manifest = JSON.parse(await readFile(join(options.cwd, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    const tarball = join(destination, `${manifest.name.replace(/[^a-z0-9]+/gi, '-')}.tgz`);
    await writeFile(tarball, 'packed\n');
    return { code: 0, stdout: `📦  ${tarball}\n`, stderr: '' };
  }
  return { code: 1, stdout: '', stderr: `unexpected command ${file} ${args.join(' ')}` };
};

describe('core-release switch', () => {
  it('takes the pin from the instance repository when --core-sha is absent and writes nothing without --apply', async () => {
    const dir = await instanceRepo();
    const lines: string[] = [];
    const code = await main(
      ['switch', '--dir', dir, '--scope', '@its-owner', '--root', dir, '--roots', '@gm/sdk,@ogm/contracts'],
      {
        run,
        env: {},
        log: (line) => lines.push(line),
      },
    );

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('pin 3cef9ec65caa');
    expect(lines.join('\n')).toContain('dry run: nothing written');
    const manifest = JSON.parse(await readFile(join(dir, 'games/example-2d/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['@gm/sdk']).toBe('file:../../vendor/gm-sdk-3cef9ec65caa.tgz');
  });

  it('refuses a switch without --dir', async () => {
    const { root } = await coreWorkspace();
    await expect(
      main(['switch', '--scope', '@its-owner', '--root', root, '--roots', '@gm/sdk'], { run, env: {}, log: () => {} }),
    ).rejects.toThrow(/switch needs --dir/);
  });

  it('refuses an unknown command and points at the help', async () => {
    await expect(
      main(['publishish', '--scope', '@its-owner', '--roots', '@gm/sdk'], { run, env: {}, log: () => {} }),
    ).rejects.toThrow(/unknown command publishish/);
  });

  it('prints the help when no command is given', async () => {
    const lines: string[] = [];
    const code = await main([], { run, env: {}, log: (line) => lines.push(line) });
    expect(code).toBe(2);
    expect(lines.join('\n')).toContain('core-release — prepare core package publishing');
  });
});

describe('core-release publish', () => {
  it('dry runs the whole closure without a token and without the network', async () => {
    const { root } = await coreWorkspace();
    const lines: string[] = [];
    const code = await main(
      ['publish', '--root', root, '--scope', '@its-owner', '--dry-run', '--roots', '@gm/sdk,@ogm/contracts'],
      {
        run,
        env: {},
        log: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('@its-owner/contracts@0.0.0-core.3cef9ec65caa');
    expect(lines.join('\n')).toContain('2 packages would be published from 3cef9ec65caa');
  });

  it('refuses to publish without the token in the environment', async () => {
    const { root } = await coreWorkspace();
    await expect(
      main(['publish', '--root', root, '--scope', '@its-owner', '--apply', '--roots', '@gm/sdk,@ogm/contracts'], {
        run,
        env: {},
        log: () => {},
      }),
    ).rejects.toThrow(/needs CORE_PACKAGES_PUBLISH_TOKEN/);
  });

  it('takes the scope from GITHUB_REPOSITORY_OWNER when none is passed', async () => {
    const { root } = await coreWorkspace();
    const lines: string[] = [];
    const code = await main(['publish', '--root', root, '--dry-run', '--roots', '@gm/sdk,@ogm/contracts'], {
      run,
      env: { GITHUB_REPOSITORY_OWNER: 'its-owner' },
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('scope @its-owner');
  });

  it('refuses a run with no scope and no owner in the environment', async () => {
    const { root } = await coreWorkspace();
    await expect(
      main(['publish', '--root', root, '--dry-run', '--roots', '@gm/sdk,@ogm/contracts'], {
        run,
        env: {},
        log: () => {},
      }),
    ).rejects.toThrow(/no scope: pass --scope/);
  });
});
