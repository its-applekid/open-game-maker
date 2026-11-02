export class CanonicalError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalError';
  }
}

function serialize(value: unknown, ancestors: WeakSet<object>, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalError(`${path} contains a non-finite number`);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new CanonicalError(`${path} contains a non-JSON value`);
  if (ancestors.has(value)) throw new CanonicalError(`${path} contains a circular reference`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new CanonicalError(`${path}[${index}] contains a non-JSON value`);
        items.push(serialize(value[index], ancestors, `${path}[${index}]`));
      }
      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalError(`${path} contains a non-plain object`);
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], ancestors, `${path}.${key}`)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonical(value: unknown): string {
  return serialize(value, new WeakSet(), '$');
}
