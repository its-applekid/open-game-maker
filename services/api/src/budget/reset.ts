function zoneOrUtc(zone: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return zone;
  } catch {
    return 'UTC';
  }
}

export function dayKey(now: Date, zone: string): string {
  return formatDay(
    now,
    new Intl.DateTimeFormat('en', {
      timeZone: zoneOrUtc(zone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  );
}

function formatDay(now: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(now);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function nextReset(now: Date, zone: string): Date {
  const normalizedZone = zoneOrUtc(zone);
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: normalizedZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatDay(now, formatter);
  const firstMinute = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  for (let offset = 0; offset <= 26 * 60; offset += 1) {
    const candidate = new Date(firstMinute + offset * 60_000);
    if (formatDay(candidate, formatter) !== today) return candidate;
  }
  throw new Error(`could not find the next reset for ${normalizedZone}`);
}
