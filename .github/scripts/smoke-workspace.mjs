import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const packagesDir = join(root, 'packages');
const smokeDir = join(packagesDir, '_smoke');
const sourceDir = join(smokeDir, 'src');
const packagesDirExisted = existsSync(packagesDir);

if (existsSync(smokeDir)) {
  throw new Error(`refusing to overwrite existing smoke package: ${smokeDir}`);
}

function run(args, expectSuccess = true) {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`pnpm ${args.join(' ')} terminated by ${result.signal}`);
  }

  if ((result.status === 0) !== expectSuccess) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`pnpm ${args.join(' ')} ${expectSuccess ? 'failed' : 'unexpectedly passed'}`);
  }
}

try {
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    join(smokeDir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@ogm/_smoke',
        private: true,
        type: 'module',
        version: '0.0.0',
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(smokeDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(sourceDir, 'add.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  writeFileSync(
    join(sourceDir, 'add.test.ts'),
    "import { describe, expect, it } from 'vitest';\nimport { add } from './add.js';\n\ndescribe('add', () => {\n  it('adds two numbers', () => {\n    expect(add(2, 2)).toBe(4);\n  });\n});\n",
  );

  run(['--filter', '@ogm/_smoke', 'exec', 'vitest', 'run']);
  run(['--filter', '@ogm/_smoke', 'exec', 'tsc', '-p', 'tsconfig.json', '--noEmit']);

  appendFileSync(join(sourceDir, 'add.ts'), "export const bad: number = 'x';\n");
  run(['--filter', '@ogm/_smoke', 'exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], false);

  process.stdout.write('smoke: test ok, typecheck fails on type error ok\n');
} finally {
  if (existsSync(smokeDir)) {
    rmSync(smokeDir, { recursive: true, force: true });
  }
  if (!packagesDirExisted && existsSync(packagesDir) && readdirSync(packagesDir).length === 0) {
    rmdirSync(packagesDir);
  }
}
