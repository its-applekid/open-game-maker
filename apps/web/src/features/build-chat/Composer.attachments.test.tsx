import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachment } from '@ogm/contracts';

import { Composer, type DictationPort } from './Composer';

const dictation: DictationPort = { pressStart: vi.fn(), pressEnd: vi.fn(), on: () => () => undefined };

afterEach(() => cleanup());

function setup(overrides: { postText?: ReturnType<typeof vi.fn>; upload?: ReturnType<typeof vi.fn> } = {}) {
  const postText = overrides.postText ?? vi.fn().mockResolvedValue({ id: 'm_1' });
  const uploadAttachment =
    overrides.upload ??
    vi.fn(async (_jobId: string, file: File, type: string): Promise<ChatAttachment> => ({
      id: `a_${file.name}`,
      kind: type.startsWith('image/') ? 'image' : 'text',
      name: file.name,
      mime: type.startsWith('image/') ? 'image/webp' : 'text/markdown',
      bytes: file.size,
    }));
  const view = render(
    <Composer
      jobId="j_1"
      dictation={dictation}
      postText={postText}
      uploadAttachment={uploadAttachment}
      probeVoice={vi.fn().mockResolvedValue({ available: false })}
    />,
  );
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const pick = (...files: File[]) => fireEvent.change(input, { target: { files } });
  return { postText, uploadAttachment, input, pick };
}

const markdown = () => new File(['# Castle\n'], 'notes.md', { type: '' });
const png = (name = 'castle.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

describe('Composer attachments', () => {
  it('attaches through the icon button and sends files with no text', async () => {
    const { postText, uploadAttachment, input, pick } = setup();
    const button = screen.getByRole('button', { name: 'Attach files' });
    expect(button).toHaveTextContent('');
    const opened = vi.spyOn(input, 'click');
    fireEvent.click(button);
    expect(opened).toHaveBeenCalled();

    pick(markdown(), png());
    expect(screen.getByText('notes.md')).toBeVisible();
    expect(screen.getByText('castle.png')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_1', '', ['a_notes.md', 'a_castle.png']));
    expect(uploadAttachment.mock.calls.map(([, file, type]) => [(file as File).name, type])).toEqual([
      ['notes.md', 'text/markdown'],
      ['castle.png', 'image/png'],
    ]);
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument();
  });

  // The composer never sends what the API would refuse.
  it('drops disallowed and oversized files and caps a message at 8', () => {
    const { pick } = setup();
    pick(
      new File(['%PDF'], 'rules.pdf', { type: 'application/pdf' }),
      new File(['echo'], 'run.sh', { type: 'application/x-sh' }),
      new File(['a'.repeat(64 * 1024 + 1)], 'huge.md', { type: 'text/markdown' }),
      new File([], 'empty.txt', { type: 'text/plain' }),
    );
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    pick(...Array.from({ length: 10 }, (_, index) => png(`shot-${index}.png`)));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('removes a chip before sending', async () => {
    const { postText, pick } = setup();
    pick(markdown(), png());
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.md' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'use this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_1', 'use this', ['a_castle.png']));
  });

  it('attaches a pasted image', () => {
    setup();
    const image = png('pasted.png');
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [image], types: ['Files'] } });
    expect(screen.getByText('pasted.png')).toBeVisible();
  });

  it('keeps the files after a failed post and reuses their uploads on retry', async () => {
    const postText = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 'm_1' });
    const { uploadAttachment, pick } = setup({ postText });
    pick(markdown());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Message not sent. Try again.'));
    expect(screen.getByText('notes.md')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledTimes(2));
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
  });
});
