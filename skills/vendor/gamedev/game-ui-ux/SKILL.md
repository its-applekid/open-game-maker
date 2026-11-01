---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/game-ui-ux/SKILL.md
modified: true
name: game-ui-ux
description: >
  Design and build game UI/UX — HUDs, menus, and overlays — that survive every screen: anchor-
  based responsive layout, resolution/aspect scaling and safe areas, keyboard/gamepad focus
  navigation, a screen/menu state stack, and event-driven (not polled) HUD updates. Engine-
  neutral patterns that pair with the detected engine's UI skill. Use when the user mentions
  HUD, health bar, main menu, pause menu, settings screen, UI layout, anchors, UI scaling,
  aspect ratio, safe area, controller/keyboard menu navigation, or wiring UI to game state.
---

# Game UI/UX

Build HUDs and menus that stay correct on a phone, an ultrawide monitor, and a TV across a
gamepad and a mouse. This skill owns the engine-neutral UI architecture — responsive layout,
scaling, focus navigation, screen flow, and how UI talks to game state — and defers the
concrete widget API to the engine UI skill.

## When to use

- Use when building a HUD (health/ammo/score), a menu (main/pause/settings), an inventory or
  shop screen, or any overlay, and you want it to scale and navigate correctly.
- Use to fix UI that breaks at other resolutions/aspect ratios, ignores notches/safe areas,
  can't be used with a controller, or is wired to game state by per-frame polling.
- Use to structure screen flow (title → game → pause → settings) as a stack, not flag soup.

**When *not* to use:** for the engine's concrete UI nodes/components and styling, use
the vendored Phaser `text-and-bitmaptext`, `groups-and-containers` and `scale-and-responsive` skills. For *visual* punch (button pop, damage
numbers, shake) use `game-feel`. For branching conversation UI use `dialogue-systems`. For
translating UI strings, that is localization (see `references/` and `input-systems` for
rebinding screens). For card/board layout specifics, the `card-game` genre composes this skill.

## Core workflow

1. **Pick a layout model: anchors + containers, never absolute pixels.** Anchor elements to
   edges/corners/center and let containers (rows, columns, grids) flow children. Absolute
   `(x, y)` positions break at the first new resolution.
2. **Choose a scaling strategy** for the whole UI: a reference resolution that scales to fit
   (most games), plus a policy for extra width/height on other aspect ratios (letterbox,
   expand, or anchor HUD corners outward).
3. **Respect the safe area.** Inset critical UI from screen edges so notches, rounded corners,
   and TV overscan don't clip it.
4. **Make every screen keyboard/gamepad navigable.** Set an initial focused control per screen,
   define focus order/neighbors, and show a clear focus highlight. Mouse and focus must coexist.
5. **Model screens as a stack.** Push (pause over game), pop (resume), with input + visibility
   handed to the top screen. This makes overlays and "back" trivial.
6. **Drive the HUD from events, not polling.** The HUD subscribes to `health_changed`,
   `score_changed`, etc. and updates only when they fire — it does not read game state every
   frame.
7. **Verify across screens and devices.** Resize the window, switch aspect ratios, unplug the
   mouse and navigate by gamepad only, and confirm focus, scaling, and safe-area insets. Report
   what you actually observed at which resolutions.

## Patterns

### 1. Anchors + containers, not absolute coordinates

```ts
import Phaser from 'phaser';

// A HUD scene that anchors to the TOP-LEFT and lays out a row of hearts from the current size.
export class HudScene extends Phaser.Scene {
  private score!: Phaser.GameObjects.Text;
  private hearts!: Phaser.GameObjects.Container;

  create(data: { lives: number }): void {
    this.score = this.add.text(0, 0, '0').setOrigin(0, 0); // sticks to the corner at any size
    this.hearts = this.add.container(0, 0);
    for (let i = 0; i < data.lives; i++) {
      this.hearts.add(this.add.image(i * 36, 0, 'heart').setOrigin(0, 0)); // a row, spaced by index
    }
    this.layout(this.scale.gameSize);
    this.scale.on('resize', this.layout, this); // re-anchor on every size change
  }

  private layout(size: Phaser.Structs.Size): void {
    const pad = 16;
    this.score.setPosition(pad, pad);
    this.hearts.setPosition(size.width - pad - this.hearts.length * 36, pad); // anchored top-right
  }
}
// RIGHT: positions computed from edges of the current size. WRONG: this.add.text(640, 360, …) (one resolution only).
```

### 2. Scale to a reference resolution (one UI, many screens)

```ts
import Phaser from 'phaser';

// Phaser ScaleManager: design at a reference size, let the canvas scale to the window.
export const config: Phaser.Types.Core.GameConfig = {
  width: 1920,
  height: 1080,
  scale: {
    mode: Phaser.Scale.FIT, // letterbox; Phaser.Scale.EXPAND reveals extra space you anchor HUD corners into
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};
// With EXPAND, listen to this.scale 'resize' (Pattern 1) and anchor the HUD to the new edges.
```

### 3. Safe-area inset for notches / overscan

```ts
// Browsers report the safe area as CSS env() values, only when the page sets
// <meta name="viewport" content="viewport-fit=cover">. On desktop they are 0.
export function readSafeArea(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string): number => parseFloat(v) || 0;
  const inset = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return inset; // CSS pixels; multiply by (game width / canvas display width) to get game units
}
// Re-read on 'resize' and orientation change, then inset the HUD anchors from Pattern 1 by these margins.
```

### 4. Gamepad/keyboard focus (UI is unusable on a controller without it)

```ts
import Phaser from 'phaser';

// Phaser has no focus system for game objects: keep a focus index per menu and move it with actions.
export class MenuScene extends Phaser.Scene {
  private buttons: Phaser.GameObjects.Text[] = [];
  private focus = 0;

  create(): void {
    this.buttons = ['Play', 'Settings', 'Quit'].map((label, i) =>
      this.add.text(100, 100 + i * 60, label).setInteractive({ useHandCursor: true }),
    );
    this.buttons.forEach((b, i) => b.on('pointerover', () => this.setFocus(i))); // mouse and focus coexist
    this.input.keyboard!.on('keydown-DOWN', () => this.setFocus((this.focus + 1) % this.buttons.length));
    this.input.keyboard!.on('keydown-UP', () =>
      this.setFocus((this.focus + this.buttons.length - 1) % this.buttons.length),
    );
    this.setFocus(0); // always focus SOMETHING on open
  }

  private setFocus(i: number): void {
    this.focus = i;
    this.buttons.forEach((b, j) => b.setStyle({ backgroundColor: j === i ? '#ffffff33' : '' })); // visible focus
  }
}
// Route gamepad d-pad/stick through the same action map as the keys (see input-systems).
// RIGHT: a control is focused on open. WRONG: nothing selected → the gamepad does nothing and the player is stuck.
```

### 5. Event-driven HUD (decouple UI from game logic)

```ts
import Phaser from 'phaser';

// RIGHT: HUD reacts to a data change; it updates only when health actually changes.
export class HealthHud extends Phaser.Scene {
  create(): void {
    const bar = this.add.rectangle(16, 16, 200, 12, 0xff4444).setOrigin(0, 0);
    // Gameplay calls this.registry.set('health', current) — the registry is shared by all scenes.
    this.registry.events.on('changedata-health', (_parent: unknown, current: number) => {
      bar.width = 200 * (current / (this.registry.get('maxHealth') as number));
    });
  }
}
// WRONG: update() { bar.width = player.hp / player.maxHp * 200 } — polls every frame,
// couples UI to the player's internals, and runs work even when nothing changed.
```

## Pitfalls

- **Absolute pixel positions / a single design resolution.** Looks right on your monitor, broken
  everywhere else. Anchor to edges/center and flow with containers.
- **No aspect-ratio policy.** 16:9-only layouts crop or letterbox badly on ultrawide and phones.
  Decide expand vs letterbox and anchor HUD to corners that move outward.
- **Ignoring the safe area.** HUD under a notch or lost to TV overscan. Inset critical elements.
- **No initial focus / no focus neighbors.** The game is unplayable on a gamepad; players land
  on a menu with nothing selected. Always focus one control and define navigation.
- **Polling game state in `update()`.** Couples UI to internals and wastes work. Push
  updates via events (`this.registry.events`, scene events).
- **Tiny fixed font sizes.** Unreadable on a TV-at-distance or a small phone. Scale text with the
  UI and offer a text-size option. Xbox Accessibility Guideline 101 sets floors of 26 px at 1080p
  on console/TV and 18 px at 1080p on PC, and asks for scaling up to 200% without losing content.
- **Menu flow as boolean flags** (`isPaused`, `inSettings`, …) becomes unmanageable. Use a
  screen stack with push/pop.
- **Hardcoded English strings baked into layout.** Translations overflow buttons. Externalize
  strings and let containers size to content (see `references/`).
- **Mouse-only or focus-only.** Support both; switching input device should not strand the user.
- **HUD drawn in the game scene scrolls with the camera**: put the HUD in its own scene
  launched in parallel (`this.scene.launch('hud')`), or `setScrollFactor(0)` on every element.
- **A corner-anchored element grows off-screen** when its size changes (longer translated
  text, a bigger text-size setting): its origin was left at (0.5, 0.5), so it grows in every
  direction. Set the origin to the anchored corner or edge as well.

## References

- For Phaser scale modes, the safe-area math, a complete focus-navigation and
  screen-stack pattern, diegetic vs non-diegetic UI, accessibility (text size, contrast,
  colorblind-safe state), and localization-ready layout, read `references/layout-and-flow.md`.

## Related skills

- Vendored Phaser `scale-and-responsive`, `text-and-bitmaptext`, `groups-and-containers` — the concrete objects and scaling.
- `game-feel` — button pops, transitions, and HUD juice that ride on top of this layout.
- `dialogue-systems` — conversation/choice UI that lives inside this UI shell.
- `input-systems` — device switching, rebinding screens, and accessible controls.
