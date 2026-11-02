import type { Patch } from '@ogm/contracts/bridge';

export function pointerSegments(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function getPointer(doc: unknown, pointer: string): unknown {
  let node = doc;
  for (const segment of pointerSegments(pointer)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** A clone of `doc` with `value` at `pointer`, creating objects on the way; and the matching patch. */
export function setPointer<T>(doc: T, pointer: string, value: unknown): { doc: T; patch: Patch } {
  const next = structuredClone(doc) as Record<string, unknown>;
  const segments = pointerSegments(pointer);
  let node = next;
  for (const segment of segments.slice(0, -1)) {
    if (node[segment] === null || typeof node[segment] !== 'object') node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments.at(-1)!] = structuredClone(value);
  return { doc: next as T, patch: { op: 'replace', path: segments, value } };
}

/** The first path at which two JSON values differ, or `null` when they serialize byte-equal. */
export function firstDifference(left: unknown, right: unknown, path = ''): string | null {
  if (JSON.stringify(left) === JSON.stringify(right)) return null;
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const found = firstDifference(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}/${key}`,
      );
      if (found !== null) return found;
    }
  }
  return path || '/';
}
