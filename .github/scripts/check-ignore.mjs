import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const mustIgnore = [
  'assets-local/x',
  'prototypes/ui-v0/tools/_pf.mjs',
  '.claude/worktrees/x',
  'node_modules/x',
  'scripts/audio/.venv/x',
  'scripts/py/audio/.venv/x',
  '.env',
  '.netlify/x',
];

const mustTrack = ['AGENTS.md', '.env.example', '.github/workflows/ci.yml'];

function checkIgnored(path, expected) {
  const result = spawnSync('git', ['check-ignore', '-q', '--no-index', path], { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed for ${path} with exit ${result.status}`);
  }

  const ignored = result.status === 0;

  if (ignored !== expected) {
    throw new Error(`${path} must ${expected ? '' : 'not '}be ignored`);
  }
}

for (const path of mustIgnore) {
  checkIgnored(path, true);
}

for (const path of mustTrack) {
  checkIgnored(path, false);
}

const agents = readFileSync('AGENTS.md', 'utf8');
for (const requiredText of [
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'Closes #',
  '## Local tests',
  '127.0.0.1',
  'GM_VERIFY_SOFTWARE_GL',
]) {
  if (!agents.includes(requiredText)) {
    throw new Error(`AGENTS.md must include ${JSON.stringify(requiredText)}`);
  }
}

process.stdout.write('ignore: required paths and AGENTS.md guidance ok\n');
