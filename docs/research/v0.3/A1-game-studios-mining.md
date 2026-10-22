# A1 — Mining Claude-Code-Game-Studios for aiur's specialist design→code workflow

**Spike:** spec v0.3 §11.3 (with §7.1–7.3, §11.2, §15). **Agent:** A1, research wave v0.3. **Date:** 2026-10-21.
**Bottom line:** Do not adopt the framework. Reuse about a dozen *patterns* and a handful of *templates*, rewritten for TypeScript, the browser, and children. Discard the 49-agent hierarchy, the gates, the sprint machinery, and the hooks. The most valuable single finding is the repository's own (unverified) measurement: the lightest process produced the better game.

---

## 1. Requirement investigated

§11.3 asks for a file-level reuse map of `Donchitos/Claude-Code-Game-Studios` (CCGS). It covers agent roles, skills, planning, context management, coordination, quality gates, playtesting, and design→code artifacts. It also asks the seven §11.3 questions, plus an adaptation plan, a skill backlog, and rejected patterns. It must not replace aiur.

## 2. Primary sources and versions (all accessed 2026-10-21)

| Item | Value | How obtained |
|---|---|---|
| Repo | https://github.com/Donchitos/Claude-Code-Game-Studios | `gh api` |
| Commit inspected | `05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418` (2026-10-19), tag `v1.2.0` | `git clone --depth 1` into scratchpad `ccgs/` |
| License | MIT, "Copyright (c) 2026 Donchitos" (`LICENSE`) | file read |
| Popularity / maintenance | 27,065 stars, 3,841 forks, 67 open issues, last push 2026-10-19, created 2026-02-12. **One contributor** (Donchitos, 43 commits on `main`). Releases v1.1.2 (09-29), v1.1.3 (10-08), v1.2.0 (10-19). | `gh api` |
| Size | 638 files. 50 agents in `.claude/agents/` (README says 49). 75 skill dirs (README says 72, catalog says 74). 28 director-gate files. 71 templates. 18 hooks. 35 helper scripts. 14 path-scoped rules. `studio-tests/` behavioral specs. | `ls`/`find` |
| aiur (for mapping only) | `/home/everdred/github/everdred/aiur` `SPEC.md` §1–3, `AGENTS.md` (tracker labels, CE skills), `docs/spec/domain-and-workflow.md` (`routing` by `complexity:N`), `.agents/skills/` (aiur-build, aiur-agent, ce-*) | local read |

The prior scan `docs/research/2026-10-21-bestgithubrepos-scan.md` and the toolbox catalog do **not** mention CCGS, so there is no earlier assessment to reconcile. **Rules followed:** no CCGS script, hook, or skill was executed. Star count is recorded, but per §15.3 it is not used as evidence of quality.

## 3. What the repository actually is

CCGS is a **Claude Code project template**: a `CLAUDE.md`, `.claude/agents|skills|hooks|rules|docs`, and empty `design/`, `production/`, and `src/` trees. Its contents are almost entirely prose prompts plus bash/awk/Python helpers. It has **no game code, no example GDDs, and no shipped games** (README: games "deliberately not shipped here"). It assumes Godot, Unity, or Unreal (`CLAUDE.md` "[CHOOSE: Godot 4 / Unity / Unreal Engine 5]"). Its runtime is one interactive Claude Code session with subagents, and the human is asked at every step ("May I write this to [filepath]?").

Key structural facts:
- **Hierarchy** (`.claude/docs/agent-roster.md`, `coordination-rules.md`): directors (creative/technical/producer, pinned to `opus`) → leads → specialists → 15 engine specialists. Vertical delegation. Conflicts escalate to the shared parent, otherwise to the creative or technical director.
- **Process knob** (`project.yaml`, `config-resolution.md` 19 KB, `effects-map.md` 140 KB): a `modes.rigor` setting of minimal/standard/full fans out to six knobs (`review_mode`, `workflow`, `docs.density`, `qa.level`, `story_granularity`, `team.size`). **Default is `minimal`**.
- **Evidence claim** (README §"Does it produce games, or documents?"): from one brief, `minimal` wrote 1 doc before code (0 min) and `standard` wrote 30 docs (58 min). "Two blind reviewers and a human playtest then ranked the `standard` build **last**." **Unverified:** the games and raw data are not published, and the table shows two rows although the text says four games.
- **Tests of the framework** (`studio-tests/`, `skills/skill-test/SKILL.md` Phase 2B): behavioral specs are judged by an LLM *reading the instructions* ("A metric is PASS when the skill's written instructions clearly satisfy the criterion"). These are prompt-compliance checks, **not executed output-quality evaluations**.

## 4. Answers to the §11.3 questions

**Q1. How are design specialists selected?** There are two mechanisms, and only one of them is content-driven.
1. *Static roster with a size dial.* Each `team-*` skill names a fixed pipeline. `team.size` (`individual`/`small`/`studio`) chooses how much of it actually spawns. At the default it **collapses to one agent**: "`team-release` names ten and runs one, `team-narrative` names six … and runs `writer` alone" (`skills/team-level/SKILL.md`). The skill must announce the active set and list who was not spawned.
2. *Content-signal routing table.* `skills/design-review/SKILL.md` Phase 3b maps document signals to specialists. For example, costs/drops → economy-designer; level layout → level-designer; UI/HUD → ux-designer + ui-programmer; dialogue/quests → narrative-director; "Animation, feel, timing, juice" → gameplay-programmer. game-designer is always included for gameplay rules. **This table is the most reusable selection pattern** and matches §7.1's "dynamic" requirement.

**Q2. What keeps their work coherent?**
- Dependency-ordered phases where upstream output becomes a binding constraint. In `team-level`, art direction is set in Step 1 and passed to the level designer as "explicit constraints. Layout decisions happen within the visual direction, not before it."
- One orchestrator compiles the final document itself ("do not re-spawn `level-designer` and re-send all outputs").
- A senior synthesis step (creative-director in `design-review`) that must *surface* specialist disagreements and not silently pick one.
- Shared anchors: game pillars (`templates/game-pillars.md`) or, at minimal, the one-page brief. Plus a cross-document **entity registry** (`design/registry/entities.yaml`) with one owning `source:` and a `referenced_by` list per fact.
- A return contract that limits what flows back: path + ≤5 decision bullets + BLOCKED/CONCERNS lines.

**Q3. What is handed to the implementation agent?** A **story file** (`.claude/docs/templates/story.md`) and a brief assembled by `dev-story` Phase 5:
- objective, acceptance criteria, Out of Scope (neighbouring stories), and planned Files;
- the ADR decision summary **inline** ("Never the ADR path"), plus control-manifest required/forbidden/guardrail rules for the story's layer;
- QA test cases (Given/When/Then for logic; Setup/Verify/Pass for visual/UI) and the test-evidence path by story type;
- explicit boundaries: no files outside scope, no architectural choice the ADR doesn't cover, and "never a value special-cased so a test passes";
- "say what the brief leaves out", so the implementer does not go looking for missing inputs.

Stories are typed Logic / Integration / Visual-Feel / UI / Config-Data. Config-Data stories need no agent: the values are shown from→to and edited directly.

**Q4. How do playtest results become revisions?** The playtest is human. `skills/playtest-report` turns notes into a fixed template and sorts findings into four buckets: design change → `/propagate-design-change`; balance → `/balance-check`; bug → `/bug-report`; polish → backlog. Defects ("plainly breaks") must not be filed as pain points ("plays badly"). The optional `CD-PLAYTEST` gate checks the result against the pillars and "the specific hypothesis being tested" for *pillar drift*. For automated observation, `docs/run-and-observe.md` has every player-visible story launched straight into the affected scene, screenshotted, the PNG read by the model, and the PNG retained with a hash stamp of the changed files. **There is no automated play-agent loop.** Feel is explicitly DEFERRED to a human ("a still cannot show it").

**Q5. What avoids coordination overhead?** The default `rigor: minimal` (1-page brief, no GDDs, solo review, one agent). `review_mode` lean/solo removes most gates. Briefs are distilled ("do not dump context … an agent handed a path re-reads the whole file"). Return contracts are short. The orchestrator compiles instead of re-spawning. Large docs are read by section (`validate-read.sh` refuses whole-file reads over 40 KB). Deterministic helper scripts "emit observations, never verdicts". `quick-design` handles changes under a week without re-planning. **But** the framework's own control surface is large overhead in itself: about 4.5k tokens always loaded, agent definitions of 1.2–5k tokens each with about 800 tokens of repeated collaboration boilerplate, and skill bodies of 1.5–6k tokens each.

**Q6. Which assumptions are tied to excluded engines or tools?**
- 15 engine specialists and `docs/engine-reference/{godot,unity,unreal}`.
- Godot/Unity/Unreal launch and capture recipes in `run-and-observe.md`; test naming for gdUnit4, NUnit, and Unreal Automation in `rules/test-standards.md`; Godot signals, ScriptableObjects, and Blueprints in the rules.
- `.gdignore` files and `scene-files.md`.
- Claude Code–specific mechanics: `AskUserQuestion`, `Agent`, frontmatter `model:`/`memory:`, hooks in `settings.json`, `${CLAUDE_SKILL_DIR}` shell injection, `statusline.sh`.
- PC/console framing: Steam and console certification templates, an 18px text minimum at 1080p, Xbox Adaptive Controller.
- One claim conflicts directly with our web-first stack: `skills/prototype/references/3-choose-path.md` says "browsers introduce 50–133ms of rendering variance … HTML prototypes [are] fundamentally unreliable for action games, platformers". **No source is cited, and it is unverified.** The S06/feel research agent should test it in Phaser/Three, not inherit it.

**Q7. What remains valuable after removing the orchestration layer?**
- the routing table;
- the dependency-ordered fan-out with constraint passing;
- the return contract and "verify the artifact, not the transcript";
- the NOT ASSESSED verdict and strictest-wins escalation;
- the one-page game brief and the "reference game + the 10% the MVP keeps" field;
- the story/implementer brief shape;
- quick-design deltas;
- run-and-observe with retained screenshots;
- playtest four-bucket triage;
- the entity registry;
- data-driven tunables;
- regression tests watched failing first;
- domain checklists (MDA/SDT/flow, pacing charts, art bible, WCAG-cited findings);
- the measured lesson that more documents do not make better games.

## 5. File-level reuse map (all paths @ `05ad7c8`)

Legend: **R** = reuse near-verbatim (MIT notice required); **A** = adapt (rewrite, credit as inspiration); **X** = reject. aiur mapping uses aiur's actual model: tracker ticket → per-issue workspace → coding agent with an in-repo prompt template, `complexity:N` → backend routing, vendored skills, and aiur-build planning packs.

| # | Path | Purpose | Rec. | Engine/tool assumptions | aiur mapping | Custom work | Validation |
|---|---|---|---|---|---|---|---|
| 1 | `.claude/skills/design-review/SKILL.md` §Phase 3b | Signal→specialist routing table, adversarial prompt, senior synthesis, disagreement surfacing | **A** | Engine-specialist row; Claude `Agent` tool | A deterministic service step classifies the game brief or change request and picks 0–4 specialist tasks (in-session subagents of one "design" ticket, or child tickets when large) | Rewrite the table for S01–S13 and genre. Add cost caps. Emit JSON | Replay 20 historical/synthetic requests and compare routing against Kevin's hand labels |
| 2 | `.claude/skills/team-level/SKILL.md` (pattern also in `team-narrative`, `team-ui`) | Phased fan-out: direction (parallel) → layout → systems → art+a11y (parallel) → QA; orchestrator compiles | **A** | AskUserQuestion between phases; `production/` paths | Shape of the coordinator/synthesis step in §7.1. Phases become barriers in the aiur-build dependency graph, or steps in one design agent | Replace human gates with automatic checks plus *one* creator-facing narrowing checkpoint (§5.4) | A/B in §9 |
| 3 | `.claude/docs/error-recovery-protocol.md` (Trigger 0) | "A named artifact that is not on disk is a failed phase"; resume, don't re-spawn | **A** | — | A deterministic check in the Game Maker service after each agent step. Ties to aiur's resume-session capability (SPEC §2.1) | Small | Unit test: an agent returning prose without the file is marked failed |
| 4 | `.claude/docs/director-gates.md` (Standard Verdict Format, escalation) | APPROVE/CONCERNS/REJECT + **NOT ASSESSED**; verdict token on the first line; strictest wins | **A** | — | Machine-readable critique result on every specialist/critic output, aggregated by the service | JSON schema | Fixture tests of the aggregation |
| 5 | `.claude/docs/templates/game-brief.md` | One-page brief: pitch, core loop, goal/fail, MVP ≤7, out of scope, build order, reference game + kept 10% | **R/A** | None | Canonical output of the §5.4 narrowing step. The root design artifact attached to the aiur ticket | Child-friendly field wording. Add art-style/HUD/editor-control fields | Kevin + kids review 5 generated briefs |
| 6 | `.claude/docs/templates/story.md`; `.claude/skills/dev-story/SKILL.md` Phase 4–6; `dev-story/CONTRACT.md` | Implementer contract and brief rules; type-based routing | **A** | ADR/TR registry, engine specialists, engine parse checks | aiur ticket body template for implementation tickets. Story type → `complexity:N` / model | Remove the TR/ADR chain. Add §7.2 deliverables (editor declarations, save schema, migrations, SDK use) | Count implementer clarification questions and out-of-scope edits |
| 7 | `.claude/skills/quick-design/SKILL.md`; `templates/quick-design-{change,tuning,new-system}.md` | Small-change path: classify Tuning/Tweak/Addition/New-small-system; quote the current rule, state the delta, add a no-regression AC | **A** | GDD paths | Default path for follow-up requests (§7.1 "reuse existing design context") | Bind to the game manifest instead of GDDs | Check that small requests never trigger full re-planning |
| 8 | `.claude/docs/run-and-observe.md` | Launch into the scene, capture, model reads the PNG, retain with hash stamp; `Run result: OBSERVED / NOT VERIFIED / N/A` | **A** | Godot/Unity/Unreal CLI | Playwright desktop + phone profiles (§7.3), deep-linking through the controlled debug adapter (§7.2) | Build the Playwright harness. Scene deep-link contract | Seeded visual bugs (clipped text, off-screen HUD) must be caught |
| 9 | `.claude/skills/playtest-report/SKILL.md` | Report template + four-bucket routing; bug vs pain-point rule | **A** | Human tester; PC/console fields | Output schema for the bug button (§5.7), playtest agents, and kid sessions. Buckets become aiur ticket kinds | Low-reading capture (voice/emoji) for kids | Route 30 sample notes and measure agreement with Kevin |
| 10 | `.claude/docs/director-gates/cd-playtest.md` | "Pillar drift" check against a stated hypothesis | **A** | — | Critic prompt run after a playtest, before revision tickets | Small | Spot-check |
| 11 | `design/registry/entities.yaml`; `.claude/skills/consistency-check/SKILL.md` | Cross-doc fact registry: owner `source:`, `referenced_by`, deprecate-never-delete | **A** | YAML + grep | Becomes part of a per-game **design manifest** (entities, tunables, quest flags) that also feeds editor declarations and save schema (S11/S12) | Design the JSON schema with the SDK spike | Inject a contradiction and check that synthesis flags it |
| 12 | `.claude/rules/gameplay-code.md`, `data-files.md`, `ui-code.md` | Tunables in data files, delta time, event bus, no singletons, explicit state-machine tables, versioned data schemas | **A** | Godot/C#/C++ examples | Coding rules in the game-workspace prompt template. **Tunables-as-data directly enables comprehensive editor controls (§5.6)** | Rewrite for TS + Phaser 4/Three.js | Lint/grep + review checklist |
| 13 | `.claude/rules/test-standards.md` | AAA tests, deterministic, "watch the regression test fail before you trust it" | **R/A** | gdUnit4/NUnit/Unreal naming | Matches aiur `AGENTS.md` "Tests must fail without the production change" | Vitest/Playwright naming | Already an aiur norm |
| 14 | `.claude/agents/game-designer.md` (Key Responsibilities → Design Document Standard) | Nested loops (30s/5–15 min/session), MDA, SDT, flow, sawtooth difficulty, feedback ≤0.5s, failure cost ∝ frequency, feel/curve/gate knobs, 8-section GDD | **A** | None | Body of an S04 skill, loaded only when gameplay is in scope | Remove economy/monetization/Bartle-PvP. Add child framing | §9 rubric |
| 15 | `.claude/agents/level-designer.md`; `templates/level-design-document.md`; `templates/difficulty-curve.md`; `skills/balance-check/SKILL.md` | Level doc standard, pacing chart, onboarding ramp, mechanic introduction in isolation, boundary-value formula checks, degenerate strategies | **A** | Combat/RPG lean | S07 skill + automated checks (unwinnable/softlock tests in Playwright) | Platformer/puzzle variants | Seeded unwinnable level must be flagged |
| 16 | `.claude/agents/art-director.md`; `templates/art-bible.md`; `skills/art-bible/`; `skills/asset-spec/SKILL.md` | 9-section art bible; per-asset description + AI-generation prompt + cited governing rules; asset naming | **A** | Poly/texture budgets; Midjourney/SD | S08 style brief per game, consumed by asset selection/generation | Map onto Game Maker art options (§5.3) and asset provenance (§7.2) | Consistency rubric over generated sets |
| 17 | `.claude/agents/accessibility-specialist.md`; `templates/accessibility-requirements.md`; `guidance/accessibility-requirements-guide.md` | WCAG-cited findings table, BLOCKING/ADVISORY, NOT ASSESSED ≠ pass; visual/audio/motor/cognitive lists | **A** | PC/console, adult reading | S09 base checklist | **Must add** low-reading, read-along, touch-first, child cognitive load — absent here | Run on the 3 representative games |
| 18 | `templates/hud-design.md`; `guidance/hud-design-guide.md` (35 KB); `templates/interaction-pattern-library.md` + guides | HUD information inventory, zones, states, visual budget, tuning knobs, ACs | **A** | Console/PC | Input to the Standard Game Maker HUD (§5.11) and S02 | Extract a short rubric (the guides are too long to load) | UI rubric review |
| 19 | `templates/narrative-character-sheet.md`; `agents/writer.md`, `narrative-director.md`; `skills/team-narrative` (ND-CONSISTENCY always on) | Voice profile, dialogue state dependencies, topics avoided; narrative consistency check | **A** | Lore-heavy RPG | S03/S12/S13 skills, conditionally routed | Short-line, spoken-delivery, caption rules | Continuity check after an update |
| 20 | `templates/sound-bible.md`; `agents/audio-director.md`, `sound-designer.md` | Audio pillars, mix buses, feedback priority | **A (structure only)** | Middleware | S05 brief format | Most S05 work is new | — |
| 21 | `skills/prototype/references/3-choose-path.md`, `SKILL.md` constraints | Genre→prototype path; ≤1 day; "3 PIVOTs → force KILL"; never refactor prototype into production; build 2–3 variants | **A partly / X partly** | Engine path; itch.io/Reddit distribution | Variant generation for the §5.4 narrowing step | Drop the browser-latency claim and public distribution (children's privacy) | — |
| 22 | `.claude/docs/context-management.md` | "The file is the memory"; overwrite-only checkpoint region (<25 lines); section-by-section writing; scripts emit observations not verdicts | **A** | Claude Code compaction hooks | Compare with aiur's Agent Workpad. Adopt "observations, not verdicts" for deterministic helpers | Small | — |
| 23 | `.claude/docs/model-tiers.md` | Haiku = lookup/format; Sonnet = authoring; Opus = multi-doc synthesis, high-stakes verdicts | **A** | Claude Code `model:` semantics | Map to aiur `routing` by `complexity:N` | Kevin's model map (§8.1) | Cost tracking from aiur |
| 24 | `studio-tests/templates/agent-test-spec.md`, `quality-rubric.md`, `agents/leads/level-designer.md` | Scenario specs: in-domain, out-of-domain redirect, adversarial review, conflict escalation, context-use | **A (format)** | Static LLM judging | Format for our skill evals, upgraded to **execute** the skill and grade outputs | Eval runner | — |
| 25 | `README.md` §"Does it produce games" | Lean-beats-heavy measurement | Evidence (unverified) | — | Supports default-minimal specialist use | Replicate cheaply (§9) | — |
| 26 | `.claude/hooks/*`, `settings.json`, `statusline.sh`, `hooks/yaml-helper.sh` (95 KB), `scripts/*` | Harness guards, config resolution, registries | **X** | Claude Code + bash/Python | aiur owns workflow/Git. `update-check.sh` calls `api.github.com` at session start, so do not vendor it into game workspaces | — | — |
| 27 | 15 engine agents, `docs/engine-reference/*` | Post-cutoff engine API notes | **X (content) / A (idea)** | Godot/Unity/Unreal | Same idea for pinned Phaser 4 / Three.js / SDK version notes | Write our own | — |
| 28 | Directors/producer, `gate-check`, sprint/epic/milestone/retro/estimate, live-ops, community, release, localization, certification, security/anti-cheat skills | Studio management | **X** | — | Duplicates aiur or is out of scope | — | — |

## 6. Mapping to the 13 expertise areas (S01–S13)

| Area | CCGS material worth mining | Coverage | Gap for the S-agent |
|---|---|---|---|
| S01 Software eng. | #6, #12, #13, `docs/coding-standards.md`, `skills/code-review` | Medium | TS/modularity; aiur/CE already strong |
| S02 Visual/UI | #18, `agents/ux-designer.md`, `skills/ux-review` | Medium (console-centric) | All-ages platform UI, creator vs player views |
| S03 Storytelling | `agents/narrative-director.md`, pillars template | Low–medium | Preserving the child's own idea |
| S04 Gameplay | #14, `agents/systems-designer.md` | **High** | Genre checklists for kid-scale games |
| S05 Audio | #20 | Low | Nearly all new |
| S06 Game feel | Only scattered mentions (coyote time ×1, input buffer ×1, hit-stop ×2, screen shake ×5, `team-polish` "add juice") | **Very low** | **Build from other sources.** Do not inherit the browser-latency claim |
| S07 Levels/balance | #15 | **High** | Automated unwinnable/boredom checks |
| S08 Art direction | #16 | Medium–high | Non-realistic style lock, asset reuse |
| S09 Accessibility (children) | #17 | Medium for adults, **none for children** | Low-reading, read-along, touch |
| S10 Automated QA | #8, #9, `skills/qa-plan`, `regression-suite`, `smoke-check`, `test-evidence-review` | Medium (process, not harness) | Playwright harness, replay, saves |
| S11 Extensible arch. | #11, #12, #7 | Medium | SDK, editor declarations, migrations |
| S12 Narrative design | #11 (registry), #19 | Medium | Quest-state model tied to saves |
| S13 Dialogue | `templates/narrative-character-sheet.md` voice profile, `agents/writer.md` | Low–medium | Spoken delivery + captions |

## 7. Adaptation plan for aiur (no aiur replacement)

1. **Service-side router (deterministic first, §3.2).** A Game Maker service step reads the narrowed brief (#5) plus the request type. It uses a routing table (#1) to emit `{specialists:[…], reason, budget}`. Defaults: new simple game → 0–2 specialists; new stateful/narrative game → up to 4; small change → `quick-change` (#7) with **zero** specialists.
2. **One aiur "design" ticket per new game.** Its agent runs the chosen specialists as subagents in dependency order (#2), each with a distilled brief and a return contract. It then performs synthesis itself, which resolves §7.1 contradictions (phone controls, perf budgets, quest/mechanic conflicts). The synthesis output is the **design manifest** (#5 + #11 + tunables) and a set of implementation ticket bodies (#6). Use aiur-build-style dependency edges only when the game is large enough to justify parallel implementation tickets.
3. **Implementation tickets** use the #6 contract extended with §7.2 deliverables, routed by `complexity:N`.
4. **Deterministic verification after each step:** artifact exists (#3), verdict JSON valid (#4), Playwright run-and-observe evidence retained (#8). A failed build never overwrites the published release (§7.3).
5. **Playtest/bug loop:** bug-button and playtest outputs go through the four-bucket triage (#9). "Design" bucket → quick-change ticket against the manifest. "Bug" → repair ticket. "Balance" → tunable edit (no agent if Config/Data, mirroring `dev-story` Phase 4).
6. **Make the synthesis cost visible** (§7.1): log tokens per specialist and for synthesis through aiur's existing cost tracking.

## 8. Curated skill backlog (custom, `gm-` prefix; each loads only when routed)

| Priority | Skill | Seeds (#) | Notes |
|---|---|---|---|
| P0 | `gm-brief` (narrowing → one-page brief) | 5, 21 | Kid-readable variants |
| P0 | `gm-specialist-router` (table + budget) | 1, 23 | Mostly deterministic code; prompt only for ambiguous cases |
| P0 | `gm-design-synthesis` (coordinator, contradiction log, manifest) | 2, 4, 11 | Visible token cost |
| P0 | `gm-implementer-contract` | 6, 12, 13 | Includes editor/save/SDK deliverables |
| P0 | `gm-run-and-observe` (Playwright desktop/phone) | 8 | Needs a harness, not just a prompt |
| P1 | `gm-quick-change` | 7 | The default for follow-ups |
| P1 | `gm-playtest-triage` | 9, 10 | Also used by the bug button |
| P1 | `gm-gameplay` (S04), `gm-levels-balance` (S07), `gm-art-bible` (S08) | 14, 15, 16 | Priority areas per §11.2 |
| P1 | `gm-feel` (S06) | — | **New;** CCGS contributes almost nothing |
| P1 | `gm-a11y-kids` (S09) | 17 | Child layer is new |
| P2 | `gm-narrative` (S03/S12/S13 combined, distinct outputs) | 19 | Routed only for story games |
| P2 | `gm-hud-ui` (S02), `gm-audio` (S05) | 18, 20 | |
| P2 | `gm-skill-evals` (executed scenario specs) | 24 | Supports §11.2 "evaluate output" |

## 9. Output-quality evaluation method

**Design:** use the three §7.3 representative briefs (UI puzzle, platformer, stateful RPG) and run three conditions:
- **(a)** brief only, one implementer;
- **(b)** router-selected specialists + synthesis;
- **(c)** fixed full fan-out (about 7 specialists).

**Measures:**
- contradictions caught before code (seed 2 per brief);
- implementer clarification and out-of-scope edits;
- acceptance criteria passed in Playwright;
- seeded visual defects caught;
- tokens and wall time from aiur cost tracking;
- blind ranking by Kevin (and, if he approves, the children) on fun and coherence.

**Success** means (b) beats (a) on ranking or defects at ≤1.5× tokens, and (c) does not beat (b). This replicates CCGS's unverified claim cheaply. **It costs model usage, so it needs a budget from Kevin** (spec research contract). Only synthetic briefs; no children's data.

## 10. Runtime and token cost (estimates; unmeasured)

These are byte-count estimates at about 4 chars/token. CCGS's always-loaded context is about 17.6 KB (about 4.5k tokens). The full agent corpus is 458 KB (about 115k tokens) and the skills are 1.6 MB (about 400k tokens). Loading CCGS wholesale per task would be wasteful, which confirms §11.2's selective-loading instruction. Adapted per-specialist call: about 3–8k input (skill ≤2k after trimming + brief) and 1.5–3k output. Synthesis: about 10–20k input. A 3-specialist new-game design would be roughly 30–50k tokens total, before implementation. CCGS's own figure for a full `design-review` is "8–15 minutes" (unverified). Measure all of these in §9.

## 11. Licensing and data questions

- MIT: copying substantial text (templates such as `game-brief.md`, checklists) requires keeping "Copyright (c) 2026 Donchitos" and the permission notice. Recommendation: rewrite rather than copy. For any near-verbatim item (#5, #13), add a `THIRD_PARTY_NOTICES` entry and a header comment in the vendored skill. This matters if skills get vendored into a public games repo (§3.5).
- The game-brief template credits Tim Ryan and Stone Librande for its field set. These are ideas, not copied text, so no extra licence is needed.
- `docs/engine-reference/unreal/*` mention third-party licences. Not reused.
- Data: CCGS sends nothing except `hooks/update-check.sh` (GitHub releases API). Not vendored. The prototype skill's advice to post builds on itch.io/Reddit is **rejected** for children's games.

## 12. Rejected patterns and reasons

1. **Fixed 49-agent studio hierarchy with vertical delegation.** Contradicts §7.1 dynamic selection. CCGS itself collapses it to one agent by default.
2. **Per-write "May I write?" and AskUserQuestion at every phase.** Incompatible with background building (§5.5) and child users. Replace with one narrowing checkpoint plus play⇄edit review.
3. **Phase gates (Concept→Release), sprints, epics, milestones, retros, estimates, producer.** Duplicates aiur's tracker and Executor. They are management theatre at Game Maker scale.
4. **TR-registry → ADR → control-manifest traceability chain.** High ceremony. CCGS's own measurement found it bought "traceability, not a better game".
5. **Six-knob rigor configuration (140 KB effects map).** The configuration itself is overhead. A router + budget replaces it.
6. **Claude Code hooks and settings as the enforcement layer.** Harness-specific. aiur and the Game Maker service enforce instead.
7. **Engine specialists and engine references.** Excluded engines.
8. **Live-ops, monetization, economy Gini/pity systems, community, certification, anti-cheat.** Out of scope or inappropriate for a children's product.
9. **Static "instruction-reading" skill tests as proof of quality.** They do not run the skill.
10. **"Browser latency lies about feel."** Uncited, and it conflicts with the stack. Test it instead.

## 13. Stack integration notes

TypeScript/Phaser 4/Three.js:
- rules #12 and #13 port directly;
- the run-and-observe idea (#8) becomes Playwright on Railway-hosted previews or a local CI runner;
- the "launch straight into the scene" requirement implies the debug adapter must expose a scene/seed deep link (coordinate with the SDK spike).

aiur: nothing here requires aiur changes. Possible small aiur-side asks, which are Kevin's call:
- an artifact-exists check after agent turns (#3);
- a per-ticket token breakdown by subagent, for synthesis cost visibility.

## 14. Limitations

- Only `main` at one commit was inspected (shallow clone). History was not reviewed.
- About 25 of 75 skills and 12 of 50 agents were read in depth. The rest were surveyed by description, headings, and grep.
- No CCGS automation was run, so helper-script behaviour is inferred from comments.
- The lean-vs-heavy measurement is unverifiable.
- Token figures are byte estimates.
- aiur mapping is based on SPEC/AGENTS skims, not code.

## 15. Next steps

1. S-area agents: take #14–#20 as seed material (§6). S06 must source elsewhere.
2. SDK/editor spike: define the design-manifest schema (#11 + tunables) jointly with editor declarations and save schema.
3. QA spike: prototype `gm-run-and-observe` with Playwright on one sample game.
4. Draft `gm-specialist-router` as code + table. Hand-label 20 requests.
5. Run the §9 A/B once Kevin sets a budget.

## 16. Decisions for Kevin (product owner)

1. **Budget for the §9 A/B** (model spend, and whether the children take part in blind ranking).
2. **Default specialist ceiling** for a new game (proposed: 0–2 simple, ≤4 complex) and whether creators ever see or choose specialists.
3. **Where synthesis lives:** inside one aiur design ticket (proposed), or split into aiur-build child tickets for large games.
4. **Human checkpoint count** before building: one narrowing approval (proposed) versus CCGS-style per-phase approvals.
5. **Attribution policy:** rewrite everything (proposed) versus vendor near-verbatim templates with MIT notices in the public games repo.
6. **Whether to request the small aiur additions** in §13 (artifact check, per-subagent token breakdown) as platform tickets.
