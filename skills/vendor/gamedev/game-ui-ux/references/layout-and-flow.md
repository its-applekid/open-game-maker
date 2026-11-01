---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/game-ui-ux/references/layout-and-flow.md
modified: true
---

# Layout, scaling & flow — depth for `game-ui-ux`

Detail the `game-ui-ux` body defers here: scaling modes, safe-area math, a complete
focus + screen-stack pattern, diegetic UI, accessibility, and localization-ready layout. Snippets
target **Phaser 4.2** in TypeScript.

## 1. Scaling modes (Phaser ScaleManager)

`scale.mode` in the game config:

| Setting | Choose | Effect |
|---------|--------|--------|
| `Phaser.Scale.FIT` | most games | scales the reference size to fit, letterboxing the rest |
| `Phaser.Scale.EXPAND` | HUD-heavy games | fits, then grows the game size to fill — extra world/UI space on odd ratios |
| `Phaser.Scale.ENVELOP` | full-bleed art | covers the window, cropping the overflow |
| `Phaser.Scale.NONE` + `zoom` | pixel art | integer zoom keeps pixel-art UI crisp; add `pixelArt: true` |

Anchor HUD corners (listen to `this.scale` `'resize'`) so `EXPAND` puts the extra space where
you want it. `FIT` keeps a hard 16:9 design.

## 2. Safe-area math

The OS reports a safe rectangle inside the screen (excludes notch, rounded corners, and — on TVs
— overscan margins). Inset only **critical** UI (health, timers, prompts); decorative art can
bleed to the edge.

```text
# Normalized anchors from a pixel safe rect (engine-neutral):
anchorMin = (safe.x / screenW,                 safe.y / screenH)
anchorMax = ((safe.x + safe.w) / screenW,       (safe.y + safe.h) / screenH)
# Re-apply on resolution change / orientation change, not once at startup.
```

- **Web:** CSS `env(safe-area-inset-*)` (needs `viewport-fit=cover`); read it through a probe
  element (see the body's Pattern 3) and reapply on `this.scale` `'resize'` and
  `'orientationchange'` (cache the last applied insets to avoid per-frame work).

## 3. Focus navigation (full pattern)

Requirements for controller/keyboard usability:

1. **Initial focus** on every screen open (set the menu's focus index and draw it).
2. **Explicit neighbors** for predictable movement (a neighbor table per control:
   up/down/left/right, or index arithmetic for simple lists and grids).
3. **Visible focus style** distinct from hover (an outline or scale, not only a tint).
   Never rely on color alone (see accessibility).
4. **Wrap or stop** intentionally at list ends; trap focus inside modal dialogs.
5. **Device coexistence:** moving the mouse can update selection; a gamepad press acts on the
   focused control. Don't clear focus when the mouse moves.

```ts
import Phaser from 'phaser';

// Trap focus inside a modal: launch it as its own scene and pause input on the menu behind it.
export function openModal(menu: Phaser.Scene): void {
  menu.input.enabled = false; // the stick/keys can't reach the menu behind
  menu.scene.launch('confirm'); // the modal scene sets its own initial focus in create()
  menu.scene.get('confirm').events.once('shutdown', () => {
    menu.input.enabled = true; // close: the menu's focus index is still where it was
  });
}
```

Showing the modal and focusing its button is not a trap on its own: the menu scene behind it
still receives keyboard and pointer input. Disabling the menu scene's input plugin turns the
whole screen off without touching each button.

## 4. Screen/menu stack

Model screens as a stack of UI states; the top owns input and is visible. Push for overlays,
pop for "back". This generalizes pause, settings-over-pause, and confirm dialogs.

```ts
import Phaser from 'phaser';

// Screens are scenes; only the top one is interactive. Each screen focuses its default control in create().
export class ScreenStack {
  private stack: string[] = [];

  constructor(private plugin: Phaser.Scenes.ScenePlugin) {}

  push(key: string): void {
    const below = this.stack.at(-1);
    if (below) this.plugin.get(below).input.enabled = false;
    this.stack.push(key);
    this.plugin.launch(key);
    this.plugin.bringToTop(key);
  }

  pop(): void {
    const top = this.stack.pop();
    if (top) this.plugin.stop(top);
    const below = this.stack.at(-1);
    if (below) this.plugin.get(below).input.enabled = true; // its focus index is unchanged
  }
}
// Pause overlay: this.scene.pause('game') freezes the game scene's update while the overlay runs.
```

This is the usual state-stack idea, applied to UI.

## 5. Diegetic vs non-diegetic UI

- **Non-diegetic:** drawn on the screen plane, outside the fiction (most HUDs). Cheapest, clearest.
- **Diegetic:** UI that exists in the world (ammo counter on the gun, health on the suit). More
  immersive, more work, can hurt readability. Use for key elements, keep a non-diegetic fallback.
- **Spatial/world-space:** floating health bars, damage numbers — anchor to world position,
  clamp to screen edges when off-screen, and scale with distance (3D).

## 6. Accessibility (bake in, don't bolt on)

- **Text size option** and never hardcode tiny fonts; size to a percentage of reference height.
  Xbox Accessibility Guideline 101 floors: 26 px at 1080p (52 px at 4K) on console/TV, 18 px at
  1080p on PC, and player scaling up to 200% without clipping or lost meaning.
- **Contrast & color independence:** text that carries gameplay information needs at least
  4.5:1 contrast with its background, large text and key visual elements at least 3:1 (Xbox
  Accessibility Guideline 102). Don't encode state in color alone — add icon/shape/text.
  Provide colorblind-safe palettes.
- **Scalable hit targets** for touch (≥ ~9 mm); padding around small buttons.
- **Reduce-motion / reduce-flashing** toggles (coordinate with `game-feel`).
- **Full keyboard + gamepad** reachability (section 3); don't gate actions behind mouse-only.

## 7. Localization-ready layout

- Externalize strings (a JSON string table per locale loaded with `this.load.json`). Never bake
  display text into layout logic.
- Let containers **size to content** so longer translations (German is ~30% longer) don't clip.
  Avoid fixed-width buttons sized to English.
- Leave room for RTL mirroring and different number/date formats.
- Keep icons separate from text so only strings need translating.

## Primary sources

- [Xbox Accessibility Guideline 101: Text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101)
- [Xbox Accessibility Guideline 102: Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102)
- [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/)
