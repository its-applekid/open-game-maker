import { useState } from 'react';

import { useRollups } from '../api';
import { adminActivities } from '../types';
import { activityLabel } from './layout';

const colors = [
  'var(--orange-b)',
  'var(--yellow-b)',
  'var(--green-b)',
  'var(--aqua-b)',
  'var(--blue-b)',
  'var(--purple-b)',
  'var(--red-b)',
  'var(--cream)',
  'var(--ink-2)',
];

export function Rollups({
  games,
  members,
}: {
  games: { id: string; title: string }[];
  members: { userId: string; email: string }[];
}) {
  const [days, setDays] = useState(30);
  const gameRows = useRollups(
    'game',
    days,
    games.map(({ id, title }) => ({ id, label: title })),
  );
  const memberRows = useRollups(
    'member',
    days,
    members.map(({ userId, email }) => ({ id: userId, label: email })),
  );
  return (
    <section className="admin-rollups">
      <div className="admin-title-row">
        <h3>Activity roll-ups</h3>
        <label>
          Window
          <select aria-label="Roll-up window" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
      </div>
      <div className="admin-rollup-legend">
        {adminActivities.map((activity, index) => (
          <span key={activity}>
            <i style={{ background: colors[index] }} />
            {activityLabel(activity)}
          </span>
        ))}
      </div>
      <RollupGroup error={gameRows.isError} label="By game" loading={gameRows.isPending} rows={gameRows.data ?? []} />
      <RollupGroup
        error={memberRows.isError}
        label="By member"
        loading={memberRows.isPending}
        rows={memberRows.data ?? []}
      />
    </section>
  );
}

export function RollupGroup({
  error,
  label,
  loading,
  rows,
}: {
  error: boolean;
  label: string;
  loading: boolean;
  rows: NonNullable<ReturnType<typeof useRollups>['data']>;
}) {
  if (loading) return <p>Loading {label.toLowerCase()}…</p>;
  if (error) return <p>{label} unavailable.</p>;
  const populated = rows.filter(({ rollup }) => rollup.builds > 0);
  return (
    <section className="admin-rollup-group">
      <h4>{label}</h4>
      {populated.length === 0 ? (
        <p>No builds in this window.</p>
      ) : (
        populated.map(({ id, label: rowLabel, rollup }) => {
          const total = Math.max(
            1,
            Object.values(rollup.byActivity).reduce((sum, bucket) => sum + bucket.durationMs, 0),
          );
          let x = 0;
          return (
            <div className="admin-rollup-row" key={id}>
              <span>{rowLabel}</span>
              <svg aria-label={`${rowLabel} activity minutes`} role="img" viewBox="0 0 1000 34">
                {adminActivities.map((activity, index) => {
                  const width = (rollup.byActivity[activity].durationMs / total) * 1000;
                  const rect = (
                    <rect fill={colors[index]} height="28" key={activity} width={width} x={x} y="3">
                      <title>
                        {activityLabel(activity)}: {(rollup.byActivity[activity].durationMs / 60_000).toFixed(1)}{' '}
                        minutes
                      </title>
                    </rect>
                  );
                  x += width;
                  return rect;
                })}
              </svg>
              <strong>{rollup.builds} builds</strong>
            </div>
          );
        })
      )}
    </section>
  );
}
