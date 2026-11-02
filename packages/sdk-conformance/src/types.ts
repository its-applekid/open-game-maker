import type { Patch } from '@ogm/contracts/bridge';
import type { ControlDecl, GameManifest, SaveData } from '@ogm/contracts/game';
import type { Insets } from '@ogm/contracts/input';

export const CHECK_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'] as const;
export type CheckId = (typeof CHECK_IDS)[number] | 'C0';
export type CheckStatus = 'pass' | 'fail' | 'unchecked';

export type CheckResult = {
  id: CheckId;
  name: string;
  status: CheckStatus;
  detail: string;
  artifacts?: string[];
};

export type GameText = { coords: string; tick: number; mode: 'play' | 'edit'; state: unknown; players: unknown[] };
export type TargetHit = { id: string; nx: number; ny: number };
export type BuildKind = 'test' | 'published';
export type ViewportSize = { width: number; height: number };

export type OpenOptions = {
  build: BuildKind;
  capabilities: string[];
  viewport: ViewportSize;
  safe: Insets;
};

/** One mounted game, driven only through the host frame and the D-HOOKS `test.*` bridge messages. */
export interface Session {
  readonly manifest: GameManifest;
  advanceTime(ms: number): Promise<void>;
  setSeed(seed: number): Promise<void>;
  text(): Promise<GameText>;
  /** Rejects with the game's `error` message when the apply fails. */
  applyDesign(doc: unknown, patches: Patch[]): Promise<'live' | 'restart-scene'>;
  /** Rejects with the game's `error` message when the restore fails. */
  restore(save: SaveData<unknown>): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Every `save.write` the game sent, oldest first. */
  saves(): Promise<SaveData<unknown>[]>;
  /** Real time: two animation frames plus `ms`. */
  idle(ms: number): Promise<void>;
  /** `null` when the game sent no `editor.placement`. */
  validatePlacement(
    prefab: string,
    position: [number, number, number],
  ): Promise<{ ok: boolean; reason?: string } | null>;
  /** `editor.pick` over an n×n grid of the frame. */
  scan(n: number): Promise<TargetHit[]>;
  /** Screenshot to `path`; returns the number of distinct colours in a sample of its pixels. */
  still(path: string): Promise<{ colours: number }>;
  /** Names of the D-HOOKS window globals present in the game's window. */
  globals(): Promise<string[]>;
  close(): Promise<void>;
}

export type GameSource = {
  dir: string;
  manifest: GameManifest;
  controls: ControlDecl[];
  /** `designSchema.parse({})`: the design the game boots with. */
  design: Record<string, unknown>;
  /** Entity ids across `design/*.json`. */
  entityIds: string[];
  hasMigrateOverride: boolean;
};

/** A previous run's out dir (or any dir with this layout): `manifest.json`, `design/*.json`, `save.json`. */
export type PreviousBuild = {
  controlIds: string[];
  entityIds: string[];
  save?: SaveData<unknown>;
};

export type CheckContext = {
  game: GameSource;
  open(options?: Partial<OpenOptions>): Promise<Session>;
  previous?: PreviousBuild;
  /** `<gameDir>/tests/fixtures/save.previous.json` when present. */
  saveFixture?: SaveData<unknown>;
  /** Every JavaScript file of the published build. */
  publishedBundle: { path: string; text: string }[];
  outDir: string;
};

export type Check = {
  id: (typeof CHECK_IDS)[number];
  name: string;
  run(ctx: CheckContext): Promise<Omit<CheckResult, 'id' | 'name'>>;
};
