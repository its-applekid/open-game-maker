import {
  ReplaySummary,
  TriageResult,
  type ControlDecl,
  type PromiseArtifact,
  type TriageClaim,
  type TriageResult as TriageResultValue,
} from '@ogm/contracts';
import { replayPromiseKey, type ReplayBundle, type ReplayResult } from '@ogm/gm-verify';

import { editorHint } from './editor-hint.js';
import { promiseArtifact } from './promise-gen.js';
import { repairTicket } from './ticket-body.js';

export type RepairBundle = ReplayBundle & {
  words?: string;
  screenshot?: string;
  controls?: ControlDecl[];
};

function normalizedError(error: string): string {
  return error
    .slice(0, 2_000)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/:\d+(?::\d+)?\b/g, ':#')
    .replace(/\s+/g, ' ')
    .trim();
}

export type TriageDraft = Omit<TriageResultValue, 'promise'> & { promise?: PromiseArtifact };

function withoutPromise(value: TriageResultValue): Omit<TriageResultValue, 'promise'> {
  const result = { ...value };
  delete result.promise;
  return result;
}

function probesDiffer(expected: number | string | boolean | undefined, actual: number | string | boolean | undefined) {
  if (typeof expected !== 'number') return expected !== actual;
  if (typeof actual !== 'number') return true;
  const tolerance = Math.max(Math.abs(expected) * 0.05, Number.EPSILON);
  return Math.abs(actual - expected) > tolerance;
}

export function differingProbeKeys(
  expected: Record<string, number | string | boolean>,
  actual: Record<string, number | string | boolean>,
): string[] {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter((key) => probesDiffer(expected[key], actual[key]))
    .sort()
    .slice(0, 3);
}

export function postReplaySignature(error: string, replayClass: ReplayResult['class'], probeKeys: string[]): string {
  return replayPromiseKey({ error: normalizedError(error), replayClass, probeKeys: probeKeys.slice(0, 3) });
}

function errorClass(error: string): string {
  return /^([A-Za-z][A-Za-z0-9_.-]{0,79}):/.exec(error)?.[1] ?? 'crash';
}

export async function triageResult(input: {
  claim: TriageClaim;
  bundle: RepairBundle;
  replay: ReplayResult;
  diagnosticsKey: string;
  controls?: readonly ControlDecl[];
  findOpen(signature: string): Promise<string | null>;
}): Promise<TriageDraft> {
  const replay = ReplaySummary.parse({
    class: input.replay.class,
    ...(input.replay.reason ? { reason: input.replay.reason } : {}),
    durationMs: input.replay.durationMs,
  });
  const hint = editorHint(input.claim.text ?? input.bundle.words, input.controls ?? input.bundle.controls ?? []);
  if (input.claim.route === 'editor_hint' || (input.replay.class === 'reproduces_no_error' && hint)) {
    return withoutPromise(
      TriageResult.parse({
        reportId: input.claim.reportId,
        replay,
        editorHint: hint,
      }),
    );
  }
  if (input.replay.class !== 'reproduces_with_error') {
    return withoutPromise(TriageResult.parse({ reportId: input.claim.reportId, replay }));
  }

  const firstError = input.replay.errorsSeen[0] ?? 'Error: reproduced crash';
  const signature = postReplaySignature(
    firstError,
    input.replay.class,
    differingProbeKeys(input.bundle.probes ?? {}, input.replay.finalProbes),
  );
  const dedupedInto = await input.findOpen(signature);
  const ticket = repairTicket({ claim: input.claim, signature, errorClass: errorClass(firstError) });
  const promise = promiseArtifact(signature, input.bundle);
  if (dedupedInto) {
    const triage = TriageResult.parse({
      reportId: input.claim.reportId,
      replay,
      signature,
      diagnosticsKey: input.diagnosticsKey,
      ticket,
      dedupedInto,
    });
    return { ...withoutPromise(triage), promise };
  }
  const triage = TriageResult.parse({
    reportId: input.claim.reportId,
    replay,
    signature,
    diagnosticsKey: input.diagnosticsKey,
    ticket,
  });
  return { ...withoutPromise(triage), promise };
}
