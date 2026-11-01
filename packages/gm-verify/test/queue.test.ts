import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  processRequest,
  requestDir,
  serveQueue,
  submitRequest,
  waitForReport,
  type Runner,
  type VerifyRequest,
} from '../src/queue.js';
import { ALWAYS_UNCHECKED, unknownBudgets, writeReport } from '../src/report.js';
import type { RunVerifyOptions } from '../src/run.js';

function workspaces(): { root: string; workspace: string } {
  const root = mkdtempSync(join(tmpdir(), 'gm-queue-'));
  const workspace = join(root, 'ws1');
  mkdirSync(join(workspace, 'dist'), { recursive: true });
  writeFileSync(join(workspace, 'dist', 'index.html'), '<p>game</p>');
  return { root, workspace };
}

const request = (over: Partial<VerifyRequest> = {}): VerifyRequest => ({
  v: 1,
  runId: 'run1',
  serveDir: 'dist',
  args: { viewport: 'phone', tier: 'mobile', frames: [0] },
  ...over,
});

/** Stands in for the browser run: fetches what the host served and writes a passing report. */
const fakeRunner = (seen: RunVerifyOptions[]): Runner => async (options) => {
  seen.push(options);
  const body = await (await fetch(options.url)).text();
  const now = new Date().toISOString();
  const report = {
    runId: options.runId ?? 'x',
    renderer: 'fake',
    software: false,
    viewport: options.viewport,
    tier: options.tier,
    frames: [],
    console: [],
    budgets: unknownBudgets(),
    probes: { served: body },
    clients: 1,
    unchecked: [...ALWAYS_UNCHECKED],
    verdict: 'pass' as const,
    startedAt: now,
    endedAt: now,
    gmVerifyVersion: 'test',
  };
  writeReport(options.outDir, report);
  return { report };
};

describe('verify queue', () => {
  it('round-trips a sandbox request file to a report file written by the host', async () => {
    const { root, workspace } = workspaces();
    const dir = submitRequest(workspace, request());
    const seen: RunVerifyOptions[] = [];
    const waiting = waitForReport(dir, { pollMs: 20, timeoutMs: 5_000 });
    await serveQueue(root, { runner: fakeRunner(seen), software: true, once: true });
    const report = await waiting;
    expect(report.verdict).toBe('pass');
    expect(report.probes.served).toBe('<p>game</p>');
    expect(seen[0].url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(seen[0].outDir).toBe(dir);
    expect(seen[0].frames).toEqual([0]);
  });

  it('claims each request once, so a second pass does not run it again', async () => {
    const { root, workspace } = workspaces();
    submitRequest(workspace, request({ runId: 'once' }));
    const seen: RunVerifyOptions[] = [];
    await serveQueue(root, { runner: fakeRunner(seen), software: true, once: true });
    await serveQueue(root, { runner: fakeRunner(seen), software: true, once: true });
    expect(seen).toHaveLength(1);
  });

  it('refuses a serveDir outside the workspace and still writes an error report', async () => {
    const { workspace } = workspaces();
    const dir = submitRequest(workspace, request({ serveDir: '../..' }));
    const seen: RunVerifyOptions[] = [];
    const report = await processRequest(workspace, dir, { runner: fakeRunner(seen), software: false });
    expect(seen).toHaveLength(0);
    expect(report.verdict).toBe('error');
    expect(report.error).toMatch(/not a directory inside the workspace/);
    expect((await waitForReport(dir, { timeoutMs: 100 })).verdict).toBe('error');
  });

  it('refuses a serveDir that symlinks out of the workspace', async () => {
    const { workspace } = workspaces();
    symlinkSync(tmpdir(), join(workspace, 'escape'));
    const dir = submitRequest(workspace, request({ serveDir: 'escape' }));
    const report = await processRequest(workspace, dir, { runner: fakeRunner([]), software: false });
    expect(report.error).toMatch(/not a directory inside the workspace/);
  });

  it('rejects a request carrying a URL or unknown fields: the host runs nothing the request names', async () => {
    const { workspace } = workspaces();
    const dir = requestDir(workspace, 'evil');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'request.json'),
      JSON.stringify({ ...request({ runId: 'evil' }), url: 'http://example.com/', args: { viewport: 'phone', tier: 'mobile', cmd: 'rm' } }),
    );
    const seen: RunVerifyOptions[] = [];
    const report = await processRequest(workspace, dir, { runner: fakeRunner(seen), software: false });
    expect(seen).toHaveLength(0);
    expect(report.verdict).toBe('error');
    expect(report.error).toMatch(/invalid request/);
  });

  it('refuses a request directory that is a symlink out of the workspace and writes nothing there', async () => {
    const { workspace } = workspaces();
    const outside = mkdtempSync(join(tmpdir(), 'gm-outside-'));
    writeFileSync(join(outside, 'request.json'), JSON.stringify(request({ runId: 'link' })));
    mkdirSync(join(workspace, '.gm', 'verify'), { recursive: true });
    symlinkSync(outside, requestDir(workspace, 'link'));
    await expect(
      processRequest(workspace, requestDir(workspace, 'link'), { runner: fakeRunner([]), software: false }),
    ).rejects.toThrow(/not a real directory/);
    expect(existsSync(join(outside, 'report.json'))).toBe(false);
  });
});
