import type { Job } from '@ogm/contracts';

export function Bar({ jobs, expanded, onToggle }: { jobs: Job[]; expanded: boolean; onToggle(): void }) {
  const active = jobs.filter((job) => !['done', 'failed', 'cancelled'].includes(job.state));
  const progress = combinedProgress(jobs);
  const label = active.length
    ? `${active.length} build${active.length === 1 ? '' : 's'} · in progress`
    : 'All builds done';

  return (
    <button className="build-chat-summary" type="button" aria-expanded={expanded} onClick={onToggle}>
      <span className="build-chat-summary-label">{label}</span>
      <span className="build-chat-summary-percent">{Math.round(progress * 100)}%</span>
      <span className="build-chat-bar" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </span>
      <span className="build-chat-chevron">{expanded ? 'Hide builds ▴' : 'Show each build ▾'}</span>
    </button>
  );
}

function combinedProgress(jobs: Job[]): number {
  const active = jobs.filter((job) => !['done', 'failed', 'cancelled'].includes(job.state));
  const total = active.reduce((sum, job) => sum + job.reservation.amountMicroUsd, 0);
  if (total === 0) return active.length === 0 && jobs.length > 0 ? 1 : 0;
  return (
    active.reduce((sum, job) => sum + job.reservation.amountMicroUsd * ((job.progressPercent ?? 0) / 100), 0) / total
  );
}
