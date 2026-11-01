import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hasFfmpeg } from '../src/capture.js';
import { launch } from '../src/browser.js';
import { measureLoad } from '../src/perf.js';
import { runVerify, type RunVerifyOptions } from '../src/run.js';
import { serveStatic } from '../src/server.js';

const STUB = fileURLToPath(new URL('../fixtures/stub-game/', import.meta.url));
/* CI sets GM_VERIFY_SOFTWARE_GL=1 (no GPU on the runner); this host runs the GPU flags. */
const SOFTWARE = process.env.GM_VERIFY_SOFTWARE_GL === '1';
const FFMPEG = hasFfmpeg();
if (!FFMPEG) console.warn('ffmpeg is not on PATH: the timeline and clip assertions are replaced by the refusal path');

let server: Awaited<ReturnType<typeof serveStatic>>;
beforeAll(async () => {
  server = await serveStatic(STUB);
});
afterAll(async () => {
  await server.close();
});

const out = () => mkdtempSync(join(tmpdir(), 'gm-shots-'));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const run = (options: Partial<RunVerifyOptions>) =>
  runVerify({
    url: server.url,
    outDir: out(),
    viewport: 'phone',
    tier: 'mobile',
    software: SOFTWARE,
    slots: { runtimeDir: mkdtempSync(join(tmpdir(), 'gm-slots-')) },
    readyTimeoutMs: 20_000,
    ...options,
  });

describe('gm run against the stub game', () => {
  it.runIf(FFMPEG)(
    'writes distinct stills at both sizes, one timeline PNG, a phone-safe MP4 and the report',
    async () => {
      const eventsDir = out();
      const { report, reportPath } = await run({
        viewport: 'both',
        frames: [0, 1, 2],
        timeline: { from: 0, to: 3, step: 1 },
        record: { seconds: 2 },
        eventsFile: join(eventsDir, 'events.jsonl'),
        jobId: 'job-1',
        aiurIssue: 45,
        aiurRunId: 'aiur/45',
      });
      const dir = join(reportPath, '..');
      expect(report.error).toBeUndefined();
      expect(report.frames.map((f) => f.path)).toEqual([
        'desktop/t0.png',
        'desktop/t1.png',
        'desktop/t2.png',
        'phone/t0.png',
        'phone/t1.png',
        'phone/t2.png',
      ]);
      for (const frame of report.frames) expect(existsSync(join(dir, frame.path))).toBe(true);
      expect(sha(join(dir, 'phone/t0.png'))).not.toBe(sha(join(dir, 'phone/t2.png')));
      expect(sha(join(dir, 'desktop/t0.png'))).not.toBe(sha(join(dir, 'phone/t0.png')));

      expect(report.timeline).toBe('phone/timeline.png');
      const tl = execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=width',
        '-of',
        'csv=p=0',
        join(dir, report.timeline!),
      ]);
      expect(tl.toString().trim()).toBe('1600');

      expect(report.clip).toBe('phone/run.mp4');
      const clip = join(dir, report.clip!);
      const streams = execFileSync('ffprobe', ['-v', 'error', '-show_streams', clip]).toString();
      expect(streams).toContain('codec_name=h264');
      expect(streams).toContain('pix_fmt=yuv420p');
      const bytes = readFileSync(clip);
      expect(bytes.indexOf('moov')).toBeGreaterThan(-1);
      expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat')); /* +faststart */

      expect(report.renderer.length).toBeGreaterThan(0);
      expect(report.software).toBe(SOFTWARE);
      expect(report.viewport).toBe('both');
      expect(report.unchecked).toEqual(expect.arrayContaining(['iPhone Safari', 'sound', 'download size']));
      expect(report.budgets.triangles).toEqual([2, 300_000, 'ok']);
      expect(report.verdict).toBe('pass');
      const events = readFileSync(join(eventsDir, 'events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      expect(events.map((e) => [e.activity, e.phase, e.source, e.jobId, e.aiurIssue, e.aiurRunId])).toEqual([
        ['playtesting', 'start', 'gm run', 'job-1', 45, 'aiur/45'],
        ['playtesting', 'end', 'gm run', 'job-1', 45, 'aiur/45'],
      ]);
    },
  );

  it('reports software: true and the SwiftShader renderer when forced', async () => {
    const { report } = await run({ software: true, frames: [0] });
    expect(report.software).toBe(true);
    expect(report.renderer).toMatch(/swiftshader/i);
  });

  it.skipIf(SOFTWARE)('names the real GPU on this host with the default flags', async () => {
    const { report } = await run({ software: false, frames: [0] });
    expect(report.software).toBe(false);
    expect(report.renderer).not.toMatch(/swiftshader|llvmpipe/i);
  });

  it('caps frames at 6 under SwiftShader', async () => {
    const warnings: string[] = [];
    const { report } = await run({ software: true, frames: [0, 1, 2, 3, 4, 5, 6, 7], warn: (l) => warnings.push(l) });
    expect(report.frames).toHaveLength(6);
    expect(warnings.join('\n')).toMatch(/capping --frames at 6/);
  });

  it('refuses without ffmpeg but keeps the stills', async () => {
    const { report, reportPath, ffmpegMissing } = await run({
      frames: [0],
      record: { seconds: 1 },
      ffmpeg: 'ffmpeg-not-installed-here',
    });
    expect(ffmpegMissing).toBe(true);
    expect(report.verdict).toBe('error');
    expect(report.error).toMatch(/ffmpeg-not-installed-here not found/);
    expect(existsSync(join(reportPath, '..', 'phone/t0.png'))).toBe(true);
    expect(report.frames).toHaveLength(1);
  });

  it('stops at once on a page error before ready and still writes an error report', async () => {
    const started = Date.now();
    const { report, reportPath } = await run({ url: `${server.url}?boom=1`, frames: [0], readyTimeoutMs: 60_000 });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(report.verdict).toBe('error');
    expect(report.error).toMatch(/stub exploded before ready/);
    expect(existsSync(reportPath)).toBe(true);
  });

  it('fails on a console error and on triangles over the mobile budget', async () => {
    const noisy = await run({ url: `${server.url}?noisy=1`, frames: [0] });
    expect(noisy.report.console).toEqual([{ level: 'error', text: 'stub noise', count: 1 }]);
    expect(noisy.report.verdict).toBe('fail');
    const heavy = await run({ url: `${server.url}?heavy=1`, frames: [0] });
    expect(heavy.report.budgets.triangles).toEqual([410_000, 300_000, 'over']);
    expect(heavy.report.verdict).toBe('fail');
  });

  it('replays --inputs through inject and reports the resulting probes', async () => {
    const { report } = await run({ frames: [], inputs: [{ t: 0.5, action: 'jump', phase: 'down', playerIndex: 0 }] });
    expect(report.probes.lastAction).toBe('jump');
    expect(report.probes.alive).toBe(true);
  });
});

describe('gm perf against the stub game', () => {
  it('times a throttled phone load and counts bytes by type', async () => {
    const browser = await launch(SOFTWARE);
    try {
      const recordDir = out();
      const perf = await measureLoad(browser, server.url, { cpu: 4, readyTimeoutMs: 20_000, recordDir });
      expect(perf.device).toBe('iPhone 13');
      expect(perf.firstMs).toBeGreaterThan(0);
      expect(perf.fromNetwork).toBeGreaterThan(0);
      expect(perf.bytesByType.code.bytes).toBeGreaterThan(0);
      expect(readFileSync(join(recordDir, 'load.log'), 'utf8')).toMatch(/\d+\.\d+ msg stub-ready/);
    } finally {
      await browser.close();
    }
  });
});
