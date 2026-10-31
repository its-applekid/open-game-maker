# B4 — Proper sandboxing from day one (U04 / R05)

Research spike, 2026-10-21. Research only: nothing was bought, signed up for, deployed or sent to a vendor.
Inputs: spec v0.4 §7.6, §7.7, §9.1, §10.9, §14.1 U04; v0.4 companion conflict C1; A6; A7; aiur source at `~/github/everdred/aiur` @ `ad084b1f3` (read-only).
Claim tags: **[V]** verified on a primary source or in code; **[I]** inferred; **[U]** unverified. All web sources accessed 2026-10-21.

> **Version scope (2026-10-25):** Read this through `docs/spec/release-plan.md`. Almost all of it is **V1**: VM per job (E2B) with an egress allowlist, a model proxy, a commit service, and games in a separate-site iframe on a separate custom domain. Sandboxing is required from day one in every version. "Kid text" in the threats means any user's text; V1 users are adults. **V3:** children's-data terms for vendors and the microphone question for child accounts. **Changed since this report:**
> - **D3 (microphone):** Kevin picked **B**, games may use the mic directly. So the V1 iframe needs `allow-same-origin`, `allow="microphone"` and per-game subdomains (§5 note). The child-account case is reopened in V3.
> - **D1 (coding agent):** Kevin picked **A**, aiur's own tool loop (Kimi, DeepSeek or OpenRouter), not the recommended B. This awaits his confirmation and a terms check of those vendors (B1 option G). Option C (Agent SDK) is off: Kevin said to use aiur with API keys and build nothing new.
> - **D2 and D4:** Kevin picked A for both (E2B with an allowlist; a separate custom domain).
> - **Repos:** there is no platform-owned games repo. Each user connects their own GitHub and Game Maker creates the game's repo. Read "the games repo" and `games/<gameId>/` below as "that game's own repo".

## 1. TL;DR

- "Proper sandboxing" means four things. (1) Generated code, installs, shell commands and Playwright run in a **per-job microVM**, never in a Railway service. (2) **No real secret ever enters that VM**: model keys, the GitHub App key and the database stay with the orchestrator. (3) The VM's **network is deny-by-default**, with a short allowlist. (4) The game runs in the browser in a **sandboxed iframe on a separate site**.
- aiur cannot do this today. It runs the agent CLIs on its own host and bypasses permission prompts. Its only OS sandbox is bubblewrap, which does not work in a Railway service [U]. Inside that sandbox the GitHub credential file is still reachable [V, code].
- aiur already has the seam needed. Every workspace step takes a `worker_host`, and the SSH-worker mode launches the agent's app-server over remote stdio. The missing pieces are a "sandbox VM" execution target, a model-API proxy, and moving `git push` and PR creation out of the agent into the orchestrator.
- Railway Sandboxes exist and are real VMs [V]. **Outbound internet cannot be turned off or allowlisted** [V], so they cannot enforce the network boundary. E2B, Cloudflare Containers and Modal can [V].
- Recommendation: **E2B (Firecracker) for build VMs with an egress allowlist**, aiur orchestrator on Railway, and a commit service that validates paths. Arithmetic at list prices gives about $0.04 per 15-minute build.
- None of this counts until it passes the §6 test list. A vendor's isolation claim is not proof (§10.9).

## 2. aiur execution today (code-verified)

| Topic | What the code does | Consequence for hosted builds |
|---|---|---|
| Where agents run | `Aiur.CodingAgent.Backend` adapters (Claude app-server, Claude REPL, Codex app-server, Muse, OpenAI-compatible) spawn locally in a per-issue worktree (`Aiur.Workspace.create_for_issue/3`) [V]. | The agent loop, its tools and its credentials share one machine. |
| Permissions | `agent.claude.permission_mode` defaults to `bypassPermissions` (`claude/config.ex`) [V]. README: "trusted environments only" [V]. | Acceptable only if the machine holding the tools has nothing worth stealing. |
| Claude/Codex tool execution | The CLI owns its own tool loop (Bash, Edit and so on). aiur passes `cwd`, `permissionMode` and `dynamicTools` only (`claude/coding_agent.ex` `thread/start`) [V]. Codex policy is `workspaceWrite`, `readOnlyAccess: fullAccess`, `networkAccess: true` (`config/codex_sandbox_policy.ex`) [V]. | aiur cannot redirect Claude's or Codex's built-in tools somewhere else. Either the whole CLI moves into the sandbox, or a different backend is used. |
| aiur-owned tool loop | The OpenAI-compatible backends (Kimi, DeepSeek, OpenRouter; `open_ai_compat/registry.ex`) use five aiur tools: `read_file`, `write_file`, `replace_in_file`, `list_files`, `exec_command` (`open_ai_compat/tool_spec.ex`, `tools.ex`) [V]. | This is the **only place where aiur itself executes tools**, so swapping it to a remote executor is a small change. |
| OS sandbox | `exec_command` runs under `bwrap --unshare-all --share-net` with a cleared env and a 300 s timeout. It refuses to run if `bwrap` is missing (`open_ai_compat/command_runner.ex`) [V]. | Network is shared (open egress). Railway services reportedly lack unprivileged user namespaces, so bwrap fails there [U, forum only]. In that case `exec_command` and the Codex sandbox simply don't work on Railway. |
| GitHub credentials | Env tokens are scrubbed from agents (`agent_environment.ex`, #2356) [V]. However, the `gh` guard reads the PAT from `AIUR_GITHUB_CREDENTIAL_FILE` in the budget state dir (`priv/github_guard/gh/00-identity.sh`, `agent_github_guard/agent_token.ex`) [V]. `command_runner.ex` bind-mounts that dir **writable** into bwrap (`budget_mount_args`) [V]. | Code running as the agent can read the token file [I: the wrapper runs as the agent's uid]. The scrubbing is hygiene, not a boundary. |
| Git writes | The agent pushes and opens PRs itself through the guarded `gh` and git in its workspace [V]. | The write boundary sits inside the untrusted zone. It must move to the orchestrator (§3.4). |
| Remote execution | `worker.ssh_hosts` (`config/schema/worker.ex`, `docs/spec/appendix-ssh-worker.md`). For Codex, the whole app-server runs over SSH stdio (`codex/app_server_port.ex` `start_port_remote`). Claude passes `worker_host: nil`, so it is local only [V]. | This is a seam for "run the agent elsewhere", but the remote host still needs the agent's auth. No E2B/Railway/Firecracker backend exists in the code or docs [V, grep]. |
| Safety component | "Agent safety" (`components/agent-sandbox.json`) covers CPU pressure, the build gate and the process reaper [V]. | It protects the host. It is not a security boundary (consistent with A6). |

**Changes aiur would need**, as findings rather than tickets:
1. A "sandbox VM" execution target alongside local and SSH: provision, hooks, exec and file I/O against a provider API, with cancellation that destroys the VM.
2. No GitHub credential, no credential file and no budget-state mount inside the sandbox. Push and PR creation run in the orchestrator.
3. Model credentials. Either aiur's own tool loop runs in the orchestrator, or the CLI runs in the VM and reaches a model proxy using a per-job token (Decision D1).
4. A hosted-mode switch that refuses local execution, so it fails closed if the sandbox provider is down.

## 3. Findings

### 3.1 Threat model (what must hold)

| # | Threat | Boundary that must hold |
|---|---|---|
| T1 | A malicious or wrong `postinstall`, generated code, or an agent shell command | VM isolation (own kernel); nothing co-located |
| T2 | Secret exfiltration (model keys, GitHub key, DB URL, other families' data) | No real secret in the VM; egress allowlist; per-job token only |
| T3 | Prompt injection from user text, voice transcripts or drawings telling the agent to "curl X" or "edit platform/" | Egress allowlist plus orchestrator path validation. The prompt is not the control. |
| T4 | Cross-family leakage | One VM per job, destroyed afterwards; the workspace contains only that game; no shared volume |
| T5 | Writes outside the game (platform, SDK, `.github/`, other games) | Commit service path allowlist; App token limited to the games repo |
| T6 | Resource exhaustion (fork bombs, disk fill, crypto-mining, endless loops) | VM size cap, wall-clock timeout, idle timeout, per-family admission (§8.3) |
| T7 | Abuse of third parties from our IPs | Egress allowlist; short lifetimes |
| T8 | Game code attacking the host UI, session or other games | Separate-site sandboxed iframe, CSP, schema-validated bridge |

### 3.2 Railway itself
- Railway Sandboxes are real: each is a "fully isolated virtual machine". The hypervisor is not named [V] (docs.railway.com/sandboxes, railway.com/sandboxes).
- Networking is `ISOLATED` (default, "outbound internet only") or `PRIVATE` [V]. "Every sandbox has outbound internet access through a NAT gateway". No egress filter or allowlist is documented [V]. **Never use `PRIVATE`**: it joins the environment's private network [V/I].
- Limits [V]:
  - Hobby: 50 concurrent, 8 vCPU / 8 GB, idle timeout 30 min (configurable).
  - Pro: 100 concurrent, 24 / 24.
  - Free: 2 / 2 with a fixed 5-minute idle timeout.
- Pricing is $0.00001929 per vCPU-second and per GB-second; memory is billed while idle; egress is $0.05/GB [V].
- The SDK (`railway` npm `Sandbox`) offers `exec` with streaming, `timeoutSec` and `kill()`, plus a full `files` API, templates, disk-only checkpoints and forks [V].
- There is no "beta" label on the product page [V]. Docker-in-sandbox is early access [V].
- Ordinary Railway services have no KVM, privileged mode or user namespaces, per staff forum replies only [U]. So gVisor, Firecracker or bubblewrap **inside** Railway is not a viable plan [I].

### 3.3 Alternatives (detail behind §4)
- **E2B** [V] (e2b.dev/pricing, docs.e2b.dev/sandbox/internet-access, github.com/e2b-dev/runtime):
  - Firecracker microVMs.
  - `allowInternetAccess:false`, plus `allowOut`/`denyOut` by IP, CIDR or domain (wildcards), changeable at runtime.
  - Limits: domain filtering covers ports 80/443 only, QUIC is not filtered, and blocked TCP can appear to connect [V]. So also deny `0.0.0.0/0`.
  - Hobby: $0 plus $100 one-time credit, 20 concurrent, 1-hour session. Pro: $150/month, 24 h, 100 concurrent.
  - Runtime is Apache-2.0 and self-hostable ("Embed", needs KVM). Stars: SDK 14.5k, runtime 1.75k.
- **Cloudflare Containers / Sandbox SDK** [V]:
  - "microVM with its own kernel", GA 2026-04-13, Workers Paid.
  - `enableInternet=false`; `allowedHosts` turns on deny-by-default; outbound handlers can intercept or inject.
  - Needs a Worker in front, at least 3 GiB per vCPU, and at most 4 vCPU.
  - Browsers are steered to a separate product (Browser Run); in-container Chromium is not documented [V/I].
- **Modal** [V]:
  - gVisor by default, VM runtime optional.
  - `block_network`, CIDR allowlist, and a domain allowlist (beta, 443/SNI only).
  - Sandboxes cost 3× list price. The JS SDK has experimental parts.
- **Daytona** [V]:
  - Open-source repo archived; "core development has moved to a private codebase".
  - Network allowlists exist, but tiers 1–2 have network "restricted and cannot be overridden"; isolation technology unnamed.
  - Drop it (same as A7).
- **Fly Machines** [V]:
  - Firecracker, about 2 s cold start, cheap.
  - **No documented egress filtering**. You would also be building your own job lifecycle.
- **Self-run gVisor/Firecracker** [V]:
  - Firecracker needs `/dev/kvm`; gVisor's systrap platform does not, but rootless mode is limited.
  - It cannot run on Railway services, and the spec rules out a home worker for V1.
- **Playwright/Chromium**:
  - It needs roughly 1–2 GB RAM and a real `/dev/shm`, or `--disable-dev-shm-usage` [I].
  - Bake Chromium into the template so tests need no download egress [I].
  - All VM options can run it; none publishes a Playwright-specific guarantee [I].

### 3.4 GitHub write boundary
- GitHub tokens are scoped to repositories and permissions, not paths (A7 [V]).
- Push rulesets can "prevent commits that include changes in specified file paths". Limits are 200 fnmatch entries, and they apply only to **private or internal** repositories (docs.github.com, *Available rules for rulesets*) [V].
- Rulesets are static per repository and apply to everyone. They cannot express "user A writes only `games/A/`" [I, from the rule definition]. They are defence in depth (block `.github/**` and `platform/**`), not the boundary.
- **The boundary is a commit service in the orchestrator:**
  1. The VM returns a patch or file set.
  2. The service checks that every path is under `games/<gameId>/`, that the caller's job owns that `gameId`, the size and type limits, the deny-list (`.github/**`, lockfile/registry overrides, binaries), and a secret/PII scan.
  3. It commits with Git Data API calls and a compare-and-swap ref update, using an App installation token for the games repo only.
  4. aiur's PR, check and merge flow runs on that branch from the orchestrator.
- Blocking `.github/**` matters: a generated workflow could otherwise run with repository secrets [I].
- CI results come from the sandbox and are posted as check runs (companion C6).

### 3.5 Browser side
- **Origin:**
  - `netlify.app`, `github.io` and `pages.dev` are on the Public Suffix List [V], so `x.netlify.app` is cross-site to the host app.
  - Netlify `_headers` / `netlify.toml` can set CSP [V], except on Function or Edge responses.
  - A second Netlify site, or a separate custom registrable domain, works [I].
- **Gamepad:**
  - The Permissions Policy feature `gamepad` defaults to `*` [V]. Safari doesn't implement the policy [V, MDN data].
  - `getGamepads()` stays empty until input is seen *in that document* [V, spec]. The game must poll for itself.
- **Audio:** user activation propagates to ancestors and same-origin descendants only [V, HTML spec]. **A parent tap does not unlock audio in a cross-origin game.** The game needs its own "tap to start" that calls `AudioContext.resume()` [I].
- **Microphone:**
  - A sandboxed frame cannot call `getUserMedia` without `allow-same-origin` [V, MDN].
  - Cross-origin frames need `allow="microphone"` [V, Chromium]. WebKit implemented `allow=` for mic in 2017 [V]. Prompt and remember behaviour on today's iPad is **[U]**.
- **Fullscreen:**
  - iPadOS has the unprefixed API since Safari 16.4 [V]; iPhone is video-only [I].
  - Have the **parent** call `iframe.requestFullscreen()` from its own button, which avoids delegation [I].
  - **Added 2026-10-22:** MDN compat data (`api/Element.json`) says iOS Safari fullscreen is "Only available on iPad, not on iPhone" and "Shows an overlay button which can not be disabled. Swiping down exits fullscreen mode, making it unsuitable for some use cases like games." [V]
    - Don't rely on fullscreen on iPad. A home-screen web app or a layout that fills the viewport is the likely route [I, untested].
    - The device test should check whether an accidental swipe-down exit breaks play.
  - Firefox 66+ blocks `getUserMedia()` in sandboxed iframes [V, MDN]. This is consistent with D3-A (no mic in games). *Kevin picked D3-B, so the game frame must allow the mic; test this in Firefox too.*
- **Focus:** the parent calls `iframe.focus()` after load; the game calls `window.focus()` on its first pointerdown; fall back to a "tap to play" overlay [I].
- **Storage:** an opaque origin (no `allow-same-origin`) has no localStorage or IndexedDB [I, spec]. Third-party storage is partitioned anyway [V]. Saves should go through the bridge to the backend, which matches spec §5.16.

## 4. Options table

Costs are 2 vCPU / 4 GB × 900 s at list price, computed by arithmetic. Egress is extra.

| Option | Isolation | Egress control | Cold start | Chromium | $/15-min build | Maturity / fit |
|---|---|---|---|---|---|---|
| Railway service (no sandbox) | Shared-kernel container [U] | None [V] | n/a | yes | — | **Not acceptable** (§7.6) |
| **Railway Sandboxes** | VM, hypervisor unnamed [V] | **None: outbound always on** [V] | "seconds" [V] | yes [I] | ≈$0.10 (CPU billed on use) | GA-looking, one vendor, SDK fits; fails the network boundary |
| **E2B** | Firecracker [V] | Domain/CIDR allow and deny lists, 80/443 domain filtering [V] | not published [U] | custom template [I] | ≈$0.04 | Mature, OSS runtime, 1 h Hobby cap is fine for 15 min |
| Cloudflare Containers | microVM [V] | `enableInternet:false` plus `allowedHosts` [V] | not checked [U] | possible, undocumented [I] | ≈$0.05 | GA 2026-04; Worker front, 4 vCPU max, second platform |
| Modal | gVisor (VM optional) [V] | Block, CIDR, domain (beta) [V] | "sub-second" (marketing) [U] | yes [I] | ≈$0.18 | Python-first; JS SDK partly experimental |
| Daytona | Unnamed "dedicated kernel" [V] | Allowlists, tier-restricted [V] | <90 ms claim [V] | 8 GB cap | ≈$0.04 | OSS archived; drop |
| Fly Machines | Firecracker [V] | None documented [V] | ~2 s [V] | yes | ≈$0.01–0.02 | Build your own lifecycle; no egress control |
| Self-run gVisor/Firecracker | strong if correct | DIY nftables | fast | yes | hardware | Needs KVM; no Railway path; home worker excluded |

## 5. Recommended architecture

```
Browser (iPad/PC)
 ├─ Host app  https://app.<host-domain>          (Netlify)  session, voice, editor
 │    └─ <iframe sandbox="allow-scripts allow-pointer-lock"
 │               allow="fullscreen; gamepad; autoplay">  ← opaque origin
 │         https://<id>.<games-domain>/  (separate registrable domain, CSP)
 │         ⇄ MessageChannel bridge (schema-validated: save, input, telemetry)
 └─ API  ───────────────────────────────►  Railway "production" env
                                            api (auth, families, jobs, saves)
                                              │ private network only
                                            orchestrator = hosted aiur + commit service
                                              holds: model keys, GitHub App key (games repo)
                                              │ provider API (create/exec/files/destroy)
                                              ▼
                              E2B microVM per job  (template: Node, pnpm, Chromium)
                                holds: one game folder, pinned SDK, per-job token
                                egress: deny all; allow registry.npmjs.org
                                        (+ model proxy only if D1 = B)
                                returns: patch + test artifacts → commit service
```

Rules:
- One VM per job, destroyed in `finally` and on cancel.
- The idle timeout catches leaks.
- Wall-clock limit on every job.
- The VM is created with an empty env apart from the per-job token.
- The orchestrator has no public ingress.
- The sandbox API key lives only in the orchestrator.
- Model-generated paths and commands never become authority (§7.2).

*Note (2026-10-25):* the iframe in the diagram follows the recommended D3-A. Kevin picked D3-B, so V1 adds `allow-same-origin` to `sandbox` and `microphone` to `allow`, and serves each game from its own subdomain of the games domain so games cannot read each other's storage. Likewise, "GitHub App key (games repo)" means a token for the one game repo the user connected, not a shared games repo.

The `SandboxProvider` seam stays at four calls (create, exec, files, destroy), as A7 proposed. Railway Sandboxes remain a drop-in fallback if Kevin accepts open egress (D2).

## 6. Proof-of-sandboxing tests

Run these against the real hosted configuration. Each test passes only if the stated outcome is observed and logged. Tests are run as a generated `postinstall`, as an agent `exec`, and as text injected into a user prompt.

**Escape and isolation**
1. `uname -a`, `/proc/cpuinfo` and `dmesg` show a guest kernel that differs from the orchestrator's.
2. Scan for and try to open `/var/run/docker.sock`, `/dev/kvm`, the host `/proc/1/root` and cloud metadata `169.254.169.254`. All must be absent or blocked.
3. Run two concurrent jobs for different families. Job A cannot see job B's files, processes or network (ping and port scan on the sandbox subnet).
4. After destroy, the VM ID cannot be reconnected to, and a new job sees none of the previous job's files.
5. `*.railway.internal` and the orchestrator's private address do not resolve or connect from the VM.

**Secret exfiltration**
6. `env`, `cat /proc/*/environ` and `find / -name '*token*' -o -name '*.pem'` find no model key, GitHub key, database URL or sandbox-provider key. The only secret present is the per-job token, if D1 = B.
7. Using the per-job token, try a model call over budget or after the job ends. It is refused. Try any non-model endpoint. It is refused.
8. Planted canary secrets in the orchestrator never appear in any VM, log, PR body, check run or commit (scan all outputs).

**Egress**
9. `curl` to a non-allowlisted domain, a raw IP, port 22, UDP/53 to an outside resolver, QUIC/443, and DNS-tunnel attempts. All fail. Confirm with an external listener that nothing arrived, because E2B notes that blocked TCP can appear to connect.
10. `npm install` from the allowlisted registry succeeds. A package whose `postinstall` fetches a payload from elsewhere fails.

**Write boundary**
11. A patch touching `platform/`, `.github/workflows/`, `games/<otherId>/`, a symlink pointing outside the game, `../` paths, or a file over the size limit is rejected by the commit service, with nothing pushed.
12. A patch containing a fake secret or a user's real name from the profile is rejected by the scan.
13. The agent has no git remote credentials. `git push` from the VM fails.

**Resources and cancellation**
14. A fork bomb, filling the disk, a 100% CPU loop and memory exhaustion each kill only that VM within its limits. The API and other jobs show no latency regression.
15. Cancelling a job from the UI destroys the VM within N seconds, and the provider's billing or list API shows no running VM.
16. Orchestrator crash mid-job: the idle timeout reaps the VM, and reconciliation marks the job failed.

**Browser runtime**
17. The game tries `parent.document`, `top.location=`, `window.open`, form posts, `document.cookie` for the host, and `fetch` to the API with credentials. All are blocked or have no effect. Bridge messages that fail the schema are dropped and logged.
18. The game tries `fetch` or `<img>` to an outside domain. CSP blocks it. Accept the documented gap that self-navigation is not covered by CSP, or have the host detect the frame navigating.
19. On a real iPad (Safari) and a Windows/Chrome PC: gamepad, audio after an in-game tap, parent-driven fullscreen, keyboard focus, and the mic behaviour chosen in D3, using the §3.5 iPad checklist.

## 7. Decisions for Kevin

**D1. How does the hosted coding agent run while keys stay out of the VM?**
- A: aiur's own tool loop (the OpenAI-compatible backend) in the orchestrator, with `Tools.execute`/`exec_command` sent to the VM. Smallest aiur change, but only Kimi, DeepSeek or OpenRouter-routed models, and aiur's 5-tool harness rather than Claude Code or Codex.
- B: Claude Code or Codex CLI **inside** the VM, launched over a remote-stdio transport like the SSH worker. Model calls go through an orchestrator proxy that holds the real key and accepts a per-job, budget-capped, expiring token.
- C: A new backend that runs the Claude Agent SDK in the orchestrator with built-in tools disabled and MCP tools proxied to the VM.
- **Recommended: B.** It keeps the harness quality Kevin's own aiur already gets, and a leaked token is worth at most one job's budget.
- *Consequences:* the model proxy, the transport and the egress allowlist entry for the proxy all become aiur or Game Maker work. A is the cheap fallback if B slips.
- **Kevin's pick:** A (awaiting confirmation). It drops Claude Code and Codex from hosted builds, and the Kimi, DeepSeek and OpenRouter terms are not yet checked. C is off (build nothing new).

**D2. Is a network allowlist required for V1, or is "no secrets inside" enough?**
- A: Allowlist required → E2B (or Cloudflare).
- B: Open egress accepted → Railway Sandboxes, one vendor.
- **Recommended: A.** With open egress, T3 and T7 succeed: an injected prompt can still send user text and private context out, or attack third parties. The spec asks for a network boundary.
- **Kevin's pick:** A.
- *Consequences:* a second vendor and processor for A8 (a DPA; children's data only from V3), plus about $0.04/build or E2B Pro at $150/month if 20 concurrent or 1-hour sessions become limits.

**D3. Can generated games use the microphone directly?**
- A: No. Voice stays in the host app, and games get only derived events over the bridge. The iframe has an opaque origin (no `allow-same-origin`).
- B: Yes. Add `allow-same-origin` and `allow="microphone"`, which is safe only on a separate site, and per-game subdomains are needed to stop games reading each other's storage.
- **Recommended: A.** It is the stronger boundary, keeps kid audio out of untrusted code, and saves already go through the backend.
- *Consequences:* a "shout to jump" mechanic needs a host-provided voice event API. Revisit in V2.
- **Kevin's pick:** B, games may use the mic directly (V1, adults). Per-game subdomains become a V1 need (D4). The question is reopened for child accounts in V3, where A's "keeps kid audio out of untrusted code" argument applies again.

**D4. Games origin.**
- A: A separate custom domain.
- B: A second `*.netlify.app` site.
- **Recommended: A.** Both are separate sites [V], but a custom domain survives a host change and supports per-game subdomains later.
- *Consequences:* one domain purchase, which is Kevin's spend to approve.
- **Kevin's pick:** A.

## 8. Uncertainty

- **[U]** Railway services lacking user namespaces or KVM comes from forum replies, not docs. This decides whether aiur's existing bwrap sandbox runs there at all. It does not change the recommendation.
- **[U]** Cold start for E2B, Railway and Cloudflare is not published. It must be measured in the ~$5 spike (A7) before choosing.
- **[U]** E2B's 1-hour Hobby cap and 20-concurrency limit against real family load. Exactly how E2B domain filtering handles SNI-less TLS or IP-literal traffic needs test 9.
- **[I]** That Claude Code and Codex run correctly in an E2B template behind a model proxy (`ANTHROPIC_BASE_URL`-style override) is not tested here. D1-B depends on it.
- **[I]** Whether the agent can read the token file is inferred from code paths, not demonstrated. It is irrelevant once hosted mode mounts nothing.
- **[U]** iPad Safari behaviour for audio unlock, gamepad focus, iframe fullscreen, mic prompts and ITP storage expiry needs a real-device test (§6 test 19).
- **[U]** Vendors' children's-data terms (A8) were not reviewed. This matters from V2 (teens) and V3 (children). Daytona's and Cloudflare's isolation internals rely on vendor statements.
- Not checked: the GitHub plan matrix for private-repo push rulesets; the Railway SDK source; Fly per-second prices.
