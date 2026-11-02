import type { GameManifest, SaveData } from '@ogm/contracts/game';
import type { Insets } from '@ogm/contracts/input';

import type { TargetHit } from '../types.js';

/** What the host page puts on `window.__conf` for the Node session to drive. */
export interface ConfApi {
  readonly manifest: GameManifest | null;
  /** Set when the frame failed before `ready`. */
  readonly failure: string | null;
  errors: string[];
  saves: SaveData<unknown>[];
  applied: { rev: number; result: string }[];
  placements: { ok: boolean; reason?: string }[];
  request(type: string, payload: unknown): Promise<unknown>;
  send(type: string, payload: unknown): void;
  barrier(): Promise<void>;
  setViewport(width: number, height: number, safe: Insets): void;
  scan(n: number): Promise<TargetHit[]>;
  /** Distinct colours in a sample of a base64 PNG. */
  colours(png: string): Promise<number>;
}

export const HOST_HTML =
  '<!doctype html><meta charset="utf-8"><style>html,body,#game{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="game"></div><script type="module" src="/main.js"></script>';

declare global {
  interface Window {
    __conf: ConfApi;
  }
}
