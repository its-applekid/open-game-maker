import { z } from 'zod';

import { Id, IsoTime } from './api.js';
import { ChatMedia } from './chat.js';

// The per-game Commands inbox (M3, A2a): one game's open aiur Commands in the shape the embeddable
// `<aiur-commands>` component consumes (aiur#7487). A Command is one open aiur decision attached to a job's
// ticket; the inbox answers it through the job's checkpoint route, which calls aiur's canonical answer path.
export const CommandOption = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: z.string().trim().min(1).max(200),
  // Present when the option carries media (A1 rich Commands). OGM signs the same blob URLs the chat uses.
  media: ChatMedia.optional(),
});

export const GameCommand = z.object({
  job_id: Id,
  // The aiur ticket the Command belongs to; null until the job is linked to a ticket.
  ticket: z.string().nullable(),
  title: z.string().trim().min(1).max(200),
  checkpoint_id: z.string(),
  decision_id: z.string().min(1),
  version: z.number().int().positive(),
  question: z.string().trim().min(1).max(8000),
  options: z.array(CommandOption).min(2).max(5),
  recommend: z.string().optional(),
  blocking: z.boolean(),
  opened_at: IsoTime,
});

// GET /api/v1/games/:gameId/commands → the open Commands of every job the caller can edit in that game.
export const GameCommandsPage = z.object({ commands: z.array(GameCommand) });

export type CommandOption = z.infer<typeof CommandOption>;
export type GameCommand = z.infer<typeof GameCommand>;
export type GameCommandsPage = z.infer<typeof GameCommandsPage>;

export const commandsSchemas = {
  'commands.game-inbox.v1': GameCommandsPage,
} satisfies Record<string, z.ZodType>;
