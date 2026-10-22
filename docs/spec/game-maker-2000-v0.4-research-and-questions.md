# Open Game Maker 2000
## v0.4 research results and question bank, the companion to spec v0.3

**Date:** October 21, 2026  
**Product owner:** Kevin Weaver  
**Prepared by:** Claude, after nine parallel research agents (A1–A9) and a compound-engineering brainstorm pass  
**Use with:** `game-maker-2000-spec-v0.3.md`, the base spec. This document records what changed since v0.3, what the research found, and what Kevin now needs to decide.  
**Status:** Research and discovery only. This is **not authorization to implement, deploy, sign up for vendors, or spend money.**

---

## Instructions for ChatGPT (read this first)

You are helping Kevin refine this spec in a **voice conversation**. Kevin is the product owner. He has already made many decisions, and he wants a thinking partner who sharpens them, fills gaps and adds context, not one who starts over.

**Inputs.** You have two documents.
- **Spec v0.3** is the full product spec. Its decisions stand unless this document reopens them.
- **This document** is the delta: one new decision, the research findings, the reconciled conflicts, and a new question bank in **Part 7**.

**How to run the conversation**

1. Read both documents before you speak. Then give Kevin a short spoken summary: the three research findings that most change the plan, and the three decisions that block MVP planning.
2. Work through **Part 7** in order, starting with the ★ questions. Skip anything Kevin has already answered.
3. **Ask one question at a time** and keep each spoken turn short, about 20–40 seconds. This is voice, so don't read long lists aloud.
   - Most questions come with a **research recommendation**. State it in one sentence and ask "keep it, or change it?"
   - Use the listed options only if Kevin wants alternatives.
4. Allow **at most two follow-ups per question**, then move on. Kevin wants to get through the whole set.
5. **Fast lane.** After the ★ questions, offer Kevin a batch mode for the unstarred ones. You name a group, summarize its recommended defaults in two sentences, and he accepts all of them or picks the ones to discuss. Record batch-accepted defaults as decisions, marked "(accepted default)".
6. Treat **Decided** items in v0.3 as settled. The exceptions are the items this document explicitly reopens, with reasons; see Part 3.
7. **Don't re-ask anything listed in Part 8.** Research has answered those questions.
8. Push back when something conflicts with v0.3 §2's goals: kid-safe, all devices, cheap on tokens, teaches design and engineering, not a slop generator.
9. Respect v0.3 §3:
   - Don't swap the tech stack.
   - Don't suggest tools from small or unestablished projects unless Kevin asks.
10. Don't state vendor policies, prices or laws from memory. Part 2 and the research index carry sourced claims. If something new matters, say "worth verifying" and add it to the open questions.
11. When Kevin says **"wrap up"**, or the conversation ends, produce a **complete, standalone spec v0.4**:
    - Use v0.3's section structure.
    - Fold in this document's research findings and Kevin's answers.
    - Mark each changed item **(changed)** and each new one **(new)**.
    - Move anything Kevin decided to **Decided**.
    - Keep unanswered questions in a question bank, in v0.3 §14's format.
    - Add a short **Change log** at the end, listing what changed and why, in Kevin's words where possible.
    - Keep this instructions section, and v0.3's "Instructions for Claude" section updated to say "next iteration", at the top of the new spec, so the document can go through another round.

---

## Instructions for Claude: the next iteration

When Kevin returns the v0.4 spec:
1. Treat its Decided items as authoritative.
2. Update the research reports only where an answer changes a recommendation.
3. Run the bounded spikes Kevin approved in Part 7 (★9). Stay within the approved budgets.
4. Then move from discovery to `ce-plan`: the MVP requirements plan, the Engine SDK contract, and the aiur integration tickets. Don't run another broad research wave unless a new decision needs one.

---

## Part 1 — New decision since v0.3

### 1.1 Waiting is playing and editing; edits survive builds — Decided (new)

While coding-agent work is queued or building, the creator can **keep playing and keep editing** in the editor view. That is the main waiting activity. [Kevin, after v0.3]
- Manual editor changes made during that time **persist into the next build**. They are stored in the **database**, not written into the game's source.
- A new build may make some edits invalid. When that happens, the existing rule applies: the creator always has the **newest build** (with their edits re-applied) and the **latest published release**, and nothing changes for players until the creator **Publishes**.

**How the research designed it** (A4 §7a, A5 §2.9; these are proposals, not decisions):
- The effective game is `base design document (from the build) + override layer (database)`.
- Overrides are keyed by **stable control ID and object ID**, never by the sentence that produced them. "Make all enemies blue" is stored as one entry per enemy that existed at the time.
- **Coding agents get a read-only snapshot** of the creator's current tuned values when a job starts. They can't write the override layer.
- **When a new build arrives**, it never swaps in underfoot. A "New build ready" chip offers *Try it*. Switching re-applies the edits with deterministic code and shows a short report: "Your 23 changes: 20 kept, 1 needs a choice, 2 couldn't carry over."
  - Renamed controls carry over through aliases.
  - Out-of-range values are **not silently clamped**; the creator chooses.
  - Removed controls or objects are dropped into an archive (proposed: 30 days). They can be restored by switching back, or turned into "Ask a builder".
- **On conflict** (the builder changed the same value), the creator's edit wins by default. It is flagged so the creator can pick "Keep mine" or "Use new". The exception is a job that was explicitly asked to change that control.
- **Publish** instantly pins `{build, immutable override snapshot}`, so players get exactly what the creator tested. A deterministic job then folds the snapshot into source ("fold"), and the draft layer is cleared relative to that new base.
- **Rollback** restores a release's own snapshot and leaves draft edits alone.
- **Forks** copy only the published snapshot, never draft edits, saves or awards.
- **Cost:** zero tokens. Database writes, plus a re-apply pass of milliseconds.

Open sub-questions are in Part 7, group B.

---

## Part 2 — What the research found (headline findings)

Labels: **[V]** verified against a primary source or the code on 2026-10-21. **[I]** inference by the research agents or the synthesis. **[P]** proposal. **[U]** unverified. Full citations are in the reports listed in Part 9.

### 2.1 Findings that change the plan

1. **Kevin's Claude Pro/Max subscription cannot power the multi-user service [V, A8].** Anthropic's Claude Code legal page says third-party apps may not "route requests through Free, Pro, or Max plan credentials on behalf of their users."
   - **The supported path is an Anthropic API key** under the Commercial Terms, paid by Kevin.
   - The subscription remains fine for Kevin's own development sessions.
   - aiur routes work to whichever account has the most headroom. Game Maker jobs must be pinned to API-key accounts only [I, A6].
2. **Every speech, music, image and 3D vendor checked is closed by default to services likely used by under-18s, except Anthropic and OpenAI [V, A8].**

   | Vendor | Rule for under-18 services [V] |
   |---|---|
   | ElevenLabs | Prohibited unless approved in writing; Zero Retention is Enterprise-only |
   | Google (Gemini, Vertex, Lyria, YouTube video understanding) | Prohibited for any service "likely to be accessed by individuals under the age of 18" |
   | fal.ai | End users must be 18+ |
   | Meshy | Trains on non-Enterprise uploads |
   | OpenAI | Allows teens with safeguards; under-13 personal data needs **approved Zero Data Retention** |

   - **Every existing aiur voice path uses ElevenLabs [V, A6].**
   - **There is no verified, free, on-device dictation path on iPad Safari.** Safari's speech recognition goes through Apple's servers [V for Chrome's on-device option; secondary sources for Safari].
   - **This reopens "basic dictation in MVP"** (Part 3).
3. **COPPA very likely applies to child accounts [V rule text; applicability needs counsel, A8].**
   - The amended rule has been enforceable since **2026-04-22**.
   - Marking an account as a child's gives the service *actual knowledge* that it has a child user.
   - **Consent must come from a parent.** An uncle-inviter is not automatically a valid consenter.
   - The rule requires:
     - a written retention policy;
     - separate consent before sharing a child's data with vendors (unless the vendor is integral to the service);
     - a written security program;
     - parental review and deletion rights.
   - The all-ages positioning is not an exemption.
4. **A Railway service is not a security boundary for untrusted code [V/C, A7].** Railway doesn't document service isolation. A forum answer describes unprivileged containers on a shared kernel.
   - **Railway now sells VM Sandboxes** [V]. They are isolated and on every plan, with no private network by default. **Outbound internet can't be disabled** [C].
   - **E2B** is the fallback when domain allow-lists become required.
   - **Daytona's open-source repo was archived in June 2026** [V].
5. **aiur assumes a trusted machine [V, A6].** It runs coding-agent CLIs on its own host with permission prompts bypassed by default. That conflicts with A7's "secrets outside the sandbox" design (Part 3, conflict C1).
6. **aiur takes work only as tracker tickets that end in a PR [V, A6].**
   - There is no create-job API.
   - It runs one daemon per repository.
   - It records usage per ticket in detail, but has **no dollar or token spending caps**.
   - Its limits are turns, wall-clock time, retries and concurrency.
   - **Game Maker must own admission, budgets and per-household limits.**
7. **GitHub can't restrict a writer to one folder [V, A7].** Ownership of `games/<id>/` has to be enforced by Game Maker's own commit service. Users and agents never hold GitHub tokens.
8. **A public repo can't honestly back a "Private" toggle [V/I, A7].** Visibility changes can't recall history, and public Actions logs, attachments and preview URLs leak. **The recommendation:**
   - keep all games in a **private** monorepo;
   - let "Private" mean *hidden from discovery + play restricted to invitees*;
   - make open source an explicit per-game **"Publish source"** export of a scrubbed snapshot.
9. **Colyseus 0.18 (2026-08-20) does provide prediction, rollback and interpolation [V, A7].** That resolves v0.3 §15.3's verification debt. But using them means running agent-written game code on the multiplayer server.
   - **Recommendation:** a generic platform-owned room that enforces roles, pause, the spectator view and version pinning.
   - Gameplay authority stays with the owner's sandboxed browser, and the room server runs as one Railway replica.
10. **Better Auth (1.7.12) for sign-in only [V, A7].** Its organization invitations need a matching email, which doesn't fit no-email child accounts. Invitations, supervision and permissions become our own small, tested policy module.
11. **Cloud CI frame rates say nothing about iPads [V, A9].** Headless Chromium renders WebGL on the CPU. **Performance targets need a calibration session on Kevin's real devices.** CI can only catch regressions against the previous release.
12. **AI screenshot judges are smoke detectors, not verdicts [V benchmarks, A9].** Models scored below 50% on single screenshots and near chance on glitches across frames. Their findings are advisory, except for a few binary checks such as a blank screen or unreadable text.
13. **Determinism has to be built into the SDK [I, A9/A5].** It needs a fixed timestep, an SDK-owned seeded RNG, and inputs recorded as logical actions.
    - Bug replay needs a **state snapshot plus inputs**, not just a seed.
    - **Rewind uses state snapshots, not input replay**, because generated games won't be deterministic.
14. **Variants should be presets of prebuilt genre demo kits, not agent builds [I, A9].** They then cost almost nothing and are playable instantly. Agent-built variants are kept for truly divergent mechanics.
15. **Few game-design skills clear the 1,000-star bar [V, A2/A3].**
    - **The only strong pack is `awesome-gamedev-agent-skills`** (2.6k★, Apache-2.0). It covers game feel, level design, platformers, puzzles, assets, audio, dialogue and UI. Its code examples are Godot/Unity and it says nothing about children, so we **adapt it**.
    - **UI is the exception:** Anthropic `frontend-design` is reusable. impeccable is useful for platform UI audits after a supply-chain review.
    - **Story, narrative, music and children's accessibility** need custom skills.
16. **Claude-Code-Game-Studios is mined, not adopted [V, A1].**
    - **What it is:** MIT, v1.2.0, one contributor; prose prompts only, with no game code. It assumes Godot, Unity or Unreal.
    - **Its own unverified claim:** the leanest mode, a one-page brief, beat the 30-document mode in blind ranking.
    - **Worth borrowing:**
      - the signal-to-specialist routing table;
      - dependency-ordered fan-out;
      - short return contracts;
      - "a missing artifact is a failed step";
      - the one-page brief;
      - the implementer story contract;
      - the quick-change path;
      - four-bucket playtest triage;
      - tuning values kept as data.
    - **Rejected:** its 49-agent hierarchy, sprints, phase gates, and hooks.
17. **Most game-feel and balance quality can be enforced by the SDK [P, A2].**
    - Jump knobs work in tiles and seconds and feed Pittman-derived physics.
    - Celeste's constants are verified from its MIT-licensed `Player.cs` and serve as the "expert" preset; a gentler kid preset sits alongside.
    - A reachability check re-runs whenever a knob moves.
    - Juice effects fire from standard events, with a platform-wide "reduce motion" setting.
18. **Read-along highlighting needs server-side word timings [V, A3].**
    - Azure, Polly, ElevenLabs and Cartesia return them. Google times only inserted marks. OpenAI returns none [V/U].
    - Browser speech can only be a fallback that highlights whole sentences.
19. **Narrative state [V/P, A3].** Yarn Spinner has no maintained JS runtime. The proposal is a small typed fact, quest and storylet model in the SDK, plus a continuity check against old saves. inkjs (659★) is optional and an exception to the star rule.
20. **Asset-first art is legally clean, with two traps [V, A8/A2].**
    - Kenney, KayKit and VCSL are CC0. The libraries (Phaser, Three.js, Tone.js, BeepBox, Colyseus, Better Auth) are MIT.
    - **Quaternius's own pages disagree.** Its FAQ says CC0, but its license page shows a custom license forbidding standalone redistribution (conflict C4).
    - smplr's sample sets are mostly unlicensed, one is GPL-2.0. **Skip smplr.**
    - TRELLIS depends on a non-commercial NVIDIA library.
21. **Analytics stay first-party [P, A5/A8].** Plain Postgres events plus daily rollups.
    - PostHog is rejected: self-hosting needs 4 vCPU/16 GB, and its cloud would add a vendor for children's data.
    - No third-party analytics SDKs on child accounts.
22. **iPad web push requires "Add to Home Screen"** (iPadOS 16.4+) [V, A9].
23. **Library status [V, A4/A5].**
    - Phaser 4 is stable (4.2.1; 4.0.0 shipped 2026-04-10).
    - Three.js is at r186.
    - Zod 4 emits JSON Schema natively, so one schema can serve as the TypeScript type, the message validator and the LLM tool schema.
    - Rapier's JS repo is archived and merged into `dimforge/rapier`. Its snapshot API supports rewind.
    - Playwright is at 1.64.1, with a fake clock that drives animation frames, an iPad WebKit profile and a bundled MCP server.

### 2.2 Rough cost scale (illustrative, unmeasured; A6 §15, A7)

| Item | Estimate |
|---|---|
| New game (Opus-class design and build) | ≈ $20 API-equivalent |
| Feature job (Sonnet-class) | ≈ $3 |
| Clarify exchange (Haiku-class, called directly) | ≈ $0.002 |
| Sandbox compute per 15-minute build | ≈ $0.04–0.10 |
| Automated test layers L0–L2 per draft | ≈ $0 tokens (CPU only) |
| Publish-time LLM visual check | ≈ $0.05 |
| Voice-agent context copied into a voice session (aiur's own measurement) | up to ≈ $2.94 per question cold; **a short briefing should be the default** |

These are sizing hypotheses for budget reservations, not prices. A bounded benchmark (★9) replaces them with measurements.

---

## Part 3 — Conflicts reconciled, and v0.3 items reopened

| # | Conflict | Resolution or status |
|---|---|---|
| C1 | **Where agent-written code runs.** A7 wants the agent loop and all secrets in the worker, with tool calls proxied into a VM sandbox. aiur runs agent CLIs locally with prompts bypassed. | **Open, ★6.** Three options are in Part 4.2. Synthesis recommendation [P]: for the family MVP, run aiur on its own isolated worker with compensating controls, and file an aiur ticket for a remote-execution backend so tool calls run in Railway Sandboxes. |
| C2 | **Voice.** v0.3 decided "basic dictation in MVP" and intended ElevenLabs. Research shows ElevenLabs needs written approval, every aiur voice path is ElevenLabs, and iPad has no verified on-device option. | **Reopened, ★3**, for a concrete new reason (v0.3 §14.3 allows this). Dictation for adult accounts is unaffected. |
| C3 | **Running on the subscription.** v0.3 §8.5 left it open. | **Answered by research** (Part 8): API key for the service. Product decisions remain (★1). |
| C4 | **Quaternius license.** A8 cites the FAQ ("CC0"); A2 found a custom license page. | **Unresolved in sources.** Recommendation [P]: treat Quaternius per pack under the stricter terms until Kevin (or the author) clarifies. Kenney and KayKit are unaffected. |
| C5 | **Forks and overrides.** A4 says forks copy source plus the effective snapshot. A5 says forks copy only the published snapshot. | **Reconciled:** a fork copies the published release (its source plus its override snapshot, folded into the fork's first commit). Never draft edits, saves, awards or analytics. |
| C6 | **CI location.** aiur waits for GitHub CI checks; A7/A9 say don't run CI on GitHub Actions for privacy. | **Reconciled [P]:** tests run in our sandboxes, and the commit service posts the results back as GitHub check runs. aiur sees normal checks, and no logs land on GitHub. |
| C7 | **Who invites children.** v0.3 lets creators mark invitees as children. COPPA consent must come from a parent. | **Reconciled into a design [P, A7]:** inviter ≠ guardian. A child account starts in *pending supervision* with safe defaults until a parent accepts guardianship. Who that is for the niece and nephew is ★2. |
| C8 | **Multiplayer authority.** Colyseus server authority vs no agent code on servers. | **Recommended [P]:** host-authoritative in the owner's browser for invite-only co-op (★ deferred group H). |
| C9 | **Repository topology.** v0.3 §9.2 left it unsettled. aiur's one-daemon-per-repo model and A7's privacy analysis both favor **one private games monorepo** (`games/<opaque-id>/`). | **Research recommendation; confirm in group G.** |

---

## Part 4 — Architecture alternatives (with tradeoffs)

### 4.1 Integration shape between Game Maker and aiur (A6)

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A+C hybrid (recommended)** | aiur runs the long, PR-shaped jobs: new games, features, repairs. Game Maker calls models directly for short single-shot steps: clarify, intent → editor command, hints, release notes when needed. | Reuses aiur's strongest parts: Git, CI, rework, routing, usage recording. Short steps stay fast (≈3 s) and cheap. | GitHub becomes part of the job bus, adding latency and API calls. Game Maker and aiur state must be reconciled. aiur needs isolation. |
| Full A | Everything AI goes through aiur tickets. | One system. | Minutes of ticket overhead for a one-sentence clarify. |
| C | Game Maker runs its own thin TypeScript job runner over the Agent SDK. | Native multi-tenancy, hard per-request caps, no GitHub dependency. | Rebuilds aiur. Contradicts v0.3 §7.1 "reuse aiur". |

Under A+C, **Game Maker owns:**
- accounts and permissions;
- durable job records;
- admission, slots and budget reservations;
- the clarify conversation;
- creating issues through its GitHub App;
- previews, Publish, release metadata and rollback;
- cost presentation;
- the dictation relay.

**aiur owns:** dispatch, worktrees, agent turns, account and model routing (API-key accounts only), CI and rework loops, PRs and raw usage recording.

**Runaway protection is layered** [P]:
1. Game Maker reserves an estimate (the p80 of past jobs of that kind) against household and platform caps before applying `agent:todo`.
2. aiur enforces per-ticket turn, time and retry bounds.
3. A watchdog compares live usage to the reservation. Past 1.5× it pauses the job and asks the admin; at the hard cap it cancels.
4. Provider limits show "waiting for capacity", not an error.
5. **Anthropic workspace spend limits on the API key** would add a hard platform-wide backstop. Worth verifying; not researched.

### 4.2 Where agent-written code executes (conflict C1; ★6)

| Option | How | Security | Effort |
|---|---|---|---|
| **(i) Isolated aiur worker (recommended for the family MVP) [P]** | aiur and its agent CLIs run on a dedicated Railway service or VM that holds only: a **spend-limited, Game-Maker-only API key**; a GitHub App token for the private games repo only; and an endpoint into the production API, with no production database credentials. | The credentials sit next to untrusted code, but a leak costs at most the key's spend limit plus games-repo writes. The commit service still validates paths before merge. | Lowest. Works with aiur as it is today. |
| (ii) aiur loop in the worker, tool execution in Railway Sandboxes | Upstream aiur ticket: a remote-exec backend that sends file edits, shell and tests into a VM sandbox (A7's topology). | Best: nothing worth stealing inside the sandbox. | Needs aiur changes. |
| (iii) A whole aiur worker per job inside a VM sandbox | Spin up a VM per job holding the credentials. | Isolates households from each other. Credentials still sit with untrusted code. | Heavy: cold starts, tmux, CLIs. |

A **home worker** (outbound-only authenticated connection, no tailnet for the kids' devices) remains possible, and research recommends deferring it.

### 4.3 Game architecture (A4)

| | **A. Host-owned design document + feature modules + database override layer (recommended)** | B. Inspector over live objects (Godot/Unity style) | C. Entity-component system everywhere |
|---|---|---|---|
| Undo / natural-language batch edits | Exact (Immer patches on JSON); selectors over the document | Fragile; fails for objects not spawned | Good |
| Persistence, forks, overrides | Natural | Hardest (serializing back to source) | Needs a scene format anyway |
| Later-change cost for lighter agents | **Low** (narrow modules, conformance-checked) | Medium–high | Low–medium |
| Up-front cost | A **platform game template** | Low | High; most libraries are under 1.5k★ |

Rejected: each agent writes its own editor. v0.3 forbids it.

**Implication:** every generated game starts from a platform-owned **game template**: a design document, feature modules, SDK hooks, a test hook, and a conformance check (`gm-sdk check`). Each MVP genre also gets a **demo kit** (A9). This answers v0.3's open implementation question 9 ("templates internally?") with *yes*, pending ★10.

### 4.4 Storage and privacy (A7)

| | **S1. Private monorepo + opt-in "Publish source" (recommended)** | S2. Public repo for shared games + private repo for private games | S3. Repo per game |
|---|---|---|---|
| Honest Private toggle | ✓ | ✗ (history already public) | ✗ |
| Fits aiur (one daemon per repo) | ✓ | Two daemons | ✗ (hundreds) |
| Open-source story | A deliberate, scrubbed export | Automatic | Flip visibility |

### 4.5 Specialist design before coding (A1)

A deterministic router reads the brief and the request type and outputs the specialists to use, the reason and the budget. The proposed defaults:
- a new simple game gets 0–2 specialists;
- a new stateful or story game gets up to 4;
- a follow-up change uses `quick-change` with 0 specialists.

**How a new game's design runs [P]:**
- **One aiur "design" ticket per new game.** The specialists run as subagents in dependency order, each returning a short contract.
- **The synthesis step** produces the design manifest and implementation ticket bodies, with its token cost logged.
- **Verification after each step is deterministic:** the artifact exists, the verdict is valid, and Playwright evidence is kept.

---

## Part 5 — Where things belong

| Layer | Contents |
|---|---|
| **aiur** (reuse; file upstream tickets for gaps) | Job dispatch, worktrees, agent turns, account routing, CI/rework/PR automation, the post-Publish fold commit, raw usage recording, skill delivery, contract-versioning conventions (`aiur-contracts`). **Candidate upstream tickets:** a per-ticket spend cap; a usage/cost endpoint; a job-create API; a remote-execution (sandbox) backend; an "artifact was written" check; per-subagent token counts. |
| **Reusable packages** (Kevin-wide, not Game Maker-specific) | `iframe-bridge` (validated message-channel RPC with a schema allowlist), `command-manifest` (controls, selectors, transactions, Immer undo), **voice** (capture, STT/TTS provider seam, `SpokenText` = text + audio + word timings, captions, usage reporting; in TypeScript or as aiur's Elixir `voice_converse`, see group G). |
| **Game Maker-specific** | `@gm/sdk` (game side: hooks, state, test hook `window.__gm`, style presets, feel and balance physics), `@gm/host` (HUD, editor chrome, kid widgets, touch overlay), the override service, the authorization policy module, invitations and supervision, the commit service, release pointer and saves, analytics, the natural-language routing prompt and tools, the game template and genre demo kits, the `gm-*` skills. |
| **Game repo** (`games/<id>/` in the private monorepo) | Feature modules, design document, assets with a provenance manifest, tests, regression "promises", save-migration fixtures. |

**Custom skill backlog** (A1/A2/A3; each about 1.5–3k tokens, loaded only by tagged task type; never all at once):

| Priority | Skills |
|---|---|
| P0 | `gm-brief`, `gm-specialist-router`, `gm-design-synthesis`, `gm-implementer-contract`, `gm-editor-sdk`, `gm-run-and-observe` |
| P1 | `gm-quick-change`, `gm-playtest-triage`, `gm-feel`, `gm-level`, `gm-art-style`, `gm-gameplay`, `gm-child-ux` |
| P2 | `gm-story-brief`, `gm-narrative-dialogue`, `gm-audio`, `gm-hud-ui`, `gm-skill-evals` |

**Vendored third-party skills** are pinned at fixed commits with their licenses: `frontend-design`, adapted parts of the gamedev pack, and impeccable's audit steps. **Nothing fetches remote instructions at runtime.** A dialogue-heavy RPG build, the worst case, loads about 7k tokens of skills; loading everything would be over 20k.

---

## Part 6 — MVP versus later (updated)

| Capability | v0.3 status | v0.4 research position |
|---|---|---|
| Create / modify, play / edit, game index, auth + invites | MVP | Unchanged. Invitations and supervision are custom code on top of Better Auth. |
| Editing while builds run; database overrides | (new decision) | **MVP.** Core to the waiting experience; zero token cost. |
| Engine SDK foundation, standard HUD, game template | Core | **MVP.** The template and conformance check are prerequisites for lighter follow-up agents. |
| Genre demo kits | — | **Proposed MVP**, one per MVP genre. They provide variants, the waiting activity and editor teaching (★8). |
| Basic dictation | MVP | **Reopened (★3).** Adults: yes. Children: depends on the vendor/consent path. |
| Cloud saves, slots, previous-release migration | Baseline | **MVP slice:** autosave + N slots, optimistic-concurrency revisions, device lease, local outbox, lazy one-step migration with fixtures. |
| Draft / Publish / update badge / semver / changelog / rollback | Required, sequencing open | **MVP slice proposed:** immutable builds, a published pointer, a changelog assembled without a model call, a polled update badge, rollback as a new release. **Later:** multiplayer room upgrades, shared draft previews. |
| Achievements | Required, placement open | **MVP slice proposed:** manifest, award API, catalog, toast; nothing recorded in drafts. **Later:** friends' achievements, progress achievements. |
| Analytics | Required, placement open | **MVP slice proposed:** automatic platform events, an attempt/marker API, one creator dashboard. **Later:** admin cross-game views, comparing releases. |
| Bug button + repair loop | Required | **MVP:** a private bundle, deterministic triage, routing to editor controls first, a repair job with a failing "promise" test, 2 attempts, then escalation. |
| Automated testing | Required | **MVP:** L0 static, L1 deterministic smoke on every draft, L2 exploration and iPad profile before "ready to try" and Publish, L3 publish-only checks. Humans judge fun. |
| Drawing + paper photo | Direction approved | **Proposed MVP, local-only processing:** canvas, jscanify crop, EXIF stripped by re-encoding, rembg on our server. AI restyling later. |
| Read-along captions with word highlighting | Direction approved | Captions in MVP. Word highlighting depends on the TTS vendor path (★3); browser speech gives sentence-level highlighting as the fallback. |
| Multiplayer, controllers, voice chat, two-way agent voice, rewind | Deferred | Still deferred. MVP reserves the hooks: seeded RNG, fixed timestep, explicit logical state, input abstraction. |

---

## Part 7 — Question bank (start here)

Each question gives: **why it matters**, the **research recommendation** (state it, then ask "keep it or change it?"), options where useful, and its sources. ★ = blocks MVP planning. Groups B–I can use the batch fast lane.

### A. Blocking decisions (★, ask one at a time)

**★1. Who pays for agent work, and with what credentials?**
- *Why:* the subscription can't back the service (Part 2 #1).
- *Recommendation:* all Game Maker agent work runs on a **Kevin-paid Anthropic API key** that serves no other purpose and has a workspace spend limit. The subscription is only for Kevin's own development.
- *Follow-up:* may **adult** invitees later bring their own API key? (Recommendation: later, not MVP.) [A8 D1, A6]

**★2. Who is the legal parent-consenter for the niece and nephew?**
- *Why:* COPPA consent must come from a parent; an uncle-admin isn't automatically valid.
- *Recommendation:* each child's **parent** creates or approves the child account and holds the guardian role. Kevin is admin and maintainer and gets the activity view the parent allows.
- *Follow-up:* are both families' parents willing, and on what device? [A8 D2, A7]

**★3. Kids' voice in the MVP, given the vendor blocks.**
- *Why:* v0.3 decided on basic dictation. ElevenLabs, Kevin's intended vendor, bans under-18 apps without written approval. iPad has no verified on-device path.
- *Options:*
  - (a) MVP is picture-first and text-first for children, with dictation for adult accounts only.
  - (b) Apply for OpenAI Zero Data Retention approval and use OpenAI transcription and TTS for children.
  - (c) Apply for ElevenLabs written approval.
  - (d) A self-hosted open speech-recognition model on our own server: no vendor, but GPU or CPU cost, and it's unevaluated.
  - (e) Let children use the iPad's **own keyboard dictation**, an operating-system feature, not our integration. It needs counsel's view on whether that counts as our disclosure.
- *Recommendation:* start with **(a)**. Pursue **(b)** and a small **(d)** spike in parallel. Ask counsel about **(e)**, the cheapest path if it's acceptable.
- *Follow-up:* does losing voice for the 5-year-old at launch change the MVP's value enough to delay it? [A8 D3, A3, A6]

**★4. Legal review: when, and how much?**
- *Why:* COPPA operator status, who can consent, vendor disclosures and public child content are counsel questions (A8 §9).
- *Recommendation:* draft the three cheap documents now (a retention notice, a per-vendor consent flow, a one-page security program). Get counsel **before inviting any family beyond Kevin's own**.
- *Follow-up:* is a budget for counsel acceptable at all? [A8 D6]

**★5. How Game Maker and aiur divide the work.**
- *Recommendation:* the **A+C hybrid** (Part 4.1). aiur runs PR-shaped jobs; Game Maker owns accounts, the queue, budgets, clarify, previews and Publish.
- *Follow-up:* may Game Maker's needs be filed as **aiur tickets**: spend cap, cost endpoint, job-create API, remote-exec backend? [A6 D1/D3]

**★6. Where agent-written code runs (conflict C1).**
- *Recommendation:* **(i)**, an isolated aiur worker with a spend-limited single-purpose key and a games-repo-only token, for the family MVP. File **(ii)** (a sandbox exec backend) as the target design before inviting other families.
- *Options:* (ii) now, or (iii). [A7 D1, A6]

**★7. What "Private" means.**
- *Recommendation:*
  - *Private* = hidden from discovery + playable only by the owner and named invitees.
  - **All source is private by default** in a private monorepo.
  - Open source is an explicit per-game **"Publish source"** export, opt-in, needing a guardian's approval for children.
- *Follow-up:* should adult creators' games ever publish source automatically? [A7 D2/D3]

**★8. MVP content scope: which genres and art styles ship first?**
- *Why:* each MVP genre needs a demo kit and a tuned template. Each art style needs an SDK style preset.
- *Recommendation:*
  - **Three genres:** platformer, RPG (the origin story), and one simple UI or puzzle game.
  - **Art:** 8-bit, 16-bit, cartoon, cel-shaded and paper first.
  - **"32-bit"** splits into "Pocket 2D (GBA-ish)" and "PS1 3D", with PS1 3D later.
  - **Voxel** means the look only, not a Minecraft-style editable world.
  - **Clay** becomes an "experimental clay-ish" option, later.
- *Follow-up:* should the bit-number labels be replaced with picture names ("Classic pixels", "Chunky 3D")? [A2 D1/D2, A9]

**★9. A bounded research budget for measurements.**
- *Why:* every cost, quality and feel number above is an estimate.
- *Recommendation:* approve one combined spike budget:

  | Spike | Cost | Source |
  |---|---|---|
  | Model-tier benchmark | ≈ $150 API-equivalent, stop at $125 | A6 |
  | Skill A/B pilot | 18 runs, inside the same cap | A2/A1 |
  | Sandbox isolation test | ≈ $5 | A7 |
  | Screenshot-judge calibration | under $5 | A9 |
  | iPad/desktop device calibration session | Kevin's time | A3/A9 |
- *Follow-up:* may the kids take part in blind side-by-side play of variants? [A1 D1, A2 D4, A6 D5, A7, A9 D6]

**★10. Every game starts from a platform template.**
- *Why:* research recommends the host-owned design document plus feature modules (Part 4.3), and genre demo kits. This settles the open implementation half of v0.3 question 9.
- *Recommendation:* yes. The creation UX stays the structured flow; internally every build starts from the template and the genre kit.
- *Follow-up:* is a modest up-front template cost acceptable before the first real game? [A4 D5]

**★11. Spending limits and children's code requests.**
- *Why:* aiur has no spend caps. A new game costs about $20 and a feature about $3 (estimates).
- *Recommendation:*
  - 2 concurrent jobs per household.
  - A monthly platform ceiling Kevin names. Ask for a number; v0.3 #33 is still open.
  - A job over its reservation **pauses and asks the admin** rather than failing.
  - A supervised child's request for new code runs **automatically within the child's budget**. An approval toggle is available to the guardian.
- *Follow-up:* what should a child see when the budget is spent? Editing and playing stay free. [A6 D6, A4 D2]

**★12. The first real test session.**
- *Why:* the evidence lens. Everything so far rests on one successful RPG session.
- *Recommendation:* the first invited test is the nephew and niece only, each with a parent present, on their iPads. It uses the observation form from A9 §6.4. No other families until ★2 and ★4 are resolved.
- *Follow-up:* what single outcome from that session would make Kevin keep going, and what would make him change course?

### B. Editor overrides and editing (fast lane available)

| # | Question | Research recommendation | Source |
|---|---|---|---|
| B1 | Should a past "all enemies" edit also apply to enemies a *later* build adds ("sticky")? | No. It applies only to those that existed; predictable and easy to explain. | A4 D3 |
| B2 | When the builder and the creator changed the same value, who wins? | The creator, flagged, unless the job explicitly targeted that control. | A4 D3, A5 D10 |
| B3 | Publish: pin instantly and fold into source afterwards, or rebuild from folded source first? | Pin instantly, then a deterministic fold. | A4 D4 |
| B4 | Kids' dialogue and labels: into Git at the fold, or database-only even after Publish? | Into the **private** monorepo is fine; scrubbed again at "Publish source". | A4 D6 |
| B5 | How long are dropped edits kept? | 30 days. | A4 D7 |
| B6 | On rollback, are draft edits kept? | Yes. Rollback changes the published release, not the draft. | A5 D11 |
| B7 | Which HUD controls can never be turned off? | Pause, exit, bug report, mute/settings, safety/account controls. | A4 D1 |
| B8 | Which knobs do kids see by default? | A kid / advanced split; forgiveness settings grouped into one "Forgiving ↔ Tricky" slider. | A2 D3 |

### C. Releases, saves, achievements, analytics

| # | Question | Research recommendation | Source |
|---|---|---|---|
| C1 | Rollback numbering | A new, higher number ("2.0.0 restores 1.2.0"). | A5 D1 |
| C2 | Save slots | One rolling autosave + 3 manual slots; plus a checkpoint autosave? | A5 D2 |
| C3 | How long do old builds stay available to open tabs? | Current + 2 previous releases + anything newer than 14 days. | A5 D3 |
| C4 | Are achievements permanent? | Yes. Rewind, reload and rollback never remove them. | A5 D4 |
| C5 | What do forks copy? | The published release only; no awards, saves or analytics. | A5 D5, C5 |
| C6 | Achievements in drafts | "(test)" toasts, nothing recorded. | A5 D6 |
| C7 | Can a creator see a named child's play data if they aren't that child's guardian? | No. Aggregates only, at least 3 players per cell. | A5 D7 |
| C8 | Analytics retention | Raw events 90 days, then rollups; adults may opt out. | A5 D8, A8 |
| C9 | Rewind (later): does it count toward "stuck" analytics, and can creators turn it off per game? | Count it as a signal; allow a per-game off switch. | A5 D9 |

### D. Accounts, sharing, forks

| # | Question | Research recommendation | Source |
|---|---|---|---|
| D1 | Can player-only accounts fork? | Yes, as a token-free copy they can't edit until upgraded to creator. | A7 D4 |
| D2 | Does access to a private game include the right to fork it? | No. Forking needs the owner's explicit permission. | A7 D4 |
| D3 | Can child accounts invite anyone? | No. "Invite a friend" becomes a request the guardian approves. | A7 D5 |
| D4 | What can an admin see about adult invitees? | Activity summary only, never parental-style detail. | A7 D6 |
| D5 | Accountless room guests? | Yes, for multiplayer rooms only: an owner-issued code, no saves, no forks, no voice. | A7 D7 |
| D6 | Adults bring their own GitHub? | Later. It would bring back a repo per game. | v0.3 §9.5, A7 |

### E. Creation flow, waiting, QA

| # | Question | Research recommendation | Source |
|---|---|---|---|
| E1 | How much narrowing? | At most 2–3 picture questions, plus a picture "plan card" the child taps 👍 or "change". Test with the family. | A9 D4 |
| E2 | Variants | Presets of the genre demo kit; agent-built variants only for truly new mechanics. | A9 |
| E3 | First-build waiting activities | Draw characters (they go into the game), tune the demo kit with the real editor, pick music, watch a picture progress timeline with real screenshots. | A9 |
| E4 | iPad notifications | A parent-assisted "Add to Home Screen" step on first run; email or SMS to the parent as fallback; no child names on the lock screen. | A9 D3 |
| E5 | Can kids play drafts that pass the smoke tests while the robot still has open findings? | Yes, labelled "the robot found something odd". | A9 D5 |
| E6 | Must the creator beat the game before others can play it, as in Mario Maker? | Yes for levels shared with others; the parent may do it for the 5-year-old. | A9 D7 |
| E7 | Repair limits | 2 automatic attempts at about ⅓ of a feature budget, then escalate to Kevin with a friendly message. | A9 D1 |
| E8 | May bug screenshots and transcripts go to the model provider for repair? | Only the downscaled screenshot and the child's words, under the Anthropic API terms, with 30-day retention. Never public GitHub. | A9 D2, A8 |

### F. Design quality, accessibility, content

| # | Question | Research recommendation | Source |
|---|---|---|---|
| F1 | Touch targets | About 64 px for main child play and HUD controls; 44 px elsewhere. Verify on the device. | A3 D1 |
| F2 | Age profiles | Per-player profiles ("5–7", "8–12", "all ages") that tighten text length and pacing. | A3 D2 |
| F3 | Read-aloud default | Automatic for the youngest profile; tap-to-hear for the others. | A3 D3 |
| F4 | Dialogue format | SDK JSON graph only in MVP; inkjs maybe later. | A3 D4 |
| F5 | Free speech fallback | Accept browser speech with sentence-level highlighting when offline or over budget. | A3 D5 |
| F6 | ACE-Step music generation | Drop it from MVP; Tone.js composition plus VCSL samples only. | A3 D6 |
| F7 | AI-generated art in MVP | No. Asset packs plus local cleanup of the child's own drawings. | A8 D4 |
| F8 | Children's recorded voices | Private games only. Publishing needs a parent's opt-in; never voice cloning. | A8 D5 |
| F9 | Google | Drop it from everything children can reach. Kevin's own offline research use only, if counsel agrees. | A8 D7 |
| F10 | Paid asset packs (KayKit "Extra") | Free CC0 assets for MVP; revisit paid packs later. | A2 D5 |
| F11 | Quaternius license conflict (C4) | Apply the stricter terms per pack until clarified. | A2 D6, A8 |

### G. Orchestration and aiur

| # | Question | Research recommendation | Source |
|---|---|---|---|
| G1 | Specialists per new game | 0–2 for simple games, up to 4 for story-heavy games. Creators see a friendly "who's helping" card, but don't choose. | A1 D2 |
| G2 | Where synthesis lives | Inside one aiur "design" ticket; split into child tickets only for large games. | A1 D3 |
| G3 | Human checkpoints before building | One: the plan card. | A1 D4 |
| G4 | Material borrowed from Claude-Code-Game-Studios | Rewrite it rather than copy templates with MIT notices. | A1 D5 |
| G5 | Repository topology | One private games monorepo with opaque game IDs (C9). | A6 D2, A7 |
| G6 | Two-way voice host | Build a TypeScript host on aiur's wire protocol, or wait for the Elixir `voice_converse` package? Recommendation: decide when two-way voice is scheduled; keep the protocol shared. | A6 D4 |

### H. Multiplayer (deferred, architecture-shaping)

| # | Question | Research recommendation | Source |
|---|---|---|---|
| H1 | Game authority | The owner's browser runs the game; a generic platform room enforces roles, pause, spectator view and version pinning. | A7 D9 |
| H2 | When the owner disconnects | End the session and save to the owner (no host migration at first). | A7 D8 |
| H3 | Sandbox vendor if egress must be blocked | Switch to E2B behind the existing sandbox interface. | A7 D1 |

### I. Operations

| # | Question | Research recommendation | Source |
|---|---|---|---|
| I1 | Home worker | Defer it; hosted first. | A7 D10 |
| I2 | Frontend hosting (v0.2 had Netlify) | Serve the static UI and game bundles from Railway or a CDN in the same project; Netlify only if a measured need appears. | A7 |

---

## Part 8 — Answered by research; don't ask again

Don't re-ask these unless Kevin brings new information:
- Whether the Claude subscription can run the service: **no**.
- Whether Google, fal.ai or ElevenLabs can be used freely with children: **no**.
- Whether GitHub can enforce folder ownership: **no**; our commit service does.
- Whether a Railway service isolates untrusted code: **no**.
- Whether Colyseus has prediction and interpolation: **yes**, version 0.18.
- Whether PostHog fits: **no**.
- Whether CI frame rates predict iPad performance: **no**.
- Whether an AI screenshot judge can gate quality on its own: **no**.
- Whether a seed plus inputs alone replays a bug: **no**; a state snapshot is also needed.
- Whether Phaser 4 is stable: **yes** (4.2.1).
- Whether smplr is acceptable: **no**.
- Whether Yarn Spinner has a JS runtime: **no**.

Also keep v0.3 §14.3's "do not repeat" list in force.

---

## Part 9 — Research index

All reports are in `docs/research/v0.3/` on the `research` branch. Sources were accessed 2026-10-21. Every report marks its unverified items.

| ID | Report | Spikes / areas | Status | Key unverified items |
|---|---|---|---|---|
| A1 | `A1-game-studios-mining.md` | §11.3 repo mining; file-level reuse map at `05ad7c8` | Complete | The repo's blind-ranking claim; token costs estimated from file sizes |
| A2 | `A2-expertise-feel-levels-art-gameplay.md` | S04, S06, S07, S08; art calibration | Complete | Lospec terms; Celeste jump-buffer value; book material recalled from memory |
| A3 | `A3-expertise-ui-story-audio-access.md` | S02, S03, S05, S09, S12, S13; read-along | Complete | Current iPadOS speech events; the 64 px figure |
| A4 | `A4-engine-sdk-editor.md` | R01, R02, R13, S01, S11; overrides | Complete | iPad gamepad/fullscreen in iframes; audio unlock; orientation lock |
| A5 | `A5-releases-saves-achievements-analytics-rewind.md` | R08, R09, R10, R11, R14 | Complete | Railway SSE; fetch-keepalive limit; Rapier handles after restore; snapshot sizes |
| A6 | `A6-aiur-integration-costs-voice.md` | R03, R06, R15 (aiur HEAD `ad084b1f`) | Complete | Railway support for tmux/bubblewrap; voice prices; `voice_converse` license |
| A7 | `A7-infra-auth-git-multiplayer.md` | R04, R05, R07, R12 | Complete | Railway hypervisor; sandbox egress docs; GitHub plan matrix for push rulesets |
| A8 | `A8-vendor-legal-assets.md` | R16, R19 (research, not legal advice) | Complete | OpenAI usage-policy page (blocked); full *Tetris v. Xio* opinion; state laws; prices |
| A9 | `A9-qa-playtest-creation-guidance.md` | S10, R17, R18; bug loop | Complete | `performance.now` under the Playwright clock; Railway GPU; all time estimates |
| — | `2026-10-21-bestgithubrepos-scan.md` | OpenPencil + r/BestGitHubRepos scan | Complete, awaiting Kevin | Caveman savings; OpenSpec fit |

**Not yet produced** (planned for after Kevin's answers): measured benchmarks, a device calibration, a sandbox isolation test, and the MVP requirements plan (`ce-plan`).

---

## Change log

### v0.4 research companion — October 21, 2026 (new)

| Change | Why |
|---|---|
| Added the "edit while builds run; overrides in the database" decision and its design | Kevin made it explicit after v0.3: playing and editing are the waiting activities, and edits must survive builds. |
| Ran nine research agents (A1–A9) covering all 13 expertise areas, all 19 spikes and the repo mining | Required by v0.3's research handoff. |
| Recorded that the subscription can't back the service, and the vendor child-use blocks | Primary-source verification (A8). |
| Reopened MVP dictation for children | ElevenLabs and Google blocks, and no verified iPad on-device path. |
| Proposed the A+C integration shape, an isolated aiur worker, the private monorepo with "Publish source", host-authoritative multiplayer, and the template-based game architecture | Research recommendations with tradeoffs. Kevin decides. |
| Reconciled conflicts C1–C9 | Synthesis across the reports. |
| Produced a new question bank: 12 ★ blocking questions plus grouped questions with recommended defaults and a batch fast lane | The post-research brainstorm. Kevin wants progress through the whole set. |
