import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { main } from '../src/cli.js';
import { registryProfile } from '../src/profile.js';
import type { RunCommand } from '../src/run.js';
import { applySwitch, planSwitch } from '../src/switch.js';

const here = dirname(fileURLToPath(import.meta.url));
const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';

const versions = new Map([
  ['@ogm/contracts', '0.0.0-core.3cef9ec65caa'],
  ['@gm/sdk', '0.0.0-core.3cef9ec65caa'],
  ['@gm/pack-kaykit', '0.0.0-core.3cef9ec65caa'],
]);

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

  it('records the released version set next to the pin when --apply writes', async () => {
    const dir = await instanceRepo();
    const lines: string[] = [];
    const code = await main(
      ['switch', '--dir', dir, '--scope', '@its-owner', '--root', dir, '--roots', '@gm/sdk,@ogm/contracts', '--apply'],
      { run, env: {}, log: (line) => lines.push(line) },
    );

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('vendor/core-packages.json');
    const set = JSON.parse(await readFile(join(dir, 'vendor', 'core-packages.json'), 'utf8')) as {
      core: { sha: string; packages: Record<string, string> };
    };
    expect(set.core.sha).toBe(SHA);
    expect(set.core.packages['@gm/sdk']).toBe('npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa');
    expect(await stat(join(dir, 'vendor/gm-sdk-3cef9ec65caa.tgz')).catch(() => null)).toBeNull();
  });

  it('migrates a standalone game repository on an explicit --core-sha', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'core-release-cli-standalone-'));
    dirs.push(dir);
    await mkdir(join(dir, 'vendor'), { recursive: true });
    await writeFile(join(dir, 'vendor', 'gm-sdk-3cef9ec65caa.tgz'), 'placeholder\n');
    await writeFile(
      join(dir, 'package.json'),
      `${JSON.stringify(
        { name: 'standalone-game', dependencies: { '@gm/sdk': 'file:vendor/gm-sdk-3cef9ec65caa.tgz' } },
        null,
        2,
      )}\n`,
    );
    const lines: string[] = [];
    const code = await main(
      [
        'switch',
        '--dir',
        dir,
        '--scope',
        '@its-owner',
        '--root',
        dir,
        '--roots',
        '@gm/sdk',
        '--core-sha',
        SHA,
        '--apply',
      ],
      { run, env: {}, log: (line) => lines.push(line) },
    );

    expect(code).toBe(0);
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['@gm/sdk']).toBe('npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa');
    expect(JSON.parse(await readFile(join(dir, 'vendor', 'core-packages.json'), 'utf8'))).toMatchObject({
      core: { sha: SHA },
    });
  });

  it('refuses a repository with no pin when --core-sha is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'core-release-cli-nopin-'));
    dirs.push(dir);
    await expect(
      main(['switch', '--dir', dir, '--scope', '@its-owner', '--root', dir, '--roots', '@gm/sdk'], {
        run,
        env: {},
        log: () => {},
      }),
    ).rejects.toThrow(/has no vendor\/core.json.*pass --core-sha/);
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

describe('core-release diagnose', () => {
  const noWorkspace: RunCommand = async (file, args) =>
    Promise.reject(new Error(`diagnose must not read the core workspace (${file} ${args.join(' ')})`));

  it('exits 1 and names each finding before a switch, without loading the core workspace', async () => {
    const dir = await instanceRepo();
    const lines: string[] = [];
    const code = await main(['diagnose', '--dir', dir, '--scope', '@its-owner'], {
      run: noWorkspace,
      env: {},
      log: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('core packages:');
    expect(output).toContain('legacy-specifier games/example-2d/package.json');
    expect(output).toContain('set-missing vendor/core-packages.json');
    expect(output).toContain('run core-release switch');
  });

  it('exits 0 on a switched repository', async () => {
    const dir = await instanceRepo();
    await applySwitch(
      await planSwitch({ dir, profile: registryProfile({ scope: '@its-owner' }), versions, coreSha: SHA }),
    );
    const lines: string[] = [];
    const code = await main(['diagnose', '--dir', dir, '--scope', '@its-owner'], {
      run: noWorkspace,
      env: {},
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toBe(`core packages ok in ${dir}`);
  });

  it('needs --dir', async () => {
    await expect(main(['diagnose'], { run: noWorkspace, env: {}, log: () => {} })).rejects.toThrow(
      /diagnose needs --dir/,
    );
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

  it('defaults to the npmjs registry, the default scope and public access', async () => {
    const { root } = await coreWorkspace();
    const lines: string[] = [];
    const code = await main(['publish', '--root', root, '--dry-run', '--roots', '@gm/sdk,@ogm/contracts'], {
      run,
      env: {},
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('registry https://registry.npmjs.org');
    expect(lines.join('\n')).toContain('scope @open-game-maker');
    expect(lines.join('\n')).toContain('access public');
    expect(lines.join('\n')).toContain('@open-game-maker/contracts@0.0.0-core.3cef9ec65caa');
  });

  it('points the tarball at GITHUB_REPOSITORY so npm can match the trusted publisher', async () => {
    const { root } = await coreWorkspace();
    const lines: string[] = [];
    const code = await main(
      ['publish', '--root', root, '--dry-run', '--scope', '@its-owner', '--roots', '@gm/sdk,@ogm/contracts'],
      {
        run,
        env: { GITHUB_REPOSITORY: 'its-owner/open-game-maker' },
        log: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('repository https://github.com/its-owner/open-game-maker');
  });

  it('publishes with no token when the registry is npmjs', async () => {
    const { root } = await coreWorkspace();
    const calls: { args: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
    const publishRun: RunCommand = async (file, args, options) => {
      if (file === 'npm') {
        calls.push({ args, env: options.env });
        return { code: 0, stdout: 'ok', stderr: '' };
      }
      return run(file, args, options);
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not found', { status: 404 }));
    const lines: string[] = [];
    const code = await main(
      ['publish', '--root', root, '--scope', '@its-owner', '--apply', '--roots', '@gm/sdk,@ogm/contracts'],
      { run: publishRun, env: {}, log: (line) => lines.push(line), fetchImpl },
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('publishing with npm OIDC trusted publishing');
    expect(calls.map((call) => call.args[0])).toEqual(['publish', 'publish']);
    expect(calls[0]?.args).toContain('https://registry.npmjs.org');
    expect(calls[0]?.env).toEqual({});
  });

  it('proves the trusted publisher with --verify-oidc and publishes nothing on a dry run', async () => {
    const { root } = await coreWorkspace();
    const calls: string[][] = [];
    const verifyRun: RunCommand = async (file, args, options) => {
      if (file === 'npm') {
        calls.push([...args]);
        return { code: 0, stdout: 'npm verb oidc Successfully retrieved and set token', stderr: '' };
      }
      return run(file, args, options);
    };
    const lines: string[] = [];
    const code = await main(
      [
        'publish',
        '--root',
        root,
        '--scope',
        '@its-owner',
        '--dry-run',
        '--verify-oidc',
        '--roots',
        '@gm/sdk,@ogm/contracts',
      ],
      { run: verifyRun, env: {}, log: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls.every((args) => args.includes('--dry-run'))).toBe(true);
    expect(lines.join('\n')).toContain('the trusted publisher answered; nothing was published');
  });

  it('fails --verify-oidc when the trusted publisher refuses the exchange', async () => {
    const { root } = await coreWorkspace();
    const verifyRun: RunCommand = async (file, args, options) => {
      if (file === 'npm') {
        return { code: 0, stdout: 'npm verb oidc Failed token exchange request with body message: no', stderr: '' };
      }
      return run(file, args, options);
    };
    const lines: string[] = [];
    const code = await main(
      ['publish', '--root', root, '--scope', '@its-owner', '--dry-run', '--verify-oidc', '--roots', '@gm/sdk'],
      { run: verifyRun, env: {}, log: (line) => lines.push(line) },
    );
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('trusted publisher FAILED');
  });

  it('refuses a tokenless publish to a registry without trusted publishing', async () => {
    const { root } = await coreWorkspace();
    await expect(
      main(
        [
          'publish',
          '--root',
          root,
          '--registry',
          'http://127.0.0.1:4873',
          '--scope',
          '@its-owner',
          '--apply',
          '--roots',
          '@gm/sdk,@ogm/contracts',
        ],
        { run, env: {}, log: () => {} },
      ),
    ).rejects.toThrow(/only registry.npmjs.org authenticates with OIDC/);
  });
});
