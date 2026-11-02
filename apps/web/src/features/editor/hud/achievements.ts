export type GameEventKind = 'achievement' | 'analytics' | 'checkpoint';

export function handleGameEvent(
  kind: GameEventKind,
  payload: unknown,
  build: 'draft' | 'published',
  toast: (message: string) => void,
): void {
  if (kind !== 'achievement') return;
  const title = achievementTitle(payload);
  if (title === undefined) return;
  toast(build === 'draft' ? `${title} (test)` : title);
}

function achievementTitle(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.trim() !== '') return payload.trim();
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const value = typeof record.title === 'string' ? record.title : record.key;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
