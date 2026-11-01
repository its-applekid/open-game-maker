const dropped: Record<string, number> = Object.create(null) as Record<string, number>;

export function recordDropped(type: string): void {
  dropped[type] = (dropped[type] ?? 0) + 1;
}

export function droppedSnapshot(): Record<string, number> {
  return { ...dropped };
}
