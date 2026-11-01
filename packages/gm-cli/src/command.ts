export type FlagSpec = Record<
  string,
  { type: 'string' | 'number' | 'boolean'; default?: unknown; help: string; multiple?: boolean; short?: string }
>;

export type GmContext = {
  cwd: string;
  assetsRoot: string | null;
  skillsDir: string | null;
  json: boolean;
  limit: number;
  fields: string[] | null;
  out: (line: string) => void;
  err: (line: string) => void;
  emit(event: string, payload: unknown): void;
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

/** Exit codes: 0 ok, 1 a check failed, 2 refused or bad usage. */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;

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
