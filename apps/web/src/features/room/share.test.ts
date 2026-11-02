import { describe, expect, it, vi } from 'vitest';

import { shareInvite } from './share';

describe('shareInvite', () => {
  it('uses the device share sheet when it is available', async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);

    await expect(
      shareInvite('https://maker.test/join/invite-1', { share, clipboard: { writeText } }),
    ).resolves.toEqual({ method: 'share' });

    expect(share).toHaveBeenCalledWith({ url: 'https://maker.test/join/invite-1' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the same URL when the share sheet is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(
      shareInvite('https://maker.test/join/invite-2', { clipboard: { writeText } }),
    ).resolves.toEqual({ method: 'copy' });

    expect(writeText).toHaveBeenCalledWith('https://maker.test/join/invite-2');
  });

  it('copies when the device share sheet rejects URL shares', async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);

    await expect(
      shareInvite('https://maker.test/join/invite-3', {
        canShare: () => false,
        share,
        clipboard: { writeText },
      }),
    ).resolves.toEqual({ method: 'copy' });

    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('https://maker.test/join/invite-3');
  });
});
