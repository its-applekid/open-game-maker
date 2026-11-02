import type { ExtractCommitOp } from './operation-types.js';
import type { OperationContext } from './context.js';
import { createCommit, createTreeFromFiles } from './git-data.js';
import { createPrivateRepository } from './repository.js';
import { repositoryName } from '../paths.js';
import type { CommitResult, Repository } from '../types.js';

export async function createRepo(op: ExtractCommitOp<'create_repo'>, context: OperationContext): Promise<CommitResult> {
  const name = repositoryName(op.gameId);
  const repository: Repository = { owner: op.owner, name, visibility: 'private' };
  const rendered = await context.templates.render(op.templateRef, op);
  if (op.visibility === 'public') {
    const verdict = await context.gate.evaluate({
      kind: 'set_visibility',
      gameId: op.gameId,
      repository,
      targetVisibility: 'public',
      files: rendered.files.map(({ path, content, mode }) => ({ path, content, mode })),
    });
    if (!verdict.allowed) return { ok: false, verdict };
  }

  const github = await context.app.forOwner(op.owner);
  await createPrivateRepository(github, op.owner, name);
  const identity = await context.app.identity();
  const tree = await createTreeFromFiles(github.request, repository, rendered.files);
  const sha = await createCommit(github.request, repository, `chore: initialize ${op.gameId}`, tree, identity);
  await github.request('POST /repos/{owner}/{repo}/git/refs', {
    ...repository,
    ref: 'refs/heads/main',
    sha,
  });

  for (const label of rendered.labels) {
    await github.request('POST /repos/{owner}/{repo}/labels', { ...repository, ...label });
  }
  await github.request('POST /repos/{owner}/{repo}/rulesets', {
    ...repository,
    name: 'main',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'pull_request' },
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: rendered.requiredChecks.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      },
    ],
  });
  await github.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
    ...repository,
    username: context.builderBotLogin,
    permission: 'push',
  });
  if (op.visibility === 'public') {
    await github.request('PATCH /repos/{owner}/{repo}', { ...repository, private: false });
  }
  return { ok: true, sha };
}
