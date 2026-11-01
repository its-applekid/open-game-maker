# T03 sandbox-and-commit: evidence packet

Researched at OGM `9508c1c` (branch `research`) against aiur `main` `0f692a45b`, on this host (`applekid`, Debian 13, kernel 6.12.113), 2026-10-31. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

Per-job isolation for the coding agents and the build/verify steps that run on this machine instead of E2B: what the host offers, egress control, the model proxy question, the commit service as the GitHub writer, the publication content gate, secrets handling, and how aiur's workers are launched inside the sandbox. It also covers the GitHub-token exposure item from `docs/handoff/aiur-executor-split-prompt.md`.

## 2. Evidence packets

### E03-1: The host can run unprivileged bubblewrap sandboxes with a private network namespace
- Claim / current behavior: `bwrap 0.12.0` is installed; `/proc/sys/kernel/unprivileged_userns_clone` = 1; `max_user_namespaces` = 126305; AppArmor is on but Debian has no `apparmor_restrict_unprivileged_userns` knob. `bwrap --unshare-all` (no `--share-net`) runs as uid 1001 and sees only `lo`; `unshare -Urn` works.
- Source and exact locus: `which bwrap`, `/proc/sys/kernel/unprivileged_userns_clone`, `bwrap --unshare-all ... /bin/sh -c 'cat /proc/net/dev'` (returned `lo` only), `unshare -Urn id` (uid 0 inside).
- Why it matters: every zero-cost sandbox on this machine (Codex's own, Claude Code's own, aiur's `exec_command`) is bwrap-based and needs exactly this.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: B13 §3 and B4 §2 say "no user namespaces, bwrap cannot run" for Railway; that constraint is moot here.
- Suggested requirement/decision impact: the V1 sandbox is bwrap-based process isolation, not a VM. Record it as the A7 assumption's answer.

### E03-2: cgroup v2 limits work from an unprivileged `systemd --user` scope
- Claim / current behavior: `/sys/fs/cgroup` is cgroup2 with `cpu memory pids` delegated to `user@1001.service`; `systemd-run --user --scope -p MemoryMax=512M -p CPUQuota=50% -p TasksMax=64` placed the command in `app.slice/run-*.scope` and `memory.max` read back `536870912`. `Linger=yes` for this user.
- Source and exact locus: `/sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service/cgroup.subtree_control`; `systemd-run --user --scope ...` output; `loginctl show-user $USER -p Linger`.
- Why it matters: B4 T6 (resource exhaustion) can be met per job without root: wrap each aiur worker launch, or the whole game-builder daemon, in a scope with memory/pid/CPU caps.
- Confidence and freshness: [M].
- Contradiction or open question: `systemd-run --user --scope -p IPAddressDeny=any /bin/true` was accepted (rc 0) but an unprivileged manager cannot attach cgroup BPF, so the filter is likely ignored [I]; not tested because it needs an outbound probe (no network in this research). Do not rely on it.
- Suggested requirement/decision impact: resource limits ticket (shared with T11). `cpuset`/`io` are not delegated; don't plan on pinning cores.

### E03-3: Docker is installed but unusable by this user; KVM exists but is unreachable; no other sandbox tooling
- Claim / current behavior: `docker 26.1.5` client present, `docker info` fails with permission denied on `/var/run/docker.sock` (group `docker` contains only `applekid`); `/dev/kvm` exists (group `kvm`, no members; CPU has VT-x on 24 threads reported by `/proc/cpuinfo`); `podman`, `firejail`, `nsjail`, `runsc`, `slirp4netns`, `pasta`, `nft`, `iptables`, `crun`, `socat` are all absent; `runc` and `unshare`/`nsenter` are present.
- Source and exact locus: `which ...` survey; `docker info`; `getent group kvm docker`; `ls -la /dev/kvm`.
- Why it matters: Firecracker/gVisor/Docker paths all need Kevin to run `sudo` (group membership or installs). Adding `orangekid` to `docker` is root-equivalent and would widen, not narrow, the agent boundary.
- Confidence and freshness: [M].
- Contradiction or open question: aiur's `workspace.bootstrap_image` (Docker warm cache) is unusable here [V `config/schema/workspace.ex` line 25].
- Suggested requirement/decision impact: V1 does not use Docker, KVM or a kernel-level egress filter. Everything below is designed around that; the `remind` list for Kevin stays optional (see §7).

### E03-4: Codex CLI 0.162.1 ships a working Linux sandbox that blocks network and home writes but reads every credential file
- Claim / current behavior: `codex sandbox -- /bin/sh -c ...` run from the repo dir: `/proc/net/dev` shows only `lo` (private netns), writing `~/.ogm-probe` failed with "Read-only file system", but `~/.config/gh/hosts.yml`, `~/.aiur/github-budget/agent-token`, `~/.codex/auth.json` and `~/.config/ogm` were all readable. The binary carries `landlock`, `bwrap`, `permission_profile`, `deny_read`, `secret_file`, `secret_env_var`, `network_proxy`, `inject_request_headers`, `readable_roots` strings.
- Source and exact locus: `codex sandbox` smoke run; `strings .../@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`; aiur `src/lib/aiur/init/agent_cli.ex` lines 134–159 (`check_codex_sandbox` probes `codex sandbox -- /bin/pwd`).
- Why it matters: this is the sandbox aiur actually dispatches into for Codex workers. Network denial for model-generated commands is already real on this host at zero cost; the open hole is read access to secrets (B4 T2) and the pack library.
- Confidence and freshness: [M] for behavior, [V] for strings; the semantics of `deny_read`/`secret_file`/`network_proxy` on 0.162.1 are [I] (no shipped docs in the npm package; `codex sandbox --help` shows `--sandbox-state-disable-network` and `-P <permission profile>`).
- Contradiction or open question: aiur hard-codes `readOnlyAccess: fullAccess` in its default policy (`config/codex_sandbox_policy.ex` line 74) and only validates `writableRoots` on a configured policy (`config/schema.ex` lines 195–209), so a restricted read policy must come from the Codex profile config, not from aiur's turn policy.
- Suggested requirement/decision impact: Codex is the V1 game-builder backend; a Codex permission profile with `deny_read` for the credential paths is the V1 credential boundary for commands (spike S1 in §6 confirms the keys).

### E03-5: Claude Code 2.1.316 carries its bubblewrap sandbox runtime
- Claim / current behavior: the installed `claude.exe` contains `bubblewrap` (69), `sandbox-runtime` (85), `allowedDomains` (109), `allowUnixSockets`, `excludedCommands`, `autoAllowBashIfSandboxed`, `enableWeakerNestedSandbox`.
- Source and exact locus: `grep -a -o` over `/home/orangekid/.nvm/versions/node/v24.14.0/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`; neither `~/.claude/settings.json` nor `~/.claude-2/settings.json` has a `sandbox` key.
- Why it matters: Claude can be a sandboxed fallback backend (Kevin: Codex until the limit, then Claude) with a domain allowlist, without root. aiur passes `permissionMode` only (`config/schema/agent.ex` line 13 default `bypassPermissions`); the sandbox is a settings-file feature in the profile dir (`CLAUDE_CONFIG_DIR`, `accounts/shims/claude.ex` line 8).
- Confidence and freshness: [V] strings; behavior [I], not run.
- Contradiction or open question: `bypassPermissions` plus sandbox-on is the combination aiur's hosted check forbids (E03-7); in local mode nothing checks it.
- Suggested requirement/decision impact: ticket "Claude fallback profile" is a spike, not on the critical path.

### E03-6: aiur `exec_command` (OpenAI-compatible backends) sandboxes with bwrap but shares the network and mounts the budget dir writable
- Claim / current behavior: `--unshare-all --share-net`, `--clearenv`, `HOME`=workspace, read-only `/usr` and system files, `--tmpfs /tmp`, budget state dir bind-mounted writable, `gh` overlaid by the guard, 300 s timeout, refuses to run without `bwrap`.
- Source and exact locus: `src/lib/aiur/open_ai_compat/command_runner.ex` lines 7–60, 125–137 (`budget_mount_args`), `@timeout_ms`.
- Why it matters: this is the only aiur-owned tool loop; it is network-open, so it is not an egress boundary and its backends need API keys (no spending), so it is out for V1.
- Confidence and freshness: [V] at `0f692a45b`; unchanged from B4 §2.
- Contradiction or open question: Kevin's decision-log pick "aiur's own tool loop (Kimi, DeepSeek, OpenRouter)" is superseded by A9 (subscriptions, no keys).
- Suggested requirement/decision impact: none for V1; note for V2 if keys arrive.

### E03-7: aiur `instance.mode: hosted` exists and fails closed, but no production backend can pass it
- Claim / current behavior: `HostedModeCheck` rejects `bypassPermissions`, requires Codex `networkAccess=false`, requires `credential_boundary: :daemon`, refuses tmux/REPL transports and non-API-key fallbacks. Registry facts: codex `credential_boundary: :agent`; claude `network_boundary: :unrestricted, credential_boundary: :agent`; OpenAI-compat `network_boundary: :unrestricted`. Docs: "no production backend can pass hosted startup until the hosted-safe backend work lands in #5701".
- Source and exact locus: `src/lib/aiur/orchestrator/hosted_mode_check.ex` lines 120–205; `coding_agent/providers/codex.ex` line 26, `providers/claude.ex` lines 29 and 117, `open_ai_compat/registry.ex` line 118; `website/docs-app/concepts/operating-aiur.md` lines 146–150; `docs/plans/2026-10-24-002-feat-hosted-api-key-auth-profiles-plan.md` lines 77–90 (model proxy #5702, sandbox VM #5703, remote workers #5953 deferred).
- Why it matters: B4 §2 change 4 ("hosted mode that fails closed") is covered on main, but it cannot be switched on for V1. The fail-closed preflight must live on the OGM side for now.
- Confidence and freshness: [V].
- Contradiction or open question: release plan "Sandbox: VM per job (E2B)" and "Funding: no subscriptions in hosted builds" vs. aiur `instance.deployment_kind: operator` ("Hosted operators may use subscriptions", `config/schema/instance.ex` line 55) and A9. The operator kind is the V1 fit.
- Suggested requirement/decision impact: V1 runs the game-builder aiur in `mode: local, deployment_kind: operator` with an OGM-owned preflight (ticket C4). File the aiur gap upstream after V1 (decision log "aiur gaps: work around then file").

### E03-8: The GitHub-token exposure from B4 §2 still holds on main, by design
- Claim / current behavior: the daemon writes the bot PAT to `~/.aiur/github-budget/agent-token` (0600, same uid as agents); the module doc says "This is a policy boundary, not a capability boundary: agents run as the same OS user as the daemon, so an agent that knows the path can read the file". The Codex sandbox read it in E03-4.
- Source and exact locus: `src/lib/aiur/github/access/wrapper_token.ex` lines 63–71; `github/agent_environment_contributor.ex` lines 44–48 (`AIUR_GITHUB_CREDENTIAL_FILE`); file `~/.aiur/github-budget/agent-token` [M exists, 41 bytes, 0600].
- Why it matters: on this host today the bot PAT **is Kevin's own login** (`.aiur/config` created 2026-10-31 for this repo: `bot_account: its-everdred`, "credential is GITHUB_TOKEN in ~/.aiur/.env"; `~/.aiur/.env` has only `GITHUB_TOKEN`). An agent building OGM can read a token that writes to everything Kevin can write to. The executor prompt says to raise this first.
- Confidence and freshness: [M]/[V].
- Contradiction or open question: the `GithubCredential` schema refuses `writes: true` on a `human` credential (`config/schema/github_credential.ex` lines 70–80), but single-identity installs bypass that by making the human the bot.
- Suggested requirement/decision impact: (1) for the OGM build itself: a free machine-user account as `bot_account` with a PAT limited to this repo; Kevin's PAT leaves `~/.aiur/.env` (Kevin action, free). (2) For the product: the game-builder daemon's bot is a machine user that is a collaborator only on game repos; the commit service, not the bot, holds the GitHub App key (E03-11). (3) `deny_read` on `~/.config/gh/hosts.yml` in the Codex profile (E03-4).

### E03-9: The credential files an agent on this host could read (names only)
- Claim / current behavior: all 0600, owned by `orangekid`: `~/.config/gh/hosts.yml` (Kevin's PAT, HTTPS), `~/.aiur/github-budget/agent-token`, `~/.codex/auth.json`, `~/.claude/.credentials.json`, `~/.claude-2/.credentials.json`, `~/.config/netlify/config.json`, `~/.config/ogm/` (ProFantasy serials), `~/.ssh/`, `~/.aiur/.env`; world-readable `~/github/aiur/.env` (0664) and `prototypes/studio-v0/.netlify-site-id`.
- Source and exact locus: `stat` survey; none were read.
- Why it matters: this is the concrete `deny_read` list for the Codex profile and the list `AIUR_SECRETS_FROM_ENV`-style loading must keep out of agent reach. `~/github/aiur/.env` at 0664 is a hygiene defect (outside this repo; flag to Kevin).
- Confidence and freshness: [M].
- Contradiction or open question: `~/.codex/auth.json` must stay readable by the Codex *process* (its own OAuth) but not by sandboxed commands; the game-builder profile gets its own `CODEX_HOME` (`accounts/shims/codex.ex` line 6) so Kevin's personal Codex login is not the one agents run as.
- Suggested requirement/decision impact: secrets ticket C6; `deny_read` list is an input to C2.

### E03-10: The `.aiur/config` written today for building OGM is network-open and bypass-permissions
- Claim / current behavior: `agent.codex.turn_sandbox_policy` = `workspaceWrite`, `writableRoots: [/home/orangekid/.aiur/workspaces, /tmp]`, `networkAccess: true`; `approval_policy: never`; `claude.permission_mode: bypassPermissions`; `instance.mode: local`.
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/.aiur/config` lines 60–75, 96–106.
- Why it matters: this config is for aiur agents building the platform from a trusted ticket set, not for creators' games; it must never be reused as the game-builder template. The game-builder template inverts it (E03-13).
- Confidence and freshness: [V] file dated 2026-10-31 22:24.
- Contradiction or open question: `/tmp` as a writable root lets one worker's commands write another's scratch (aiur's default excludes `/tmp`, `codex_sandbox_policy.ex` lines 78–83); drop it unless a build needs it.
- Suggested requirement/decision impact: two aiur daemons with two policies on this machine: platform-build (now) and game-builder (V1 product). Keep them in separate `.aiur` dirs and `CODEX_HOME`s.

### E03-11: aiur already mints GitHub App installation tokens; the commit service can mirror that in TypeScript
- Claim / current behavior: `Aiur.GitHub.AppCredentials` reads `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`; `AppToken` signs a 10-minute RS256 JWT and exchanges it per installation; the App token "must never reach agents" (`wrapper_token.ex` line 60). GitHub facts (A7 R07): installation tokens are repo-scoped, 1 h, no path scoping; push rulesets apply to all pushers and only on private/internal repos.
- Source and exact locus: `src/lib/aiur/github/app_credentials.ex` lines 1–30; `app_token.ex` lines 1–40; tests `src/test/aiur/github/app_token_test.exs`; A7 lines 229–235.
- Why it matters: a GitHub App is free, gives per-repo tokens that expire, and is installable by each family member on their own account (A11: per-user repos). A PAT (what `gh` holds here) is per-human, long-lived and attributes writes to Kevin.
- Confidence and freshness: [V] for aiur; GitHub facts [V] in A7 (2026-10-21).
- Contradiction or open question: the aiur daemon and the OGM commit service would both hold App credentials if the game-builder daemon also used App auth; keep App auth in the commit service only and give the daemon a machine-user PAT (its `bot_account`), as aiur's own two-identity design expects (`config/schema/github_app.ex` doc).
- Suggested requirement/decision impact: commit service = Node service with `@octokit/auth-app` + Git Data API, CAS ref updates (A7 lines 239–241). Kevin must create the App and install it (free; `remind`).

### E03-12: "Only the commit service writes to GitHub" cannot hold for build branches on aiur main; it can hold for `main` and all platform writes
- Claim / current behavior: aiur workers clone, branch (`aiur/<issue>`), push and open PRs themselves through the guarded `gh` (`.aiur/hooks` `after_create`; `priv/github_guard/gh/00-identity-a3-context.sh` lines 69–80). Daemon-owned Git publication is a deferred follow-up (#5701/#5953, E03-7); no module on main returns a patch to an orchestrator.
- Source and exact locus: as cited; B4 §3.4 lines 100–111; architecture doc lines 148, 208, 253 ("Only the commit service can write to a creator's GitHub").
- Why it matters: without an aiur change the B4 write boundary moves to the merge: the commit service validates every PR as a required check run and performs every merge, fold, fork, release and visibility change itself. Agents can push branches to a game repo but never land anything.
- Confidence and freshness: [V].
- Contradiction or open question: contradicts the architecture doc's wording; the practical boundary is "nothing reaches `main` or a release pointer without the commit service". The bot's branch pushes are bounded by the machine user's collaborator scope (game repos only).
- Suggested requirement/decision impact: tickets C3 (commit service) and C4 (boundary check run) with aiur `merge_policy.ci: wait` making `ogm/boundary` required (aiur `merge-policy.md` line 104 treats a failed required check as failed).

### E03-13: The V1 sandbox design that costs nothing (recommendation)
- Claim / current behavior: Two layers, same uid. **Layer A, commands:** Codex's own Linux sandbox with aiur `agent.codex.turn_sandbox_policy = {type: workspaceWrite, writableRoots: [<that job's workspace only>], networkAccess: false, excludeSlashTmp: true}` and a Codex permission profile in the game-builder `CODEX_HOME` denying reads of the E03-9 paths, `assets-local/`, and other creators' workspaces. **Layer B, processes:** the game-builder aiur daemon runs as a `systemd --user` service with `MemoryMax`, `TasksMax`, `CPUWeight` (T11), `agent.max_concurrent_agents` = admission slots (1 creation + 3 edit), `max_agent_duration_minutes` as the wall clock, `build_nice: 10`. **Identity:** a machine-user bot as `bot_account`, collaborator on game repos only; Kevin's logins never in the builder's profile dirs. **Writes:** E03-12. **Model calls:** leave from the Codex process (outside Layer A) on the subscription; no proxy.
- Source and exact locus: E03-1, E03-2, E03-4, E03-8, E03-11, E03-12; aiur keys verified in `config/schema/codex.ex` lines 39–48 and `config/schema/agent.ex` (`max_concurrent_agents`, `max_agent_duration_minutes`, `build_nice` present in `.aiur/config`).
- Why it matters: it satisfies B4 T1 (bwrap+landlock+seccomp for commands; not a VM, accepted), T2 (deny_read + separate profiles; bot PAT residual, E03-8), T3/T7 (no network from commands), T4 (one workspace per job, writable root = that workspace), T5 (E03-12), T6 (E03-2), with nothing bought and no root.
- Confidence and freshness: [O] built on [M]/[V] above; the `deny_read` semantics are the one [I] load-bearing piece (spike S1).
- Contradiction or open question: B4 §5 "E2B microVM per job" and "model proxy" are replaced; a kernel-level boundary (VM) is not available without `sudo` (E03-3). The games iframe boundary (B4 §3.5) is untouched and belongs to T09/T11.
- Suggested requirement/decision impact: replaces assumption A7's text with this design; `requirements.md` should state "process sandbox (bwrap/landlock), no network from agent commands, no secrets readable by agent commands, commit service gates main" as the V1 security bar and name the VM as V2.

### E03-14: No model proxy in V1; per-ticket spend caps replace it
- Claim / current behavior: a proxy with per-job tokens only makes sense for API keys the proxy holds (B4 D1-B). V1 has no keys (A9); Codex/Claude hold their own OAuth and call providers directly from the harness process, which is outside Layer A. aiur has a ticket-spend-cap plan (`docs/plans/2026-10-24-5693-ticket-spend-cap.md`) that names #5702 (proxy) as separate.
- Source and exact locus: as cited; `grep -i "model.proxy|ANTHROPIC_BASE_URL"` over aiur `src/lib` finds nothing [V].
- Why it matters: removes a V1 component; budget enforcement becomes aiur usage reads plus OGM admission (T01/T02).
- Confidence and freshness: [V]/[O].
- Contradiction or open question: release plan "Sandbox: ... a model proxy" (Decided) is overridden by "no spending". Codex's `network_proxy` feature with `inject_request_headers` [V strings] could become a command-level egress allowlist later (spike S3), which is a different thing from a model proxy.
- Suggested requirement/decision impact: drop the proxy ticket; add "egress allowlist for commands" to V2 unless S3 is cheap.

### E03-15: Sandboxed builds cannot `npm install` from the registry; the dependency store must be offline
- Claim / current behavior: with `networkAccess: false` every command is network-less (E03-4). `pnpm 10` is installed (`~/.nvm/.../bin/pnpm`); a pnpm content-addressable store under the home is readable from the Codex sandbox (full read by default; must stay in the readable set once `deny_read` is used).
- Source and exact locus: `which pnpm`; E03-4; B4 §5 "egress: allow registry.npmjs.org" assumed a VM with an allowlist.
- Why it matters: the engine template's lockfile plus `pnpm install --offline` from a seeded store is the only way builds complete without network; new dependencies become an explicit request (approval policy `on-request`, aiur native question) rather than an agent `npm install`.
- Confidence and freshness: [M] tooling; design [O].
- Contradiction or open question: Chromium for `gm-verify` must be preinstalled on the host (`/usr/bin/chromium` is [M] present) and run with `--no-sandbox` inside the outer sandbox; GPU access (`/dev/dri`) inside the Codex sandbox is [U] (spike S2).
- Suggested requirement/decision impact: ticket C7 (offline store) and spike S2, shared with T04/T10.

### E03-16: Publication content gate: what exists and what V1 needs
- Claim / current behavior: nothing in `prototypes/`, `scripts/` or `.claude/` commits, pushes or scans content (`grep octokit|git push|gh pr create` finds only research text). The spec requires enforcing "output/publication permissions" in code (§10.9 line 1163); A7 lists the leakage vectors (lines 264–275: paths/slugs, author identity, agent artifacts, names in content, Actions logs, attachments, source maps); C2 §10 adds usage-rights enforcement at publish via the lockfile (line 666); the architecture doc puts "PII and content checks on public repos" in the commit service (line 253).
- Source and exact locus: as cited.
- Why it matters: the gate is a deterministic function over (diff or tree, lockfile, profile names, visibility) with a verdict the voice agent can explain; it runs on every PR (`ogm/boundary`) and again at Publish and at any public visibility flip.
- Confidence and freshness: [V] sources; design [O].
- Contradiction or open question: child-account "publication gate" is V3 (release plan §4); the V1 gate is the adult/public-source one. "Advisory visual checks" at publish (spec line 890, L3 ~$0.05) is spending: out.
- Suggested requirement/decision impact: ticket C5; the lockfile rights schema is T05's contract.

### E03-17: Multi-repo hosting multiplies sandbox policies, not sandboxes
- Claim / current behavior: aiur runs one daemon per repository (`workspace.root` per config; B8 line 12; #5938 is V1 in B13). Each creator repo therefore gets its own game-builder daemon config, workspace root and writable root.
- Source and exact locus: `.aiur/config` `workspace.root: ~/.aiur/workspaces/its-everdred/open-game-maker-2000`; `config/schema/workspace.ex` line 20.
- Why it matters: the sandbox policy must be generated per repo (writable root = that repo's workspace root), and `deny_read` must exclude every other creator's workspace root. T02 owns the daemon-per-repo lifecycle; this track owns the policy template it stamps.
- Confidence and freshness: [V].
- Contradiction or open question: N daemons each with `max_concurrent_agents` must share the host admission (1+3) — the OGM backend, not aiur, is the global limiter (T01).
- Suggested requirement/decision impact: C1 produces a function `renderAiurConfig(repo, workspaceRoot, denyReadRoots)`; C4 verifies the rendered file before each dispatch.

### E03-18: Separate-uid isolation is available only with `sudo` (deferred default)
- Claim / current behavior: aiur's SSH-worker mode launches the Codex app-server over SSH stdio on another host (`docs/spec/appendix-ssh-worker.md` A.1; `codex/app_server_port.ex` line 118 `start_port_remote`); Claude is local-only (`claude/coding_agent.ex` line 68 `worker_host: nil`). A second local user (`ogm-builder@localhost`) would make every Kevin credential unreadable by construction, but creating the user, its subuid range and sshd access needs root. `/etc/subuid` already has ranges for `applekid` and `orangekid`.
- Source and exact locus: as cited; `/etc/subuid` [M].
- Why it matters: it is the cheapest real credential boundary on this machine (no VM) and uses an aiur seam that already exists for Codex.
- Confidence and freshness: [V]/[M]; untested.
- Contradiction or open question: configured `turn_sandbox_policy.writableRoots` extras "are not forwarded to SSH workers" (`config/schema/codex.ex` line 47); remote policy uses the workspace plus `.git`, `.agents`, `.codex` (`codex_sandbox_policy.ex` lines 290–297), which is exactly the tight policy wanted.
- Suggested requirement/decision impact: put on the `remind` list for Kevin (one `adduser` + sshd key); if he does it, ticket C1 gains a `worker.ssh_hosts` variant and E03-8's residual risk closes.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Command sandbox for Codex workers | Codex CLI 0.162.1 Linux sandbox (bwrap+landlock+seccomp, Rust, vendor binary); aiur turn policy `src/lib/aiur/config/codex_sandbox_policy.ex` (Elixir, tests: `src/test/aiur/config/*` partial, `hosted_mode_check_test.exs` yes) | Keep (configure) | Verified working here (E03-4); only config and a permission profile needed |
| Claude command sandbox | Claude Code 2.1.316 `sandbox-runtime` (bundled, strings only) | Keep as spike | Fallback backend; not run here |
| aiur `exec_command` bwrap runner | `src/lib/aiur/open_ai_compat/command_runner.ex` (Elixir, test `command_runner_budget_test.exs`) | Leave unused | Network-open, needs API keys |
| Hosted fail-closed check | `src/lib/aiur/orchestrator/hosted_mode_check.ex` (Elixir, tests yes) | Keep upstream; mirror a subset in OGM preflight (TS) | Cannot be enabled until aiur #5701 (E03-7) |
| GitHub App token minting | `src/lib/aiur/github/app_credentials.ex`, `app_token.ex`, `app_token_refresher.ex` (Elixir, tests yes) | Port the shape to TS (`@octokit/auth-app`) | Commit service is Node; keep the daemon on a machine-user PAT |
| GitHub write guard for agents | `src/priv/github_guard/gh/*.sh` + `wrapper_token.ex` | Keep (aiur's) | Governs agent `gh` calls; residual token readability accepted (E03-8) |
| Resource limits | `systemd-run --user` / user units (`scripts/drive-sync/ogm-drive-sync.service` as the unit pattern, `NoNewPrivileges`, `UMask=0077`) | Keep pattern | Measured working (E03-2) |
| Commit service, boundary check, content gate | Nothing in this repo | Build (TS) | E03-12, E03-16 |
| Sandbox proof tests | B4 §6 list (prose only) | Build as a script | Spec §10.9 demands evidence, not claims |

## 4. Interfaces and contracts this track defines or consumes

**Defines: game-builder aiur policy template (owner T03; consumed by T02's daemon-per-repo).**
```yaml
instance: { mode: local, deployment_kind: operator }
agent:
  priority: [codex]
  accounts: { codex: [gamebuilder] }          # CODEX_HOME=~/.config/ogm/codex-gamebuilder
  max_concurrent_agents: 1                     # OGM admission is the real limiter
  max_agent_duration_minutes: 45
  build_nice: 10
  codex:
    approval_policy: on-request
    thread_sandbox: workspace-write
    turn_sandbox_policy:
      type: workspaceWrite
      writableRoots: ["<workspaceRoot>"]       # that repo only; no /tmp
      networkAccess: false
      excludeSlashTmp: true
```

**Defines: Codex permission profile (owner T03; keys [I] until spike S1).** `~/.config/ogm/codex-gamebuilder/config.toml` with `[permissions.gamebuilder.filesystem]` `deny_read = ["~/.config/gh", "~/.aiur/github-budget", "~/.codex/auth.json", "~/.claude", "~/.claude-2", "~/.config/ogm", "~/.config/netlify", "~/.ssh", "~/.aiur/.env", "<repo>/assets-local", "<other workspace roots>"]` and `secret_file` entries for the same.

**Defines: commit service API (owner T03; consumed by T01 backend, T08 releases/forks, T05 lockfile).**
```ts
type CommitOp =
  | { kind: 'create_repo'; gameId: string; owner: string; visibility: 'public'|'private'; templateRef: string }
  | { kind: 'fold_design'; gameId: string; base: string /* sha */; files: { path: string; content: string }[] }
  | { kind: 'fork'; sourceGameId: string; sourceSha: string; newGameId: string; owner: string }
  | { kind: 'release'; gameId: string; sha: string; semver: string; changelog: string }
  | { kind: 'merge'; gameId: string; prNumber: number }
  | { kind: 'set_visibility'; gameId: string; visibility: 'public'|'private' };
type CommitResult = { ok: true; sha: string } | { ok: false; verdict: BoundaryVerdict };
type BoundaryVerdict = { allowed: boolean; reasons: { code: 'path'|'size'|'secret'|'pii'|'rights'|'denylist'; path?: string; detail: string }[] };
// route: POST /internal/commit  (loopback only, backend service token); check run name: "ogm/boundary"
```

**Consumes:** aiur `merge_policy.ci: wait` and required checks (T02); lockfile rights schema `assets.lock.json` (T05); per-job `gm` CLI token (T01/T05) so agents never hold bucket credentials (B6 §6 item 5); systemd unit layout and `EnvironmentFile=` paths (T11).

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| C1 | Game-builder aiur policy template | `renderAiurConfig()` emits the §4 template per creator repo; `/tmp` and network off; separate `CODEX_HOME` | `services/builder/aiur-config/` (TS), `~/.config/ogm/codex-gamebuilder/` layout | 2 | T02 daemon-per-repo contract | Daemon lifecycle, admission |
| C2 | Codex permission profile and deny-read list | Sandboxed commands cannot read E03-9 paths, `assets-local/`, other workspaces; proven by a probe script | `services/builder/sandbox/profile.toml`, `scripts/sandbox/probe.sh` | 3 | Spike S1 | Claude profile (C8) |
| C3 | Commit service | GitHub App auth, Git Data API CAS writes, ops in §4, audit row per op, loopback-only route | `services/commit/` (TS, Octokit), `packages/contracts/commit.ts` | 3 | Kevin creates the App (free) | Boundary rules (C4), release UX (T08) |
| C4 | Boundary check run and sandbox preflight | `ogm/boundary` check on every game-repo PR (paths, size, lockfile, secret/PII scan); dispatch refused unless the rendered aiur config matches C1 | `services/commit/boundary/`, `services/builder/preflight.ts` | 3 | C1, C3, T05 lockfile schema | Content gate at publish (C5) |
| C5 | Publication content gate | Deterministic verdict at Publish and visibility flip: rights (lockfile), agent-artifact denylist, names, source maps; explainable reasons | `services/commit/publish-gate/` | 2 | C3, C4, T05 rights fields | Visual/model checks (spend) |
| C6 | Secrets layout | `~/.config/ogm/*.env` 0600 + `EnvironmentFile=`; App PEM path; `AIUR_SECRETS_FROM_ENV=1` for the builder daemons; fix `~/github/aiur/.env` mode | `ops/systemd/*.service`, `docs/ops/secrets.md` | 1 | T11 unit layout | Rotations UI |
| C7 | Offline dependency store | Engine template lockfile + seeded pnpm store; `pnpm install --offline` in the build skill; new-dependency request path | `scripts/sandbox/seed-store.sh`, `skills/gm-build/`, template `package.json` | 2 | T04 template, T10 skill | Registry allowlist (V2) |
| C8 | Sandbox proof suite | B4 §6 tests 3, 6, 9, 11, 13, 14 adapted to bwrap/Codex, runnable on this host, results logged | `scripts/sandbox/proof/` | 2 | C2, C4 | iPad/browser tests (T09) |
| C9 | Claude fallback profile (spike) | `CLAUDE_CONFIG_DIR` profile with sandbox on, `allowedDomains` minimal, `permission_mode` non-bypass; go/no-go | `services/builder/claude-profile/` | 2 | C1 | Making Claude primary |

## 6. Risks and unknowns

- **S1 (spike, 1–2 h): Codex `deny_read`/`secret_file`/permission-profile semantics on 0.162.1.** Strings exist [V]; behavior [I]. Default if it fails: move the credential files out of the agent's reach instead (dedicated `CODEX_HOME`, `GH_CONFIG_DIR` already agent-private per aiur, `~/.config/ogm` moved under a root-owned path by Kevin) and accept read access to the bot PAT (E03-8).
- **S2 (spike): Chromium for `gm-verify` inside the Codex sandbox** (`--no-sandbox`, `/dev/dri`, `/dev/shm`). Default: run `gm-verify` as a backend-side job outside Layer A on the same workspace, read-only, under its own `systemd-run --user` scope.
- **S3 (spike, optional): Codex `network_proxy` with a domain allowlist** as a root-less egress allowlist for commands. Default: no network from commands in V1 (C7 makes builds work).
- **Residual: the bot PAT is readable by agents** (E03-8). Default: machine user scoped to game repos; the platform repo never grants it access; E03-18 as the real fix if Kevin runs the `adduser`.
- **Policy: Claude Code hosting-clause terms** (decision log open question 3) when the builder runs on subscriptions for other adults. Default: Codex-only for creators' builds until Kevin confirms; [O].
- **aiur hosted mode is unusable** (E03-7). Default: C4 preflight; file the gap upstream post-V1.
- **No kernel-level isolation** (process sandbox, same kernel, same uid). Default: accept for V1 (family, adults, invite-only) and state it in `requirements.md`; VM/second-uid is V2 or a Kevin action.
- **`IPAddressDeny` for user units** likely ineffective (E03-2). Default: do not use it as a control.

## 7. Self-hosting notes

Checked read-only on this host (2026-10-31): `bwrap 0.12.0`, `unshare` (util-linux 2.41.5), `systemd 257`, `runc`, `docker 26.1.5` (socket denied), `tailscale` present, `chromium` present, `codex-cli 0.162.1`, `Claude Code 2.1.316`, `aiur` and `aiur-claude` in `~/.local/bin`, `mise`, Node 24.14.0, pnpm. Absent: `podman firejail nsjail runsc slirp4netns pasta nft iptables crun proot socat caddy cloudflared`. Kernel 6.12.113, 12 threads, 31 GB RAM (16 GB available at check time), 2.8 TB free. User namespaces on; cgroup v2 with `cpu memory pids` delegated; `Linger=yes`; `/dev/kvm` present, not accessible.

What changes versus the Railway/E2B plan: no VM per job (process sandbox instead), no sandbox-provider key, no model proxy, no egress allowlist (commands have no network at all), the commit service and the builder daemons share the machine with the backend so secrets separation is by file permissions, profile directories and `deny_read` rather than by network. aiur workspaces live under `~/.aiur/workspaces/<owner>/<repo>` and already exist for this repo.

Only Kevin can do (all free; for the `remind` list): create the GitHub App and install it on his account; create a machine-user GitHub account for the builder bot and swap it into `~/.aiur/.env` (E03-8); `chmod 600 ~/github/aiur/.env`; optionally `adduser ogm-builder` plus sshd key for E03-18; do not add `orangekid` to `docker`.
