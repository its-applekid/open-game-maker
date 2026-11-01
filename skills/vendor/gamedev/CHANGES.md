# Changes from gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4

Modified under Apache License 2.0 §4(b). Skills are flattened from `skills/<category>/<skill>/` to `<skill>/`. Every
file gains `license`, `source` and `modified: true` front-matter keys. Engine-specific prose (Godot, Unity, Unreal)
was replaced with its Phaser 4.2 / three.js r186 / browser equivalent, and "watch real players" steps now say to run
`gm run` and read the sheet.

- platformer/SKILL.md: Python pseudocode rewritten to TypeScript (jump-physics module; Phaser Arcade scene with `onFloor`, `JustDown`/`JustUp`, `setGravityY`, `setMaxVelocityY`); one-way, fixed-step and moving-platform notes now Phaser Arcade; related skills point at vendored skills.
- platformer/references/feel-tuning.md: Python rewritten to TypeScript (half-step integration, apex hang and fast-fall on an Arcade body, corner correction via `TilemapLayer.getTilesWithinWorldXY`).
- input-systems/SKILL.md: GDScript rewritten to TypeScript (`ActionMap` on `KeyboardEvent.code`, radial deadzone, buffer and coyote timers, rebinding saved to `localStorage`); InputMap notes now Phaser keyboard, gamepad and pointer.
- input-systems/references/buffering-and-accessibility.md: no code; SDL3/Godot/Steam gamepad notes replaced with the browser "standard" gamepad mapping.
- game-ui-ux/SKILL.md: GDScript rewritten to TypeScript (HUD anchored on scale `resize`, ScaleManager FIT/EXPAND config, safe area from CSS `env()`, menu focus index, registry-driven HUD).
- game-ui-ux/references/layout-and-flow.md: GDScript rewritten to TypeScript (modal focus trap, `ScreenStack` on the ScenePlugin); scaling tables now Phaser scale modes; two engine doc links removed.
- audio-design/SKILL.md: GDScript rewritten to TypeScript (Web Audio buses into `WebAudioSoundManager.destination`, ducking with `setTargetAtTime`, an SFX pool, a beat clock on `AudioContext.currentTime`).
- audio-design/references/adaptive-music.md: GDScript rewritten to TypeScript (layered music, bar-aligned section switching, intensity with hysteresis).
- camera-systems/SKILL.md: GDScript rewritten to TypeScript (`startFollow`/`setBounds`/`setDeadzone`, frame-rate-independent follow, a focus rig with look-ahead, a three.js orbit rig with `Raycaster` pull-in, additive shake); description no longer names Unity or Godot rigs.
- camera-systems/references/follow-and-framing.md: GDScript rewritten to TypeScript (view clamp against a `Phaser.Geom.Rectangle`); rig table now Phaser and three.js.
- game-feel/SKILL.md: GDScript and C# rewritten to TypeScript (trauma shake via `setFollowOffset`/`setRotation`, hit-stop via physics pause and `time.delayedCall`, squash tween, feedback tiers).
- game-feel/references/feedback-recipes.md: GDScript and C# rewritten to TypeScript (summed-sines shake, a three.js `easeOutBack` pop); ease table uses Phaser ease names.
- physics-tuning/SKILL.md: GDScript rewritten to TypeScript against Phaser Arcade (`worldstep` fixed step, `setFPS`, mass, drag, bounce, collision categories); CCD and interpolation notes now Phaser facts.
- physics-tuning/references/timestep-and-ccd.md: Python accumulator rewritten to TypeScript; solver settings now Phaser Arcade and Matter.
- save-systems/SKILL.md: GDScript and Python rewritten to TypeScript (`localStorage` with a backup key, typed migration chain, slots and autosave); storage prose now browser storage.
- save-systems/references/versioning-and-migration.md: Python migration chain rewritten to TypeScript; "where saves live" now browser storage.
- procedural-gen/SKILL.md: Python rewritten to TypeScript (`Phaser.Math.RandomDataGenerator`, fBm, weighted pick, rooms and corridors with `Phaser.Geom`).
- procedural-gen/references/noise.md: Python rewritten to TypeScript; library list now JS noise libraries.
- procedural-gen/references/dungeon-generation.md: Python (rooms, BSP, drunkard's walk, cellular automata, WFC, flood fill) rewritten to engine-free TypeScript.
- level-design/SKILL.md: GDScript rewritten to TypeScript (metrics, beats, gating graph); blockout tools now grey tiles, `this.add.rectangle` and `THREE.BoxGeometry`.
- level-design/references/pacing-and-flow.md: front matter only.
- prototype-fast/SKILL.md: the greybox loop is a Phaser `Scene` in TypeScript; publishing and non-web engine references removed.
- game-jam/SKILL.md: playtest step now `gm run`; links to skills not vendored removed.
- phaser-core/SKILL.md: JavaScript rewritten to TypeScript (typed `GameConfig`, scene fields and lifecycle parameters); the PixiJS pointer removed.
- phaser-core/references/scene-flow.md: JavaScript rewritten to TypeScript.
- phaser-arcade-physics/SKILL.md: JavaScript rewritten to TypeScript (typed Arcade sprites, groups and collision callbacks; the hit handler is a local function).
- phaser-arcade-physics/references/bodies-and-collision.md: JavaScript rewritten to TypeScript (typed collide and process callbacks).
- threejs-scene-setup/SKILL.md: jsDelivr import map replaced with Vite imports; JavaScript rewritten to TypeScript; the WebGPU block imports `three/webgpu`; description and the PixiJS pointer updated.
- threejs-scene-setup/references/scene-graph.md: JavaScript rewritten to TypeScript (typed dispose traversal).
- threejs-gltf-loading/SKILL.md: JavaScript rewritten to TypeScript (`GLTF` types, typed mixer and actions).
- threejs-gltf-loading/references/loaders-and-animation.md: jsDelivr Basis transcoder URL replaced with decoders copied to Vite's `public/`; JavaScript rewritten to TypeScript.
- threejs-materials-lighting/SKILL.md: JavaScript rewritten to TypeScript.
- threejs-materials-lighting/references/materials-lights-table.md: JavaScript rewritten to TypeScript.
