import type { Job } from '@ogm/contracts';

import { Icon } from '../../components/Icon';

export function combinedProgress(jobs: Job[]): number {
  const active = jobs.filter((job) => !['done', 'failed', 'cancelled'].includes(job.state));
  const total = active.reduce((sum, job) => sum + job.reservation.amountMicroUsd, 0);
  if (total === 0) return active.length === 0 && jobs.length > 0 ? 1 : 0;
  return (
    active.reduce((sum, job) => sum + job.reservation.amountMicroUsd * ((job.progressPercent ?? 0) / 100), 0) / total
  );
}

export function Fab({ jobs, fresh, onOpen }: { jobs: Job[]; fresh: boolean; onOpen(): void }) {
  const active = jobs.filter((job) => !['done', 'failed', 'cancelled'].includes(job.state));
  const progress = combinedProgress(jobs);
  const ariaLabel = fresh
    ? 'A build finished. Show it'
    : active.length
      ? `${active.length} build${active.length === 1 ? '' : 's'} running, ${Math.round(progress * 100)}% done. Show progress`
      : 'All builds done';

  return (
    <button
      className={`build-chat-fab tap-primary ${fresh ? 'ready' : ''} ${active.length ? '' : 'idle'}`}
      type="button"
      aria-label={ariaLabel}
      onClick={onOpen}
    >
      <svg className="build-chat-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" strokeWidth="3.5" />
        <circle
          className="build-chat-ring-progress"
          cx="20"
          cy="20"
          r="18"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="113"
          strokeDashoffset={113 * (1 - progress)}
        />
      </svg>
      <Icon name="hammer" className="build-chat-hammer" />
      <span className="build-chat-count">{active.length || '✓'}</span>
    </button>
  );
}
