import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { parse } from 'yaml';

import { profileHash, renderCodexProfile } from './profile.js';
import { renderAiurConfig } from './render.js';
import type { PreflightResult, RenderInput } from './types.js';

const GUARDED_PATHS = [
  'agent.codex',
  'agent.priority',
  'agent.accounts',
  'instance',
  'workspace.root',
  'tracker.github.repo',
  'tracker.github.allowed_users',
  'hooks_file',
  'prompt_file',
  'events.export.enabled',
] as const;

export async function preflight(daemonDir: string, input: RenderInput): Promise<PreflightResult> {
  const codexHome = input.codexHome ?? join(homedir(), '.config/ogm/codex-gamebuilder');
  const reasons: string[] = [];

  try {
    const expectedConfigText = renderAiurConfig(input);
    const expectedProfile = renderCodexProfile(input);
    const configPath = join(resolve(daemonDir), '.aiur/config');
    const profilePath = join(resolve(codexHome), 'config.toml');
    const actualConfigText = await readText(configPath, 'missing .aiur/config', reasons);
    const actualProfile = await readText(profilePath, 'missing Codex profile', reasons);

    if (actualConfigText !== undefined) {
      compareConfig(actualConfigText, expectedConfigText, reasons);
    }
    if (actualProfile !== undefined && profileHash(actualProfile) !== profileHash(expectedProfile)) {
      reasons.push('codex profile hash mismatch');
    }
  } catch (error) {
    reasons.push(`preflight error: ${errorMessage(error)}`);
  }

  const uniqueReasons = [...new Set(reasons)];
  return uniqueReasons.length === 0 ? { ok: true } : { ok: false, reasons: uniqueReasons };
}

async function readText(path: string, missingReason: string, reasons: string[]): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      reasons.push(missingReason);
    } else {
      reasons.push(`${missingReason}: ${errorMessage(error)}`);
    }
    return undefined;
  }
}

function compareConfig(actualText: string, expectedText: string, reasons: string[]): void {
  let actual: unknown;
  try {
    actual = parse(actualText);
  } catch (error) {
    reasons.push(`invalid .aiur/config: ${errorMessage(error)}`);
    return;
  }
  const expected: unknown = parse(expectedText);

  for (const path of GUARDED_PATHS) {
    if (!isDeepStrictEqual(valueAt(actual, path), valueAt(expected, path))) {
      reasons.push(`config drift: ${path}`);
    }
  }

  addUnsafeReasons(actual, reasons);
}

function addUnsafeReasons(config: unknown, reasons: string[]): void {
  const mode = valueAt(config, 'instance.mode');
  const networkAccess = valueAt(config, 'agent.codex.turn_sandbox_policy.networkAccess');
  const approvalPolicy = valueAt(config, 'agent.codex.approval_policy');
  const writableRoots = valueAt(config, 'agent.codex.turn_sandbox_policy.writableRoots');
  const workspaceRoot = valueAt(config, 'workspace.root');

  if (mode !== 'local') reasons.push('unsafe config: instance.mode');
  if (networkAccess !== false) {
    reasons.push('unsafe config: agent.codex.turn_sandbox_policy.networkAccess');
  }
  if (approvalPolicy === 'never') reasons.push('unsafe config: agent.codex.approval_policy');
  if (!safeWritableRoots(writableRoots, workspaceRoot)) {
    reasons.push('unsafe config: agent.codex.turn_sandbox_policy.writableRoots');
  }
  if (valueAt(config, 'agent.claude.permission_mode') === 'bypassPermissions') {
    reasons.push('unsafe config: agent.claude.permission_mode');
  }
  if (containsRemoteRoute(valueAt(config, 'agent.priority')) || containsRemoteRoute(valueAt(config, 'agent.routing'))) {
    reasons.push('unsafe config: remote agent route');
  }
}

function safeWritableRoots(roots: unknown, workspaceRoot: unknown): boolean {
  return (
    typeof workspaceRoot === 'string' &&
    Array.isArray(roots) &&
    roots.length === 1 &&
    typeof roots[0] === 'string' &&
    resolve(roots[0]) === resolve(workspaceRoot) &&
    roots[0] !== '/tmp' &&
    !roots[0].startsWith('/tmp/')
  );
}

function containsRemoteRoute(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('+remote');
  if (Array.isArray(value)) return value.some(containsRemoteRoute);
  if (isRecord(value)) return Object.values(value).some(containsRemoteRoute);
  return false;
}

function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    return isRecord(current) ? current[key] : undefined;
  }, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
