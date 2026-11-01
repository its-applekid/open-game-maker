# OGM V1 build: planning pack

Feature slug `ogm-v1`, ticket prefix `OGM`, plan_version 1. Researched at commit `9508c1c46735e442a2e07a1bffad2bb9f190da8d` (branch `research`, 2026-10-31). Repository `its-everdred/open-game-maker-2000`, base branch `main`.

This pack follows the aiur `aiur-build` planning contract: it records approved intent and evidence. GitHub owns ticket facts once tickets are promoted; aiur owns runtime state.

## The request (Kevin, 2026-10-31, verbatim)

> Once you've finished with this task and deployed it, I want you to do a full audit of all of the scope and research and features that we have planned for this entire project. I want you to break it down into a few dozen tickets. Break it down in such a way that you have a high level plan of the direction of the code base, how you might build adapters, interfaces, have an understanding of APIs, build a full architecture plan, use compound engineering skills like brainstorm, plan, and work purely from the research perspective. Create a series of tickets with an understanding of the code that will be impacted for those tickets. Review the aiur build order skill. The next task is to break those tickets down into a build order where you have an understanding of the dependency tree of the code that will be impacted by each ticket, optimizing for having as much parallel work as possible, as many parallel agents working on as many tickets as possible. Merge conflicts are inevitable, so we don't need to try too hard to avoid them, but just optimizing for building this as quickly as possible through parallelization and a wide code surface area. Once you've broken down the project, the research into tickets, and you've created a build order, you'll additionally need to make sure that you instantiate the repo config using aiur init. before doing any of this, pull the latest IR (aiur) locally. use aiur-dev to use the latest version. Once you have the config set up, make sure to use codex agents until we hit the usage limit, then use whichever Claude login has the most tokens. Before implementing any of these tickets, I want you to fan out parallel background agents to deeply research those tickets even further, ensuring that the codex agents are mostly implementation and don't have to follow too much high-level architecture understanding. That may look like using an additional compound engineering plan skill on each individual ticket. Make sure to document all research in the repo in our research branch, and point to those documents in the actual GitHub tickets.

> commit research to research, but to be clear, the intention here is to have aiur agents implement all the discussed features of the entire game maker, for real. only scope that's wrong: instead of hosting the coding agents and backend on railway, set up your machine to safely be to host.

> you're going to use the /aiur-run skill, making you the executor. Your role is to fan out parallel background agents to review all PRs, and you will have the final say on merging all of the PRs from all of the IR coding agents.

> you have my auth to take and implement any suggests the aiur agent makes in khala. it will help you setup aiur config and init.

## Objective

Implement Open Game Maker 2000 V1 as scoped in `docs/spec/release-plan.md` §2 (read through `docs/spec/game-maker-2000-v0.5-decisions.md`, which wins on conflict), for real, with aiur coding agents, with one scope change: **everything that was to run on Railway (backend API, hosted aiur, voice host, rooms, commit service, intake worker, bucket) runs on Kevin's second machine instead, set up safely for that.** The Netlify frontend stays.

## Non-goals

- Anything the release plan places in V2 or V3 (teens, child accounts, parental controls, split screen, rewind, drawing tools, restyling, CDN, paid generators, self-service credentials).
- Spending money: no paid services, no provider API keys added by agents. Everything runs on what is installed and signed in here (Codex CLI and Claude Code subscriptions, GitHub, Netlify).
- Legal advice.

## Constraints

- Standing rules in `CLAUDE.md` and the 2026-10-26 handoff §4: never `cd`; research commits go to `research`; never commit `assets-local/`, keys, download links, serials; keep family context out of public material.
- Stack: TypeScript everywhere (React frontend, Node backend), Three.js + Rapier / Phaser, Tone.js, ZzFX, Colyseus (release plan "Stack").
- Tools need at least 1k GitHub stars unless an exception is approved.
- Untrusted game code and coding agents never see secrets. Sandboxing from day one.
- The engine repo is open source and ships no packs; paid packs stay on this instance.

## Terminal condition of the later run

V1 as bounded by `feature-boundary.md` is implemented, independently reviewed, green against `main`, merged under the recorded policy, documented, and proven by the end-to-end proof named there. The 5:30am (2026-11-01, local) deploy is a checkpoint, not the terminal condition: whatever has merged by then is built and deployed for Kevin to test.

## Source precedence

1. Kevin's explicit decisions in this conversation (recorded in `questions-or-commands.md`).
2. `docs/spec/game-maker-2000-v0.5-decisions.md`.
3. `docs/spec/release-plan.md`.
4. `docs/research/v0.5/C2` (ticketing checklist), C1, C3, C4; then `docs/research/v0.4/B*`; then `docs/research/v0.3/A*` where not superseded.
5. `docs/architecture/architecture-scope.html` (the design doc; its Railway parts are superseded by the self-hosting decision).
6. The prototypes (`prototypes/`) as evidence of what worked, not as code to keep.

## Mutation authority (recorded 2026-10-31)

- Commit and push to `research`: yes (standing).
- Create GitHub issues, labels, CODEOWNERS, `.aiur/config`: yes (Kevin: "instantiate the repo config using aiur init"; "Create a series of tickets").
- Review PRs with background agents and merge: yes, Executor has final say (Kevin, 2026-10-31).
- Take suggestions from the aiur agent in the Khala channel `GM` and implement them: yes (Kevin, 2026-10-31), within these constraints (no spending, no secrets in the channel).
- Self-fix / take over worker tickets: yes, as the `aiur-run` executor role allows when bounded recovery fails.
- Spend money, add provider API keys, publish anything outside this repo and ogm2000.netlify.app: no.

## Contents

| File | What |
|---|---|
| `questions-or-commands.md` | Open questions, the assumptions taken for each, and Kevin's answers |
| `deferred-findings.md` | Findings outside the active boundary |
| `evidence/BRIEF.md` | The shared brief given to every research track |
| `evidence/T*.md` | Evidence packets, one per track |
| `requirements.md` | Requirements with IDs and acceptance examples (Stage 2) |
| `decisions.md` | Technical decisions with rationale (Stage 3) |
| `architecture.md` | The architecture plan: packages, adapters, interfaces, APIs (Stage 5) |
| `tickets/OGM-NNN.md` | Ticket contracts (Stage 5) |
| `build-order.json`, `graph.md` | The typed graph, wave table, critical path (Stage 6) |
| `validation.md` | Validation report (Stage 7) |
| `handoff.md` | Executor handoff (Stage 9) |
