import { splitSentences } from './sentences.js';
import type { ServerFrame } from './wire.js';

export interface CaptionLine {
  id: string;
  text: string;
  final: boolean;
  turn_id?: string;
  cut?: boolean;
}

export interface Captions {
  you: CaptionLine[];
  builder: CaptionLine[];
}

function joinChunks(left: string, right: string): string {
  if (!left || !right) return left + right;
  const needsSpace = /[\p{L}\p{N}]$/u.test(left) && /^[\p{L}\p{N}]/u.test(right);
  return `${left}${needsSpace ? ' ' : ''}${right}`;
}

function lastIndexMatching(lines: CaptionLine[], predicate: (line: CaptionLine) => boolean): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index]!)) return index;
  }
  return -1;
}

export function captionsReducer(state: Captions, frame: ServerFrame): Captions {
  if (frame.type === 'transcript') {
    const you = [...state.you];
    const openIndex = lastIndexMatching(you, (line) => !line.final);
    const line: CaptionLine = {
      id: openIndex >= 0 ? you[openIndex]!.id : `you-${you.length}`,
      text: frame.text,
      final: frame.kind === 'final',
    };

    if (openIndex >= 0) you[openIndex] = line;
    else you.push(line);
    return { ...state, you };
  }

  if (frame.type === 'agent_text') {
    const builder = [...state.builder];
    const openIndex = lastIndexMatching(builder, (line) => line.turn_id === frame.turn_id && !line.final);
    const carry = openIndex >= 0 ? builder[openIndex]!.text : '';
    if (openIndex >= 0) builder.splice(openIndex, 1);

    const existingCount = builder.filter((line) => line.turn_id === frame.turn_id).length;
    const sentences = splitSentences(joinChunks(carry, frame.text));
    for (const [index, text] of sentences.entries()) {
      const complete = /[.!?]$/.test(text) || index < sentences.length - 1 || frame.final;
      builder.push({
        id: `builder-${frame.turn_id}-${existingCount + index}`,
        text,
        final: complete,
        turn_id: frame.turn_id,
      });
    }
    return { ...state, builder };
  }

  if (frame.type === 'interrupted') {
    const builder = [...state.builder];
    const lineIndex = lastIndexMatching(builder, (line) => line.turn_id === frame.turn_id);
    if (lineIndex >= 0) {
      builder[lineIndex] = { ...builder[lineIndex]!, cut: true, final: true };
    }
    return { ...state, builder };
  }

  return state;
}
