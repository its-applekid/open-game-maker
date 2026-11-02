import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachment } from '@ogm/contracts';

import { Composer, type DictationPort } from './Composer';

const dictation: DictationPort = { pressStart: vi.fn(), pressEnd: vi.fn(), on: () => () => undefined };

afterEach(() => cleanup());

type Props = Parameters<typeof Composer>[0];

// A draft chat has no job yet: attachments are stored per job, so they must go to the job the text starts.
function setup(startJob: Props['startJob']) {
  const postText = vi.fn<Props['postText']>().mockResolvedValue({ id: 'm_1' });
  const uploadAttachment = vi.fn(async (_jobId: string, file: File): Promise<ChatAttachment> => ({
    id: `a_${file.name}`,
    kind: 'text',
    name: file.name,
    mime: 'text/markdown',
    bytes: file.size,
  }));
  const view = render(
    <Composer
      jobId="edit-g_1-main"
      dictation={dictation}
      postText={postText}
      startJob={startJob}
      uploadAttachment={uploadAttachment}
      probeVoice={vi.fn().mockResolvedValue({ available: false })}
    />,
  );
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const pick = (...files: File[]) => fireEvent.change(input, { target: { files } });
  const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  return { postText, uploadAttachment, pick, type };
}

const markdown = () => new File(['# Door\n'], 'door.md', { type: 'text/markdown' });

describe('Composer starting a job', () => {
  it('starts the job with the text, then uploads the files to that job', async () => {
    const startJob = vi.fn<NonNullable<Props['startJob']>>().mockResolvedValue('j_new');
    const { postText, uploadAttachment, pick, type } = setup(startJob);
    pick(markdown());
    type('Make the door glow');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_new', '', ['a_door.md']));
    expect(startJob).toHaveBeenCalledWith('Make the door glow');
    expect(uploadAttachment.mock.calls.map(([jobId]) => jobId)).toEqual(['j_new']);
  });

  it('only starts the job when there are no files', async () => {
    const startJob = vi.fn<NonNullable<Props['startJob']>>().mockResolvedValue('j_new');
    const { postText, type } = setup(startJob);
    type('Make the door glow');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(startJob).toHaveBeenCalledTimes(1));
    expect(postText).not.toHaveBeenCalled();
  });

  it('needs text to start a job', () => {
    const { pick } = setup(vi.fn());
    pick(markdown());
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the files when admission is refused', async () => {
    const startJob = vi.fn<NonNullable<Props['startJob']>>().mockResolvedValue(undefined);
    const { uploadAttachment, pick, type } = setup(startJob);
    pick(markdown());
    type('Make the door glow');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(startJob).toHaveBeenCalledTimes(1));
    expect(screen.getByText('door.md')).toBeVisible();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('restores the text and files when the job cannot be started', async () => {
    const startJob = vi.fn<NonNullable<Props['startJob']>>().mockRejectedValue(new Error('409'));
    const { uploadAttachment, pick, type } = setup(startJob);
    pick(markdown());
    type('Make the door glow');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Message not sent. Try again.'));
    expect(screen.getByRole('textbox')).toHaveValue('Make the door glow');
    expect(screen.getByText('door.md')).toBeVisible();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });
});
