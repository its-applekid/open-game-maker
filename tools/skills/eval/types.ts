export type EvalConfigName = 'with_skill' | 'baseline' | 'full_reference';
export type EvalAgent = 'codex' | 'claude' | 'skipped';

export interface EvalRun {
  brief: string;
  config: EvalConfigName;
  agent: EvalAgent;
  dir: string;
  startedAt: string;
  durationMs: number;
  tokens?: { input: number; output: number };
  gates: { check: boolean; test: boolean; run: 'pass' | 'fail' | 'error' };
  m1: { duplicatedPct: number; largestClone?: { file: string; lines: number } };
  m4: { unasked: string[] };
  m5: { total: number; equalToCardExample: number };
  m6: { adapterCalls: string[]; renderKeys: string[] };
  passed: boolean;
  error?: string;
}

export interface EvalBrief {
  id: string;
  promptFile: string;
  expectedMechanics: string[];
}

export interface EvalConfig {
  name: EvalConfigName;
  excludeSkills: string[];
  corpusEnv?: string;
}

export interface Thresholds {
  m1Pct: number;
}

export interface EvalOptions {
  configs: EvalConfigName[];
  briefs: string[];
  agent: Exclude<EvalAgent, 'skipped'>;
  maxParallel: number;
  dryRun: boolean;
  confirm: boolean;
  out?: string;
}

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export type ProcessRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
) => Promise<ProcessResult>;

export interface M6Comparison {
  passed: boolean;
  adapterCollisions: string[][];
  renderKeyCollisions: string[][];
}
