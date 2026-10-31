# Prompt: aiur executor, split the build order across two machines

You are the aiur Executor for the aiur build order that is currently in motion. Kevin wants a plan, not execution yet: re-cut the remaining work so a second aiur instance on a second machine can take an independent slice. The slice should put first the aiur components that a new consumer, **Open Game Maker 2000**, will need anyway.

> **Version scope (2026-10-25):** Game Maker V1 is adults only (18+); teens are V2 and child accounts with parental controls are V3. So the self-hosted voice cascade and child-safe provider work are **(V3)** and are not V1 dependencies; V1 voice needs only `voice_converse` with ElevenLabs then OpenAI, the no-transcript mode, alignment/usage frames and narration render. Multi-repo hosting (#5938) is V1; per-job scoping (#5937) is post-V1 (decision log). Kid-first framing ("for families") is superseded: it is a general game maker. See `docs/spec/release-plan.md` for V1/V2/V3 scope.

## Context

Open Game Maker 2000 is Kevin's general web game-creation platform (V1: adults only; parental controls for child accounts come in V3). Its research lives in the private repo `its-everdred/open-game-maker-2000`, on branch `research`. If it isn't cloned on this machine, read it with `gh`.

Read in this order. Stop when you have enough; you don't need everything.

1. `docs/research/v0.4/B8-aiur-integration-budgets-bugs.md`: how hosted Game Maker would drive aiur, and a ranked **gap list of upstream aiur work**.
2. `docs/research/v0.4/B2-voice-stack.md`: what aiur's voice component actually is today, and what Game Maker needs from it. The gaps are labeled G1–G7: child-safe providers **(V3)**, no-transcript mode, alignment/usage frames, narration render path, and others.
3. `docs/research/v0.4/B4-sandboxing.md` §2 and §7: aiur execution today and the changes needed for hosted, sandboxed runs. These are a sandbox-VM execution target, no credentials in the sandbox, and push/PR moved to the orchestrator. Also read the **likely GitHub-token exposure** finding.
4. `docs/research/v0.4/B1-provider-credentials.md` §2.3 and §4: aiur's account and credential routing, and hosted-mode credential requirements.
5. `docs/spec/game-maker-2000-spec-v0.4.md` §7.1–7.2 and §7.10–7.11: the two uses of aiur, and the delivery principle.

The research was done against aiur `ad084b1f` and `46bda0020`. Recheck everything against current `main` before relying on it.

## What to do

1. **Establish the current plan.**
   - Find the build order(s) in motion and the remaining tickets, with their states and dependencies. Use the `aiur-build` / `aiur-run` artifacts and GitHub.
   - Find the refactor roadmap and component plans. Include the MP-E6 voice plan on `research/refactor-findings` and epic #4083 (`voice_converse`).
   - Estimate the remaining effort. Kevin believes it is a few weeks of work.

2. **Map Game Maker's needs onto planned aiur components.**
   - For each need below, name the existing ticket, epic or package that covers it, or mark it as a gap. Don't invent APIs.
   - **Voice, one-way and two-way.** The reusable `voice_converse` component. Kevin's provider order is ElevenLabs first, then OpenAI. The component also needs:
     - a session API and wire codec;
     - a provider seam that also takes a self-hosted cascade (STT → LLM → TTS), for minors until a vendor approves child use **(V3; keep the seam open, but the cascade is not a V1 dependency)**;
     - a no-store transcript mode;
     - alignment (word-timing) and usage frames;
     - a batch narration render path;
     - a host-supplied token issuer, so an external TypeScript app can embed it.
   - **Model usage data as one component.** Per-ticket usage read API, per-ticket spend caps, external progress/phase reads, outbound events, a cancel that confirms the agent stopped, and account/rate-limit snapshots. Treat these as one coherent usage and observability surface where the roadmap allows.
   - **Hosted execution.** A sandbox-VM execution target, a model-call proxy with per-job tokens, the commit service / orchestrator-side push, and a hosted mode that fails closed. Also enforcement that the hosted instance uses API-key profiles only.
   - **Many repositories.** Each Game Maker user connects GitHub at setup and gets their own repo. One hosted aiur therefore has to serve many repos, but aiur runs one daemon per repository today.
   - Lower priority: per-ticket skill injection, a job-create API, per-tenant concurrency, versioned status schemas.

3. **Split the work across two instances.**
   - **Stay the course:** keep the planned refactor and component work; don't reorder for its own sake.
   - Partition the remaining tickets into two lanes:
     - **Machine A:** the current instance.
     - **Machine B:** a new instance on another machine.
   - Choose lanes by code surface, so the lanes rarely touch the same files.
   - Kevin's hypothesis is that the voice component is the most independent and should be Machine B's first lane. Verify or refute that from the code.
   - Within each lane, order Game Maker-critical components first: voice, usage data, hosted execution.
   - For every cross-lane dependency or shared file, state the contract that unblocks it and which lane owns it.
   - Keep the continuously testable rule: every merge leaves something Kevin can try.

4. **Prepare coordination.**
   - Kevin will invite both machines' Executors into a shared channel.
   - Draft the kickoff message for that channel. It should cover: lane ownership, the shared contracts, the files each lane must not touch without asking, merge and rebase etiquette, how to hand a ticket across lanes, and when to escalate to Kevin.

## Deliverable

Write one plan document in the aiur repo's usual place for build-order planning, but don't merge it. It should contain:

- the current-state summary;
- a needs → component map, marked covered, partial or gap;
- the two-lane split, with a ticket list per lane in order;
- the cross-lane contracts and conflict hotspots;
- proposed new tickets for gaps (titles and one-line scope only);
- the channel kickoff message;
- open questions for Kevin.

Then reply to Kevin with a 10-line summary and the path.

## Boundaries

- **Planning only.** Don't relabel, re-parent, create or close tickets, start the second instance, or change a running build order until Kevin approves the plan.
- **Don't copy Game Maker material into public places.** That covers family details, children's ages, product specifics and the research text. If you draft aiur tickets, phrase needs generically, e.g. "an external app embedding voice needs a no-transcript mode" (the minors angle is V3).
- **Raise the security finding first.** If the GitHub-token exposure in B4 §2 still holds on current `main`, flag it to Kevin as its own item. It affects aiur today regardless of Game Maker.
