export type DiffOptions = { readonly path: string; readonly context?: number };

type Op = { readonly kind: 'keep' | 'add' | 'remove'; readonly line: string };

function lines(text: string): string[] {
  const split = text.split('\n');
  if (split.length > 0 && split[split.length - 1] === '') split.pop();
  return split;
}

/** Longest common subsequence over lines; the files here are manifests and `.npmrc`, so O(n*m) is fine. */
function operations(before: readonly string[], after: readonly string[]): Op[] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const row = table[i] as number[];
    const next = table[i + 1] as number[];
    for (let j = after.length - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j] ? (next[j + 1] as number) + 1 : Math.max(next[j] as number, row[j + 1] as number);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      ops.push({ kind: 'keep', line: before[i] as string });
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const right = table[i]?.[j + 1] ?? 0;
    if (down >= right) {
      ops.push({ kind: 'remove', line: before[i] as string });
      i += 1;
    } else {
      ops.push({ kind: 'add', line: after[j] as string });
      j += 1;
    }
  }
  while (i < before.length) {
    ops.push({ kind: 'remove', line: before[i] as string });
    i += 1;
  }
  while (j < after.length) {
    ops.push({ kind: 'add', line: after[j] as string });
    j += 1;
  }
  return ops;
}

/**
 * A unified diff of two texts. Empty when nothing changed. The output is what a dry run prints, so a
 * reviewer can read the switch before anything is written.
 */
export function unifiedDiff(before: string, after: string, options: DiffOptions): string {
  if (before === after) return '';
  const context = options.context ?? 3;
  const ops = operations(lines(before), lines(after));

  const changed: number[] = [];
  ops.forEach((op, index) => {
    if (op.kind !== 'keep') changed.push(index);
  });
  if (changed.length === 0) return '';

  const ranges: [number, number][] = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last !== undefined && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }

  const out: string[] = [`--- a/${options.path}`, `+++ b/${options.path}`];
  for (const [start, end] of ranges) {
    const slice = ops.slice(start, end + 1);
    const beforeCount = slice.filter((op) => op.kind !== 'add').length;
    const afterCount = slice.filter((op) => op.kind !== 'remove').length;
    const beforeStart = ops.slice(0, start).filter((op) => op.kind !== 'add').length + 1;
    const afterStart = ops.slice(0, start).filter((op) => op.kind !== 'remove').length + 1;
    // A new file has no lines to start from: git writes `-0,0`, not `-1,0`.
    const beforeFrom = beforeCount === 0 ? beforeStart - 1 : beforeStart;
    const afterFrom = afterCount === 0 ? afterStart - 1 : afterStart;
    out.push(`@@ -${beforeFrom},${beforeCount} +${afterFrom},${afterCount} @@`);
    for (const op of slice) {
      const marker = op.kind === 'add' ? '+' : op.kind === 'remove' ? '-' : ' ';
      out.push(`${marker}${op.line}`);
    }
  }
  return `${out.join('\n')}\n`;
}
