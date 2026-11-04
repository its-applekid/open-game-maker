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

## Evidence and review states

- **Foundation before replication.** Prove the risky base first (one assembled structure at the right scale, actors,
  depth and collision, movement and combat transitions, the physical interaction, saves) before tickets that multiply
  content built on it. A known-broken base is repaired, never copied.
- Every visual or audio ticket ends with real evidence (screenshots and short captures at phone portrait, phone
  landscape and desktop; audio previews) that the agent has looked at itself.
- Review states: generated → agent-reviewed → player review requested → player-approved or provisional default.
  Silence is never approval; low-confidence work (a new or poorly preprocessed pack) asks for review in small batches.
- Fairness across aspect ratios is gameplay: test encounter visibility, threat cues, aiming and puzzles on narrow and
  wide screens, not only menus.
- Private context (references to other games, the player's words) stays in private storage for authorised agents;
  public tickets describe behaviour and acceptance only, with no commercial game comparisons.

## File it in aiur

- Child issues in the instance repo, each linking the parent, with: goal, owned files, interface contract, acceptance
  checks, skills to load, assets chosen, and the decisions it relies on (by id). No raw player text: summaries only.
- `aiur-main feature create` for the game (once) and `aiur-main epic set` per lane; GitHub native blocked-by edges for
  dependencies; priority labels (prototype tickets `priority:1`).
- Build Order: the parent issue is its root; confirm with `aiur-main build-orders <root>` that every child appears with
  the right edges, then queue the unblocked children (`aiur-main --todo`).
- Post the plan summary on the parent: architecture sketch, ticket list by lane, prototype set, open decisions.

## Deep-dive every ticket before implementation (always, unasked)

Once the high-level plan and the proposed Build Order exist (your own brainstorm → plan loop), do not dispatch any
implementation ticket yet. Nobody has to ask for this step; it is part of planning every new game.

1. **One research ticket per implementation ticket**, filed at once and run in parallel (label `kind:research`, same
   feature and epic, priority above implementation). Each one blocks its implementation ticket (native blocked-by).
   Library and asset tickets that already are research get no extra spike.
2. **Each research agent** loads `ce-brainstorm` then `ce-plan` (compound-engineering) on its ticket, reads the private
   context it cites, the code and the assets it touches, and the related tickets' contracts. It writes
   `games/<name>/docs/research/<ticket>.md`: the design for that piece, the interfaces it consumes and provides,
   step-by-step implementation units, exact files, test scenarios with expected values, asset ids, evidence to produce,
   risks, and open questions with a recommended default. Public-safe wording; private detail stays in private storage
   and is referenced, never copied.
3. **You weave them.** When the research for a lane or milestone lands, reconcile contradictions across tickets (shared
   contracts, names, data formats, effect vocabulary), write `games/<name>/docs/spec/<area>.md` as the final design for
   that area, and rewrite each implementation ticket to point at its research doc and spec section, with acceptance
   restated as checkable items.
4. **Write for a weaker implementer.** Assume the implementation agent is less capable than you: no step left implicit,
   no "as appropriate", exact paths and names, and one obvious next action per unit. If a ticket still needs judgment
   beyond that, split it or keep the judgment in the spec.
5. Then queue implementation in Build Order priority. Questions raised by research go to the player as Commands with a
   recommendation; they never block unrelated tickets (provisional defaults apply as usual).

## Keep it moving

- Apply provisional defaults to open Commands after about five minutes; record them as decisions (origin: default).
- When a decision changes (a late answer), find the affected tickets and merged code, then re-plan: edit open tickets,
  add rework tickets, revert only what the change requires, and message running agents with `aiur-main message`.
- Schedule with the instance's normal limits and queue; small edits to other games may jump ahead of a large build.
- When the prototype set merges, tell the player it is playable (never open the game for them).

## Done

All children merged, the game passes `gm check`, `gm test`, `gm run` and the spec's acceptance criteria, the parent
issue has the final summary, and reuse candidates are noted under `## Promote` for later.
