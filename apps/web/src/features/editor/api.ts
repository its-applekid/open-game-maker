import type {
  DesignDoc,
  EditorCommand,
  Job,
  Patch,
  ReapplyReport,
  Release,
  SaveSlot,
  Transaction,
} from '@ogm/contracts';
import { PatchTooLargeError, validatePatches } from '@ogm/design-log';

import { api, ApiError, sse } from '../../lib/api/client';

export type GameMetadata = {
  id: string;
  familyId: string;
  ownerId: string;
  title: string;
  visibility: 'listed' | 'private';
  repoVisibility: 'public' | 'private';
};

export type DesignSnapshot = { rev: number; buildId: string; doc: DesignDoc };
export type Lease = { token: number; expiresAt: string };
export type TransactionBody = {
  baseRev: number;
  leaseToken: number;
  kind: 'manual';
  label: string;
  baseBuildId: string;
  commands: EditorCommand[];
  patches: Patch[];
  inverse: Patch[];
  sessionId: string;
};

export type TransactionPostResult =
  | { ok: true; rev: number }
  | { ok: false; kind: 'conflict'; headRev: number }
  | { ok: false; kind: 'lease-lost'; holder: string }
  | { ok: false; kind: 'retryable'; message: string }
  | { ok: false; kind: 'invalid'; reason: 'patch_too_large' | 'invalid_patches' }
  | { ok: false; kind: 'failure'; status: number; message: string };

export type LeaseResult =
  | { ok: true; lease: Lease }
  | { ok: false; kind: 'lease-lost'; holder: string }
  | { ok: false; kind: 'retryable'; message: string }
  | { ok: false; kind: 'failure'; status: number; message: string };

export type OptionalCapability<T> = { available: true; value: T } | { available: false };

export function getGame(gameId: string): Promise<GameMetadata> {
  return api(`/games/${segment(gameId)}`);
}

export function getDesignSnapshot(gameId: string, branch: string): Promise<DesignSnapshot> {
  return api(branchPath(gameId, branch, '/design'));
}

export async function acquireLease(gameId: string, branch: string, sessionId: string): Promise<LeaseResult> {
  return leaseCall(branchPath(gameId, branch, '/lease'), { method: 'POST', json: { sessionId } });
}

export async function heartbeatLease(
  gameId: string,
  branch: string,
  sessionId: string,
  token: number,
): Promise<LeaseResult> {
  return leaseCall(branchPath(gameId, branch, '/lease/heartbeat'), {
    method: 'POST',
    json: { sessionId, token },
  });
}

export async function releaseLease(
  gameId: string,
  branch: string,
  sessionId: string,
  token: number,
): Promise<LeaseResult> {
  return leaseCall(branchPath(gameId, branch, '/lease'), {
    method: 'DELETE',
    json: { sessionId, token },
  });
}

export async function postTransaction(
  gameId: string,
  branch: string,
  body: TransactionBody,
): Promise<TransactionPostResult> {
  try {
    for (const candidate of [body.patches, body.inverse]) {
      const validation = validatePatches(candidate);
      if (!validation.ok) return { ok: false, kind: 'invalid', reason: 'invalid_patches' };
    }
  } catch (error) {
    if (error instanceof PatchTooLargeError) return { ok: false, kind: 'invalid', reason: 'patch_too_large' };
    throw error;
  }

  try {
    return await api<{ rev: number }>(branchPath(gameId, branch, '/transactions'), {
      method: 'POST',
      json: body,
    }).then(({ rev }) => ({ ok: true as const, rev }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, kind: 'conflict', headRev: numberField(error.body, 'headRev') };
    }
    if (error instanceof ApiError && error.status === 423) {
      return { ok: false, kind: 'lease-lost', holder: stringField(error.body, 'holder', 'other-session') };
    }
    if (error instanceof ApiError) {
      return { ok: false, kind: 'failure', status: error.status, message: error.message };
    }
    return { ok: false, kind: 'retryable', message: error instanceof Error ? error.message : 'network error' };
  }
}

export function openTransactionStream(gameId: string, branch: string, after: number): EventSource {
  return sse(`${branchPath(gameId, branch, '/transactions')}?after=${encodeURIComponent(String(after))}`);
}

export function listJobs(gameId: string): Promise<{ jobs: Job[] }> {
  return api(`/jobs?gameId=${encodeURIComponent(gameId)}`);
}

export function getOptionalSaves(gameId: string): Promise<OptionalCapability<{ slots: SaveSlot[] }>> {
  return optionalApi(`/games/${segment(gameId)}/saves`);
}

export function getOptionalPublished(gameId: string, etag?: string): Promise<OptionalCapability<Release>> {
  return optionalApi(`/games/${segment(gameId)}/published`, etag === undefined ? undefined : { headers: { 'if-none-match': etag } });
}

export function getOptionalReapply(
  gameId: string,
  branch: string,
  fromBuildId: string,
  toBuildId: string,
): Promise<OptionalCapability<ReapplyReport>> {
  const query = new URLSearchParams({ from: fromBuildId, to: toBuildId });
  return optionalApi(`${branchPath(gameId, branch, '/reapply')}?${query}`);
}

export function submitReapply(
  gameId: string,
  branch: string,
  choices: Record<string, unknown>,
): Promise<OptionalCapability<{ accepted: true }>> {
  return optionalApi(branchPath(gameId, branch, '/reapply'), { method: 'POST', json: { choices } });
}

export function parseTransactionEvent(event: MessageEvent<string>): Transaction {
  return JSON.parse(event.data) as Transaction;
}

async function leaseCall(path: string, init: RequestInit & { json: unknown }): Promise<LeaseResult> {
  try {
    const lease = await api<Lease>(path, init);
    return { ok: true, lease };
  } catch (error) {
    if (error instanceof ApiError && error.status === 423) {
      return { ok: false, kind: 'lease-lost', holder: stringField(error.body, 'holder', 'other-session') };
    }
    if (error instanceof ApiError) {
      return { ok: false, kind: 'failure', status: error.status, message: error.message };
    }
    return { ok: false, kind: 'retryable', message: error instanceof Error ? error.message : 'network error' };
  }
}

async function optionalApi<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<OptionalCapability<T>> {
  try {
    return { available: true, value: await api<T>(path, init) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { available: false };
    throw error;
  }
}

function branchPath(gameId: string, branch: string, suffix: string): string {
  return `/games/${segment(gameId)}/branches/${segment(branch)}${suffix}`;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function numberField(body: unknown, field: string): number {
  const value = record(body)?.[field];
  return typeof value === 'number' ? value : 0;
}

function stringField(body: unknown, field: string, fallback: string): string {
  const value = record(body)?.[field];
  return typeof value === 'string' ? value : fallback;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
