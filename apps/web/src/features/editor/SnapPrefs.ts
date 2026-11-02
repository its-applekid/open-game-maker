export type SnapPrefs = { version: 1; enabled: boolean; grid: number };

export function loadSnapPrefs(gameId: string, defaultGrid: number, storage: Storage = localStorage): SnapPrefs {
  const fallback: SnapPrefs = { version: 1, enabled: true, grid: validGrid(defaultGrid) ? defaultGrid : 1 };
  try {
    const raw = storage.getItem(storageKey(gameId));
    if (raw === null) return fallback;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== 'boolean' || !validGrid(value.grid)) {
      return fallback;
    }
    return { version: 1, enabled: value.enabled, grid: value.grid };
  } catch {
    return fallback;
  }
}

export function saveSnapPrefs(gameId: string, prefs: SnapPrefs, storage: Storage = localStorage): void {
  if (!validGrid(prefs.grid)) throw new RangeError('snap grid must be a finite positive number');
  storage.setItem(storageKey(gameId), JSON.stringify({ version: 1, enabled: prefs.enabled, grid: prefs.grid }));
}

function storageKey(gameId: string): string {
  return `ogm.editor.snap.${gameId}`;
}

function validGrid(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1024;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
