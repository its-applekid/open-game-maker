import { pathToFileURL } from 'node:url';

import type { RunCommand } from './bump.js';
import { readSettings, type Settings } from './config.js';
import { runCommand } from './exec.js';
import { anonymousCoreRemote, installationGitHub, type CoreRemote, type InstanceGitHub } from './github.js';
import { failed, runPass, type Outcome } from './run.js';

type Connect = (settings: Settings, fetchImpl: typeof fetch) => Promise<{ core: CoreRemote; github: InstanceGitHub }>;

export type MainDeps = {
  readonly run?: RunCommand;
  readonly fetchImpl?: typeof fetch;
  readonly connect?: Connect;
  readonly out?: (line: string) => void;
};

const defaultConnect: Connect = async (settings, fetchImpl) => ({
  core: anonymousCoreRemote(fetchImpl),
  github: await installationGitHub(settings.auth, fetchImpl),
});

function describe(outcome: Outcome): string {
  switch (outcome.action) {
    case 'current':
      return `${outcome.repo}: current (${outcome.pin.slice(0, 12)})`;
    case 'pull-open':
      return `${outcome.repo}: a core bump pull request is already open ${outcome.url}`;
    case 'no-pin':
      return `${outcome.repo}: skipped, ${outcome.detail}`;
    case 'no-script':
      return `${outcome.repo}: skipped, no scripts/bump-core.sh`;
    case 'no-change':
      return `${outcome.repo}: scripts/bump-core.sh changed nothing (pin ${outcome.pin.slice(0, 12)})`;
    case 'opened':
      return `${outcome.repo}: opened ${outcome.url} from ${outcome.branch} (pin ${outcome.pin.slice(0, 12)})`;
    case 'error':
      return `${outcome.repo}: error ${outcome.message}`;
  }
}

/**
 * One timer tick: read the core's head commit and bring every instance repository up to it.
 * Returns the process exit code — 1 when any repository failed, so the unit's journal flags it.
 */
export async function main(source?: Record<string, string | undefined>, deps: MainDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  let settings: Settings;
  try {
    settings = readSettings(source);
  } catch (error) {
    out(`core-bump: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let targetSha: string;
  let github: InstanceGitHub;
  try {
    const connection = await (deps.connect ?? defaultConnect)(settings, fetchImpl);
    github = connection.github;
    targetSha = await connection.core.headSha(settings.coreRepo, settings.coreBranch);
  } catch (error) {
    out(`core-bump: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  let outcomes: Outcome[];
  try {
    outcomes = await runPass({
      repos: settings.repos,
      coreRepo: settings.coreRepo,
      coreBranch: settings.coreBranch,
      targetSha,
      workRoot: settings.workDir,
      github,
      run: deps.run ?? runCommand,
    });
  } catch (error) {
    out(`core-bump: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  for (const outcome of outcomes) out(`core-bump ${describe(outcome)}`);
  return failed(outcomes) ? 1 : 0;
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  process.exitCode = await main();
}
