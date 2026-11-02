import { createGameFrame } from '@gm/host';
import type { GameManifest, SaveData, TargetRef } from '@ogm/contracts/game';
import type { Insets } from '@ogm/contracts/input';

import type { ConfApi } from './api.js';

/** Host messages a page fires at most this often; the bridge drops above 120/s. */
const SCAN_BATCH = 50;
const SCAN_PAUSE_MS = 500;

const params = new URLSearchParams(location.search);
const build = params.get('build') === 'published' ? 'published' : 'test';
const errors: string[] = [];
const saves: SaveData<unknown>[] = [];
const applied: { rev: number; result: string }[] = [];
const picked: TargetRef[][] = [];
const placements: { ok: boolean; reason?: string }[] = [];
let manifest: GameManifest | null = null;
let failure: string | null = null;

const frame = createGameFrame({
  container: document.querySelector<HTMLElement>('#game')!,
  gamesOrigin: params.get('game')!,
  gameId: 'conf',
  buildId: build,
  build,
  mode: 'test',
  playerIndex: 0,
  capabilities: (params.get('caps') ?? '').split(',').filter(Boolean),
  role: () => 'owner',
  readyTimeoutMs: 60_000,
  onReady: (ready) => {
    manifest = ready;
  },
  onSaveWrite: (save) => saves.push({ saveSchemaVersion: save.saveSchemaVersion, data: save.data }),
  onError: (error) => {
    errors.push(`${error.code}: ${error.message}`);
    if (!manifest) failure = `${error.code}: ${error.message}`;
  },
});
frame.on('design.applied', ({ rev, result }) => applied.push({ rev, result }));
frame.on('editor.picked', ({ targets }) => picked.push(targets));
frame.on('editor.placement', (placement) => placements.push(placement));

/** Messages are handled in order, so any answered request means everything sent before it was handled. */
async function barrier(): Promise<void> {
  await frame.request('test.seed', {}).catch(() => undefined);
}

const api: ConfApi = {
  get manifest() {
    return manifest;
  },
  get failure() {
    return failure;
  },
  errors,
  saves,
  applied,
  placements,
  request: (type, payload) => frame.request(type as 'test.seed', payload as never),
  send: (type, payload) => {
    frame.send(type as 'lifecycle.pause', payload as never);
  },
  barrier,
  setViewport(width: number, height: number, safe: Insets) {
    frame.send('viewport', { w: width, h: height, dpr: devicePixelRatio, orientation: 'landscape', safe });
  },
  async scan(n) {
    picked.length = 0;
    const cells: { nx: number; ny: number }[] = [];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) cells.push({ nx: (col + 0.5) / n, ny: (row + 0.5) / n });
    }
    for (let start = 0; start < cells.length; start += SCAN_BATCH) {
      for (const cell of cells.slice(start, start + SCAN_BATCH)) frame.send('editor.pick', { x: cell.nx, y: cell.ny });
      await new Promise((resolve) => setTimeout(resolve, SCAN_PAUSE_MS));
    }
    await barrier();
    if (picked.length !== cells.length) throw new Error(`editor.pick answered ${picked.length} of ${cells.length}`);
    return cells.flatMap((cell, index) => picked[index]!.map((target) => ({ id: target.id, ...cell })));
  },
  async colours(png) {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const seen = new Set<number>();
    const step = Math.max(1, Math.floor(pixels.length / 4 / 4096));
    for (let pixel = 0; pixel < pixels.length / 4; pixel += step) {
      const offset = pixel * 4;
      seen.add((pixels[offset]! << 16) | (pixels[offset + 1]! << 8) | pixels[offset + 2]!);
    }
    return seen.size;
  },
};

window.__conf = api;
