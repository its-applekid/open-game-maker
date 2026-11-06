import { queryClient } from '../../app/query';
import { api } from '../../lib/api/client';
import { myJobsQueryKey } from './jobs';

// One answer path for every surface: the job's checkpoint route validates the option against the job's checkpoint and
// calls aiur's canonical Decision API, so the inbox, the conversation modal and an inline checkpoint card all agree.
export async function answerCheckpoint(jobId: string, checkpointId: string, optionId: string): Promise<void> {
  await api(`/jobs/${encodeURIComponent(jobId)}/checkpoints/${encodeURIComponent(checkpointId)}/answer`, {
    method: 'POST',
    json: { option_id: optionId },
  });
  await queryClient.invalidateQueries({ queryKey: myJobsQueryKey });
}
