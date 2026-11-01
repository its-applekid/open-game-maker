import { tierSchema, type Tier } from '@ogm/contracts';

export const TIER_STORAGE_KEY = 'gm.tier';

export const DPR_CAP = {
  desktop: 2,
  mobile: 1.5,
  low: 1,
} as const satisfies Record<Tier, number>;

export interface TierSignals {
  coarse: boolean;
  iOS: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  dpr: number;
  override?: Tier | null;
  remembered?: Tier | null;
}

type NavigatorWithDeviceMemory = Navigator & { readonly deviceMemory?: number };

function parseTier(value: string | null): Tier | null {
  const result = tierSchema.safeParse(value);
  return result.success ? result.data : null;
}

function readRememberedTier(win: Window): Tier | null {
  try {
    return parseTier(win.localStorage.getItem(TIER_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readSignals(win: Window = window): TierSignals {
  const navigator = win.navigator as NavigatorWithDeviceMemory;
  const userAgent = navigator.userAgent;

  return {
    coarse: win.matchMedia('(pointer: coarse)').matches,
    iOS: /iP(hone|ad|od)/.test(userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(userAgent)),
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    dpr: win.devicePixelRatio,
    override: parseTier(new URLSearchParams(win.location.search).get('tier')),
    remembered: readRememberedTier(win),
  };
}

export function rememberTier(tier: Tier, override: Tier | null = null, storage?: Storage): void {
  if (override) return;

  try {
    (storage ?? globalThis.localStorage).setItem(TIER_STORAGE_KEY, tier);
  } catch {
    // Browser storage is unavailable in some private modes and embedded contexts.
  }
}

export function pickTier(signals?: TierSignals): Tier {
  const current = signals ?? readSignals();
  const memory = current.deviceMemory ?? (current.coarse ? 4 : 8);
  const cores = current.hardwareConcurrency ?? 4;
  const computed =
    !current.coarse && memory >= 8 ? 'desktop' : memory <= 2 || (cores <= 2 && !current.iOS) ? 'low' : 'mobile';
  const tier = current.override ?? current.remembered ?? computed;

  if (signals === undefined) rememberTier(tier, current.override);
  return tier;
}
