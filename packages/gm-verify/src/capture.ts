import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { HookDriver } from './hooks.js';

/** SwiftShader is slow: at most this many stills and seconds of clip (D-VERIFY-GPU). */
export const SOFTWARE_MAX_FRAMES = 6;
export const SOFTWARE_MAX_RECORD_S = 5;
export const MAX_CAPTURE_FRAMES = 120;
export const FFMPEG_HINT = 'sudo apt install ffmpeg';
/** Sprite sheets are authored at 12 fps; duplicate samples when the delivery encode requests a higher rate. */
export const STREAM_CAPTURE_FPS = 12;
/** A synchronous encode blocks the run's timeout timer, so ffmpeg carries its own limit. */
export const FFMPEG_TIMEOUT_MS = 5 * 60_000;

/** ffmpeg is missing: the caller refuses (exit 2) with the install hint; stills are already written. */
export class FfmpegMissingError extends Error {
  constructor(readonly binary: string) {
    super(`${binary} not found on PATH`);
    this.name = 'FfmpegMissingError';
  }
}

export function hasFfmpeg(binary = 'ffmpeg'): boolean {
  const probe = spawnSync(binary, ['-version'], { stdio: 'ignore' });
  return probe.error === undefined && probe.status === 0;
}

function ffmpeg(binary: string, args: string[]): void {
  if (!hasFfmpeg(binary)) throw new FfmpegMissingError(binary);
  execFileSync(binary, ['-loglevel', 'error', '-y', ...args], { timeout: FFMPEG_TIMEOUT_MS, killSignal: 'SIGKILL' });
}

function h264Args(out: string, preset: 'fast' | 'slow' = 'fast'): string[] {
  return [
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    '-preset',
    preset,
    '-crf',
    '27',
    '-movflags',
    '+faststart',
    out,
  ];
}

async function shot(h: HookDriver, ms: number, path: string, type: 'png' | 'jpeg' = 'png'): Promise<void> {
  await h.renderAt(ms);
  await h.page.screenshot({ path, type, ...(type === 'jpeg' ? { quality: 92 } : {}) });
}

async function canvasVideo(
  h: HookDriver,
  options: Required<Pick<RecordOptions, 'seconds' | 'fps' | 'start'>>,
  path: string,
): Promise<{ width: number; height: number }> {
  const encoded = await h.page.locator('canvas').evaluate(async (element, capture) => {
    const source = element as HTMLCanvasElement;
    if (!source.captureStream || typeof MediaRecorder === 'undefined') {
      throw new Error('canvas stream recording is unavailable');
    }

    const stream = source.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (!track?.requestFrame) throw new Error('manual canvas frame capture is unavailable');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) throw new Error('WebM canvas recording is unavailable');

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener('dataavailable', ({ data }) => {
        if (data.size > 0) chunks.push(data);
      });
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.addEventListener('error', () => reject(new Error('canvas MediaRecorder failed')), { once: true });
    });

    type BrowserHooks = {
      renderAt?: (ms: number) => void;
      advanceTime?: (ms: number) => void;
    };
    const browser = window as unknown as { __gm?: BrowserHooks; __frame?: (seconds: number) => void };
    const hooks = browser.__gm;
    let clockMs = capture.start * 1_000;
    const renderAt = (ms: number): void => {
      if (hooks?.renderAt) hooks.renderAt(ms);
      else if (hooks?.advanceTime) hooks.advanceTime(Math.max(0, ms - clockMs));
      else if (browser.__frame) browser.__frame(ms / 1_000);
      else throw new Error('page exposes no deterministic frame hook');
      clockMs = ms;
    };

    recorder.start();
    try {
      const frames = Math.round(capture.seconds * capture.fps);
      for (let frame = 0; frame < frames; frame += 1) {
        renderAt((capture.start + frame / capture.fps) * 1_000);
        track.requestFrame();
        // Yield through a paint so Chromium commits the requested frame. Media timestamps are discarded below.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    } finally {
      recorder.stop();
      track.stop();
    }
    await stopped;

    const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return { data: btoa(binary), width: source.width, height: source.height };
  }, options);
  writeFileSync(path, Buffer.from(encoded.data, 'base64'));
  return { width: encoded.width, height: encoded.height };
}

/** One still per time (seconds) at `<dir>/t<t>.png`. */
export async function stills(h: HookDriver, times: number[], dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (const t of times) {
    const path = join(dir, `t${t}.png`);
    await shot(h, t * 1000, path);
    paths.push(path);
  }
  return paths;
}

/** The capture.mjs `xstack` layout: 4 per row, last frame repeated to fill the grid, scaled to 1600 px wide. */
export function tileArgs(files: string[], out: string): string[] {
  const cols = Math.min(4, files.length);
  const rows = Math.ceil(files.length / cols);
  const cells = cols * rows;
  const inputs = Array.from({ length: cells }, (_, i) => `[${Math.min(i, files.length - 1)}]`).join('');
  const layout = Array.from({ length: cells }, (_, i) => {
    const x = i % cols === 0 ? '0' : Array.from({ length: i % cols }, () => 'w0').join('+');
    const row = Math.floor(i / cols);
    const y = row === 0 ? '0' : Array.from({ length: row }, () => 'h0').join('+');
    return `${x}_${y}`;
  }).join('|');
  const filter = cells === 1 ? '[0]scale=1600:-1' : `${inputs}xstack=inputs=${cells}:layout=${layout},scale=1600:-1`;
  return [...files.flatMap((file) => ['-i', file]), '-filter_complex', filter, '-frames:v', '1', out];
}

export function tile(files: string[], out: string, binary = 'ffmpeg'): void {
  if (files.length === 0) throw new Error('nothing to tile');
  mkdirSync(dirname(out), { recursive: true });
  ffmpeg(binary, tileArgs(files, out));
}

/** Frames at `times` (seconds) tiled in time order into one PNG. */
export async function timeline(h: HookDriver, times: number[], out: string, binary = 'ffmpeg'): Promise<void> {
  if (!hasFfmpeg(binary)) throw new FfmpegMissingError(binary);
  const tmp = mkdtempSync(`${out}.frames-`);
  try {
    const files: string[] = [];
    for (const [i, t] of times.entries()) {
      const file = join(tmp, `${String(i).padStart(3, '0')}.png`);
      await shot(h, t * 1000, file);
      files.push(file);
    }
    tile(files, out, binary);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** H.264/yuv420p capture: phone-safe 960 px by default, or the source viewport dimensions when native is requested. */
export function clipArgs(
  framesDir: string,
  fps: number,
  out: string,
  native = false,
  nativeSize?: { width: number; height: number },
): string[] {
  const nativeScale = nativeSize
    ? `scale=${nativeSize.width}:${nativeSize.height}:flags=neighbor:in_range=full:out_range=tv,format=yuv420p`
    : 'scale=iw:ih:in_range=full:out_range=tv,format=yuv420p';
  return [
    '-framerate',
    String(fps),
    '-i',
    join(framesDir, 'f%05d.jpg'),
    '-vf',
    native ? nativeScale : 'scale=960:-2:in_range=full:out_range=tv,format=yuv420p',
    ...h264Args(out, 'slow'),
  ];
}

/** Retimes manually requested canvas samples to an exact duration and frame rate before the H.264 encode. */
export function streamClipArgs(
  input: string,
  fps: number,
  sampleFps: number,
  seconds: number,
  out: string,
  native = false,
  nativeSize?: { width: number; height: number },
): string[] {
  const scale = native
    ? nativeSize
      ? `scale=${nativeSize.width}:${nativeSize.height}:flags=neighbor:in_range=full:out_range=tv`
      : 'scale=iw:ih:in_range=full:out_range=tv'
    : 'scale=960:-2:in_range=full:out_range=tv';
  return [
    '-i',
    input,
    '-vf',
    `setpts=N/(${sampleFps}*TB),tpad=stop_mode=clone:stop_duration=${seconds},fps=${fps},${scale},format=yuv420p`,
    '-t',
    String(seconds),
    '-frames:v',
    String(Math.round(seconds * fps)),
    ...h264Args(out),
  ];
}

/** MediaRecorder may drop requested canvas frames; normalize the staged H.264 stream to the delivery contract. */
export function normalizeClipArgs(input: string, fps: number, seconds: number, out: string): string[] {
  return [
    '-i',
    input,
    '-vf',
    `tpad=stop_mode=clone:stop_duration=${seconds},fps=${fps},trim=duration=${seconds},format=yuv420p`,
    '-t',
    String(seconds),
    '-frames:v',
    String(Math.round(seconds * fps)),
    '-an',
    ...h264Args(out),
  ];
}

export type RecordOptions = { seconds: number; fps?: number; start?: number; native?: boolean };

export async function record(h: HookDriver, options: RecordOptions, out: string, binary = 'ffmpeg'): Promise<void> {
  if (!hasFfmpeg(binary)) throw new FfmpegMissingError(binary);
  const fps = options.fps ?? 30;
  const sampleFps = Math.min(fps, STREAM_CAPTURE_FPS);
  const start = options.start ?? 0;
  mkdirSync(dirname(out), { recursive: true });
  const tmp = mkdtempSync(`${out}.frames-`);
  try {
    const input = join(tmp, 'capture.webm');
    const staged = join(tmp, 'staged.mp4');
    const sourceSize = await canvasVideo(h, { seconds: options.seconds, fps: sampleFps, start }, input);
    const viewport = h.page.viewportSize();
    const nativeSize =
      options.native && viewport && sourceSize.width * viewport.height === sourceSize.height * viewport.width
        ? viewport
        : undefined;
    ffmpeg(binary, streamClipArgs(input, fps, sampleFps, options.seconds, staged, options.native, nativeSize));
    ffmpeg(binary, normalizeClipArgs(staged, fps, options.seconds, out));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** `0:10:0.5` → [0, 0.5, ..., 10]. */
export function timelineTimes(spec: { from: number; to: number; step: number }): number[] {
  const count = Math.floor((spec.to - spec.from) / spec.step) + 1;
  if (
    !Number.isFinite(spec.from) ||
    !Number.isFinite(spec.to) ||
    !Number.isFinite(spec.step) ||
    spec.from < 0 ||
    spec.to < spec.from ||
    spec.step <= 0 ||
    count < 1 ||
    count > MAX_CAPTURE_FRAMES
  )
    throw new Error(`timeline must contain 1-${MAX_CAPTURE_FRAMES} non-negative frames`);
  const times: number[] = [];
  for (let i = 0; ; i += 1) {
    const t = +(spec.from + i * spec.step).toFixed(6);
    if (t > spec.to + 1e-9) break;
    times.push(t);
  }
  return times;
}

export function relativeTo(outDir: string, path: string): string {
  return relative(outDir, path).split('\\').join('/');
}
