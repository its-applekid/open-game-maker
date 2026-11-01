import { AiurPhase, Id, IsoTime } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { z } from 'zod';

const PhaseEvent = z
  .object({
    jobId: Id,
    phase: AiurPhase,
    transition: z.string().max(80).optional(),
    at: IsoTime,
    source: z.enum(['events_feed', 'progress_poll']),
  })
  .strict();

export type PhaseEvent = z.input<typeof PhaseEvent>;

export function recordAiurPhase(db: Db, value: PhaseEvent): void {
  const event = PhaseEvent.parse(value);
  db.insert(schema.aiurPhaseEvents)
    .values({ ...event, at: new Date(event.at).toISOString() })
    .onConflictDoNothing()
    .run();
}
