# A7 — Infrastructure, accounts, Git storage, and multiplayer (R05, R04, R07, R12)

Research agent A7 · spec v0.3 · all sources accessed **2026-10-21** · nothing deployed, signed up for, or purchased; no project or child data sent anywhere.

Legend: **[V]** verified against a primary source today · **[C]** community/staff forum or vendor blog, not official docs · **[U]** unverified or inferred · **[M]** from prior knowledge, not re-checked today.

Out of scope here: aiur internals (A6) and vendor/legal policy, including COPPA and verifiable parental consent (A8). Where this report depends on those, it says so.

> **Version scope (2026-10-25):** Read through `docs/spec/release-plan.md`. V1 (adults only, 18+): R05 sandboxing and topology (E2B with an egress allowlist is now Decided, B4), R04 for adult roles and invites, R07 leakage and fork rules. V2: R12 multiplayer gameplay, spectators and room guests (V1 reserves the architecture only). V3: every supervision, guardian, child-flag and parent-claim element of R04, and child rules in R07.
> Kid-first framing is superseded: this is a general game maker, and child rules live only in the V3 parental-controls module.
> Superseded where they differ: auth and accounts → the 2026-11-03 operator allow-list decision (no V1 age screen), then **B9** and **B10** for future age-band and parental-control work; sign-in is email plus passkey and/or Google (decision log). Repo strategy (S1 private monorepo) → Decided: the user connects their own GitHub and Game Maker creates a repo per game, public or private. Multiplayer → **V2** (B7 hooks).

---

## 0. Bottom line

1. **A Railway service is a process and resource boundary, not a security boundary for untrusted code.** Railway does not document its service isolation. The only statement found is a forum reply that services run as unprivileged Podman containers on a shared kernel [C]. Railway also cannot filter egress on services [U]. Run agent-generated code, `npm install`, and Playwright **in a VM sandbox**, never in the API, game-serving, or multiplayer services.
2. **Railway now sells VM sandboxes.** Railway Sandboxes are an "isolated, ephemeral Linux VM scoped to a Railway environment". They default to `ISOLATED` networking (no private network) and are available on every plan [V]. They keep the stack to one vendor, which suits the "single operational project" preference. Their gap is that outbound internet cannot be disabled [C]. If egress allow-lists become a hard requirement, the fallback is **E2B** (Firecracker, per-sandbox nftables plus SNI domain allow/deny lists, Apache-2.0 runtime you can self-host [V]).
3. **Keep the agent loop and every secret outside the sandbox.** The orchestrator (an aiur worker service) holds the LLM credentials and the GitHub App key. The sandbox gets only a workspace tarball and returns a diff plus test artifacts. Because nothing worth stealing is inside, the open egress is acceptable for an MVP.
4. **GitHub cannot enforce "user A writes only folder A".** App tokens are scoped to repositories and permissions, not paths. Push rulesets are path-based, but they apply to every pusher and work only on private or internal repositories [V]. So folder ownership must be enforced in the backend. Neither agents nor users ever hold a GitHub token; only the deterministic commit service does.
5. **"Private" should mean two things now and one thing later:** hidden from discovery, and play restricted to owner plus named invitees. Source confidentiality comes from a **private system-of-record repo**. Open source becomes an explicit, per-game **"Publish source"** export of a scrubbed snapshot. A UI toggle on a public repo cannot honestly promise secrecy.
6. **Colyseus 0.18 (released 2026-08-20) now includes prediction, rollback, interpolation and lag compensation [V].** They need a deterministic step function shared with the server, and that is the catch: server authority means running *agent-generated game code inside the multiplayer server*. Recommendation: a **platform-owned generic room** (Colyseus) that enforces roles, pause, the editor-spectator view and version pinning. Gameplay stays host-authoritative in the owner's sandboxed browser iframe for invite-only co-op. One Railway replica, no sticky sessions needed.
7. **Use Better Auth (1.7.12) for authentication only.** Write the authorization layer (invites, grants, supervision, game ownership) as a small, tested policy module of our own. The organization plugin's invitations need the accepting session's email to match the invitation, which does not fit no-email child accounts [V]. *(Child accounts are V3; in V1 every account has a mandatory email, so this objection is V3-only.)*

---

## R05 — Railway deployment and safe agent execution

### Requirement
Run one Railway project with separate API/game-serving and build-worker responsibilities. Establish what each boundary actually guarantees: generated code, npm installs, test browsers, secrets, persistence, cancellation, and multiplayer interference. Compare with a home worker that needs no tailnet. Deliver a threat model and a simple recommendation (spec §7.4, §9.1, §10.7).

### Primary sources (2026-10-21)
- Railway docs: private networking (`docs.railway.com/reference/private-networking`), volumes (`/reference/volumes`), plans and pricing (`/reference/pricing/plans`), variables (`/guides/variables`, `/reference/variables`), scaling (`/reference/scaling`), public API tokens (`/reference/public-api`), code-execution sandboxes guide (`/guides/code-execution-sandboxes`), and the sandboxes product page (`railway.com/sandboxes.md`).
- Railway Station forum threads on runtime security and sandbox security review (the second now redirects; quoted via search snippet) [C].
- E2B pricing (`e2b.dev/pricing`), docs (`docs.e2b.dev/llms-full.txt`), and the `e2b-dev/runtime` README via `gh`.
- Modal sandboxes guide and pricing. Cloudflare Sandbox and Containers docs and pricing. Fly.io pricing. The Daytona GitHub README.

### Versions and project health (gh/npm, today)
| Item | Version / state | License | Stars |
|---|---|---|---|
| `railway` TS SDK (Sandbox class) | 3.16.0 | MIT | — |
| E2B SDK `e2b` / `e2b-dev/E2B` | 2.58.0 | Apache-2.0 (repo) / MIT (npm) | 14.5k |
| `e2b-dev/runtime` (formerly `infra`) | active | Apache-2.0 | 1.75k |
| Modal JS SDK `modal` | 0.11.1 (pre-1.0) | Apache-2.0 | client repo 527 |
| `@cloudflare/sandbox` | 1.0.2 | Apache-2.0 | `cloudflare/sandbox-sdk` 1.2k |
| Daytona `daytonaio/daytona` | **archived**. "As of June 2026, Daytona's core development has moved to a private codebase" | (AGPL historically [M]) | 71.5k |
| gVisor | active | Apache-2.0 | 19.7k |
| Firecracker | active | Apache-2.0 | 37.5k |

The ≥1k-star rule applies to *tools we embed*. E2B, gVisor and Firecracker pass. The Railway SDK and Cloudflare sandbox SDK are the vendors' own clients. The Modal client repo is below 1k but is a vendor client. **Drop Daytona**: its open-source line is frozen.

### Railway facts relevant to the design [V unless marked]
- **Topology.** Workspace, then project, then environment, then service. "Each environment has its own isolated network". Services reach each other at `SERVICE.railway.internal` over WireGuard. The docs describe no firewall or egress control for services [U: absence of documentation].
- **Volumes.** "Each service can only have a single volume." "Replicas cannot be used with volumes." A redeploy with a volume causes "a small amount of downtime". Size caps are 5 GB on Hobby and 50 GB on Pro by default (self-serve up to 1 TB). Conclusion: build workspaces should be **ephemeral**; durable data belongs in Postgres or object storage.
- **Plan limits per service, replicas included.** Hobby ($5/mo, includes $5 usage) allows 48 vCPU / 48 GB RAM / 6 replicas. Pro ($20) allows 1,000 vCPU / 1 TB / 42 replicas. These are **maximums you set per service**, so you can give a worker service its own vCPU/RAM ceiling that is separate from the API's. That is the resource-isolation guarantee [V for limits; per-service cgroup enforcement U].
- **Container prices.** $20/vCPU-month, $10/GB-month RAM, $0.05/GB egress; builds are free. **VM workloads (sandboxes) cost $50/vCPU-month and $50/GB-month**, billed per second, and "idle sandboxes remain billable".
- **Secrets.** Variables are per service or shared per environment and are injected at **build and run time**. Sealed variables are "never visible in the UI nor can it be retrieved via the API". The docs describe no role-based visibility. **Project tokens "are scoped to a specific environment within a project"**, which is the right credential for an orchestrator that only creates sandboxes.
- **Scaling.** "Railway does not support sticky sessions"; traffic is spread randomly across replicas. Community staff replies cite a 10,000-connection-per-domain cap. WebSocket lifetime is not guaranteed, and replies conflict between "no timeout" and a 15-minute HTTP maximum [C].
- **Sandboxes.** Per-environment concurrency is 10 (Free/Trial), 50 (Hobby), 100 (Pro). Maximum size is 2 vCPU/2 GB on Free, 8/8 on Hobby, 24/24 on Pro. The default idle timeout is 30 min (adjustable up to 120 min or "never"). Network modes are `ISOLATED` (default, "outbound internet only") or `PRIVATE`. Checkpoints, forks and templates are supported. "Nothing is inherited from the project. A sandbox only gets the variables you pass in env" [C]. "Outbound internet can't be disabled" [C]. The hypervisor is **not named** [U]. A competitor's blog says the product was still in beta in July 2026 [C]; the official page shows no beta label [V].

### Three kinds of isolation, by option
| Option | Independent process / failure containment | Resource isolation | Security isolation for untrusted code |
|---|---|---|---|
| Two processes in one Railway service | Partial: a crash can take both down on restart | **None**: they share the service's ceiling | None |
| Separate Railway services (api, worker, mp) | Yes: separate deploys, restarts, logs | Yes: per-service vCPU/RAM ceilings | **Weak/unknown**: shared-kernel container [C]; same egress; any secret in its env is readable by code it runs |
| Docker + gVisor/Firecracker *inside* Railway | — | — | **Not available [U]**: needs privileged runtime or KVM, which Railway does not document |
| Railway Sandbox (VM) | Yes | Yes (sized per sandbox) | **Strong** (VM, own kernel [V "VM"; hypervisor U]); egress open |
| E2B (cloud or self-hosted) | Yes | Yes | **Strong**: Firecracker plus per-sandbox egress firewall and domain allow-lists [V] |
| Modal Sandbox | Yes | Yes | Strong: gVisor by default, VM runtime optional [V]; JS SDK pre-1.0 |
| Cloudflare Sandbox (Containers) | Yes | Yes | Strong: "Each instance is a microVM with its own kernel and network"; `enableInternet: false` [V]; needs a Worker front and the Workers Paid plan |
| Fly Machines | Yes | Yes | Strong (Firecracker [M]; not stated on the pricing page) |
| Home worker plus gVisor/Firecracker | Yes | Yes (your hardware) | Strong if configured; E2B Embed runs "on a single Linux host with KVM" [V] |

### Recommended topology (one Railway project, `production` environment plus a `builds` environment)
```text
production env (private network)
  web        static UI + game bundles (or Netlify/CDN, per v0.2 candidate)
  api        Better Auth, authz policy, game index, saves, releases, publish/fork services
  worker     aiur orchestrator: job queue consumer, LLM calls, GitHub App commits
  mp         (post-MVP) Colyseus room server, 1 replica
  postgres   (Railway template) — accounts, grants, jobs, saves, release pointers
  object storage (Railway bucket or R2/S3 [U which]) — assets, build artifacts, previews

builds env (no services, no shared variables)
  Railway Sandboxes, ISOLATED mode, created by worker with a project token scoped to `builds`
```
Job flow:
1. The worker takes a job and checks budget and authorization through `api`.
2. It creates a sandbox from a cached template (Node, pnpm, Playwright Chromium) and uploads the game folder plus the pinned SDK version.
3. The LLM agent loop runs **in the worker**. Tool calls (`exec`, file edit, test) are proxied into the sandbox with `timeoutSec` and checked exit codes; the docs warn that `exec` "does not throw on a non-zero exit code".
4. The worker downloads the diff and artifacts and destroys the sandbox in `finally`.
5. The worker validates paths (only `games/<gameId>/**`), size and file types, then commits via the GitHub App.
6. Preview artifacts go to object storage under a draft key, never the published pointer.

Cancellation means destroying the sandbox; the idle timeout catches leaks. The `builds` environment cannot see production's private network, and the sandbox gets no project variables.

**Why the agent loop lives in the worker:** the egress that cannot be disabled is only dangerous if something valuable is inside the sandbox. With no provider keys, GitHub token or database URL inside, a malicious or simply wrong `postinstall` script can waste compute (capped by size and timeout) or try to attack the internet from Railway's IPs (abuse risk; mitigate with short lifetimes and an npm allow-list *policy* checked before install). It cannot steal platform credentials.

Kill-switch upgrade path *(now moot: E2B with an allowlist is the Decided V1 sandbox, B4)*: if child-safety review (A8) or abuse requires **blocked egress**, move the sandbox call behind an interface (`SandboxProvider`) and switch to E2B with a domain allow-list (registry.npmjs.org, the pinned CDN). Keep the interface to the four calls used: create, exec, put/get files, destroy. That is not a speculative abstraction; it is the seam the threat model needs.

### Home worker (optional)
- **Pattern.** A home daemon makes an **outbound-only** HTTPS/WebSocket connection to `api`. It authenticates with a per-worker credential: a long random secret, rotated and revocable, bound to a worker record, never a user session. It *pulls* jobs and pushes back diffs and artifacts. Nothing listens at home, and no tailnet, port forward or Cloudflare Tunnel is needed. Kids' devices only ever talk to Railway.
- **Execution at home** still needs a VM-grade sandbox: gVisor `runsc` under Docker, or E2B Embed (Firecracker, KVM). Run it on a dedicated VLAN/VM or host firewall rules that deny RFC1918 destinations, so generated code cannot reach the home LAN.
- **The worker should hold no LLM keys** if the provider-auth question (R06/A8) forbids a consumer subscription; it would then just be a cheaper sandbox host.
- **Recommendation.** Defer. It adds a second ops surface (uptime, patching, a home egress IP used for abuse) to save roughly $0.05–0.10 per build. Revisit only if build volume makes sandbox spend material.

### Threat model (STRIDE-lite)
| # | Threat | Asset | Control (enforced where) |
|---|---|---|---|
| S1 | Spoofing: stolen invite link or session used to act as creator | budget, games | Invites bound to the intended recipient and single-use (§R04). Passkey/email-OTP auth. Creator actions re-check grants server-side in `api` |
| S2 | Spoofing: forged worker connects to job queue | jobs, diffs | Per-worker secret; worker identity checked on every pull; diffs re-validated by `worker`/`api` regardless of source |
| T1 | Tampering: agent writes outside its game (platform, SDK, other games) | platform integrity | Path allow-list in the commit service. Platform lives in a separate repo the App cannot write. Optional push ruleset blocking `platform/**` if the repo is private |
| T2 | Tampering: generated game code tampers with the platform UI | accounts | Game runs in a sandboxed iframe on a separate origin; postMessage schema validation (§7.4) |
| R1 | Repudiation: "who spent the budget / who published?" | trust | Append-only audit table: actor user, acting-as, job id, cost, commit SHA. Commits always by bot with `Requested-By:` an opaque user id |
| I1 | Info disclosure: generated code or `postinstall` reads secrets | LLM keys, GitHub key, DB | **No secrets in sandbox**; separate `builds` env; sealed variables in production |
| I2 | Info disclosure: private game or child data reaches public Git, logs or previews | child privacy | §R07 storage strategy; bot commit identity; no prompts or transcripts in Git; previews in private bucket with signed URLs |
| I3 | Info disclosure: spectators see owner's private prompts or admin panels | privacy | Server-side view filtering in room (§R12) |
| D1 | DoS: runaway build starves gameplay | live sessions | Builds never run in `api`/`mp`; per-sandbox size, `timeoutSec`, idle timeout; per-user concurrent-job cap; budget gate (R15) |
| D2 | DoS/abuse: sandbox used to attack third parties | Railway account | Short lifetime, small size, install policy; E2B egress allow-list as upgrade |
| E1 | Elevation: creator prompt reinterpreted as platform change | §9.1 boundary | Worker's App installation excludes the platform repo; platform-ticket filing is a separate, write-only action |
| E2 | Elevation: child or player escalates via invite chain | roles | Invite capability matrix enforced in `api` (§R04) |
| E3 | Elevation: sandbox escape to Railway host | everything in that host | VM boundary (vendor responsibility); nothing co-located in `builds` |

### Likely costs (illustrative, 15-min build at 2 vCPU / 4 GB)
Railway Sandbox ≈ $0.10. E2B ≈ $0.04. Modal ≈ $0.06. Cloudflare standard-3 ≈ $0.05 (CPU billed only while active). These are arithmetic from today's list prices; real usage is lower when CPU is idle on vendors that bill active CPU. LLM tokens will dominate by one to two orders of magnitude. Always-on services (api, worker, small Postgres) on Hobby/Pro are probably $10–30/month at family scale [U: estimate]. E2B Pro is $150/month if its 1-hour Hobby session cap is too short.

### Evaluation method (bounded, needs Kevin's OK to spend roughly $5)
In a throwaway Railway `builds` environment:
1. Time a cold versus template boot.
2. Run `pnpm install` plus a Playwright smoke on a demo game.
3. Measure peak RSS and confirm Chromium runs in the VM.
4. Verify isolation from inside a sandbox: `ISOLATED` cannot resolve `*.railway.internal`, `env` shows no project variables, and egress really is open.
5. Confirm cancellation (destroy during `exec`) and that idle timeout reaps.
6. Repeat steps 2–4 on E2B Hobby (free credits) for an egress-allow-list comparison.

---

## R04 — Accounts, invitations, child supervision, and permissions

> **V1 reading:** use the maintainer/admin, creator/player and game-owner dimensions with adult invites. The `supervision` edge, `isChild`, the Guardian column, the "Mark invitee as child" and "Configure parental controls" rows, and the guardian recommendations below are **(V3)**.

### Requirement
An authorization matrix that keeps **platform authority, creation permission, game ownership and supervision** as separate dimensions (§4.1). Covers invite rules (§4.2), guardian authority and parent-claim, upgrades and revocation, accountless guests, and abuse cases.

### Sources and versions [V]
`better-auth` 1.7.12 (MIT, 30.4k stars, published 2026-10-20). In-core plugins include `organization`, `admin`, `access`, `anonymous`, `email-otp`, `magic-link`, `username`, `two-factor`, `multi-session`, `jwt`. **Passkey is now a separate package, `@better-auth/passkey` 1.7.12.** Docs read: organization, admin, anonymous plugin pages.

Facts that matter:
- **Organization invitations** expire after 48 h by default. Accepting requires "a logged-in session whose email matches the invitation". `invitationLimit` defaults to 100. Before/after hooks can block an operation by throwing. Dynamic access control is available, and "users cannot grant permissions their own role lacks".
- **Admin plugin** offers create user, set role, ban (revokes sessions), list and revoke sessions, and impersonate. Impersonation lasts 1 h by default, and "by default, admins cannot impersonate other admin users".
- **Anonymous plugin** creates a session with no PII. `onLinkAccount({anonymousUser,newUser})` fires on later sign-in, and the anonymous user is deleted after linking unless that is disabled.

### Model: four independent dimensions
```
user.platformRole ∈ {maintainer, admin, none}          // platform authority
user.capability   ∈ {creator, player}                  // creation permission
game.ownerId                                           // game ownership (per game/fork)
supervision(guardianId → childId, status, source)      // supervision is an edge, not a role
user.isChild (derived: exists active-or-pending supervision OR flagged at invite)
```
`maintainer` is a deploy-time allow-list (env/config), never grantable in-app. An in-app admin cannot mint maintainers.

### Authorization matrix (✓ allowed, ✗ denied, ◐ conditional)
| Action | Maintainer | Admin | Creator | Player | Game owner (this game) | Guardian (of this child) | Adult peer inviter | Accountless guest |
|---|---|---|---|---|---|---|---|---|
| Modify platform / prompt platform agents | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Invite creator | ✓ | ✓ | ✗ | ✗ | — | ✗ | — | ✗ |
| Invite player | ✓ | ✓ | ◐ adult creators only (rec.) | ✗ | — | ◐ via guardian consent flow | — | ✗ |
| Mark invitee as child | ✓ | ✓ | ✓ (creates *pending* supervision) | ✗ | — | ✓ | — | ✗ |
| Create game / spend build budget | ✓ | ◐ only if also creator | ✓ within budget | ✗ | — | ✗ | — | ✗ |
| Edit a game / drive editor in room | ◐ "help" mode, audited | ✗ | ✗ unless owner | ✗ | ✓ | ✗ | ✗ | ✗ |
| Publish / rollback a release | ◐ audited | ✗ | ✗ unless owner | ✗ | ✓ | ◐ child-publish approval if enabled | ✗ | ✗ |
| Fork a visible, permitted game | ✓ | ◐ if creator | ✓ | ◐ **Kevin decides** | ✓ (own) | ✗ | ✗ | ✗ |
| Play published, non-private game | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ in invited room only |
| Play private game | ◐ audited | ✗ | ◐ explicit grant | ◐ explicit grant | ✓ | ◐ child's own games | ✗ | ◐ room invite by owner |
| See activity of invitees | ✓ | ✓ for own invitees (scope **Kevin decides**) | ◐ aggregate for own games | ✗ | ◐ own-game analytics | ✓ child's full activity | ✗ (no parental-style view of peers) | ✗ |
| Configure parental controls | ✗ (support only) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Revoke invitee / downgrade | ✓ | ✓ own invitees | ✓ own player invitees | ✗ | — | ✓ suspend child | ✗ | — |
| Upgrade player → creator | ✓ | ✓ | ✗ | ✗ | — | ◐ must approve for child | — | ✗ |

Precedence: deny wins. Supervision restrictions apply *on top of* any role, including a child creator. Platform role never implies game ownership; maintainer edit of another's game is an audited "help" action visible to the owner (and guardian).

### Guardian authority, child inviters, parent claim (recommendations) (V3)
- **Inviter ≠ guardian.** A creator who ticks "child account" creates a **pending supervision** with themselves as *provisional supervisor* only if they are an adult account that has completed a guardian attestation. The child account is limited to safe defaults (no public discovery, no friend presence, no voice chat, no free-text sharing) until an adult accepts guardianship. Which verification method counts as "legitimate guardian authority" is **A8's call** (COPPA / VPC). This report only supplies the state machine: `pending → active (attested|verified) → transferred | revoked`.
- **Child inviters.** Child accounts get **no invitation capability** by default, even if they are creators. A child's "invite a friend" becomes a *request* their guardian approves, and the guardian becomes the inviter of record. This closes "child marks another child as child and becomes supervisor".
- **Parent claim.** A parent claims through an admin-mediated flow, or a claim link the provisional supervisor or Kevin issues, plus the A8 verification method. Supervision **transfers**: the provisional supervisor loses supervisor views, audit is retained, and the parent can re-set controls. The child's games, saves and achievements are untouched because they key to `childId`, not to the inviter.
- **Upgrade player → creator** flips `capability` and keeps the user id, so saves survive. A child's upgrade needs guardian approval because it unlocks spending.
- **Revocation.**
  - **Revoked creator with live games:** capability drops to player and in-flight jobs are cancelled (sandbox destroyed). Published games stay playable (they are releases, not live processes). Games are marked "owner inactive" with no further edits. Kevin can transfer ownership or unpublish.
  - **Banned user:** Better Auth `ban` revokes sessions. Their games are delisted, not deleted, pending review.
  - **Revoked inviter:** their invitees remain. Invite lineage stays for audit but confers no ongoing power.

### Invitation implementation
Use **own `invitations` table plus policy**, not the organization plugin:
- **Token.** 128-bit random, stored hashed, single-use, 48–72 h expiry, revocable.
- **Bound to the recipient.** Either an email the recipient must verify (adults), or, for no-email children **(V3)**, a guardian-accepted redemption: the guardian signs in and creates the child profile (household/picture-PIN candidate, §4.3).
- **Payload.** Capability, child flag and inviter are server-side fields; the link never carries role claims.
- **Rate limits.** Per inviter, plus an audit log.

Better Auth supplies sessions, email OTP/magic link, passkey (`@better-auth/passkey`), admin ban/impersonate/session revoke for Kevin, and anonymous sessions for room guests. The organization plugin stays a later option for "household" grouping if ever needed.

### Accountless guests
*(V2 at the earliest: V1 has no guest play; room guests arrive with multiplayer.)* Recommend **supporting them only as room guests**:
- They join through an owner-issued, expiring, single-room code and get a Better Auth anonymous session.
- They can play and spectate in that room only, with no saves beyond the session, no achievements (or "pending until you sign in", migrated in `onLinkAccount`), no presence, no voice, and no forks.
- A shared URL never grants more than "request to join", which the owner approves.

**(V3)** Children joining as guests is an A8 question: guests cannot carry a child flag, so supervised children should join with their account.

### Abuse and edge cases to test
1. A stolen invite link is used by someone else. Email binding or guardian redemption blocks it, and the token is single-use.
2. A creator invites 50 "players" to farm a budget. Players cannot spend; invite rate limit; admin sees lineage.
3. A child creator tries to invite: denied, which converts the invite into a guardian request.
4. A creator marks an adult peer as "child" to gain oversight. The invitee sees "You'll be supervised by X" before accepting and can decline. Adults can dispute (admin reviews).
5. Real parent and provisional supervisor disagree. The verified guardian wins, and Kevin is the tiebreaker.
6. A revoked creator owns a game that is live in a multiplayer room. The room continues read-only (no editor) and closes at session end.
7. An admin is removed while their invitees have activity visibility rules. Visibility follows the *current* relationship, not history.
8. A maintainer impersonates a child account to debug. Allowed only with audit and guardian visibility. The admin plugin's 1 h cap applies, and impersonating admins is off.
9. A guest code is shared publicly. The owner approves joins, the code expires, and there is a room cap.
10. A forked game's provenance names the original child creator publicly. Show provenance by display handle only, never real names (§R07).

---

## R07 — Git storage, source publication, forking, and privacy

### Requirement
Choose a repository layout, enforce per-creator write rules, handle concurrent writes, specify deterministic fork/copy with provenance, and resolve public source versus private games (§5.2, §5.13, §9.2–9.4).

### Verified GitHub facts [V unless marked]
- **Installation tokens** take `repositories`/`repository_ids` (up to 500) and a `permissions` subset, "expire one hour from the time you create them", and can never exceed the installation. There is **no path or folder scoping**. The only file-granular permission is `single_file`, which the app configures with a fixed list of paths, not per-token folders [V that it exists; path-list detail M].
- **Push rulesets** offer "Restrict file paths" (fnmatch, 200 entries), extension, path-length and size rules. They apply to "a private or internal repository and that repository's entire fork network". Path rules apply to **all pushers**: exceptions are by file pattern, and the only actor exemption is the ruleset-wide bypass list. **They cannot express "user X may only write folder X."**
- **Plan availability for push rulesets is inconsistent across GitHub's own pages.** One says GitHub Team for private/internal repos; Enterprise Cloud docs say Enterprise Cloud. They do not apply to public repos (inferred from the "private or internal" wording [U]). Ordinary branch rulesets work on public repos on Free [C via docs snippet].
- **CODEOWNERS** only requests or requires PR reviews; it does not stop direct pushes by the App. It is irrelevant when the only writer is our bot.

**Design consequence.** The **commit service is the enforcement point**. Users and agents never receive GitHub credentials. The worker validates that every changed path is under `games/<gameId>/`, that the requester owns `gameId`, and size and type limits. Only then does it commit with the App token. A push ruleset blocking `platform/**`, `.github/**` and binaries over N MB is cheap defence-in-depth *if* the repo is private on a supporting plan.

### Concurrency
A shared monorepo has one `main` and many writers, which means non-fast-forward races.
- Serialise **per repository** through a job-queue mutex (Postgres advisory lock) for merges to `main`, and do edits on per-game branches `games/<id>/draft`.
- Commit with the Git Data API (create blobs, tree and commit, then update ref) using compare-and-swap on the ref SHA and a retry on 422. This avoids holding a clone in the worker.
- Different game folders never textually conflict, so rebases are trivial.
- At family scale (tens of commits per day) one lock is enough. Repo-per-game removes the lock entirely.

### Deterministic fork/copy (no agent)
1. Run the policy check `canFork(user, sourceGame, sourceRelease)`. Private-game access does **not** imply fork rights by default (Kevin decides).
2. Allocate a new `gameId` (ULID) and slug.
3. Read the tree at the **source release's commit SHA**, not `main`, and write it under `games/<newId>/` in one commit by the bot.
4. Rewrite the manifest: new id, `ownerId`, title "… (copy)", and `provenance: {sourceGameId, sourceReleaseId, sourceCommit, forkedAt}`. Show the source owner by display handle only. Add a commit trailer `Forked-From: <sourceGameId>@<sha>`.
5. Assets: copy object-storage keys (content-addressed, so it is a reference) or copy them if source deletion must not break the fork.
6. Never copy saves, achievements, analytics, prompts or transcripts. They are not in Git anyway (§9.2).
7. Make it idempotent with a job key `fork:<user>:<source>@<release>`, so a retry does not create two copies.

Rename, restore-version and publish follow the same pattern: a deterministic service, a policy check, a bot commit and an audit row.

### What "Private" can mean
| Meaning | What it protects | Mechanism |
|---|---|---|
| P1 Undiscoverable | Name and preview absent from wall, presence, activity feeds | Index and feed filtering in `api` |
| P2 Access-controlled play | Only owner plus explicit grantees can load the build | Authorised build URLs (signed, short-lived), not just hidden links |
| P3 Source/asset-confidential | Code, art, prompts and design never public | Private storage; nothing in public Git, Actions logs, Pages or public buckets |

P1 alone is easy but **must not be labelled "private"** if anyone with the URL can play it or the source is public.

### Leakage vectors to close (any strategy)
- **Paths and slugs** (`games/emma-unicorn-castle/`), commit messages, branch names, PR and issue titles. Use opaque ids in paths and a neutral bot message template.
- **Commit author/committer.** Always the bot identity. Never a real name or email; requester is an opaque id trailer.
- **Agent artifacts** committed by accident: plan files, specialist notes, voice transcripts, playtest logs naming the child. Use a deny-list and secret/PII scan in the commit service.
- **Generated content containing names.** The title, dialogue or credits ("Made by Emma, age 8"). Lint before Publish-source, and default display handles.
- **GitHub Actions logs** (public on public repos), PR preview deployments, GitHub Pages. Run CI in our sandboxes, not Actions, or keep repos private.
- **Issue and PR attachments.** Bug-button screenshots must go to our private storage, never GitHub issue uploads. Whether private-repo attachment URLs need authentication is [U].
- **Preview videos and screenshots** in buckets with guessable or permanent URLs. Use a private bucket and signed URLs.
- **Fork provenance** pointing at a private source, which reveals its existence.
- **History after a visibility change.** Public → private cannot be recalled: clones, forks, search caches and archives such as Software Heritage keep it [M]. Private → public is safe only if the history is scrubbed.
- **Source maps and bundled debug strings** in published builds.

### Three storage strategies
| | S1 Private monorepo plus explicit source publishing (**recommended**) | S2 Public monorepo for shared games plus private repo for private games | S3 Repo per game |
|---|---|---|---|
| Matches Kevin's folder preference | ✓ (`games/<id>/`) | ✓ (two trees) | ✗ |
| P3 truthfully available | ✓ default | ✓ only for games *born* private | ✓ |
| Public → private toggle honest | ✓ (source never public unless exported) | ✗ history already public | ✗ same |
| Open source story | "Publish source" exports a scrubbed snapshot to a public repo (shared or per game), opt-in, off by default for children (V3) | Automatic for shared games | Flip repo visibility |
| Enforcement | Commit service (plus private push rulesets) | Commit service; no push rulesets on the public repo | Repo-scoped token gives real GitHub isolation |
| Ops cost | 1–2 repos, one lock | 2 repos, moving games between them is messy | Hundreds of repos, App install lists, per-repo setup |
| Cost | GitHub Free org: private repos free [M] | Same | Same |

**Recommendation:** use S1.
- The **"Private" toggle means P1 + P2.**
- P3 is the platform default, because nothing is public until an owner (with guardian approval for children, V3) runs "Publish source".
- This keeps the open-source desire as a deliberate, reviewable act and never makes the toggle lie.
- Keep large binaries in object storage referenced by hash, not Git or LFS, to keep the repo small.
- Re-evaluate S3 only if bring-your-own-GitHub (§9.5) arrives, because a per-game repo is what a household would connect.

---

## R12 — Multiplayer gameplay plus editor spectators

### Requirement
Room/state architecture covering owner-only edit, pause-for-room, a visible cursor/knob view, private invites, shared progress, reconnection and version coordination. Verify what libraries actually do (§5.8, R12).

### Sources and versions [V]
- `colyseus` 0.18.9, `@colyseus/core` 0.18.21 (2026-10-21), `@colyseus/schema` 5.0.42, MIT, 7.4k stars. The 0.18 announcement is dated 2026-08-20.
- Docs read: home, `netcode/client-prediction`, reconnection (via search snippets), scalability (via snippet).
- PartyServer `partyserver` 0.5.10 (ISC, `cloudflare/partykit` 1.3k stars) and `partysocket` 1.3.0. The classic `partykit` CLI is 0.0.115 (`partykit/partykit` 5.7k stars, still pushed 2026-10-09).
- Nakama 13.6k (Apache-2.0, Go).

### What Colyseus provides, precisely
- **State sync.** Authoritative server state, "clients receive binary delta patches automatically" (Schema 5.0). `StateView` gives per-client filtered views, and 0.18 adds `view.subscribe(collection)` [V].
- **Prediction, reconciliation and interpolation: present since 0.18** ("Built-in client prediction, rollback, interpolation, and lag compensation, new in 0.18") [V]. The spec's "unverified" flag is now resolved, but with conditions:
  - The developer supplies "one deterministic function … that runs on both client and server".
  - The server must `setFixedTimestep`.
  - `adopt` reseeds scalars only: "Non-scalar engine state (contact caches, sleeping islands, solver accumulators) is not rolled back".
  - Unreliable inputs need WebTransport (JS only, experimental).
  - **So a physics-engine game is only partly covered**, and *the step function runs on the server*.
- **Rooms and lifecycle.** `onAuth`, message handlers, `maxClients`, `lock`.
- **Reconnection.** `onDrop` plus `allowReconnection(client, seconds)`, then `onReconnect` or `onLeave` on timeout. Reconnection arrived in 0.17 [V via doc snippet]. The client SDK resets the input handle on reconnect.
- **Scaling** requires Redis (`RedisPresence` + `RedisDriver`, the latter `@colyseus/redis-driver` 0.18.5) and **a per-process `publicAddress`** since 0.15 [V via doc snippet].

### The authority problem the libraries don't solve
Server-authoritative Colyseus means **agent-generated game logic executes in the `mp` service**. That violates R05: untrusted code in a game-serving process, next to room secrets, and possibly crashing other families' rooms. Options:
- **A. Host-authoritative relay (recommended for invite-only co-op).**
  - The platform-owned room is generic and has no game code. It owns membership, roles, pause state, version pin, editor-spectator stream and input/state relay.
  - The game simulation runs in the **owner's sandboxed iframe**. Other clients send inputs and receive host snapshots, interpolated by an SDK helper.
  - Cheating is irrelevant among invited family. Host migration on owner disconnect is a product decision.
  - Colyseus's built-in Predict is *not* used. The SDK owns a simple snapshot interpolation instead, which games call rather than reimplement.
- **B. Server-authoritative with game logic in a per-room sandbox** (e.g. a Railway Sandbox per active room). This is correct and uses Colyseus prediction, but costs about $50/vCPU-month while rooms are live, adds latency hops and is complex. Reserve it for genres that truly need it (competitive, physics-heavy).
- **C. Deterministic lockstep/rollback.** It requires all generated games to be deterministic, which is unrealistic for agent output.

### Room model (A, on Colyseus)
- **State.** Room state, platform schema only: `{ gameId, releaseId, buildHash, ownerId, phase: playing|pausedForEdit|migrating, members{id,role:owner|player|guest,connected}, editor{ focusControlId, cursor{x,y}, knobs{id→value}, panelVisibility: public|private } }`.
- **Authority.** `onAuth` validates the Better Auth session or guest code, then checks the play grant for a private game. `ownerId` comes from the game record, never from the client. Every `editor:*` and `pause` message checks `client.auth.userId === ownerId`; anything else is dropped and logged.
- **Pause for room.** The owner entering edit mode sets `phase=pausedForEdit`, and all clients freeze their sim. Resume is owner-only. It is scoped to this room, never global.
- **Spectator view.**
  - The owner's editor emits throttled (about 15 Hz) cursor, focus and knob deltas.
  - The server forwards them through a `StateView` that **omits private panels**. While the owner is in prompts, budget or admin panels, spectators see only "Uncle Kevin is typing a request…".
  - Prompt text, costs and admin data never enter room state.
- **Draft previews.**
  - *Knob-level edits* (agent-defined controls) are ephemeral **room overlays** on the pinned release, visible to room members only and discarded or saved to the draft explicitly.
  - *Code-level edits* (agent builds) produce a draft build. The owner may "load draft in this room", which grants room members temporary read of that draft build (signed URL, expires with room) and sets `phase=migrating`. It never publishes.
- **Version coordination.**
  - The room is pinned to `releaseId` + `buildHash` at creation, and join rejects a mismatch with a "reload to join" prompt.
  - When a new release publishes, members see "update available". The owner chooses "update room": pause, host serialises state (R09 bounded migration), all clients load the new build, resume.
  - There are no silent mid-session swaps.
- **Reconnection.** `allowReconnection` gives 60 s for players and 120 s for the owner. If the owner drops, the room auto-pauses (host-authoritative means no sim without the host). After the timeout it either ends with progress saved to the owner's slot or migrates host; **Kevin decides**.
- **Shared progress, achievements, save.** The host is the authority. Saves go to the owner's slot (plus optional per-player copies, R09). In multiplayer, achievements are awarded by host attestation; that trust is acceptable for invite-only use (R10).

### Alternatives checked
- **PartyServer** (Durable Objects plus Hibernation) is an excellent fit for a generic relay room and gets per-room isolation by design. But it moves `mp` to Cloudflare, breaking "single Railway project". It is pre-1.0 and its README says "this is a Work in Progress". PartyKit was acquired by Cloudflare in 2024 [M]. The classic `partykit` platform still ships but sees little change.
- **Nakama** is a full game backend (Go, own accounts) that duplicates Better Auth and Postgres responsibilities. Too heavy.
- **geckos.io** is WebRTC unreliable transport (1.5k stars, last push March 2026). Only if latency demands it.
- **Yjs over a WebSocket** could carry the editor-spectator state but not gameplay. Unnecessary given room state.

### Railway fit
- WebSockets work, but connection lifetime is not guaranteed [C], so clients must reconnect (Colyseus and PartySocket do).
- **Run `mp` as one service with one replica.** Railway has no sticky sessions and Colyseus multi-process needs a per-process public address plus Redis. Scaling out later means *N separate services* with their own domains plus Redis, not replicas.
- A single Node process carries many small relay rooms. Keep it separate from `worker` so builds never touch tick timing (R05 D1).

### Evaluation method
Prototype with two demo games (platformer, top-down):
- Relay round-trip on Railway Hobby measured at p50/p95, 4 clients, 20 Hz snapshots.
- Pause/resume correctness.
- Kill the owner tab and reconnect within or after the window.
- Release swap mid-room.
- A spectator never receives private-panel fields (assert on the wire).
- Budget: Hobby plan only.

---

## Licensing and data-handling questions
- **(V3)** Railway, E2B, Modal and Cloudflare all process **generated game code and possibly kid-authored text, drawings or voice-derived prompts**. Which processors are acceptable for children's data, and under what DPA, is for A8.
- The Daytona open-source line is frozen; avoid.
- Colyseus, Better Auth and the Railway SDK are MIT. PartyServer is ISC. E2B runtime, gVisor and Firecracker are Apache-2.0. No copyleft concerns found.
- **(V3)** The GitHub org holding children's games: whether a *private* GitHub repo is an acceptable store for child-created content (GitHub as a processor) is an A8 question.
- **(V3)** Publishing source under an open licence on a child's behalf: who grants the licence (guardian), and which licence? Kevin/A8.

## Stack integration summary
- **TypeScript throughout:** Better Auth in `api`; Colyseus server and client; `railway` SDK (or `e2b`) behind a four-method `SandboxProvider` in `worker`; Octokit Git Data API in the commit service.
- **aiur (A6)** sits in `worker`. It needs: tool execution proxied into a remote sandbox (not local shell), a path-allow-listed commit step, and cancellation that destroys the sandbox. A6 should confirm whether aiur's executor can target a remote exec API.

## Next steps
1. Kevin approves an approximately $5 Railway Sandbox and E2B Hobby isolation spike (R05 evaluation).
2. Write the `authorize(actor, action, resource)` policy module with this matrix as table-driven tests before any UI.
3. Create a private `games` repo plus GitHub App (contents:write on that repo only) and implement the commit service with path validation and CAS ref updates.
4. Lay down the invitation state machine (V1, adults); the supervision part waits for A8's guardian-verification method **(V3)**.
5. Spike a Colyseus relay room post-MVP with the spectator-filtering assertion.

## Decisions for Kevin
1. **Sandbox vendor:** Railway Sandboxes (one vendor, egress open, no secrets inside) **vs** E2B (egress allow-lists, second vendor, $150/mo if over 1 h sessions).
2. **Meaning of "Private":** accept P1 + P2 for the toggle, with source confidential by default and open source via an explicit "Publish source"?
3. **Open-source default:** may adults' games auto-publish source, or is it always opt-in? For children, guardian approval required? **(V3)**
4. **Forking:** can players fork (token-free, uneditable until upgraded)? Does access to a private game include fork rights?
5. **(V3)** **Child invite power:** confirm child accounts cannot invite; friend invites go through the guardian.
6. **Admin visibility scope** over invitees: everything, activity only, or aggregate for adults?
7. **Accountless room guests:** allow (room-only, no saves), or require accounts for everyone?
8. **Owner disconnect in multiplayer:** end the session and save to owner, or migrate the host to another player (no editing)?
9. **Multiplayer authority:** accept host-authoritative (trust among invitees) for MVP+1, reserving per-room sandboxed servers for later genres?
10. **Home worker:** defer (recommended) or prioritise?

Not checked: Railway's actual hypervisor and service runtime, official sandbox egress docs, the current GitHub plan matrix for push rulesets, GitHub private-attachment auth, Fly Machine isolation docs, and Modal network-control options. All are marked [U]/[C] above.
