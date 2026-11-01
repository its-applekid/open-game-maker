export interface RuntimeEvent {
  t: number;
  type: string;
  data?: unknown;
}

export class EventRing {
  private readonly entries: RuntimeEvent[] = [];

  constructor(private readonly capacity = 1024) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('event capacity must be a positive integer');
  }

  push(t: number, type: string, data?: unknown): void {
    this.entries.push(data === undefined ? { t, type } : { t, type, data });
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
  }

  since(cursor: number): RuntimeEvent[] {
    return this.entries.filter(({ t }) => t > cursor).map((event) => ({ ...event }));
  }
}
