import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const SetupSubstepSchema = z
  .object({
    kind: z.enum(['run', 'hand', 'optional']),
    text: z.string().min(1),
    command: z.string().min(1),
    writes: z.array(z.string().min(1)),
    check: z.string().min(1),
    cites: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const SetupStepSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    time: z.string().min(1),
    outcome: z.string().min(1),
    preconditions: z.string().min(1),
    agent_prompt: z
      .string()
      .min(1)
      .refine((value) => ['{{N}}', '{{title}}', '{{hand_list}}'].every((token) => value.includes(token)), {
        message: 'agent_prompt must include {{N}}, {{title}}, and {{hand_list}}',
      }),
    substeps: z.array(SetupSubstepSchema).min(1),
  })
  .strict();

export const SetupContentSchema = z
  .object({
    steps: z.array(SetupStepSchema).min(1),
  })
  .strict()
  .superRefine(({ steps }, context) => {
    for (const [index, step] of steps.entries()) {
      if (step.id !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'id'],
          message: `step ids must be consecutive from 1; expected ${index + 1}`,
        });
      }
    }
  });

export type SetupSubstep = z.infer<typeof SetupSubstepSchema>;
export type SetupStep = z.infer<typeof SetupStepSchema>;
export type SetupContent = z.infer<typeof SetupContentSchema>;

const defaultRepositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

export function parseSetupContent(source: string, repositoryRoot = defaultRepositoryRoot): SetupContent {
  const content = SetupContentSchema.parse(parse(source));
  const missingCitations = content.steps.flatMap((step) =>
    step.substeps.flatMap((substep) =>
      substep.cites.filter((citation) => !existsSync(resolve(repositoryRoot, citation))),
    ),
  );

  if (missingCitations.length > 0) {
    throw new Error(`Setup content cites missing repository paths: ${[...new Set(missingCitations)].join(', ')}`);
  }

  return content;
}

export function loadSetupContent(path: string, repositoryRoot = defaultRepositoryRoot): SetupContent {
  return parseSetupContent(readFileSync(path, 'utf8'), repositoryRoot);
}
