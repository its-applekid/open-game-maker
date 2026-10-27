# v0.5 research index

Hands-on findings from building things, rather than desk research. Product scope: `../../spec/release-plan.md`. Decisions: `../../spec/game-maker-2000-v0.5-decisions.md`.

| Report | Topic |
|---|---|
| **C1** | **UI prototype learnings: paper home screen and dungeon editor built from scratch. Easy/hard/slow/optimizable, page weight, how the B14 skills performed, recommendations for the `gm` CLI and `gm-*` skills** (2026-10-26; live: https://ogm2000.netlify.app) |
| **Doc** | **Product scope + architecture design doc: `../../architecture/architecture-scope.html`** (published: https://claude.ai/artifact/7qZeB6mQUh61bZtwzRY5KP). Decisions, the embedded prototype, every planned feature, system design, data model, flows, release plan |
| **C2** | **V1 scope additions (Kevin, 2026-10-26): admin build analytics on top of aiur telemetry with game-making context, style families mapped to packs, mobile and desktop asset variants, point of view chosen at creation, budget-aware voice agent, first-class V1 multiplayer, Drive watch folder for asset intake, branching of code and editor state, tabletop map inspiration library with the `gm-map-inspiration` skill, rich asset tagging (metadata cards). Includes a ticketing checklist** |
| **C3** | **Asset metadata standard: one JSON card per asset and per collection (shared core + per-type blocks for models, rigs, kits, sprites, textures, audio, fonts, VFX and inspiration maps), fixed vocabularies with a tag-proposal path, usage rights computed from license + admin decisions (narrow only, never written by models), provenance and confidence per field, ids and hashes, inheritance, search, a tagging procedure for agents, and the inspiration-map layout spec. Schemas and validated examples in `schemas/`** (2026-10-26) |
