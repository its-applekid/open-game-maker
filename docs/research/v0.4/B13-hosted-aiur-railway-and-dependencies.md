# B13: Hosted aiur on Railway, and Game Maker's aiur dependencies

- **Source:** coordination with the aiur agents (Aiur-PC is the coordinator; Aiur-NUC owns Game Maker dependencies) in a shared Khala channel, 2026-10-23 to 10-25, plus Kevin's directives in that channel. Ticket numbers refer to the aiur repo.
- **Related:** B1 (credentials), B4 (sandboxing; Railway constraints in §3.2), B8 (aiur integration), and the v0.5 decision-log rows "Stack" and "aiur dependencies".
- **Live status:** the Game Maker Feature Map artifact (claude.ai, private) shows each V1 feature with its aiur tickets, colored by merge state. This file records the reasoning, not live state.

> **Version scope (2026-10-25):** hosted aiur on Railway, voice_converse, the voice contract and client, release tags (#5936) and multi-repo hosting (#5938) are V1. Per-job read scoping (#5937) is post-V1, and the self-hosted voice cascade (#4113, #4114) is V3, for child accounts. See `docs/spec/release-plan.md`.

## 1. Directives from Kevin

- aiur dependencies are built as **independent, modular packages** Game Maker can consume (2026-10-23).
- **TypeScript only** for Game Maker: a React frontend and a Node backend on Railway. Rust was considered and set aside.
- **Priority: run aiur on a Railway backend instead of home PCs.** It needs Google/Gmail sign-in, security, and coordination so several machines can run aiur instances against one repo. It serves Kevin's own aiur (home CPU limits) and the Game Maker backend.
- **Child and parental-control scope moved to V3** (2026-10-25). The self-hosted voice cascade (#4113, #4114) is therefore not a V1 dependency; Aiur-PC and Aiur-NUC were told.

## 2. How Game Maker consumes aiur

| Package | Form | Notes |
|---|---|---|
| `voice_converse` | Elixir package in the aiur repo, consumed as a mix git dependency with `sparse:` and pinned tags | Host-agnostic. Ports: credentials, token issuer, agent channel, briefing source, command source. `Narration.render/2` returns audio plus word-timing segments. CI isolation job `voice-converse-standalone` |
| Voice wire contract | JSON Schema | #4091 |
| TS voice client | npm package | #5690 |
| Hosted aiur | HTTP with versioned schemas (`@aiur/contracts`, JSON Schema to TS types) | Usage and progress reads carry `contract` and `contract_version: 1` |

Release tags are #5936, per-job read scoping (post-V1) is #5937, and multi-repo hosting (V1) is #5938.

## 3. Railway requirements (agreed with Aiur-PC)

**Platform constraints (B4 §3.2):**
- Railway services have no KVM or user namespaces, so bubblewrap cannot run.
- Railway Sandboxes are VMs with no egress allowlist. Never put sandboxes on the private network.
- A volume attaches to one service, so there are no replicas.
- E2B runs untrusted Game Maker jobs.

**Game Maker shape:**
- **aiur instances:** one shared hosted aiur for Game Maker, using API keys only, separate from Kevin's subscription-based instances.
- **Isolation:** agents always run in per-job VMs.
- **Networking:** private networking between the backend and aiur. The public endpoints are webhooks, the dashboard behind sign-in, and the voice host (a WebSocket with a backend-issued token).
- **Deployment:** secrets live in env only, never in sandboxes. One region.

**Priority order:** S1 (token exposure) → R1 → R2 → R3(a) → R5 → R6.

Aiur-PC filed #5939–#5954. The multi-instance control-plane epic is #5964, with #5968, #5969 and #5972 in Aiur-NUC's lane.

| Merged by 2026-10-25 | In progress or queued |
|---|---|
| #5611 Google + passkey sign-in, #5947 claim leases, #5952 container load gate, #5699 fail-closed hosted mode | #5941 env-only secrets, #5942 public-domain sign-in, #5939 foreground daemon, #5940 image + template, #5943–#5945 credentials and tokens, #5948–#5951 leader lease, shared budget, roster and webhooks, #5954 Railway guide |

## 4. Voice path status (2026-10-25)

- **Merged:** provider seam #4117, registry #4110, ElevenLabs adapter #4118, token issuer #5689, allowlist #5691, batch narration #5688, narration provider rules #5814, and the provider delete queue #4120 (PR #6151).
- **Next on the critical path:** the transcript index #4139, then the live session #4124. After that: the wire contract #4091, text timing #4105, usage frame #5687 and the TS client #5690.

## 5. The bottleneck: sandboxing

Every hosted build feature waits on the sandbox VM target (#5703) and the model proxy (#5702). Both wait on two refactor tickets (#3478, #3479) and on Kevin's S1 decision.

## 6. Open decisions for Kevin

1. **S1:** fix the GitHub token exposure privately, or file a public ticket? The daemon cookie in argv is the same class of problem.
2. **Where do agents run on Railway?** Inside the service in a trusted container (#5946), or on separate workers (#5953)? Recommended: start in the trusted container. Aiur-PC's default is separate workers.
3. **Credentials:** recommended to use your subscription for your own instances and API keys for Game Maker.
4. **Lease store:** GitHub CAS or Railway Postgres? Recommended: Postgres.
5. **Railway plan size:** recommended Pro.

## 7. Process findings (from the aiur channel)

- **Local coverage runs block PRs on a busy host.** Running full-coverage pre-PR checks locally on a saturated CPU cost agents about 5 hours before a PR opened. Without a PR, the green-CI trigger can't fire. Proposed: run only the affected tests locally and leave coverage to CI (#6099, #6143).
- **Pending accessibility decision for Kevin** (aiur decision dec_41ae387c720c5978, blocks #3175). Graph lines overlap card text, so the accessibility checker can't grade the contrast there. Option (a): keep the visuals and add an arithmetic contrast check for those spots. Option (b): redesign the board. Aiur-NUC recommends (a).

## 8. Khala behavior notes

- Listening modes are steer, sync and async. In async, the deliver hook returns before any delivery and there are no mention checks, so @mentions don't notify. The idle waker skips async sessions.
- Only the owner sets the mode.
- Kevin requested two features from the Khala maintainers:
  - async mode should still notify on @mentions;
  - an agent should be able to change its own listening mode at the owner's request, or by itself when a channel is no longer relevant.
