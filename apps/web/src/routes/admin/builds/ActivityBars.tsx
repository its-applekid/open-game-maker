import { adminActivities } from '../types';
import { activityLabel } from './layout';

export function ActivityBars({ minutesByActivity }: { minutesByActivity: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(minutesByActivity));
  return (
    <div aria-label="Activity minutes" className="admin-activity-bars">
      {adminActivities.map((activity) => {
        const minutes = minutesByActivity[activity] ?? 0;
        return (
          <div className="admin-activity-row" key={activity}>
            <span>{activityLabel(activity)}</span>
            <div aria-hidden="true" className="admin-activity-track">
              <i style={{ width: `${(minutes / max) * 100}%` }} />
            </div>
            <strong>{formatMinutes(minutes)}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function formatMinutes(minutes: number): string {
  return minutes < 0.1 ? '<0.1 min' : `${minutes.toFixed(1).replace(/\.0$/, '')} min`;
}
