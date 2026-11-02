import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SaveSlot } from '@ogm/contracts/browser';

import type { GameFrameController } from '../../features/editor/frame';
import { PlatformHud } from './PlatformHud';

function frameHarness() {
  let saveWrite: ((payload: { saveSchemaVersion: number; data: unknown }) => void) | undefined;
  let event: ((kind: 'achievement' | 'analytics' | 'checkpoint', payload: unknown) => void) | undefined;
  const frame = {
    onEvent: vi.fn((callback) => {
      event = callback;
      return vi.fn();
    }),
    onSaveWrite: vi.fn((callback) => {
      saveWrite = callback;
      return vi.fn();
    }),
    pause: vi.fn(),
    restoreSave: vi.fn(),
    resume: vi.fn(),
    setSettings: vi.fn(),
  } as unknown as GameFrameController;
  return {
    event: (kind: 'achievement' | 'analytics' | 'checkpoint', payload: unknown) => event?.(kind, payload),
    frame,
    saveWrite: (payload: { saveSchemaVersion: number; data: unknown }) => saveWrite?.(payload),
  };
}

afterEach(cleanup);

describe('PlatformHud', () => {
  it('pauses and resumes with one lifecycle message per action and restores focus', async () => {
    const test = frameHarness();
    render(<PlatformHud build="draft" frame={test.frame} gameId="game" saves={false} />);

    const pause = screen.getByRole('button', { name: 'Pause' });
    fireEvent.click(pause);
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    expect(test.frame.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    expect(test.frame.resume).toHaveBeenCalledOnce();
    await waitFor(() => expect(pause).toHaveFocus());
  });

  it('leaves through the screen-owned navigation action', () => {
    const test = frameHarness();
    const onLeave = vi.fn();
    render(<PlatformHud build="draft" frame={test.frame} gameId="game" saves={false} onLeave={onLeave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('hides save controls when the later-owned route is unavailable', async () => {
    const test = frameHarness();
    render(
      <PlatformHud
        build="draft"
        frame={test.frame}
        gameId="game"
        saves
        saveApi={{ list: vi.fn().mockResolvedValue({ available: false }), read: vi.fn(), write: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Save slots' })).not.toBeInTheDocument());
  });

  it('renders all contract slots and writes game saves into the selected host slot', async () => {
    const test = frameHarness();
    const slots = [{ slotId: 'auto', headRevision: 4 }] as SaveSlot[];
    const write = vi.fn().mockResolvedValue(undefined);
    render(
      <PlatformHud
        build="draft"
        frame={test.frame}
        gameId="game"
        saves
        saveApi={{ list: vi.fn().mockResolvedValue({ available: true, value: { slots } }), read: vi.fn(), write }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('button', { name: 'Auto save' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save slot 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save slot 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save slot 3' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save slot 3' }));
    test.saveWrite({ saveSchemaVersion: 1, data: { checkpoint: 2 } });

    await waitFor(() =>
      expect(write).toHaveBeenCalledWith('game', '3', { saveSchemaVersion: 1, data: { checkpoint: 2 } }, undefined),
    );
  });

  it('refreshes the slot revision before a second save write', async () => {
    const test = frameHarness();
    const write = vi.fn().mockResolvedValue(undefined);
    const list = vi
      .fn()
      .mockResolvedValueOnce({ available: true, value: { slots: [{ slotId: 'auto', headRevision: 4 }] } })
      .mockResolvedValueOnce({ available: true, value: { slots: [{ slotId: 'auto', headRevision: 5 }] } })
      .mockResolvedValueOnce({ available: true, value: { slots: [{ slotId: 'auto', headRevision: 6 }] } });
    render(
      <PlatformHud build="draft" frame={test.frame} gameId="game" saves saveApi={{ list, read: vi.fn(), write }} />,
    );
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    await waitFor(() => expect(test.frame.onSaveWrite).toHaveBeenCalledTimes(2));

    test.saveWrite({ saveSchemaVersion: 1, data: { checkpoint: 1 } });
    await waitFor(() => expect(write).toHaveBeenNthCalledWith(1, 'game', 'auto', expect.anything(), 4));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    test.saveWrite({ saveSchemaVersion: 1, data: { checkpoint: 2 } });

    await waitFor(() => expect(write).toHaveBeenNthCalledWith(2, 'game', 'auto', expect.anything(), 5));
  });

  it('forwards safe settings and emits draft-only achievement copy', () => {
    const test = frameHarness();
    const toast = vi.fn();
    render(<PlatformHud build="draft" frame={test.frame} gameId="game" saves={false} toast={toast} />);

    expect(test.frame.setSettings).toHaveBeenCalledWith({
      mute: false,
      volume: 1,
      textScale: 1,
      reduceMotion: expect.any(Boolean),
    });
    test.event('achievement', { title: 'Opened the crypt' });
    expect(toast).toHaveBeenCalledWith('Opened the crypt (test)');
  });
});
