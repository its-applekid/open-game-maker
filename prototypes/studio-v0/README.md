**Archived (OGM-101).** Replaced by `apps/web`; kept for history and the write-up below.

# Studio prototype v0 (throwaway)

The whole studio loop as one page: title screen (big logo and Start over an opinionated scene, three directions to compare at
`#title-a` (default), `#title-b`, `#title-c`, or the A/B/C pill top right: A a glass city being built and painted in, B a floating
island of game worlds built in glass and painted in turn (both three.js, `title-3d.js`, Kenney 3D kits), C a layered glass landscape
that flung paint colours in, with characters from different games (2D canvas, `title-c.js`); `?manual` stops the animation so
`window.__title.step(n, dt)` can drive it for screenshots) → **Games** library with live animated covers → game
modal with a gameplay montage and Steam-style details → **Play** / **Edit** in the ui-v0 Goblin Cellar dungeon (every game opens it)
→ **New Game** steps (Genre, Vibe, Art, World, Players, Talk it through) → build tracker (collapsed button → combined bar → every build).

- Voice is scripted: the seismograph trace, the builder's paint-orb and the words are animation, not a microphone. Every voice spot also takes typing.
- Art step only offers styles we own packs for; picking one opens a popover with previews of those packs (Kenney CC0, Synty licensed).
- Builds are fake timers: new games 5 minutes, features 1 minute. The tracker has 10× / 60× demo speeds.
- Covers and clips are drawn live from Kenney CC0 sprite sheets (`scenes.js`); Goblin Cellar uses real screenshots of ui-v0.

Build the publishable folder with `tools/build.sh` (copies sprites and pack previews from `assets-local`, copies ui-v0 into `demo/`
with models as glTF JSON). Goblin screenshots: run `prototypes/ui-v0/tools/e2e.mjs` at 1280×720 and save `06-play`, `07-fight`,
`08-result` (cropped to the stage) and `04-placed` as 960 px webp in `art/goblin-{play,fight,result,placed}.webp`.
Deploy with `tools/deploy.sh` (after `build.sh`) to https://ogm2000.netlify.app.
Hashes `#library` and `#new` skip the title screen.

Sound (`sound.js`): a Kenney title track and Sidetrax "Camelot" as the menu track (intro once, then a seamless loop between the
loop points on its asset card; swap either in `MUSIC`, any file in `art/music`; the public deploy leaves Camelot out and falls back
to a Kenney track); picking a
game in the Games spotlight fades the music out under that game's quiet effects and ambience (no game music); closing it brings the
menu music back. Audio starts after the first tap or key press (browser rule); the glass speaker button mutes.
