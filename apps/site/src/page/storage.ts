const prefix = 'ogm-setup:';

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readValue(key: string): string | null {
  try {
    return store()?.getItem(prefix + key) ?? null;
  } catch {
    return null;
  }
}

export function writeValue(key: string, value: string | null): void {
  try {
    const storage = store();
    if (value === null) storage?.removeItem(prefix + key);
    else storage?.setItem(prefix + key, value);
  } catch {
    /* storage unavailable: the page keeps working without persistence */
  }
}
