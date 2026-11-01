import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VoiceClient } from '@ogm/voice-client';

import { Composer, type DictationPort } from './Composer';

class FakeDictation implements DictationPort {
  listeners: Array<(value: { kind: 'partial' | 'final'; text: string }) => void> = [];
  pressStart = vi.fn();
  pressEnd = vi.fn();
  on(_event: 'transcript', listener: (value: { kind: 'partial' | 'final'; text: string }) => void) {
    this.listeners.push(listener);
    return () => undefined;
  }
  finish(text: string) {
    for (const listener of this.listeners) listener({ kind: 'final', text });
  }
}

afterEach(() => cleanup());

describe('Composer', () => {
  it('keeps a dictated final transcript for review until Send', async () => {
    const dictation = new FakeDictation();
    const postText = vi.fn().mockResolvedValue({ id: 'm_1' });
    render(
      <Composer
        jobId="j_1"
        dictation={dictation}
        postText={postText}
        probeVoice={vi.fn().mockResolvedValue({ available: false })}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hold to talk' }));
    dictation.finish('make the door red');

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('make the door red'));
    expect(postText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_1', 'make the door red'));
  });

  it('hides two-way voice when probing reports unavailable', async () => {
    render(
      <Composer
        jobId="j_1"
        dictation={new FakeDictation()}
        postText={vi.fn()}
        probeVoice={vi.fn().mockResolvedValue({ available: false })}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start voice chat' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  });

  it('rolls back an optimistic row and restores text when posting fails', async () => {
    const onOptimistic = vi.fn();
    const onFailed = vi.fn();
    render(
      <Composer
        jobId="j_1"
        dictation={new FakeDictation()}
        postText={vi.fn().mockRejectedValue(new Error('offline'))}
        probeVoice={vi.fn().mockResolvedValue({ available: false })}
        onOptimistic={onOptimistic}
        onFailed={onFailed}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep the bridge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onFailed).toHaveBeenCalledWith(onOptimistic.mock.calls[0][0].id));
    expect(screen.getByRole('textbox')).toHaveValue('keep the bridge');
    expect(screen.getByRole('status')).toHaveTextContent('Message not sent');
  });

  it('allows only one pending post', async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    const postText = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );
    render(
      <Composer
        jobId="j_1"
        dictation={new FakeDictation()}
        postText={postText}
        probeVoice={vi.fn().mockResolvedValue({ available: false })}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'one message' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(postText).toHaveBeenCalledOnce();
    expect(send).toBeDisabled();
    await act(async () => {
      resolvePost({ id: 'm_1' });
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'next message' } });
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);
    expect(postText).toHaveBeenCalledTimes(2);
  });

  it('allows only one pending voice start', async () => {
    let resolveStart: () => void = () => undefined;
    const startFromGesture = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const createVoiceClient = vi.fn(
      () =>
        ({
          on: vi.fn(() => () => undefined),
          startFromGesture,
          end: vi.fn(),
        }) as unknown as VoiceClient,
    );
    render(
      <Composer
        jobId="j_1"
        voiceTarget={{ kind: 'build', game_id: 'g_1', job_id: 'j_1', ticket: '57', creator_id: 'u_1' }}
        dictation={new FakeDictation()}
        postText={vi.fn()}
        probeVoice={vi.fn().mockResolvedValue({
          available: true,
          token: 'token',
          url: 'wss://voice.example.test',
          expiresAt: '2026-11-01T10:00:00Z',
        })}
        createVoiceClient={createVoiceClient}
      />,
    );

    const start = await screen.findByRole('button', { name: 'Start voice chat' });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(createVoiceClient).toHaveBeenCalledOnce();
    expect(startFromGesture).toHaveBeenCalledOnce();
    expect(start).toBeDisabled();
    await act(async () => resolveStart());
  });
});
