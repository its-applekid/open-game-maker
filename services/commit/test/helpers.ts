import type { BoundaryGate } from '../src/gate.js';
import { allowed } from '../src/result.js';
import type { TemplateSource } from '../src/template-source.js';
import type { AuthenticatedGitHub, GitHubApp, GitHubIdentity, GitHubRequest, Repository } from '../src/types.js';
import type { OperationContext } from '../src/ops/context.js';

export type Call = { route: string; parameters: Record<string, unknown> };

export function fakeRequest(
  responder: (call: Call, index: number) => unknown | Promise<unknown>,
  calls: Call[] = [],
): { request: GitHubRequest; calls: Call[] } {
  return {
    calls,
    request: async <T>(route: string, parameters: Record<string, unknown> = {}) => {
      const call = { route, parameters };
      calls.push(call);
      return { data: (await responder(call, calls.length - 1)) as T };
    },
  };
}

export function contextWith(
  request: GitHubRequest,
  overrides: Partial<OperationContext> = {},
  repository: Repository = { owner: 'alice', name: 'gm-game-1', visibility: 'private' },
): OperationContext {
  const github: AuthenticatedGitHub = { accountType: 'User', request };
  const app: GitHubApp = {
    async forOwner() {
      return github;
    },
    async identity(): Promise<GitHubIdentity> {
      return { name: 'ogm-app[bot]', email: 'ogm-app[bot]@users.noreply.github.com' };
    },
  };
  const gate: BoundaryGate = {
    async evaluate() {
      return allowed();
    },
  };
  const templates: TemplateSource = {
    async render() {
      return { files: [], labels: [], requiredChecks: ['ci / required', 'ogm/boundary'] };
    },
  };
  return {
    app,
    gate,
    repos: {
      async resolve() {
        return repository;
      },
    },
    templates,
    builderBotLogin: 'builder-bot',
    platformIssueRepo: { owner: 'platform', name: 'bugs' },
    ...overrides,
  };
}
