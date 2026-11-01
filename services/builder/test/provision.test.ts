import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { renderDaemonFiles } from '@ogm/game-repo-template';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { provisionGameRepo, type ProvisionInput } from '../src/provision.js';
import { buildFleet, cleanupHomes, systemctlCalls, tempHome } from './fleet/helpers.js';

afterEach(cleanupHomes);

const input: ProvisionInput = {
  gameId: 'g_01J',
  owner: 'everdred-games',
  visibility: 'private',
  kind: 'new_game',
  templateRef: 'game-3d@1',
};
const commit = { url: 'http://127.0.0.1:4030', token: 'commit-service-token-0123456789abcdef' };

function commitAnswering(body: unknown, status = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: impl, requests };
}

describe('provisionGameRepo', () => {
  it('posts one create_repo, renders the stopped daemon directory and records the repo', async () => {
    const home = await tempHome();
    const { fleet, store, runner } = buildFleet(home);
    const service = commitAnswering({ ok: true, sha: 'abc123' });
    const setGameRepo = vi.fn(async () => undefined);

    const result = await provisionGameRepo(input, { commit, fleet, setGameRepo, fetch: service.fetch });

    expect(result).toEqual({ ok: true, repo: 'everdred-games/gm-g_01J', sha: 'abc123' });
    expect(service.requests).toHaveLength(1);
    expect(service.requests[0]!.url).toBe('http://127.0.0.1:4030/internal/commit');
    expect(service.requests[0]!.init.headers).toMatchObject({ authorization: `Bearer ${commit.token}` });
    expect(JSON.parse(service.requests[0]!.init.body as string)).toEqual({
      kind: 'create_repo',
      gameId: 'g_01J',
      owner: 'everdred-games',
      visibility: 'private',
      templateRef: 'game-3d@1',
    });
    expect(setGameRepo).toHaveBeenCalledWith('g_01J', 'everdred-games/gm-g_01J');

    const row = await store.byRepo('everdred-games/gm-g_01j');
    expect(row?.status).toBe('stopped');
    const dir = join(home, '.local/share/ogm/daemons', row!.slug);
    expect(await readFile(join(dir, '.aiur/hooks'), 'utf8')).toBe(renderDaemonFiles().hooks);
    expect(await readFile(join(dir, '.aiur/prompt.md'), 'utf8')).toBe(renderDaemonFiles().prompt);
    expect(parse(await readFile(join(dir, '.aiur/config'), 'utf8')).tracker.github.repo).toBe(
      'everdred-games/gm-g_01j',
    );
    expect((await stat(join(home, '.config/ogm/daemons', row!.slug, 'hook-secret'))).mode & 0o777).toBe(0o600);
    expect(systemctlCalls(runner)).toEqual([]);
  });

  it('returns a refused create_repo verdict unchanged and touches nothing else', async () => {
    const verdict = { allowed: false, reasons: [{ code: 'rights' as const, detail: 'paid pack in a public repo' }] };
    const service = commitAnswering({ ok: false, verdict });
    const fleet = { prepareDaemonDir: vi.fn(async () => undefined) };
    const setGameRepo = vi.fn(async () => undefined);

    const result = await provisionGameRepo(
      { ...input, visibility: 'public' },
      { commit, fleet, setGameRepo, fetch: service.fetch },
    );

    expect(result).toEqual({ ok: false, verdict });
    expect(fleet.prepareDaemonDir).not.toHaveBeenCalled();
    expect(setGameRepo).not.toHaveBeenCalled();
  });

  it('fails loudly when the commit service errors', async () => {
    const service = commitAnswering({ error: 'commit operation failed' }, 502);
    const fleet = { prepareDaemonDir: vi.fn(async () => undefined) };
    const setGameRepo = vi.fn(async () => undefined);
    await expect(provisionGameRepo(input, { commit, fleet, setGameRepo, fetch: service.fetch })).rejects.toThrow(/502/);
    expect(setGameRepo).not.toHaveBeenCalled();
  });
});
