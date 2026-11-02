# 2D game template

Grey-box Phaser 4 scaffold for games created by Open Game Maker 2000. Its file layout follows the names used by `phaserjs/template-vite-ts`; all implementation in this directory is original.

The simulation in `src/state.ts` is plain deterministic data. Phaser scenes only project that state into rectangles, and the SDK clock owns every update and render pass.

Run `pnpm test` for the Node simulation, `pnpm test:browser` for the Chromium boot proof, and `GM_VERIFY_SOFTWARE_GL=1 pnpm test:browser` for the SwiftShader path.
