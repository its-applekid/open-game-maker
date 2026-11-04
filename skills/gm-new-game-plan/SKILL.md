---
name: gm-new-game-plan
description: Load as the Executor when a new-game parent issue (label request:new-game) arrives with a design spec. Architects the whole game, cuts parallel tickets with shallow dependencies, files them with features, epics and an aiur Build Order, puts the playable prototype first, and keeps re-planning as decisions change.
---

# New-game planning (Executor)

The parent issue is a planning record, never a worker ticket. Only the Executor takes it (it carries
`request:new-game` and no dispatch label). Edits to an existing game are single tickets and never use this skill.

## Inputs

The parent issue's public summary, its private context (spec from `gm-new-game-design`, chat, voice transcript,
attachments), the instance repo (`games/`, `packages/`), `gm-core`, the set skill for the chosen style, and
`../gm-new-game-design/references/resources.md`. Open questions still pending stay pending; plan around them.

## Plan the whole game, prototype first

1. **Architecture.** Lay out the game's skeleton before any ticket: folder layout under `games/<name>/`, the systems
   (input, player, world/map, entities, UI, audio, saves, progression), their interfaces and the seams where tickets
   meet. Prefer existing SDK modules, pack adapters and `packages/` code; note likely shared pieces, but do not promote
   anything that has not been built and proven yet.
2. **Skeleton ticket first.** One small ticket creates the folder, the template, the system stubs with their
   interfaces, data formats and test hooks, so every later ticket edits its own files.
3. **Cut tickets by ownership.** Each ticket owns a clear set of files and one outcome a player can see or a test can
   check. Use only the lanes this game needs (gameplay, controls, characters and animation, enemies, maps and levels,
   UI and HUD, story and text, music, sound, voice, saves and progression, multiplayer, polish, verification). No fixed
   count: as many as the game needs, each completable by one agent in a few hours.
4. **Shallow dependencies.** Aim for depth 2–3: skeleton → parallel systems and content → integration and polish.
   Depend on interfaces, not on finished features. Avoid two tickets editing the same file.
5. **Prototype first.** Mark the tickets that deliver the prototype milestone (spec section 13) as priority 1; the
   rest of the full game is planned and queued behind them. The prototype is a feedback chance, never a gate: keep
   building whether or not the player plays it.
6. **Questions as tickets' blockers.** A ticket that needs an open decision depends on that Command; everything else
   starts now. Content tickets that need a creative choice (music direction, character look) open their own option
   Commands with samples (see the design skill's question protocol).

## File it in aiur

- Child issues in the instance repo, each linking the parent, with: goal, owned files, interface contract, acceptance
  checks, skills to load, assets chosen, and the decisions it relies on (by id). No raw player text: summaries only.
- `aiur-main feature create` for the game (once) and `aiur-main epic set` per lane; GitHub native blocked-by edges for
  dependencies; priority labels (prototype tickets `priority:1`).
- Build Order: the parent issue is its root; confirm with `aiur-main build-orders <root>` that every child appears with
  the right edges, then queue the unblocked children (`aiur-main --todo`).
- Post the plan summary on the parent: architecture sketch, ticket list by lane, prototype set, open decisions.

## Keep it moving

- Apply provisional defaults to open Commands after about five minutes; record them as decisions (origin: default).
- When a decision changes (a late answer), find the affected tickets and merged code, then re-plan: edit open tickets,
  add rework tickets, revert only what the change requires, and message running agents with `aiur-main message`.
- Schedule with the instance's normal limits and queue; small edits to other games may jump ahead of a large build.
- When the prototype set merges, tell the player it is playable (never open the game for them).

## Done

All children merged, the game passes `gm check`, `gm test`, `gm run` and the spec's acceptance criteria, the parent
issue has the final summary, and reuse candidates are noted under `## Promote` for later.
