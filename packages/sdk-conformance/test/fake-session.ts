import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Patch } from '@ogm/contracts/bridge';
import type { ControlDecl, GameManifest, SaveData } from '@ogm/contracts/game';

import type { CheckContext, GameSource, GameText, OpenOptions, Session, TargetHit } from '../src/types.js';

type Design = { globals: { 'player.speed': number }; entities: Record<string, { id: string; prefab: string }> };
type State = { x: number; score: number; entities: string[] };

/** One deliberately broken behaviour per check; the default script is a conformant game. */
export type FakeScript = {
  manifest?: Partial<GameManifest>;
  controls?: ControlDecl[];
  /** C2: an apply that also changes unrelated state. */
  applyLeaks?: boolean;
  /** C3: restore drops `score`. */
  restoreDropsScore?: boolean;
  /** C4: an older save fails to migrate. */
  migrateThrows?: boolean;
  /** C5: boot needs this capability. */
  requires?: string;
  /** C6: steps run while paused. */
  ignoresPause?: boolean;
  /** C7: where the player is picked, normalized. */
  player?: { nx: number; ny: number };
  /** C7: the player is never picked (off screen). */
  playerHidden?: boolean;
  colours?: number;
  /** C8: globals left on a published window. */
  publishedGlobals?: string[];
  /** C9: sessions are not deterministic. */
  nondeterministic?: boolean;
  /** C11: a placed entity survives the revert. */
  placementSticks?: boolean;
};

export const SPEED: ControlDecl = {
  id: 'player.speed',
  label: 'Player speed',
  scope: 'global',
  path: '/globals/player.speed',
  widget: { kind: 'slider', min: 1, max: 10 },
  default: 4,
};

export const MANIFEST: GameManifest = {
  id: 'fake',
  sdk: '*',
  title: 'Fake',
  inputs: { actions: { move: 'axis' } },
  presentation: { orientation: 'landscape', minLogical: { w: 640, h: 360 }, fit: 'fixed' },
  view: 'side',
  dimension: '2d',
  capabilities: ['audio'],
  palette: {
    categories: [{ id: 'level', label: 'Level', kind: 'items' }],
    items: [{ prefab: 'platform', label: 'Platform', category: 'level' }],
  },
  tools: ['select', 'place'],
  gizmos: {},
  saves: true,
  overrides: { aliases: {}, retired: [] },
};

export const DESIGN: Design = {
  globals: { 'player.speed': 4 },
  entities: { platform_01: { id: 'platform_01', prefab: 'platform' } },
};

let sessionsCreated = 0;

export class FakeSession implements Session {
  readonly manifest: GameManifest;
  closed = false;
  readonly scans: number[] = [];
  private tick = 0;
  private paused = false;
  private design: Design = structuredClone(DESIGN);
  private state: State = { x: 0, score: 0, entities: ['platform_01'] };
  private readonly written: SaveData<unknown>[] = [];
  private readonly salt = (sessionsCreated += 1);

  constructor(
    private readonly script: FakeScript,
    readonly options: OpenOptions,
  ) {
    this.manifest = { ...MANIFEST, ...script.manifest };
    if (script.requires && !options.capabilities.includes(script.requires)) {
      throw new Error(`boot failed: ${script.requires} is missing`);
    }
  }

  async advanceTime(ms: number): Promise<void> {
    if (this.paused && !this.script.ignoresPause) return;
    const steps = Math.floor(ms / (1000 / 60) + 1e-9);
    this.tick += steps;
    this.state.x += steps * this.design.globals['player.speed'] + (this.script.nondeterministic ? this.salt : 0);
    this.state.score += steps;
  }

  async setSeed(): Promise<void> {}

  async text(): Promise<GameText> {
    if (this.options.build === 'published') throw new Error('published builds refuse test requests');
    return { coords: '2d', tick: this.tick, mode: 'play', state: structuredClone(this.state), players: [{ id: 'p1' }] };
  }

  async applyDesign(doc: unknown, patches: Patch[]): Promise<'live' | 'restart-scene'> {
    this.design = structuredClone(doc as Design);
    if (this.script.applyLeaks) this.state.score += 1;
    const ids = Object.keys(this.design.entities);
    this.state.entities = this.script.placementSticks ? [...new Set([...this.state.entities, ...ids])] : ids;
    return patches.some((patch) => patch.path[0] === 'entities') ? 'restart-scene' : 'live';
  }

  async restore(save: SaveData<unknown>): Promise<void> {
    if (save.saveSchemaVersion === 0) {
      if (this.script.migrateThrows) throw new Error('save_unsupported');
      this.state = { x: 0, score: 0, entities: [] };
      this.written.push({ saveSchemaVersion: 1, data: structuredClone(this.state) });
      return;
    }
    const data = structuredClone(save.data) as State;
    if (this.script.restoreDropsScore) delete (data as Partial<State>).score;
    this.state = data;
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.written.push({ saveSchemaVersion: 1, data: structuredClone(this.state) });
  }

  async resume(): Promise<void> {
    this.paused = false;
  }

  async saves(): Promise<SaveData<unknown>[]> {
    return structuredClone(this.written);
  }

  async idle(): Promise<void> {
    if (this.script.ignoresPause) await this.advanceTime(50);
  }

  async validatePlacement(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true };
  }

  async scan(n: number): Promise<TargetHit[]> {
    this.scans.push(n);
    if (this.script.playerHidden) return [];
    const { nx, ny } = this.script.player ?? { nx: 0.5, ny: 0.5 };
    const cell = 1 / n;
    return [{ id: 'p1', nx: Math.floor(nx / cell) * cell + cell / 2, ny: Math.floor(ny / cell) * cell + cell / 2 }];
  }

  async still(): Promise<{ colours: number }> {
    return { colours: this.script.colours ?? 40 };
  }

  async globals(): Promise<string[]> {
    return this.options.build === 'published' ? (this.script.publishedGlobals ?? []) : ['__gm'];
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function fakeGame(script: FakeScript = {}): GameSource {
  return {
    dir: '/fake',
    manifest: { ...MANIFEST, ...script.manifest },
    controls: script.controls ?? [SPEED],
    design: structuredClone(DESIGN) as unknown as Record<string, unknown>,
    entityIds: Object.keys(DESIGN.entities),
    hasMigrateOverride: false,
  };
}

/** A check context over fake sessions; `sessions` records every session opened. */
export function fakeContext(
  script: FakeScript = {},
  overrides: Partial<CheckContext> = {},
): CheckContext & { sessions: FakeSession[] } {
  const sessions: FakeSession[] = [];
  return {
    game: fakeGame(script),
    sessions,
    async open(options = {}) {
      const session = new FakeSession(script, {
        build: 'test',
        capabilities: MANIFEST.capabilities,
        viewport: { width: 1280, height: 720 },
        safe: { top: 0, right: 0, bottom: 0, left: 0 },
        ...options,
      });
      sessions.push(session);
      return session;
    },
    publishedBundle: [{ path: 'assets/index.js', text: 'console.log("game")' }],
    outDir: mkdtempSync(join(tmpdir(), 'gm-sdk-test-')),
    ...overrides,
  };
}
