---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/input-systems/SKILL.md
modified: true
name: input-systems
description: >
  Architect game input — action mapping (abstracting keys into named actions),
  rebinding with conflict detection and persistence, multi-device support
  (keyboard, gamepad, touch), analog deadzones, and feel features like input
  buffering and coyote time, plus accessibility. Engine-neutral. Use when the
  user mentions input mapping, rebind controls, gamepad support, deadzone, input
  buffering, coyote time, or accessible controls.
---

# Input systems

Never wire gameplay to raw keys. Map physical inputs (a key, a button, a touch)
to named **actions** (`jump`, `interact`, `move`), and let gameplay read actions.
That one indirection gives you rebinding, multi-device support, and accessibility
almost for free. This skill is the engine-neutral architecture; bind it to
Phaser's keyboard, gamepad and pointer plugins (`this.input.keyboard`,
`this.input.gamepad`, `this.input`) — see the vendored Phaser `input-keyboard-mouse-touch`.

## When to use

- Use to design an input layer: actions, bindings, multiple devices, and a
  rebinding UI with conflict detection and saved bindings.
- Use to add analog handling (deadzones, sensitivity) and game-feel features
  (input buffering, coyote time).
- Use to make controls accessible (full remapping, hold-vs-toggle, sensitivity,
  no required simultaneous presses).

**When *not* to use:** for the concrete Phaser input API (Key objects, pointer
events, gamepad plugin), use the vendored Phaser `input-keyboard-mouse-touch`. For the
movement/jump *physics* the buffer feeds, see `physics-tuning` and
`phaser-arcade-physics`. Persisting bindings to disk is `save-systems`.

## Core workflow

1. **Define actions, not keys.** Gameplay asks "is `jump` pressed?", never "is
   Space pressed?". Actions are the stable contract; bindings are data.
2. **Bind per device.** Each action holds bindings for keyboard, gamepad, and
   touch. The active device is whichever last sent input; swap UI prompts to match.
3. **Read the right edge.** Use *pressed-this-frame* (edge) for discrete actions
   (jump, interact) and *held* (level) for continuous ones (move, aim). Confusing
   the two causes double-fires or missed presses.
4. **Filter analog input.** Apply a deadzone to sticks/triggers so resting drift
   reads as zero, and scale sensitivity/curve to taste.
5. **Buffer for feel.** Remember a pressed action for a short window so a slightly
   early press still fires (input buffering); allow a jump shortly after leaving a
   ledge (coyote time).
6. **Make rebinding first-class.** A UI that captures the next input, detects
   conflicts, and persists bindings — and a reset-to-default. Save via
   `save-systems`.
7. **Verify on every device** and with rebinds: keyboard, gamepad, touch; rebind
   an action mid-game and confirm gameplay and prompts follow.

## Patterns

### 1. Actions over raw keys; edge vs held

```ts
import Phaser from 'phaser';

// Gameplay reads ACTIONS. The mapping from key/button to action lives in data.
// Keyboard bindings are KeyboardEvent.code values (physical positions), pad bindings are button indices.
export type Action = 'jump' | 'left' | 'right' | 'up' | 'down';
export type Bindings = Record<Action, { keys: string[]; pad: number[] }>;

export class ActionMap {
  private held = new Set<Action>();
  private pressedThisFrame = new Set<Action>();

  constructor(
    scene: Phaser.Scene,
    public bindings: Bindings,
  ) {
    scene.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e.code, true, e.repeat));
    scene.input.keyboard!.on('keyup', (e: KeyboardEvent) => this.onKey(e.code, false, false));
    scene.events.on('postupdate', () => this.pressedThisFrame.clear());
  }

  private onKey(code: string, down: boolean, repeat: boolean): void {
    for (const action of Object.keys(this.bindings) as Action[]) {
      if (!this.bindings[action].keys.includes(code)) continue;
      if (down && !repeat && !this.held.has(action)) this.pressedThisFrame.add(action);
      if (down) this.held.add(action);
      else this.held.delete(action);
    }
  }

  justPressed(action: Action): boolean {
    return this.pressedThisFrame.has(action); // discrete (edge): fires once on the press frame
  }

  isHeld(action: Action): boolean {
    return this.held.has(action); // continuous (held): read every frame
  }

  axis(neg: Action, pos: Action): number {
    return (this.isHeld(pos) ? 1 : 0) - (this.isHeld(neg) ? 1 : 0); // -1..1, one axis
  }
}
// RIGHT: name actions ("jump"); rebinding/devices just change the binding data.
// WRONG: `if (spaceKey.isDown) jump()` — unrebindable, keyboard-only,
// and `isDown` is a held check that would re-fire jump every frame.
```

Phaser equivalents: `Phaser.Input.Keyboard.JustDown(key)` / `key.isDown` for a single
Key object, `this.input.gamepad.pad1` with `pad.leftStick` and `pad.isButtonDown(i)` for pads,
and pointer events (`this.input.on('pointerdown', …)`) for touch. Wrap all of them behind the
action map so gameplay never touches them directly.

### 2. Analog deadzone and sensitivity

```ts
import Phaser from 'phaser';

// Raw sticks never rest at exactly zero. Apply a RADIAL deadzone (on the vector
// length), not per-axis, so diagonals aren't clipped into the axes.
export function applyDeadzone(stick: Phaser.Math.Vector2, dead = 0.2, curve = 1.0): Phaser.Math.Vector2 {
  const mag = stick.length();
  if (mag < dead) return new Phaser.Math.Vector2(0, 0); // inside deadzone -> no movement
  // Rescale so motion ramps from 0 at the edge of the deadzone, not from `dead`.
  const scaled = Math.min((mag - dead) / (1 - dead), 1); // some pads report > 1 on diagonals
  return stick.clone().scale(scaled ** curve / mag); // curve > 1 = finer aim near center
}
// Usage: const move = applyDeadzone(this.input.gamepad!.pad1!.leftStick);
// WRONG: clamping each axis separately — it carves a square hole and snaps to axes.
```

Keep the response curve (exponent) separate from sensitivity (a plain gain on
the result, usually a camera turn rate) and expose both. Phaser's
`pad.setAxisThreshold(value)` is a per-axis threshold; turn it off (0) and use the
radial deadzone above for sticks.

### 3. Input buffering + coyote time (forgiving, responsive feel)

```ts
import Phaser from 'phaser';

// Buffer: a jump pressed slightly BEFORE landing still triggers on touchdown.
// Coyote: a jump pressed slightly AFTER walking off a ledge still works.
const BUFFER = 0.12; // seconds an early press stays "remembered"
const COYOTE = 0.1; // seconds after leaving ground you can still jump
const JUMP_VELOCITY = -420;

export class JumpFeel {
  private bufferTimer = 0;
  private coyoteTimer = 0;

  step(body: Phaser.Physics.Arcade.Body, jumpPressed: boolean, dt: number): void {
    this.bufferTimer -= dt;
    this.coyoteTimer = body.onFloor() ? COYOTE : this.coyoteTimer - dt;
    if (jumpPressed) this.bufferTimer = BUFFER; // remember the press
    if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      body.setVelocityY(JUMP_VELOCITY);
      this.bufferTimer = 0; // consume both so it fires once
      this.coyoteTimer = 0;
    }
  }
}
```

### 4. Rebinding with conflict detection

```ts
import Phaser from 'phaser';

type Action = string;
type Bindings = Record<Action, { keys: string[]; pad: number[] }>;
const RESERVED = ['menu']; // actions the player must always be able to reach

// Capture the next physical input, reject conflicts, then persist.
export class Rebinder {
  private waitingFor: Action | null = null; // set by the "press a key for Jump" button

  constructor(
    private scene: Phaser.Scene,
    private bindings: Bindings,
    private defaults: Bindings,
    private onConflict: (action: Action, other: Action) => void,
  ) {
    scene.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (this.waitingFor && !e.repeat) this.finish({ kind: 'key', code: e.code }); // ignore key repeat
    });
    scene.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (this.waitingFor) this.finish({ kind: 'pad', index: button.index });
    });
  }

  listen(action: Action): void {
    this.waitingFor = action;
  }

  private finish(input: { kind: 'key'; code: string } | { kind: 'pad'; index: number }): void {
    const action = this.waitingFor!;
    this.waitingFor = null;
    for (const [other, b] of Object.entries(this.bindings)) {
      const used = input.kind === 'key' ? b.keys.includes(input.code) : b.pad.includes(input.index);
      if (other !== action && used) return this.onConflict(action, other); // offer swap or cancel
    }
    // Replace only this device kind's binding.
    if (input.kind === 'key') this.bindings[action].keys = [input.code];
    else this.bindings[action].pad = [input.index];
    localStorage.setItem('bindings', JSON.stringify(this.bindings)); // persist (see save-systems)
  }

  resetToDefaults(): void {
    this.bindings = structuredClone(this.defaults);
    localStorage.removeItem('bindings');
  }

  canUnbind(action: Action): boolean {
    return !RESERVED.includes(action); // never strand the player without a way to the menu
  }
}
// Compare bindings by value (KeyboardEvent.code strings, button indices), never by object identity.
// Pad bindings are button indices, not a pad id, so a rebound button works for every pad.
```

Keyboard bindings use the **physical** key (`KeyboardEvent.code`, e.g. `KeyW`), so WASD
stays in the same place on AZERTY or Dvorak; show the label for the player's layout with
`navigator.keyboard.getLayoutMap()` where the browser supports it (fall back to the code).

## Pitfalls

- **Hardcoding keys** in gameplay blocks rebinding, locks out gamepad/touch, and
  scatters input logic. Read named actions only.
- **Edge vs held confusion**: using a held check for jump re-fires every frame;
  using an edge check for movement drops held input. Match the check to the action.
- **Per-axis deadzones** clip diagonal stick input and snap movement to the axes.
  Use a radial deadzone on the vector magnitude.
- **No buffering/coyote time** makes tight platformers feel unfair even when the
  physics are correct — players "clearly pressed jump". Add small windows.
- **Rebinding without conflict handling** lets two actions share a key, or strands
  the player by unbinding menu access. Detect conflicts; guarantee a way back.
- **WASD lands in the wrong place on AZERTY/QWERTZ**: bindings stored by key
  *letter* (`KeyboardEvent.key`) follow the layout. Store physical key positions
  (`KeyboardEvent.code`) and display the layout's label.
- **A rebound gamepad button works only for player 1**: the binding was stored
  against `pad1`. Store button indices for all pads unless the game assigns pads
  to players on purpose.
- **Not swapping prompts on device change** shows "Press Space" to a gamepad
  player. Track the last-used device and switch glyphs.
- **Ignoring accessibility**: required simultaneous presses, no remap, fixed
  sensitivity, hold-only actions. Offer remap, toggle-vs-hold, and sensitivity.
- **Reading input in the wrong loop**: poll held state in the scene's `update` for
  consistent movement; capture discrete presses from events so none are missed between frames.

## References

- `references/buffering-and-accessibility.md` — buffering/coyote tuning, jump feel
  (variable height, apex), device detection and prompt swapping, touch controls,
  and an accessibility checklist (remap, toggle/hold, sensitivity, latency).

## Related skills

- Vendored Phaser `input-keyboard-mouse-touch` — the concrete Phaser input API.
- `save-systems` — persist custom key bindings and input settings.
- `physics-tuning` — the movement the buffer/coyote windows feed into.
- `platformer` — a genre whose feel depends on input handling.
