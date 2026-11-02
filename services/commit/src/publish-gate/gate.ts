import type { BoundaryVerdict } from '@ogm/contracts';

import type { BoundaryApi } from '../boundary/api-client.js';
import type { BlocklistLoader } from '../boundary/blocklist.js';
import { evaluateBoundary } from '../boundary/evaluate.js';
import {
  buildDiffInput,
  buildInlineDiffInput,
  buildInlineTreeInput,
  buildTreeInput,
  mainHead,
} from '../boundary/inputs.js';
import type { BoundaryGate, GateInput } from '../gate.js';
import { allowed } from '../result.js';
import type { GitHubApp } from '../types.js';

class BoundaryGateInputError extends Error {
  constructor(field: string) {
    super(`boundary gate requires ${field}`);
    this.name = 'BoundaryGateInputError';
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new BoundaryGateInputError(field);
  return value;
}

function gateError(error: unknown): BoundaryVerdict {
  return {
    allowed: false,
    reasons: [{ code: 'denylist', detail: `gate error: ${error instanceof Error ? error.name : 'UnknownError'}` }],
  };
}

export class RealBoundaryGate implements BoundaryGate {
  readonly #app: GitHubApp;
  readonly #api: BoundaryApi;
  readonly #blocklist: BlocklistLoader;

  constructor(options: { app: GitHubApp; api: BoundaryApi; blocklist: BlocklistLoader }) {
    this.#app = options.app;
    this.#api = options.api;
    this.#blocklist = options.blocklist;
  }

  async evaluate(input: GateInput): Promise<BoundaryVerdict> {
    if (input.kind === 'set_visibility' && input.targetVisibility === 'private') return allowed();
    if (!['fold_design', 'merge', 'release', 'set_visibility'].includes(input.kind)) return allowed();

    try {
      const [blocklist, profileNames] = await Promise.all([this.#blocklist.load(), this.#api.piiTerms(input.gameId)]);
      if (input.kind === 'set_visibility' && input.files !== undefined) {
        return evaluateBoundary(
          buildInlineTreeInput({
            files: input.files,
            visibility: 'public',
            actor: 'platform',
            blocklist,
            profileNames,
          }),
        );
      }

      const github = await this.#app.forOwner(input.repository.owner);

      if (input.kind === 'fold_design') {
        return evaluateBoundary(
          await buildInlineDiffInput({
            request: github.request,
            repository: input.repository,
            baseSha: required(input.sha, 'sha'),
            files: required(input.files, 'files'),
            blocklist,
            profileNames,
          }),
        );
      }

      if (input.kind === 'merge') {
        const expectedHead = required(input.sha, 'sha');
        const built = await buildDiffInput({
          request: github.request,
          repository: input.repository,
          prNumber: required(input.prNumber, 'prNumber'),
          blocklist,
          profileNames,
        });
        if (built.headSha !== expectedHead) {
          return {
            allowed: false,
            reasons: [{ code: 'denylist', detail: 'pull request head changed during boundary check' }],
          };
        }
        return evaluateBoundary(built.input);
      }

      const sha =
        input.kind === 'release'
          ? required(input.sha, 'sha')
          : (input.sha ?? (await mainHead(github.request, input.repository)));
      return evaluateBoundary(
        await buildTreeInput({
          request: github.request,
          repository: input.repository,
          sha,
          visibility: input.kind === 'set_visibility' ? 'public' : input.repository.visibility,
          blocklist,
          profileNames,
        }),
      );
    } catch (error) {
      return gateError(error);
    }
  }
}
