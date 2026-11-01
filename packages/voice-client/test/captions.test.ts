import { describe, expect, it } from 'vitest';

import { captionsReducer, type Captions } from '../src/captions.js';

const empty = (): Captions => ({ you: [], builder: [] });

describe('captionsReducer', () => {
  it('replaces partial user text and closes it on the final transcript', () => {
    let state = empty();
    state = captionsReducer(state, { v: 1, type: 'transcript', kind: 'partial', text: 'make' });
    state = captionsReducer(state, {
      v: 1,
      type: 'transcript',
      kind: 'partial',
      text: 'make the',
    });
    state = captionsReducer(state, {
      v: 1,
      type: 'transcript',
      kind: 'final',
      text: 'make the door',
    });

    expect(state.you).toEqual([{ id: 'you-0', text: 'make the door', final: true }]);
  });

  it('turns agent chunks into sentence-level builder lines', () => {
    let state = empty();
    state = captionsReducer(state, {
      v: 1,
      type: 'agent_text',
      turn_id: 'turn-1',
      text: 'Sure. I’ll',
      final: false,
    });
    state = captionsReducer(state, {
      v: 1,
      type: 'agent_text',
      turn_id: 'turn-1',
      text: ' start now',
      final: true,
    });

    expect(state.builder.map(({ text, final }) => ({ text, final }))).toEqual([
      { text: 'Sure.', final: true },
      { text: 'I’ll start now', final: true },
    ]);
  });

  it('marks the trailing builder sentence cut when interrupted', () => {
    let state = captionsReducer(empty(), {
      v: 1,
      type: 'agent_text',
      turn_id: 'turn-1',
      text: 'Building the room',
      final: false,
    });
    state = captionsReducer(state, { v: 1, type: 'interrupted', turn_id: 'turn-1' });

    expect(state.builder.at(-1)).toMatchObject({ text: 'Building the room', cut: true });
  });
});
