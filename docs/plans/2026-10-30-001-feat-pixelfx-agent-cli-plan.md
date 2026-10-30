---
title: pixelfx effects for Game Maker agents, through the gm CLI
type: feat
status: proposed (not started; no tickets until Kevin asks)
date: 2026-10-30
origin: Kevin, 2026-10-30, "https://github.com/patch-gg/pixelfx plan to make accessible to agents via cli"
---

# pixelfx effects for Game Maker agents, through the gm CLI

## Recommendation

Treat pixelfx as a **tier 2 source** (B11 §4.7) that is vendored at a pinned commit, and reach it through the `gm` CLI. Don't let agents call its own scripts directly.

- **Finding and using existing effects:** pixelfx effects join `gm assets search`, `info`, `sheet` and `use` as kind `vfx/pixel`.
- **Recolouring, previewing, exporting and making new effects:** a small new `gm fx` namespace, alongside `gm music` and `gm sfx zzfx`.
- **The look-and-refine loop:** the `gm-vfx` skill gains pixelfx's draft, render, look, refine loop. That loop is also how a direction checkpoint for an effect gets its options.

Why not use pixelfx's `tools/*.mjs` as they are? They're built for a person at a terminal:
- output is free text with no `--json`;
- failures print stack traces;
- they write into the checkout's own `records/` folder;
- they know nothing about our licences, lockfile or game folders.

The `gm` conventions already fix all of this: compact by default, `--json` when needed, one-line errors with a next step, and contact sheets instead of single images.

## What pixelfx is (checked 2026-10-30)

- **What:** 232 pixel art effects in 20 categories (fire, explosions, magic, weather, UI, pickups, critters and more). Each effect is one JS file that draws into a colour buffer and an additive light buffer. There are no images.
- **Licence:** MIT, code and effects. Parts are adapted from Hugo Duprez's MIT Sprite Fusion effects. The exception is the Patch Pixel font in `gallery/fonts`, which isn't covered by the MIT licence; leave it out.
- **Runtime:** Node 18+, no runtime dependencies. ffmpeg is optional, for GIF and MP4.
- **Options on every effect:** `palette` (a dark-to-bright hex ramp, or one of about 30 named ramps), `seed`, `flip`, `angle`, `light`, plus each effect's own knobs in `meta.options`.
- **Outputs:**
  - a contact sheet PNG of up to 16 frames, labelled with frame and time;
  - GIF and MP4;
  - a sprite sheet as a transparent PNG plus Aseprite-style JSON, which Phaser, Godot and Unity importers read (`meta.pixelfx` carries fps, loop and pivot).
- **Existing tools:** `list` (word search), `render`, `check` (spills, loop seams, unseeded randomness, slow frames), `new` (scaffold), `sheets` (bulk export) and a gallery server. It also ships a Claude Code skill with the render-and-look loop.
- **Trial run here:**
  - checkout: commit `fe7103c`, 8.2 MB;
  - Node 24: `list frost` took 0.7 s;
  - `render fire/torch --sheet`: 60 frames in 4.3 s;
  - `explosions/big-explosion`: 217 frames;
  - the contact sheets look hand-animated, not generic.
- **Age:** the repo is days old (about 100 stars on 2026-10-30), so pin a commit and review each update before taking it.
- **Fit:** these are 2D pixel effects. They suit pixel games directly. 3D games (the dungeon prototype is three.js) use them as camera-facing sprite sheets, which is a style choice the one-style-family rule should check (C1).

## Shape

### 1. Vendor it, pinned

- `third_party/pixelfx/` holds a copy of the repo at a pinned commit:
  - keep `src/` (core and effects), `tools/lib/` (the renderer and PNG writer), `LICENSE` and `NOTICE.md`;
  - drop `gallery/` (the Patch Pixel font), the montage GIF and the Claude plugin files.
- `third_party/pixelfx/PIN` records the commit and the date it was reviewed.
- `scripts/fx/update_pixelfx.sh <sha>` fetches a commit, shows the diff of `src/` and `tools/lib/` for review, and copies it in. It never runs automatically.
- Nothing is installed: no `npm i`, no install scripts. The only dependency is a dev dependency (`esbuild`), which we don't need.

### 2. Effects in the asset catalog

- An importer writes one asset card per effect from its `meta`: name, description, tags, category, loop or once, duration, size, whether it uses the stock character, and option knobs with their defaults. The card also links a contact-sheet preview and an animated preview, rendered once at import.
- **Asset kind:** add the subkind `pixel` to B11's `vfx` kind (`vfx/pixel`), plus a style of `pixel`. Then `gm assets search frost --kind vfx --style pixel` finds them next to flipbooks from packs.
- **IDs:** for example `t2:pixelfx/ice/frost-nova@fe7103c`.
- **What `gm assets use` copies:**
  - **for a JS game:** the effect file, its category's `_lib.js` and `src/core` (shared, copied once);
  - **for anything else:** the rendered sprite sheet.
  - Either way it records the asset in `assets.lock.json` and adds the MIT credit (Patch, and Hugo Duprez where the file says so) to CREDITS.

### 3. The `gm fx` namespace

Same rules as the rest of `gm`:
- compact lines by default, `--json` and `--fields` when needed;
- every output path is explicit or goes under the game's `shots/fx/`, never into the vendored copy;
- exit 0 on success, 1 when a check fails, 2 on bad input;
- one-line errors that suggest the next command.

| Command | What it does |
|---|---|
| `gm fx render <id> [--palette name\|hexes] [--seed N] [--flip] [--opt k=v ...] [--gif\|--mp4]` | One contact sheet (plus GIF or MP4) of one effect with these options. Prints the paths |
| `gm fx takes <id> --n 3 [--vary seed\|palette\|opt:k=a,b,c]` | N variations rendered into **one labelled image**, so choosing is a single image read. This feeds direction checkpoints |
| `gm fx sheet <id...> --for phaser\|godot\|unity\|three [--opt ...]` | Sprite sheet PNG plus JSON, with the pivot and fps, ready to import |
| `gm fx new <name> [--from <id>] [--loop]` | Tier 3: scaffolds an effect in the game's own `fx/` folder, starting from an existing one when `--from` is given |
| `gm fx check <id\|path>` | pixelfx's checks, failures only, one line each |
| `gm fx palettes` | The named colour ramps, one line each, plus the current game's palette when it has one |

`gm assets register --made-by-agent --from <id>` records agent-made or edited effects, as it does for other tier 3 assets.

Implementation is a thin Node module over `third_party/pixelfx/tools/lib/fxlib.mjs` (`loadEffect`, `renderFrames`, `contactSheet`, `spriteSheet`, `writeVideo`), not a shell-out to pixelfx's scripts.

### 4. Skill: `gm-vfx`

Fold in pixelfx's skill and Sprite Fusion's method (code is clay, trust your eyes, feed your references):
- search the catalog before making anything;
- most requests are an existing effect with different options (palette, seed, size), not new code;
- make new effects by draft, render, look and refine with `gm fx render` and `check`, never one shot;
- match the game's palette and pixel scale, using `palette` set from the game's style family;
- for big effect decisions (the look of the hero's main attack, the game's hit feel), offer options with `gm fx takes` as a direction checkpoint (scope: "Direction checkpoints").

## Checks that say it works

- **Search:** `gm assets search frost --kind vfx` returns pixelfx effects in under a second, offline.
- **Takes:** `gm fx takes fire/torch --n 3 --vary palette` writes one image with three labelled variations.
- **JS use:** `gm fx sheet` and `gm assets use` on a sample JS game give an effect that plays in-game. A headless run (`gm run --headless --frames`) shows it, and the lockfile and CREDITS list it.
- **Sheet import:** a Phaser atlas load of a `gm fx sheet` output plays at the right fps with the pivot at the feet.
- **Errors:** a bad id or bad options give one line plus a suggested command, with no stack trace.
- **Untouched copy:** `third_party/pixelfx` has no changes after any command (checked by a test).

## Open questions for Kevin

1. **Before `gm` exists:** the `gm` CLI is still design only (B11). Should the prototype get a small stand-in now (`scripts/fx/gmfx.mjs` with the same commands), so the studio prototype's agents and direction checkpoints can try it? Or should this wait for the step-2 research spike? Recommendation: wait. Effects aren't on the current UX pass, and the research spike will place `gm` properly.
2. **Upstream:** we could offer pixelfx a `--json` flag and an output-directory flag as a pull request. That's outward-facing (a PR from your account), so only if you want it.
