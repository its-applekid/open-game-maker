import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostBridge } from './bridge.js';
import { createGameFrame, HostError } from './frame.js';

afterEach(() => document.body.replaceChildren());

describe('createGameFrame', () => {
  it('sets the exact iframe attributes and games-origin URL', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const frame = createGameFrame({
      container,
      gamesOrigin: 'https://games.test',
      appOrigin: 'https://app.test',
      gameId: 'game one',
      buildId: 'build/one',
      build: 'draft',
      mode: 'play',
      playerIndex: 0,
      capabilities: [],
      role: () => 'owner',
    });

    expect(frame.iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-pointer-lock');
    expect(frame.iframe.getAttribute('allow')).toBe('autoplay; fullscreen; gamepad');
    expect(frame.iframe.src).toBe('https://games.test/g/game%20one/build%2Fone/index.html?build=draft&protocol=1');
    frame.dispose();
  });

  it('refuses an app-origin games URL without appending an iframe', () => {
    const container = document.createElement('div');
    expect(() =>
      createGameFrame({
        container,
        gamesOrigin: 'https://app.test/games',
        appOrigin: 'https://app.test',
        gameId: 'g',
        buildId: 'b',
        build: 'draft',
        mode: 'play',
        playerIndex: 0,
        capabilities: [],
        role: () => 'owner',
      }),
    ).toThrow(new HostError('same-origin'));
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('refuses a non-web games URL', () => {
    const container = document.createElement('div');
    expect(() =>
      createGameFrame({
        container,
        gamesOrigin: 'data:text/html,game',
        appOrigin: 'https://app.test',
        gameId: 'g',
        buildId: 'b',
        build: 'draft',
        mode: 'play',
        playerIndex: 0,
        capabilities: [],
        role: () => 'owner',
      }),
    ).toThrow(new HostError('invalid-origin'));
    expect(container.childElementCount).toBe(0);
  });

  it('removes the frame on dispose', () => {
    const close = vi.spyOn(HostBridge.prototype, 'close');
    const container = document.createElement('div');
    const frame = createGameFrame({
      container,
      gamesOrigin: 'https://games.test',
      appOrigin: 'https://app.test',
      gameId: 'g',
      buildId: 'b',
      build: 'draft',
      mode: 'play',
      playerIndex: 0,
      capabilities: [],
      role: () => 'owner',
    });
    frame.dispose();
    expect(container.childElementCount).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not change local input mode when the role gate rejects mode.set', () => {
    const container = document.createElement('div');
    const frame = createGameFrame({
      container,
      gamesOrigin: 'https://games.test',
      appOrigin: 'https://app.test',
      gameId: 'g',
      buildId: 'b',
      build: 'draft',
      mode: 'play',
      playerIndex: 0,
      capabilities: [],
      role: () => 'watcher',
    });
    const setPadMode = vi.spyOn(frame.gamepads, 'setMode');
    const setOverlayEnabled = vi.spyOn(frame.overlay, 'setEnabled');

    frame.setMode('edit');

    expect(setPadMode).not.toHaveBeenCalled();
    expect(setOverlayEnabled).not.toHaveBeenCalled();
    frame.dispose();
  });
});
