function zoneOrUtc(zone: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return zone;
  } catch {
    return 'UTC';
  }
}

export function dayKey(now: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zoneOrUtc(zone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function nextReset(now: Date, zone: string): Date {
  const normalizedZone = zoneOrUtc(zone);
  const today = dayKey(now, normalizedZone);
  const firstMinute = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  for (let offset = 0; offset <= 26 * 60; offset += 1) {
    const candidate = new Date(firstMinute + offset * 60_000);
    if (dayKey(candidate, normalizedZone) !== today) return candidate;
  }
  throw new Error(`could not find the next reset for ${normalizedZone}`);
}
