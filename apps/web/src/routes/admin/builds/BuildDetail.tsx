import { useParams } from 'react-router';

import { formatUnits } from '../../../features/build-chat/units';
import { useAdminBuilds, useAdminSettings, useBuildTimeline } from '../api';
import { Timeline } from './Timeline';

export function BuildDetail() {
  const jobId = useParams().jobId ?? '';
  const builds = useAdminBuilds();
  const settings = useAdminSettings();
  const timeline = useBuildTimeline(jobId);
  if (builds.isPending || settings.isPending || timeline.isPending)
    return <p className="admin-state">Loading build…</p>;
  if (builds.isError || settings.isError || timeline.isError) return <p className="admin-state">Build unavailable</p>;
  const build = builds.data.builds.find(({ job }) => job.id === jobId);
  return (
    <section>
      <p className="admin-kicker">Build detail</p>
      <h2>{build?.game.title ?? jobId}</h2>
      <div className="admin-stat-grid">
        <article className="admin-stat">
          <span>Cost</span>
          <strong>
            {timeline.data.aiur.usageMicroUsd === null
              ? 'Unknown'
              : formatUnits(timeline.data.aiur.usageMicroUsd, settings.data.unitLabel, settings.data.microUsdPerUnit)}
          </strong>
        </article>
        <article className="admin-stat">
          <span>Retries</span>
          <strong>{timeline.data.aiur.retries ?? 'Unknown'}</strong>
        </article>
        <article className="admin-stat">
          <span>Repair attempts</span>
          <strong>{timeline.data.aiur.phases.filter(({ transition }) => transition === 'rework').length}</strong>
        </article>
      </div>
      <Timeline timeline={timeline.data} />
    </section>
  );
}
