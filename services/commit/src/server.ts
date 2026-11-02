import { createHash, timingSafeEqual } from 'node:crypto';

import { getConnInfo } from '@hono/node-server/conninfo';
import { CommitOp as CommitOpSchema } from '@ogm/contracts';
import { Hono } from 'hono';
import type { Context } from 'hono';

import type { AuditEntry, AuditWriter } from './audit.js';
import type { ActiveRepository } from './boundary/api-client.js';
import type { BoundaryCheck } from './boundary/poller.js';
import { registerBoundaryWebhook } from './boundary/webhook.js';
import type { OperationContext, RepositoryResolver } from './ops/context.js';
import { executeOperation } from './ops/registry.js';
import { repositoryName } from './paths.js';
import type { CommitOp, CommitResult, Repository } from './types.js';

type ServerDependencies = {
  serviceToken: string;
  operations: Omit<OperationContext, 'repos'>;
  repos: RepositoryResolver;
  audit: AuditWriter;
  remoteAddress?: (context: Context) => string | undefined;
  execute?: (op: CommitOp, context: OperationContext) => Promise<CommitResult>;
  now?: () => Date;
  boundaryWebhook?: {
    secret: string | undefined;
    resolveRepository(owner: string, name: string): Promise<ActiveRepository | undefined>;
    run: BoundaryCheck;
    onError?(error: unknown): void;
  };
};

function tokenMatches(expected: string, authorization: string | undefined): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const received = authorization.slice('Bearer '.length);
  const expectedDigest = createHash('sha256').update(expected).digest();
  const receivedDigest = createHash('sha256').update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function gameIdOf(op: CommitOp): string {
  if (op.kind === 'fork') return op.newGameId;
  if (op.kind === 'file_issue') return 'platform';
  return op.gameId;
}

async function repoNameFor(op: CommitOp, context: OperationContext): Promise<string> {
  if (op.kind === 'create_repo') return `${op.owner}/${repositoryName(op.gameId)}`;
  if (op.kind === 'fork') return `${op.owner}/${repositoryName(op.newGameId)}`;
  if (op.kind === 'file_issue') {
    return `${context.platformIssueRepo.owner}/${context.platformIssueRepo.name}`;
  }
  const repo = await context.repos.resolve(op.gameId);
  return `${repo.owner}/${repo.name}`;
}

function memoizedRepos(source: RepositoryResolver): RepositoryResolver {
  const values = new Map<string, Promise<Repository>>();
  return {
    resolve(gameId: string): Promise<Repository> {
      const existing = values.get(gameId);
      if (existing !== undefined) return existing;
      const pending = source.resolve(gameId);
      values.set(gameId, pending);
      return pending;
    },
  };
}

export function createCommitApp(dependencies: ServerDependencies): Hono {
  if (Buffer.byteLength(dependencies.serviceToken, 'utf8') < 32) {
    throw new Error('OGM_COMMIT_SERVICE_TOKEN must be at least 32 bytes');
  }
  const app = new Hono();
  const startedAt = Date.now();
  const remoteAddress = dependencies.remoteAddress ?? ((context: Context) => getConnInfo(context).remote.address);

  app.get('/healthz', (context) =>
    context.json({
      ok: true,
      service: 'commit',
      version: '0.0.0',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1_000),
    }),
  );

  if (dependencies.boundaryWebhook !== undefined) {
    registerBoundaryWebhook(app, dependencies.boundaryWebhook);
  }

  app.post('/internal/commit', async (context) => {
    if (!isLoopback(remoteAddress(context))) return context.json({ error: 'loopback required' }, 403);
    if (!tokenMatches(dependencies.serviceToken, context.req.header('authorization'))) {
      return context.json({ error: 'unauthorized' }, 401);
    }
    const parsed = CommitOpSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!parsed.success) {
      return context.json({ error: { code: 'invalid_op', issues: parsed.error.issues } }, 422);
    }

    const operationContext: OperationContext = {
      ...dependencies.operations,
      repos: memoizedRepos(dependencies.repos),
    };
    const execute = dependencies.execute ?? executeOperation;
    let result: CommitResult | undefined;
    let failure: unknown;
    try {
      result = await execute(parsed.data, operationContext);
    } catch (error) {
      failure = error;
    }

    const entry: AuditEntry = {
      at: (dependencies.now ?? (() => new Date()))().toISOString(),
      op: parsed.data.kind,
      gameId: gameIdOf(parsed.data),
      repo: await repoNameFor(parsed.data, operationContext).catch(() => 'unresolved'),
      result: failure === undefined ? (result?.ok === true ? 'allowed' : 'refused') : 'error',
      ...(result?.ok === true ? { sha: result.sha } : {}),
      ...(result?.ok === false ? { verdict: result.verdict } : {}),
      actor: 'api',
    };
    await dependencies.audit.append(entry);
    if (failure !== undefined) return context.json({ error: 'commit operation failed' }, 502);
    return context.json(result as CommitResult, 200);
  });
  return app;
}
