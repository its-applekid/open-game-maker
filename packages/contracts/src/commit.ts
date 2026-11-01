import { z } from 'zod';

const Visibility = z.enum(['public', 'private']);
const Identifier = z.string().min(1);
const Sha = z.string().min(1);

const BoundaryReason = z
  .object({
    code: z.enum(['path', 'size', 'secret', 'pii', 'rights', 'denylist']),
    path: z.string().optional(),
    detail: z.string().min(1),
  })
  .strict();

export const BoundaryVerdict = z
  .object({
    allowed: z.boolean(),
    reasons: z.array(BoundaryReason),
  })
  .strict();

export type BoundaryVerdict = z.infer<typeof BoundaryVerdict>;

export const CommitOp = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create_repo'),
      gameId: Identifier,
      owner: Identifier,
      visibility: Visibility,
      templateRef: Identifier,
    })
    .strict(),
  z
    .object({
      kind: z.literal('fold_design'),
      gameId: Identifier,
      base: Sha,
      files: z.array(
        z
          .object({
            path: z.string().min(1),
            content: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal('fork'),
      sourceGameId: Identifier,
      sourceSha: Sha,
      newGameId: Identifier,
      owner: Identifier,
      visibility: Visibility,
    })
    .strict(),
  z
    .object({
      kind: z.literal('release'),
      gameId: Identifier,
      sha: Sha,
      semver: Identifier,
      changelog: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('merge'),
      gameId: Identifier,
      prNumber: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('set_visibility'),
      gameId: Identifier,
      visibility: Visibility,
    })
    .strict(),
  z
    .object({
      kind: z.literal('file_issue'),
      title: z.string().min(1),
      body: z.string(),
      labels: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      kind: z.literal('create_branch'),
      gameId: Identifier,
      branch: Identifier,
      sha: Sha,
    })
    .strict(),
]);

export type CommitOp = z.infer<typeof CommitOp>;

export const CommitResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), sha: z.string().min(1) }).strict(),
  z.object({ ok: z.literal(false), verdict: BoundaryVerdict }).strict(),
]);

export type CommitResult = z.infer<typeof CommitResult>;

export const schemas = {
  'commit.v1': CommitOp,
} satisfies Record<'commit.v1', z.ZodType>;
