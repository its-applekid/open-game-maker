import { createHash } from 'node:crypto';

export type DaemonStatus = 'stopped' | 'starting' | 'running' | 'idle';
export type JobKind = 'new_game' | 'feature' | 'repair';

// T02 §4 contract; `unit` is `ogm-aiur@<slug>.service` and `checkoutPath` the daemon directory.
export type GameDaemon = {
  repo: string;
  checkoutPath: string;
  unit: string;
  envFile: string;
  port: number;
  clientToken: string;
  status: DaemonStatus;
};

// The persisted record: GameDaemon minus the token, plus lifecycle bookkeeping.
export type DaemonRow = {
  slug: string;
  repo: string;
  checkoutPath: string;
  unit: string;
  envFile: string;
  port: number;
  status: DaemonStatus;
  lastHealthAt: string | null;
  lastError: string | null;
  startedAt: string | null;
  idleSince: string | null;
  maxConcurrentAgents: 1 | 2;
  createdAt: string;
};

export interface DaemonStore {
  byRepo(repo: string): Promise<DaemonRow | undefined>;
  list(): Promise<DaemonRow[]>;
  insert(row: DaemonRow): Promise<void>;
  update(slug: string, patch: Partial<Omit<DaemonRow, 'slug' | 'repo'>>): Promise<DaemonRow>;
}

// Jobs admitted and not finished (filed, running or paused) for one repo, from OGM-013's jobs table.
export type ActiveJobs = (repo: string) => Promise<{ kind: JobKind }[]>;

export type FleetEnv = {
  home: string;
  builderBotToken: string | undefined;
  builderBotLogin: string;
  intakeLogin: string;
  assetsLocalDir: string;
  aiurRoot?: string;
  apiPort?: number;
  supervisorToken?: string;
  codexHome?: string;
};

export const LIVE_STATUSES: readonly DaemonStatus[] = ['starting', 'running', 'idle'];
export const MAX_LIVE_DAEMONS = 4;

// stopped→starting→running→idle→stopped, plus a new job waking an idle daemon and failures exiting to stopped.
const TRANSITIONS: Record<DaemonStatus, readonly DaemonStatus[]> = {
  stopped: ['starting'],
  starting: ['running', 'stopped'],
  running: ['idle', 'stopped'],
  idle: ['running', 'stopped'],
};

export function assertTransition(from: DaemonStatus, to: DaemonStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`daemon status cannot go ${from} -> ${to}`);
  }
}

const MAX_SLUG = 48;

// `withHash` disambiguates repos that flatten to the same slug (`a/b.c` and `a/b-c`).
export function slugFor(repo: string, withHash = false): string {
  const slug = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_SLUG && !withHash) return slug;
  const hash = createHash('sha256').update(repo.toLowerCase()).digest('hex').slice(0, 4);
  return `${slug.slice(0, MAX_SLUG - 5).replace(/-+$/, '')}-${hash}`;
}
