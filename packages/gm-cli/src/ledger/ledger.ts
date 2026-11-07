import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { OptionProvenance } from '@ogm/contracts';
import { ulid } from 'ulid';
import { z } from 'zod';

import { CommandError } from '../command.js';

/**
 * The creator feedback ledger (#567): one file in the game repo, versioned with the game, so a rejection outlives the
 * session, the agent and the chat it was spoken in. `design/feedback.json` is not a design doc; the build's design fold
 * skips it (`packages/sdk/src/vite/index.ts`).
 */
export const FEEDBACK_FILE = 'design/feedback.json';

/** The design area a rejection covers. `options` means every option an agent might present. */
export const FeedbackScope = z.enum(['characters', 'look', 'options']);
export type FeedbackScope = z.infer<typeof FeedbackScope>;

// The provenance vocabularies come from the option contract, so a new kind or view reaches the ledger by itself.
const ProvenanceKind = OptionProvenance.shape.kind.unwrap();
const ProvenanceView = OptionProvenance.shape.view.unwrap();
const name = z.string().trim().min(1).max(200);

/**
 * The machine-checkable side of a rule. Each named list is a requirement the option's provenance must meet: every pack
 * it used must be listed, its kind and view must be listed, and every asset it used must be listed. An empty `must`
 * means the rule is advisory — kept as words for the agent, not enforced by the check.
 */
export const FeedbackMust = z
  .object({
    packs: z.array(name).min(1).optional(),
    assets: z.array(name).min(1).optional(),
    kinds: z.array(ProvenanceKind).min(1).optional(),
    views: z.array(ProvenanceView).min(1).optional(),
  })
  .strict();
export type FeedbackMust = z.infer<typeof FeedbackMust>;

export const RejectedOption = z
  .object({
    id: z.string().trim().min(1).max(32),
    label: z.string().trim().min(1).max(200).optional(),
    provenance: OptionProvenance.optional(),
  })
  .strict();
export type RejectedOption = z.infer<typeof RejectedOption>;

export const LedgerEntry = z
  .object({
    id: z.string().regex(/^fb_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
    at: z.string().datetime({ offset: true }),
    // The creator's words, verbatim. Never a paraphrase.
    words: z.string().trim().min(1).max(4000),
    // The rule the agent derived from those words, in the creator's own quality bar.
    rule: z.string().trim().min(1).max(500),
    scope: FeedbackScope,
    must: FeedbackMust,
    design_version: z.string().trim().min(1).max(64),
    rejected: z
      .object({
        options: z.array(RejectedOption),
        command: z.string().trim().min(1).max(200).nullable(),
        media: z.array(z.string().trim().min(1).max(200)),
      })
      .strict(),
    // The open options and Commands this rejection invalidated, named so the next session leaves them alone.
    withdrawn: z
      .object({
        options: z.array(z.string().trim().min(1).max(32)),
        commands: z.array(z.string().trim().min(1).max(200)),
      })
      .strict(),
  })
  .strict();
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const FeedbackLedger = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(LedgerEntry),
  })
  .strict();
export type FeedbackLedger = z.infer<typeof FeedbackLedger>;

export const EMPTY_LEDGER: FeedbackLedger = { schemaVersion: 1, entries: [] };

export function ledgerPath(gameDir: string): string {
  return join(gameDir, FEEDBACK_FILE);
}

/** Read the ledger; a game with no ledger yet reads as empty rather than failing. */
export function readLedger(gameDir: string): FeedbackLedger {
  const file = ledgerPath(gameDir);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_LEDGER, entries: [] };
    throw new CommandError(`cannot read ${FEEDBACK_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new CommandError(
      `${FEEDBACK_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = FeedbackLedger.safeParse(value);
  if (!parsed.success) throw new CommandError(`${FEEDBACK_FILE} is not a valid ledger: ${parsed.error.message}`);
  return parsed.data;
}

export function writeLedger(gameDir: string, ledger: FeedbackLedger): void {
  const file = ledgerPath(gameDir);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(FeedbackLedger.parse(ledger), null, 2)}\n`);
  } catch (error) {
    throw new CommandError(`cannot write ${FEEDBACK_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type RejectionInput = {
  words: string;
  rule: string;
  scope: FeedbackScope;
  must?: FeedbackMust;
  designVersion?: string;
  rejected: { options: RejectedOption[]; command: string | null; media: string[] };
  withdrawn: { options: string[]; commands: string[] };
  now?: string;
  id?: string;
};

export function rejectionEntry(input: RejectionInput): LedgerEntry {
  const id = input.id ?? `fb_${ulid()}`;
  const at = input.now ?? new Date().toISOString();
  const unique = <T>(values: T[]): T[] => [...new Set(values)];
  return LedgerEntry.parse({
    id,
    at,
    words: input.words,
    rule: input.rule,
    scope: input.scope,
    must: input.must ?? {},
    design_version: input.designVersion ?? '0.0.0',
    rejected: {
      options: input.rejected.options,
      command: input.rejected.command,
      media: unique(input.rejected.media),
    },
    withdrawn: {
      options: unique(input.withdrawn.options),
      commands: unique(input.withdrawn.commands),
    },
  });
}

/** Append one rejection and return the ledger as written. */
export function appendRejection(
  gameDir: string,
  input: RejectionInput,
): { ledger: FeedbackLedger; entry: LedgerEntry } {
  const ledger = readLedger(gameDir);
  const entry = rejectionEntry(input);
  const next: FeedbackLedger = { schemaVersion: 1, entries: [...ledger.entries, entry] };
  writeLedger(gameDir, next);
  return { ledger: next, entry };
}
