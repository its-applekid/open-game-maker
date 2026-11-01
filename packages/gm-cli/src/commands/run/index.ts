import { setPriority } from 'node:os';
import { relative, resolve } from 'node:path';

import type { Tier, ViewId } from '@ogm/contracts';
import type { InputScript, VerifyReport } from '@ogm/gm-verify';
import { isLoopbackUrl } from '@ogm/gm-verify/server';

import { EXIT, UsageError, type GmCommand, type GmContext } from '../../command.js';
import { printJson } from '../../context.js';

const VIEWPORTS = ['desktop', 'phone', 'both'] as const;
const TIERS = ['mobile', 'desktop', 'low'] as const;
const RIGS = ['iso', 'topdown', 'side', 'follow', 'fps', 'orbit', 'fixed'] as const;
const FFMPEG_HINT = 'sudo apt install ffmpeg';

function oneOf<T extends string>(name: string, value: unknown, choices: readonly T[]): T {
  if (typeof value === 'string' && choices.includes(value as T)) return value as T;
  throw new UsageError(`--${name} must be ${choices.join(', ')}`, `gm run --${name} ${choices[0]}`);
}

export function parseFrames(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0)
    throw new UsageError('--frames needs comma-separated seconds', 'gm run --frames 0,2,5');
  const parts = value.split(',');
  const frames = parts.map(Number);
  if (
    frames.length > 120 ||
    parts.some((part) => part.trim() === '') ||
    frames.some((frame) => !Number.isFinite(frame) || frame < 0)
  )
    throw new UsageError('--frames needs up to 120 non-negative seconds', 'gm run --frames 0,2,5');
  return frames;
}

export function parseTimeline(value: unknown): { from: number; to: number; step: number } | undefined {
  if (value === undefined) return undefined;
  const raw = typeof value === 'string' ? value.split(':') : [];
  const parts = raw.map(Number);
  if (
    parts.length !== 3 ||
    raw.some((part) => part.trim() === '') ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[0] < 0 ||
    parts[1] < parts[0] ||
    parts[2] <= 0 ||
    Math.floor((parts[1] - parts[0]) / parts[2]) + 1 > 120
  )
    throw new UsageError('--timeline needs from:to:step (up to 120 frames)', 'gm run --timeline 0:10:0.5');
  return { from: parts[0], to: parts[1], step: parts[2] };
}

export function parseRecord(value: unknown): { seconds: number } | undefined {
  if (value === undefined) return undefined;
  const match = typeof value === 'string' ? /^(\d+(?:\.\d+)?)s?$/.exec(value) : null;
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!(seconds > 0 && seconds <= 60))
    throw new UsageError('--record needs a duration from 0 to 60 seconds', 'gm run --record 10s');
  return { seconds };
}

function loadInputs(
  ctx: GmContext,
  value: unknown,
  readInputScript: (path: string) => InputScript,
): InputScript | undefined {
  if (value === undefined) return undefined;
  try {
    return readInputScript(resolve(ctx.cwd, value as string));
  } catch (error) {
    const cause = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new UsageError(`--inputs could not be read: ${cause}`, 'gm run --inputs script.json');
  }
}

export function loadBudgetOverrides<T>(
  ctx: GmContext,
  value: unknown,
  read: (path: string) => T,
  commandName: 'run' | 'perf',
): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return read(resolve(ctx.cwd, value));
  } catch (error) {
    const cause = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new UsageError(`--budgets could not be read: ${cause}`, `gm ${commandName} --budgets budgets.json`);
  }
}

export function niceCapture(): void {
  try {
    setPriority(10);
  } catch {
    // Best effort: an unprivileged runner can always lower, but capture correctness does not depend on niceness.
  }
}

export function finish(ctx: GmContext, report: VerifyReport, reportPath: string, ffmpegMissing = false): number {
  if (ffmpegMissing || report.error?.includes('ffmpeg not found on PATH'))
    throw new UsageError(report.error ?? 'ffmpeg is unavailable', FFMPEG_HINT);
  const shownPath = relative(ctx.cwd, reportPath) || reportPath;
  if (ctx.json) printJson(ctx, { reportPath: shownPath, ...report });
  else ctx.out(`${shownPath}  ${report.verdict}  ${report.renderer}`);
  if (report.verdict === 'error') {
    if (!ctx.json && report.error) ctx.err(report.error);
    return EXIT.failed;
  }
  return report.verdict === 'pass' ? EXIT.ok : EXIT.failed;
}

export const command: GmCommand = {
  name: 'run',
  summary: 'capture deterministic stills, a timeline, a clip and report.json',
  usage: '[--url loopback] [--viewport desktop|phone|both] [capture flags]',
  example: 'run --headless --viewport both --frames 0,2,5 --record 10s --out shots/',
  flags: {
    headless: { type: 'boolean', default: true, help: 'run Chromium without a display server' },
    url: { type: 'string', help: 'loopback game URL; otherwise serve ./dist' },
    viewport: { type: 'string', default: 'both', help: 'desktop, phone or both' },
    tier: { type: 'string', default: 'mobile', help: 'mobile, desktop or low asset tier' },
    inputs: { type: 'string', help: 'logical input script JSON' },
    frames: { type: 'string', help: 'comma-separated capture times in seconds' },
    timeline: { type: 'string', help: 'from:to:step seconds tiled into one PNG' },
    record: { type: 'string', help: 'H.264 clip duration, for example 10s' },
    rig: { type: 'string', help: 'camera rig id' },
    out: { type: 'string', default: 'shots', help: 'direct-run output directory' },
    budgets: { type: 'string', help: 'calibration budget overrides JSON' },
  },
  async run(ctx, args, flags) {
    if (args.length > 0) throw new UsageError(`unexpected argument ${args[0]}`, 'gm help run');
    const viewport = oneOf('viewport', flags.viewport, VIEWPORTS);
    const tier = oneOf('tier', flags.tier, TIERS) as Tier;
    const rig = flags.rig === undefined ? undefined : (oneOf('rig', flags.rig, RIGS) as ViewId);
    const frames = parseFrames(flags.frames);
    const timeline = parseTimeline(flags.timeline);
    const record = parseRecord(flags.record);
    const url = typeof flags.url === 'string' ? flags.url : undefined;

    if (url && !isLoopbackUrl(url))
      throw new UsageError('--url is loopback only', 'gm run --url http://127.0.0.1:8000/');
    const verify = await import('@ogm/gm-verify');
    const inputs = loadInputs(ctx, flags.inputs, verify.readInputScript);
    const budgets = loadBudgetOverrides(ctx, flags.budgets, verify.readBudgetOverrides, 'run');

    if (ctx.config.verifyQueue) {
      if (url) throw new UsageError('queue mode serves ./dist and does not accept --url', 'omit --url');
      const runId = verify.newRunId();
      const dir = verify.submitRequest(ctx.cwd, {
        v: 1,
        runId,
        ...(ctx.config.jobId ? { jobId: ctx.config.jobId } : {}),
        ...(ctx.config.aiurIssue !== undefined ? { aiurIssue: ctx.config.aiurIssue } : {}),
        ...(ctx.config.aiurRunId ? { aiurRunId: ctx.config.aiurRunId } : {}),
        serveDir: 'dist',
        args: {
          viewport,
          tier,
          ...(rig ? { rig } : {}),
          ...(frames ? { frames } : {}),
          ...(timeline ? { timeline } : {}),
          ...(record ? { record } : {}),
          ...(inputs ? { inputs } : {}),
          ...(budgets ? { budgets } : {}),
        },
      });
      try {
        const report = await verify.waitForReport(dir);
        return finish(ctx, report, resolve(dir, 'report.json'));
      } catch (error) {
        ctx.err(error instanceof Error ? error.message : String(error));
        return EXIT.failed;
      }
    }

    niceCapture();
    let server: Awaited<ReturnType<typeof verify.serveStatic>> | undefined;
    let target = url;
    if (!target) {
      try {
        server = await verify.serveStatic(resolve(ctx.cwd, 'dist'));
        target = server.url;
      } catch {
        throw new UsageError('no built game in ./dist', 'build the game or pass --url http://127.0.0.1:PORT/');
      }
    }
    try {
      const result = await verify.runVerify({
        url: target,
        outDir: resolve(ctx.cwd, flags.out as string),
        viewport,
        tier,
        ...(rig ? { rig } : {}),
        ...(frames ? { frames } : {}),
        ...(timeline ? { timeline } : {}),
        ...(record ? { record } : {}),
        ...(inputs ? { inputs } : {}),
        ...(budgets ? { budgets } : {}),
        software: ctx.config.verifySoftwareGl,
        eventsFile: ctx.config.eventsFile,
        jobId: ctx.config.jobId,
        aiurIssue: ctx.config.aiurIssue,
        aiurRunId: ctx.config.aiurRunId,
        source: 'gm run',
        slots: { runtimeDir: ctx.config.runtimeDir },
        warn: ctx.err,
      });
      return finish(ctx, result.report, result.reportPath, result.ffmpegMissing);
    } finally {
      await server?.close();
    }
  },
};
