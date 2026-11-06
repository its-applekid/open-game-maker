import { ChatCheckpoint, type ChatCheckpoint as ChatCheckpointValue } from '@ogm/contracts';

export type CommandOption = ChatCheckpointValue['options'][number];

export function parseCommandOptions(raw: string): CommandOption[] | null {
  try {
    const parsed = ChatCheckpoint.shape.options.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
