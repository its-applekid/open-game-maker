# Studio prototype v0 (throwaway)

The whole studio loop as one page: title screen (the ui-v0 home screen) → **Games** library with live animated covers → game
modal with a gameplay montage and Steam-style details → **Play** / **Edit** in the ui-v0 Goblin Cellar dungeon (every game opens it)
→ **New Game** steps (Genre, Vibe, Art, World, Players, Talk it through) → build tracker (collapsed button → combined bar → every build).

- Voice is scripted: the seismograph trace, the builder's paint-orb and the words are animation, not a microphone. Every voice spot also takes typing.
- Art step only offers styles we own packs for; picking one opens a popover with previews of those packs (Kenney CC0, Synty licensed).
- Builds are fake timers: new games 5 minutes, features 1 minute. The tracker has 10× / 60× demo speeds.
- Covers and clips are drawn live from Kenney CC0 sprite sheets (`scenes.js`); Goblin Cellar uses real screenshots of ui-v0.

Build the publishable folder with `tools/build.sh` (copies sprites and pack previews from `assets-local`, copies ui-v0 into `demo/`
with models as glTF JSON). Goblin screenshots: run `prototypes/ui-v0/tools/e2e.mjs` at 1280×720 and save `06-play`, `07-fight`,
`08-result` (cropped to the stage) and `04-placed` as 960 px webp in `art/goblin-{play,fight,result,placed}.webp`.
Deploy with `tools/deploy.sh` (after `build.sh`) to https://ogm2000-studio.netlify.app.
Hashes `#library` and `#new` skip the title screen.
