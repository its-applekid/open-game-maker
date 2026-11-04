# New-game pipeline: decisions (Kevin, 2026-11-03 voice review)

Condensed from Kevin's handoff of the 2026-11-03 voice conversation about the new-game briefing. These are product
decisions; engineering details marked "delegated" are for the implementing agents. Earlier decisions (engine layers,
repo split, promotion, showcase and starter scenes from 2026-11-02) stand.

## Flow

Dedicated New Game flow → private scope and design conversation → sanitized parent GitHub issue → Executor-only intake →
adaptive front-loaded design questions → whole-game architecture and Build Order → prototype-first parallel build →
the whole game keeps building → player launches and iterates. It keeps working if the player skips, goes quiet,
ignores the prototype or changes a decision later.

## Register

| Id | Decision |
|---|---|
| N1 | Only the New Game flow creates a new-game request and a multi-ticket Build Order. Later changes come from the game's editor (typed, one-way or two-way voice) and become **one ticket for one agent**. |
| N2 | A GitHub **parent issue** per new game holds a privacy-safe summary and routing metadata, never raw chat, voice transcripts or sensitive detail. Full context lives in private storage for authorised agents. The parent links all children (the Build Order) and must reach the Executor without a worker claiming it. Schema and storage: delegated. |
| N3 | **No approval gate.** The Executor plans and starts automatically, launching tickets as their questions resolve. ~5 min without an answer → provisional decision, keep working. Late answers trigger impact analysis and re-plan, rework or revert. Durable decision history. |
| N4 | Use aiur's existing instance limits, accounts, scheduler and queue; no per-game quota. The Executor prioritises globally; a small edit may jump ahead of a large build. |
| S1 | No fixed ticket set or count. Teach principles: strong-model skeleton, interfaces and seams, then independently owned tickets; only the lanes the game needs; maximum safe parallelism, shallow dependencies. |
| S2 | Plan the **full game** up front; prototype tickets first, the rest queued. |
| S3 | First playable = an early representative prototype of the key mechanics. Feedback chance, never a gate; the full game keeps building. |
| S4 | Prefer existing SDK, adapters and shared packages; anticipate extraction, but promote only implemented, proven components (instance shared library first, core via the versioned contribution path). |
| S5 | Already decided 2026-11-02; showcase frozen on v4. Do not reopen. |
| Q1 | No question cap; front-load high-leverage questions with rich examples; player can skip any or all. |
| Q2 | Use known details silently; never re-ask. Large pastes show as a compact attachment in the creation chat; full text goes to the design agent (threshold: delegated). |
| Q3 | Support images, GIF/video, audio, story samples and playable prototypes; choose per decision. Rich options go through **aiur Commands**, not a Game Maker-only picker. |
| Q4 | No special operator role. The player answers creative questions; the Executor handles orchestration. Admins reach the Executor through generic admin settings. |
| Q5 | Questions never stop the world; independent tickets start; ~5 min defaults; skip and late replace supported. |
| Q6 | Two-way voice knows the current request and the game's pending Commands, reads them aloud and answers through the real aiur Command workflow; a new feature raised while talking becomes its single ticket. Same semantics typed. |
| M1 | Numeric badge on the top-right hamburger for outstanding requests; "action needed" looks different from "jobs finished" (finished bars may turn green). Visual detail: delegated. No phone push required. |
| M2 | No Build Order graph in the player UI. Ticket progress bars grouped by game, with meaningful aiur states (not started, active, paused, parked, finished); every job opens an expanded conversation and progress view; a new-game build still reads as one coordinated effort. |
| M3 | A central per-game Commands inbox plus each job's own conversation, built on an embeddable **aiur Commands** component matching the aiur dashboard's Commands flow. |
| M4 | Signal that the prototype is playable; never auto-launch. |
| A1 | aiur Commands carry images, GIFs, video and audio in agent prompts and options **and** in player responses; text options, free response and the recommendation stay. Same in the aiur dashboard and Game Maker. |
| A2 | Embeddable, permission-aware aiur **Commands** package/API, and an embeddable aiur **agent-conversation** component: conversation and activity with text, one-way and two-way voice; right-edge minimap; inline media artifacts as agents work; used for New Game creation, editor feature scoping and the per-job modal; pending Commands in the inbox and in the conversation, voice can answer them. Codex files the aiur tickets after inspecting aiur's code (extract, don't duplicate). |
| A3 | `request:new-game` issues are visible to and subscribed by the Executor, never auto-dispatched to a worker; reuse an existing parked or non-dispatch mechanism, file an aiur ticket only if needed; retries and ownership so it is never missed or claimed by a worker. |
| T1 | Start the prerequisites and the simulation path now, in parallel. The first game builds on a working hosted instance; the full creation UI is not a gate. Reconcile #444–#447 with live state. |
| T2 | First test game: not chosen yet. Kevin designs it with ChatGPT from the simulation packet. Do not pick one. |
| T3 | Two-way voice in the app is not a prerequisite for the first game. |

## Phases

1. Skills and resources (gm-new-game-design, gm-new-game-plan) and the simulation packet
   (`docs/new-game/game-maker-design-agent-simulation-packet.md`) — done first.
2. Kevin and ChatGPT design the game from the packet.
3. Claude and the Executor create the real full-game Build Order from the returned spec.
4. Build the first game in the Weaver instance's Open-Games repo (`games/<name>/`, `packages/`).
5. Kevin plays it; gaps become tickets.
6. A second game goes through the complete Game Maker UI (conversation, Commands inbox, grouped progress, voice).
