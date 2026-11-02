import type { PlayerSettings } from '@ogm/contracts/browser';

const STORAGE_KEY = 'ogm.settings';
const defaults = (reduceMotion: boolean): PlayerSettings => ({
  mute: false,
  volume: 1,
  textScale: 1,
  reduceMotion,
});

export function loadSettings(
  storage: Storage = localStorage,
  prefersReducedMotion: () => boolean = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
): PlayerSettings {
  const fallback = defaults(prefersReducedMotion());
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return fallback;
    return normalizeSettings(value, fallback);
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: PlayerSettings, storage: Storage = localStorage): PlayerSettings {
  const normalized = normalizeSettings(settings, defaults(false));
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeSettings(value: Record<string, unknown>, fallback: PlayerSettings): PlayerSettings {
  return {
    mute: typeof value.mute === 'boolean' ? value.mute : fallback.mute,
    volume: finiteBound(value.volume, 0, 1, fallback.volume),
    textScale: finiteBound(value.textScale, 0.75, 2, fallback.textScale),
    reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : fallback.reduceMotion,
  };
}

function finiteBound(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
