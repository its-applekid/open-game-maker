---
name: gm-ui-hud
description: Lay out the game's own HUD and screens around the host's platform HUD, safe areas, and player settings.
---

# Game Maker UI and HUD

## Two HUDs

The host owns the platform HUD: pause, saves, settings (volume, mute, text size, reduced motion), achievement
toasts, and leaving the game. Never draw, restyle, cover, or duplicate it. The game owns only what the game knows:
score, health, timer, objective, inventory, prompts, and its title, won, and lost screens. Pause is the host's: the SDK
stops the clock and calls `GameInstance.pause`, then `GameInstance.resume`; the game draws no pause menu of its own.

## One model per player

Derive the HUD from game state as a `HudModel` per player: a flat record of strings, numbers, and booleans. In
multiplayer, `MultiplayerHooks.hud` returns that player's model and never includes another player's private fields.
Render from the model on change, not from scattered gameplay calls, so the same model drives the screen, tests, and
spectators. Keep HUD text in the design doc's strings, not in render code.

## Layout

Read the `Viewport` from `host.viewport.current()` and follow `host.viewport.onChange`; it carries size, `dpr`,
orientation, and `safe` insets. Keep every HUD element inside the safe insets. Lay out against the manifest's
`presentation.minLogical` reference size and scale uniformly from it; anchor elements to corners and edges, never to
absolute pixels of one device. Re-layout on every viewport change, including rotation.

Budget the HUD to at most 25% of the screen and keep the centre clear for play. Prefer corners: status top-left,
score top-right, prompts near the bottom edge clear of the touch overlay. Hide what does not matter in the current
state.

## Readable by default

- Text is at least 16 CSS px on a phone after scaling; multiply by `PlayerSettings.textScale` from
  `host.settings.onChange`.
- Keep strong contrast against moving backgrounds: a solid or blurred plate behind text, not a thin outline alone.
- If the game draws its own button, primary targets are at least 64 px and secondary targets at least 44 px.
- Honour `reduceMotion`: no shaking, flashing, or sliding HUD; change values in place.
- Pair numbers with an icon or word, and keep a message on screen long enough to read aloud.
- Spoken lines show their caption before the audio starts and follow sentence by sentence: play them through
  `SpokenText` from `@gm/sdk/audio`, whose sentence callback drives the caption, so the text never depends on hearing.

## State inventory

List the game's screens before building them: title, play, paused, won, and lost. Paused is the host's dialog over a
frozen game; the others are the game's. Each needs a clear way forward (start, retry, next) reachable by every
declared input. Write one input script per state and capture a still of each with
`gm run --viewport both --inputs inputs.json --frames 0,2,5`. Look at the stills: no clipped text, nothing under a
notch, the platform HUD uncovered, the centre clear.

## Reference

Open `vendor/gamedev/game-ui-ux` for anchors, focus order, and event-driven HUD patterns, and
`vendor/phaser/scale-and-responsive` or `vendor/phaser/text-and-bitmaptext` only for engine details. The host
contract wins when a vendor reference suggests owning pause, settings, or device safe areas.
