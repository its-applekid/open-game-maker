import type { ComponentType } from 'react';

import type { StreamedChatMessage } from '../stream';
import { CheckpointRow } from './CheckpointRow';
import { MediaRow } from './MediaRow';
import { ProgressRow } from './ProgressRow';
import { TextRow } from './TextRow';

export type RowProps = { message: StreamedChatMessage; messages: StreamedChatMessage[] };

export function rowFor(kind: string): ComponentType<RowProps> {
  switch (kind) {
    case 'image':
    case 'clip':
      return MediaRow;
    case 'progress':
      return ProgressRow;
    case 'checkpoint':
      return CheckpointRow;
    case 'text':
    default:
      return TextRow;
  }
}
