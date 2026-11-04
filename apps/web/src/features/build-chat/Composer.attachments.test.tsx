import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ChatAttachment } from '@ogm/contracts';

import { ApiError } from '../../lib/api/client';
import { Composer, type DictationPort } from './Composer';

const dictation: DictationPort = { pressStart: vi.fn(), pressEnd: vi.fn(), on: () => () => undefined };

afterEach(() => cleanup());

type Props = Parameters<typeof Composer>[0];

function setup(overrides: { postText?: Mock<Props['postText']> } = {}) {
  const postText = overrides.postText ?? vi.fn<Props['postText']>().mockResolvedValue({ id: 'm_1' });
  const uploadAttachment = vi.fn(async (_jobId: string, file: File, type: string): Promise<ChatAttachment> => ({
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
  const paste = (text: string) =>
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { files: [], types: ['text/plain'], getData: () => text },
    });
  return { postText, uploadAttachment, input, pick, paste };
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

  it.each([
    ['1,500 characters', 'a'.repeat(1_500)],
    ['20 lines', Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n')],
  ])('keeps a paste of %s inline', (_label, text) => {
    const { paste } = setup();

    expect(paste(text)).toBe(true);
    expect(screen.queryByText('Pasted text')).not.toBeInTheDocument();
  });

  it.each([
    ['1,501 characters', 'a'.repeat(1_501)],
    ['21 lines', Array.from({ length: 21 }, (_, index) => `line ${index + 1}`).join('\n')],
  ])('turns a paste of %s into a readable text attachment', async (_label, text) => {
    const { paste, postText, uploadAttachment } = setup();

    expect(paste(text)).toBe(false);
    const chip = screen.getByRole('listitem');
    expect(within(chip).getByText('Pasted text')).toBeVisible();
    expect(within(chip).getByText(/^\d+(?:\.\d)? (?:B|KB)$/)).toBeVisible();
    const preview = chip.querySelector('details')!;
    expect(preview).not.toHaveAttribute('open');

    fireEvent.click(within(chip).getByText('Pasted text'));
    expect(preview).toHaveAttribute('open');
    expect(preview.querySelector('pre')?.textContent).toBe(text);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledWith('j_1', '', ['a_pasted-text.txt']));
    const file = uploadAttachment.mock.calls[0]?.[1] as File;
    expect(file.name).toBe('pasted-text.txt');
    expect(await readFile(file)).toBe(text);
  });

  it('keeps the files after a failed post and reuses their uploads on retry', async () => {
    const postText = vi
      .fn<Props['postText']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ id: 'm_1' });
    const { uploadAttachment, pick } = setup({ postText });
    pick(markdown());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Message not sent. Try again.'));
    expect(screen.getByText('notes.md')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledTimes(2));
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
  });

  // A post whose reply was lost has already used the ids; the retry must not be stuck on them.
  it('uploads the files again after the server refuses their ids', async () => {
    const postText = vi
      .fn<Props['postText']>()
      .mockRejectedValueOnce(new ApiError(422, { error: 'attachment_not_found' }))
      .mockResolvedValue({ id: 'm_1' });
    const { uploadAttachment, pick } = setup({ postText });
    pick(markdown());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Message not sent. Try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(postText).toHaveBeenCalledTimes(2));
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
  });
});

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
