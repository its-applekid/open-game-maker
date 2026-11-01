import { createGameFrame, type GameFrame } from '@gm/host';
import type { GameManifest } from '@ogm/contracts/game';

interface BrowserHost {
  frame: GameFrame;
  ready: GameManifest[];
  relays: unknown[];
  errors: unknown[];
  forge(): void;
}

declare global {
  interface Window {
    __host: BrowserHost;
  }
}

const ready: GameManifest[] = [];
const relays: unknown[] = [];
const errors: unknown[] = [];
const frame = createGameFrame({
  container: document.querySelector<HTMLElement>('#game')!,
  gamesOrigin: 'http://127.0.0.1:4174',
  gameId: 'fixture',
  buildId: 'draft-1',
  build: 'draft',
  mode: 'play',
  playerIndex: 0,
  capabilities: [],
  inputMapping: { touch: 'stick', gamepad: { move: 'leftStick', jump: 'a', use: 'x' } },
  role: () => 'owner',
  onReady: (manifest) => ready.push(manifest),
  onAudioRelay: (payload) => relays.push(payload),
  onError: (failure) => errors.push(failure),
});

window.__host = {
  frame,
  ready,
  relays,
  errors,
  forge: () => {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = 'http://127.0.0.1:4174/forger.html';
    document.body.append(iframe);
  },
};
