// The app's only gamepad reader. Every animation frame it hands a snapshot of each pad to onFrame subscribers (OGM-075
// forwards them into a game) and, while no game is in play mode, turns presses into the key presses the menus already
// understand: d-pad or left stick to arrows, A to Enter, B to Escape, LB/RB to the previous/next focus zone.
export type GamepadSnapshot = {
  index: number;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
  t: number;
};

type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type PadState = { buttons: boolean[]; held: Partial<Record<Dir, { since: number; last: number }>> };

const DEAD_ZONE = 0.5;
const REPEAT_AFTER = 400;
const REPEAT_EVERY = 120;
const BUTTON_KEYS: Record<number, string> = { 0: 'Enter', 1: 'Escape' };
const ZONE_BUTTONS: Record<number, 'prev' | 'next'> = { 4: 'prev', 5: 'next' };
export const ZONE_EVENT = 'ogm:zone';

const subscribers = new Set<(f: GamepadSnapshot) => void>();
const pads = new Map<number, PadState>();
let playMode = false;

export function onFrame(cb: (f: GamepadSnapshot) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function setPlayMode(on: boolean): void {
  playMode = on;
}

export function startGamepadPoller(): () => void {
  let raf = 0;
  let stopped = false;
  const tick = (t: number) => {
    if (stopped) return;
    poll(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    pads.clear();
  };
}

function poll(t: number): void {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    const snapshot: GamepadSnapshot = {
      index: pad.index,
      axes: [...pad.axes],
      buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
      t,
    };
    subscribers.forEach((cb) => cb(snapshot));

    const state = pads.get(pad.index) ?? { buttons: [], held: {} };
    pads.set(pad.index, state);
    const pressed = snapshot.buttons.map((b) => b.pressed);
    if (!playMode) {
      pressed.forEach((down, i) => {
        if (!down || state.buttons[i]) return;
        if (BUTTON_KEYS[i]) press(BUTTON_KEYS[i]);
        else if (ZONE_BUTTONS[i]) window.dispatchEvent(new CustomEvent(ZONE_EVENT, { detail: ZONE_BUTTONS[i] }));
      });
      directions(snapshot, pressed, state, t);
    } else {
      state.held = {};
    }
    state.buttons = pressed;
  }
}

function directions(snapshot: GamepadSnapshot, pressed: boolean[], state: PadState, t: number): void {
  const [x = 0, y = 0] = snapshot.axes;
  const active: Record<Dir, boolean> = {
    ArrowUp: !!pressed[12] || y < -DEAD_ZONE,
    ArrowDown: !!pressed[13] || y > DEAD_ZONE,
    ArrowLeft: !!pressed[14] || x < -DEAD_ZONE,
    ArrowRight: !!pressed[15] || x > DEAD_ZONE,
  };
  for (const dir of Object.keys(active) as Dir[]) {
    const held = state.held[dir];
    if (!active[dir]) {
      delete state.held[dir];
    } else if (!held) {
      state.held[dir] = { since: t, last: t };
      press(dir);
    } else if (
      t - held.since >= REPEAT_AFTER &&
      t - held.last >= (held.last === held.since ? REPEAT_AFTER : REPEAT_EVERY)
    ) {
      held.last = t;
      press(dir);
    }
  }
}

function press(key: string): void {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  // a synthetic Enter has no default action: activate the focused control the way a real one would
  if (
    key === 'Enter' &&
    !event.defaultPrevented &&
    target instanceof HTMLElement &&
    target.matches('button, a[href], [role="button"]')
  ) {
    target.click();
  }
}
