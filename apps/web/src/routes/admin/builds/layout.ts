import type { Activity } from '@ogm/contracts';

export type TimelineLayoutInput = {
  phases: { phase: string; at: string }[];
  activities: { activity: Activity | string; startedAt: string; endedAt: string | null }[];
  generatedAt: string;
};

export type TimelineSegment = {
  id: string;
  label: string;
  x: number;
  width: number;
  row: 'phase' | 'activity';
  open?: boolean;
};

const labels: Record<string, string> = {
  asset_pipeline: 'Asset pipeline',
  level_building: 'Level building',
  gameplay_code: 'Gameplay code',
  animation_vfx: 'Animation & VFX',
  audio: 'Audio',
  ui_hud: 'UI & HUD',
  playtesting: 'Playtesting',
  deploy_release: 'Deploy & release',
  writing: 'Writing',
};

export function activityLabel(activity: string): string {
  return labels[activity] ?? activity.replaceAll('_', ' ');
}

export function layoutTimeline(input: TimelineLayoutInput, width: number) {
  const phases = [...input.phases].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const activityTimes = input.activities.flatMap(({ startedAt, endedAt }) => [
    Date.parse(startedAt),
    Date.parse(endedAt ?? ''),
  ]);
  const start = Math.min(...phases.map(({ at }) => Date.parse(at)), ...activityTimes.filter(Number.isFinite));
  const end = Math.max(
    Date.parse(input.generatedAt),
    ...phases.map(({ at }) => Date.parse(at)),
    ...activityTimes.filter(Number.isFinite),
  );
  const duration = Math.max(1, end - start);
  const scale = width / duration;
  const phaseSegments: TimelineSegment[] = phases.slice(0, -1).map((phase, index) => {
    const next = phases[index + 1]!;
    return {
      id: `${phase.phase}-${phase.at}`,
      label: activityLabel(phase.phase),
      x: (Date.parse(phase.at) - start) * scale,
      width: Math.max(1, (Date.parse(next.at) - Date.parse(phase.at)) * scale),
      row: 'phase',
    };
  });
  const implementIndex = phases.findIndex(({ phase }) => phase === 'implement' || phase === 'work');
  const implementStart = implementIndex >= 0 ? Date.parse(phases[implementIndex]!.at) : start;
  const implementEnd =
    implementIndex >= 0 && phases[implementIndex + 1] ? Date.parse(phases[implementIndex + 1]!.at) : end;
  const activities: TimelineSegment[] = input.activities.map((activity, index) => {
    const activityStart = Math.max(implementStart, Date.parse(activity.startedAt));
    const activityEnd = Math.min(implementEnd, Date.parse(activity.endedAt ?? input.generatedAt));
    return {
      id: `${activity.activity}-${activity.startedAt}-${index}`,
      label: activityLabel(activity.activity),
      x: (activityStart - start) * scale,
      width: Math.max(1, Math.max(0, activityEnd - activityStart) * scale),
      row: 'activity',
      ...(activity.endedAt === null ? { open: true } : {}),
    };
  });
  const minutesByActivity = Object.fromEntries(input.activities.map(({ activity }) => [activity, 0])) as Record<
    string,
    number
  >;
  for (const activity of input.activities) {
    const activityEnd = Date.parse(activity.endedAt ?? input.generatedAt);
    minutesByActivity[activity.activity] =
      (minutesByActivity[activity.activity] ?? 0) + Math.max(0, activityEnd - Date.parse(activity.startedAt)) / 60_000;
  }
  return { phases: phaseSegments, activities, minutesByActivity, scale };
}
