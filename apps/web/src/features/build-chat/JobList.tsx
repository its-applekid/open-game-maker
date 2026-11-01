import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { Job } from '@ogm/contracts';

import { ApiError } from '../../lib/api/client';
import { pushToast } from '../../lib/notify';
import { cancelJob } from './jobs';
import { JobRow } from './JobRow';

export function JobList({ jobs, unitLabel, onOpen }: { jobs: Job[]; unitLabel: string; onOpen(job: Job): void }) {
  const navigate = useNavigate();
  const [cancelHidden, setCancelHidden] = useState<string[]>([]);

  const cancel = async (job: Job) => {
    if (!window.confirm(job.plan.title)) return;
    try {
      await cancelJob(job.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setCancelHidden((current) => [...current, job.id]);
      } else {
        pushToast('Could not cancel the build. Try again.');
      }
    }
  };

  return (
    <ul className="build-chat-jobs" aria-label="Builds">
      {jobs.map((job) => (
        <JobRow
          key={job.id}
          job={job}
          unitLabel={unitLabel}
          onOpen={() => onOpen(job)}
          onEdit={() => navigate(`/new?job=${encodeURIComponent(job.id)}`)}
          onCancel={() => void cancel(job)}
          cancelAvailable={!cancelHidden.includes(job.id)}
        />
      ))}
    </ul>
  );
}
