import type { ConsoleEntry } from './report.js';

const KEY_CHARS = 200;

/** Collects page errors and console errors/warnings, one entry per `level + first 200 chars` with a count. */
export class ConsoleCollector {
  private readonly entries = new Map<string, ConsoleEntry>();

  add(level: ConsoleEntry['level'], text: string): void {
    const key = `${level}\u0000${text.slice(0, KEY_CHARS)}`;
    const existing = this.entries.get(key);
    if (existing) existing.count += 1;
    else this.entries.set(key, { level, text: text.slice(0, KEY_CHARS), count: 1 });
  }

  list(): ConsoleEntry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }
}
