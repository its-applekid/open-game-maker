export type FlagSpec = Record<
  string,
  { type: 'string' | 'number' | 'boolean'; default?: unknown; help: string; multiple?: boolean; short?: string }
>;

export type GmConfig = {
  eventsFile?: string;
  jobId?: string;
  aiurIssue?: number;
  aiurRunId?: string;
  sandbox?: boolean;
  verifySoftwareGl: boolean;
  verifyQueue: boolean;
  runtimeDir?: string;
};

export type GmContext = {
  cwd: string;
  assetsRoot: string | null;
  skillsDir: string | null;
  config: GmConfig;
  json: boolean;
  limit: number;
  fields: string[] | null;
  out: (line: string) => void;
  err: (line: string) => void;
  emit(event: string, payload: unknown, jobId?: string): void;
  /** `OGM_BLOB_ROOT`, resolved against cwd; null when unset. */
  blobRoot: string | null;
  /** `OGM_BLOCKLIST_FILE`, resolved against cwd; null when unset. */
  blocklistFile: string | null;
};

/** One file per command under `src/commands/<namespace>/<cmd>.ts`, exporting `command`. */
export type GmCommand = {
  name: string;
  summary: string;
  usage?: string;
  example?: string;
  flags: FlagSpec;
  run(ctx: GmContext, args: string[], flags: Record<string, unknown>): Promise<number>;
};

/** Exit codes: 0 ok, 1 a check failed, 2 refused, 3 timed out, 4 became moot. */
export const EXIT = { ok: 0, failed: 1, usage: 2, timeout: 3, moot: 4 } as const;

/** Refusal or bad usage: printed as one line `<cause>. Try: <suggestion>` and exit 2. */
export class UsageError extends Error {
  constructor(
    readonly cause: string,
    readonly suggestion: string,
  ) {
    super(`${cause}. Try: ${suggestion}`);
    this.name = 'UsageError';
  }
}

/** An expected command failure whose one-line message should be printed with exit 1. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}
