import { isAbsolute } from 'node:path';

import { z } from 'zod';

export class PolicyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolation';
  }
}

const loginPattern = /^[A-Za-z0-9-]+$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const absolutePath = z.string().min(1).refine(isAbsolute, 'must be an absolute path');
const denyReadPath = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('~/') || isAbsolute(value), 'must be absolute or start with ~/');

export const RenderInputSchema = z
  .object({
    repo: z.string().regex(repositoryPattern, 'must be an owner/name repository'),
    baseBranch: z.literal('main').default('main'),
    workspaceRoot: absolutePath.refine(
      (value) => value !== '/tmp' && !value.startsWith('/tmp/'),
      'must not be under /tmp',
    ),
    port: z.number().int().min(1024).max(65535),
    intakeLogin: z.string().regex(loginPattern),
    botAccount: z.string().regex(loginPattern),
    kind: z.enum(['new_game', 'feature', 'repair']),
    maxConcurrentAgents: z.union([z.literal(1), z.literal(2)]).default(1),
    denyReadRoots: z.array(denyReadPath),
    instanceId: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    codexHome: absolutePath.optional(),
    overrides: z
      .object({
        networkAccess: z.boolean().optional(),
        excludeSlashTmp: z.boolean().optional(),
        writableRoots: z.array(z.string()).optional(),
        approvalPolicy: z.string().optional(),
        permissionMode: z.string().optional(),
        instanceMode: z.enum(['local', 'hosted']).optional(),
        claude: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RenderInput = z.input<typeof RenderInputSchema>;
export type ValidatedRenderInput = z.output<typeof RenderInputSchema>;

export type PreflightResult = { ok: true } | { ok: false; reasons: string[] };
