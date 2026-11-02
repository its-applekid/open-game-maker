import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DictationError, DictationTranscript } from '@ogm/voice-client';

import { Composer, type DictationPort } from './Composer';

class FakeDictation implements DictationPort {
  private transcripts: Array<(value: DictationTranscript) => void> = [];
  pressStart = vi.fn();
  pressEnd = vi.fn();
  on(event: 'transcript', listener: (value: DictationTranscript) => void): () => void;
  on(event: 'error', listener: (value: DictationError) => void): () => void;
  on(
    event: 'transcript' | 'error',
    listener: ((value: DictationTranscript) => void) | ((value: DictationError) => void),
  ) {
    if (event === 'transcript') this.transcripts.push(listener as (value: DictationTranscript) => void);
    return () => undefined;
  }
  finish(text: string) {
    this.transcripts.forEach((listener) => listener({ kind: 'final', text }));
  }
}

afterEach(() => cleanup());

describe('scope Composer', () => {
  it('keeps dictated scope text editable until the creator sends it', async () => {
    const dictation = new FakeDictation();
    const postText = vi.fn().mockResolvedValue({ id: 'm_1' });
    render(
      <Composer
        jobId="j_scope"
        voiceTarget={{ kind: 'scope', game_id: 'g_1', session_id: 's_1', creator_id: 'u_1' }}
        dictation={dictation}
        postText={postText}
        probeVoice={vi.fn().mockResolvedValue({ available: false })}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hold to talk' }));
    act(() => dictation.finish('three small islands'));

    expect(screen.getByRole('textbox')).toHaveValue('three small islands');
    expect(postText).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'three tiny islands' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_scope', 'three tiny islands'));
  });
});
