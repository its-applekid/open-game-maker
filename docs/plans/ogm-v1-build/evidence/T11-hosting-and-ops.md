# T11 hosting-and-ops: evidence packet

Researched at commit `9508c1c` (branch `research`), host `applekid`, 2026-10-31 22:20 PDT. aiur reference `/home/orangekid/github/aiur` @ `0f692a45b`. Every host fact below was read with `which`, `--version`, `systemctl --user`, `loginctl`, `ss -tlnp`, `df`, `free`, `ps`, `tailscale status|serve status|funnel status`, and `cat` of world-readable config. Nothing was changed; nothing ran with sudo. No secret value was read or printed; variables are named only.

## 1. Scope of this track

Replace the Railway side of the V1 architecture with this machine: supervision, reverse proxy and TLS, a public hostname, the games origin, the blob store, the database, secrets, resource bounding of aiur's Codex/Claude workers next to the services, backups, logs, and the hand steps only Kevin can do.
Out of scope here: the sandbox boundary itself (T03), the bucket's content model (T05), the aiur job API (T02), the Netlify app (T09).
Everything recommended below costs nothing and needs no new provider key.

## 2. Evidence packets

### E11-1: The Netlify frontend is the only part of the decided hosting row that survives; every "Railway" cell is superseded
- Claim / current behavior: `release-plan.md` §2 "Hosting" row says "Netlify frontend, Railway backend, hosted aiur on Railway, Railway bucket. No CDN"; the "Sandbox" row says "VM per job (E2B)"; the "Funding" row says "Kevin's API keys through hosted aiur profiles. No subscriptions in hosted builds". Kevin's 2026-10-31 decision (README.md "Objective", questions-or-commands.md rows "Hosting", "Who implements") moves all of that to this machine on the subscriptions signed in here.
- Source and exact locus: `docs/spec/release-plan.md` lines 53–55; `docs/plans/ogm-v1-build/README.md` line 19; `questions-or-commands.md` A7–A9.
- Why it matters: B13 §3 ("agents always run in per-job VMs", "API keys only, separate from Kevin's subscription-based instances") and B4 §5's diagram are the architecture tickets would otherwise copy. None of it applies verbatim now.
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: the "Funding" row (API keys only, no subscriptions) is contradicted by A9 (subscriptions). aiur's `instance.deployment_kind: operator` allows subscriptions; `consumer` does not.
- Suggested requirement/decision impact: decisions.md needs a "Hosting (self-hosted)" entry that lists which B4/B13/A7 rules still hold (no secrets in agent reach, loopback-only services, egress policy) and which are void (Railway private network, E2B, Railway bucket).

### E11-2: Process supervision is already solved by `systemd --user`; linger is on and the drive-sync unit is the house pattern (but is not installed)
- Claim / current behavior: `systemctl --user status` reports the user manager running since 2026-10-29 (246 units, 0 failed); `loginctl show-user $USER -p Linger` → `Linger=yes`. Existing units in `~/.config/systemd/user/`: `symphony.service` (Elixir app through `mise exec`, `EnvironmentFile=~/.config/symphony-dashboard.env`, `Restart=always`), `pz-auto-update.timer`, `aiur-agent-chat-poll.timer`. `scripts/drive-sync/ogm-drive-sync.service` (`Type=simple`, `Restart=on-failure`, `UMask=0077`, `NoNewPrivileges=yes`, `WantedBy=default.target`) is the repo's own pattern, but it is not installed: `systemctl --user is-enabled ogm-drive-sync` → `not-found`, and `~/.local/state/ogm` does not exist.
- Source and exact locus: `scripts/drive-sync/ogm-drive-sync.service` lines 6–18; `scripts/drive-sync/README.md` "One-time setup" step 9; `~/.config/systemd/user/symphony.service`.
- Why it matters: every OGM service (API, rooms, voice host, games host, aiur daemon, drive sync, backup timer) can be a user unit with no sudo; copying the drive-sync unit's hardening lines keeps them consistent.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: none.
- Suggested requirement/decision impact: a requirement "every long-running OGM process is a `systemd --user` unit under `ogm.slice` or `ogm-agents.slice`, enabled with `--now`, logs in the journal". Ticket: host bootstrap (§5 row 1).

### E11-3: cgroup v2 with cpu, memory and pids delegated to the user slice: resource bounding needs no root
- Claim / current behavior: `/sys/fs/cgroup` is `cgroup2fs`; `user-1001.slice/cgroup.controllers` and `user@1001.service/cgroup.subtree_control` both list `cpu memory pids`. So `CPUWeight=`, `CPUQuota=`, `MemoryMax=`, `MemoryHigh=`, `TasksMax=` work in user units and in `systemd-run --user --slice=...`.
- Source and exact locus: host read of `/sys/fs/cgroup/user.slice/user-1001.slice/`.
- Why it matters: A7 D1 ("runaway build starves gameplay") and B4 T6 are enforceable with two slices: `ogm.slice` (api, rooms, voice, games host; `CPUWeight=200`) and `ogm-agents.slice` (aiur daemon and everything it spawns; `CPUWeight=50`, `MemoryMax=16G`, `TasksMax=4096`). Children inherit the cgroup, so putting the aiur daemon unit in `ogm-agents.slice` bounds every Codex/Claude worker and verify Chromium it launches.
- Confidence and freshness: [M]; slice values [O].
- Contradiction or open question: `io` is not delegated, so `IOWeight=` is unavailable; disk contention is unbounded.
- Suggested requirement/decision impact: ticket §5 row 7 (resource bounding) writes the two slices and sets aiur's own gates to match (E11-4).

### E11-4: aiur's own load gates exist and must be set explicitly; the derived agent cap is too high for this host
- Claim / current behavior: `agent.max_concurrent_agents` defaults to `min(max(2, schedulers + floor(schedulers/4)), max(1, floor(memory.max/4GiB)))` = `min(15, 7)` = 7 on this host (12 schedulers, 31 GiB). `agent.max_concurrent_builds` defaults to 4; `agent.max_cpu_pressure` 20.0 (PSI some avg60) and `agent.target_cpu_pressure` 10.0 hold or shrink dispatch; `agent.max_concurrent_agents`, `agent.max_concurrent_builds` are live keys (`aiur set`). The "Agent safety" component (`components/agent-sandbox.json`: "Limits agent processes and concurrent builds to protect the host") is host protection, not a security boundary (B4 §2).
- Source and exact locus: `website/docs-app/reference/configuration-agent.md` lines 38–42, 71, 216, 232; `configuration-daemon.md` "Live keys".
- Why it matters: the product default is 1 creation + 3 edit builds (release plan "Accounts and family"). The host measured load average 9.16/6.67/4.41 on 12 threads with a Project Zomboid server (`pzserver`, ~13% of RAM), Firefox, symphony and the aiur daemon resident; 1.5 GiB swap in use; CPU is an i7-10710U (6C/12T, 1.1 GHz base). Seven agents plus services would thrash.
- Confidence and freshness: [V] docs on 0f692a45b; [M] load.
- Contradiction or open question: whether 1+3 is achievable at all while the PZ server runs is a measurement, not a decision; the budget module (T01) must surface "capacity wait" rather than overcommit (B8 line 134).
- Suggested requirement/decision impact: `.aiur/config` for the games repos sets `agent.max_concurrent_agents: 4`, `agent.max_concurrent_builds: 2`, keeps the PSI gates; OGM's admission (T01) treats aiur's cap as the hard ceiling.

### E11-5: Tailscale is installed, serving and Funnel-capable: the zero-cost public HTTPS hostname is `applekid.tailee0e71.ts.net`
- Claim / current behavior: `tailscale version` 1.104.2, node online, MagicDNS on, `CertDomains: ["applekid.tailee0e71.ts.net"]`, capability map includes `funnel` with ports `443,8443,10000`. `tailscale serve status` shows two existing tailnet-only mounts: `https://applekid.tailee0e71.ts.net/` → `http://127.0.0.1:18789` and `http://applekid...:80/` → file share `/var/lib/pz-status`. `tailscale funnel status` shows nothing public yet. Kevin's iPad, iPhone and two MacBooks are nodes on the same tailnet (`tailscale status`).
- Source and exact locus: host read; Tailscale docs for Funnel's port set and TLS-by-Tailscale are [I] from memory, consistent with the capability string observed.
- Why it matters: no Caddy, nginx, certbot or cloudflared is installed (`which` → missing for all four), no domain is owned by the project, and buying one is a spend. Tailscale already terminates TLS with a Let's Encrypt cert for the node name and reverse-proxies to loopback, with path routing. That is the whole reverse-proxy and TLS story for V1 at zero cost and zero installs.
- Confidence and freshness: [M] 2026-10-31; WebSocket proxying through `tailscale serve` [I].
- Contradiction or open question: (a) `OperatorUser` is `applekid`, not `orangekid` (`tailscale debug prefs`), so this account cannot change serve/funnel without sudo: Kevin runs `sudo tailscale set --operator=orangekid` once. (b) Port 443's root path is taken by the 18789 service; enabling Funnel on 443 would publish it. Use 8443 (API + WebSockets) and 10000 (games origin) and leave 443 tailnet-only. (c) Funnel bandwidth is relay-limited [I]; acceptable for a family, not for public launch.
- Suggested requirement/decision impact: decision "Ingress: Tailscale serve + Funnel on 8443/10000; 443 untouched"; Kevin's hand step recorded in `remind`.

### E11-6: Better Auth cookies must be first-party on `ogm2000.netlify.app`; the API is reached through a Netlify proxy rewrite, WebSockets go direct with tokens
- Claim / current behavior: the frontend stays on Netlify (`prototypes/studio-v0/tools/deploy.sh` deploys to the site in `.netlify-site-id`, writes `_headers`). Cross-site cookies from `netlify.app` to `ts.net` would be blocked by Safari ITP on Kevin's iPad/iPhone [I]. Netlify `_redirects` supports `/api/* https://host:port/api/:splat 200` proxy rewrites [I: Netlify docs, not re-read]. Netlify proxies do not carry WebSocket upgrades [I].
- Source and exact locus: `prototypes/studio-v0/tools/deploy.sh` lines 8–11 (the `_headers` write is where `_redirects` would be added); B13 §3 "the voice host (a WebSocket with a backend-issued token)"; A7 R12 `onAuth` with a session or token.
- Why it matters: it fixes the origin map: cookies live only on `ogm2000.netlify.app`; the ts.net host holds no cookies, so sharing one hostname across ports 8443 and 10000 is harmless; long-lived streams (rooms, voice, build chat) connect to `wss://applekid.tailee0e71.ts.net:8443/...` with a short-lived token minted by `/api/`.
- Confidence and freshness: [I] as of 9508c1c.
- Contradiction or open question: Netlify proxied bandwidth costs credits (B6: 20 credits/GB; memory: credits are limited). Only JSON goes through it; blobs and game bundles never do (E11-8). A proxied-request timeout [U] may cut long SSE streams: use WebSockets for anything over a few seconds.
- Suggested requirement/decision impact: T09 adds `_redirects`; T01's API must accept both the cookie session (via proxy) and bearer tokens (direct WS); T07/T06 authenticate sockets by token.

### E11-7: The games origin is cross-site to the app at zero cost, but per-game subdomains (the mic decision) are not possible without a domain
- Claim / current behavior: B4 D3-B and D4-A (Kevin's picks) require `allow-same-origin` + `allow="microphone"` and "per-game subdomains ... so games cannot read each other's storage"; release plan §6 Q7 says this needs wildcard DNS and TLS. Tailscale gives one hostname per node and no wildcard; `*.netlify.app` branch subdomains would cost a production deploy per game (15 credits each, 300/month hard cap on Free, B6 "Netlify").
- Source and exact locus: `docs/research/v0.4/B4-sandboxing.md` lines 237–249 and 181; `docs/spec/release-plan.md` line 111.
- Why it matters: serving every game from `https://applekid.tailee0e71.ts.net:10000/g/<gameId>/<buildId>/` is cross-site to the app (different registrable domain) [V by PSL reasoning, I on `ts.net` PSL entry] but all games share one origin: localStorage/IndexedDB and the microphone permission grant are shared between a family's games.
- Confidence and freshness: [I] as of 9508c1c.
- Contradiction or open question: Kevin's D4-A ("separate custom domain") implies a domain purchase, which is a spend he has not approved in this run (README "Non-goals").
- Suggested requirement/decision impact: default [O]: one shared games origin on port 10000 in V1, saves and settings only through the bridge (B4 §3.5 "Storage"), mic allowed, limitation recorded; upgrade path when Kevin buys a domain: Cloudflare free DNS + `cloudflared` tunnel (wildcard, zero cost beyond the domain) or router port-forward + Caddy DNS-01. Flag as a decision for Kevin.

### E11-8: No S3-compatible store is installed; a filesystem blob store behind B6's `BlobStore` interface is the zero-install default
- Claim / current behavior: `which minio mc garage seaweedfs rclone restic` → all missing; Docker is installed (26.1.5, `docker.service` active) but `orangekid` is not in the `docker` group (`getent group docker` → `applekid` only), so containers need sudo. 2.8 TB free on the single NVMe (`df /home`). B6 §6 defines `BlobStore { put, head, signedGet, delete }` as "single S3 client; endpoint/bucket/keys from env" with `blobs/sha256/<hex>` keys and day-rounded signed URLs.
- Source and exact locus: `docs/research/v0.4/B6-asset-storage-cdn.md` lines 250–259; host `which`.
- Why it matters: the interface is what tickets code against; the backing can be a directory. A Node implementation (`fs` + HMAC signed GET served by the API on :8443) needs nothing installed and keeps "never in GitHub", opaque keys, no listing, immutable Cache-Control (B6 §4 rules).
- Confidence and freshness: [M] host; [V] B6; recommendation [O].
- Contradiction or open question: the decision log says "the instance's S3-compatible bucket" and the `gm` CLI (T05/B11) may assume an S3 SDK. If T05 needs real S3 semantics, Garage (single static binary, AGPL, ~4k stars [I]) or MinIO (AGPL, 50k+ stars [I]) can run as a user unit later with the same keys; no ticket should hard-code either now.
- Suggested requirement/decision impact: decision "Blob store V1 = filesystem under `~/.local/share/ogm/blobs/sha256/`, signed URLs from the API; S3 backend is a later swap behind `BlobStore`". Env: `OGM_BLOB_ROOT`, `OGM_BLOB_SIGNING_KEY`, optional `ASSET_S3_ENDPOINT`/`ASSET_BUCKET` unused in V1.

### E11-9: No Postgres and no sqlite3 CLI; Node 24's `node:sqlite` loads but is experimental
- Claim / current behavior: `which psql postgres pg_ctl sqlite3` → missing. `node -e "require('node:sqlite')"` works (`DatabaseSync` is a function) with `ExperimentalWarning: SQLite is an experimental feature`. Node v24.14.0, npm 11.9.0, pnpm 10.33.0 via nvm. aiur's shared lease store wants a TLS PostgreSQL URL (`AIUR_LEASE_DATABASE_URL`) only for multi-instance coordination; a single daemon needs none.
- Source and exact locus: host; `configuration-daemon.md` `instance.id` row.
- Why it matters: T01 owns the DB decision; this track's input is that Postgres costs a sudo install (`apt install postgresql`, free) or Docker group membership, while SQLite costs nothing and matches one host, one API process, a family of users.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: B6 §6 and A7 assume Postgres tables (`asset`, `narration_cache`, advisory locks). SQLite covers them with WAL mode and one writer; per-repo merge serialisation (A7 R07 "advisory lock") becomes an in-process mutex.
- Suggested requirement/decision impact: recommend [O] SQLite via `better-sqlite3` (stable; `node:sqlite` is flagged experimental) + Drizzle, file `~/.local/share/ogm/data/ogm.db`, `PRAGMA journal_mode=WAL`; backups via the online backup API (E11-13). If T01 picks Postgres, add "Kevin: `sudo apt install postgresql`" to the hand list.

### E11-10: Secrets: `~/.config/ogm` (0700, files 0600) and `~/.aiur/.env` (0600) are the established pattern; units take `EnvironmentFile=`
- Claim / current behavior: `~/.config/ogm/` is mode 700 with four 600 files (names only: `itch-api-key`, `profantasy-serials.json`, `humble-audio-links.json`, `itch-purchase-links.txt`); `~/.aiur/.env` is 600; `symphony.service` reads `EnvironmentFile=~/.config/symphony-dashboard.env`. aiur reads shell → `./.env` → `~/.aiur/.env`, `AIUR_SECRETS_FROM_ENV=1` skips dotenv, secret values never appear in logs or `.env.example` (`configuration-daemon.md` "Environment variables").
- Source and exact locus: host `stat`; `scripts/drive-sync/README.md` step 4; aiur `configuration-daemon.md` lines 26–32.
- Why it matters: B4 T2 ("no real secret ever enters the agent's reach") is partly a file-permission and cgroup question here: agents run as the same uid (`orangekid`), so a 0600 file is readable by any agent process. The boundary is T03's sandbox (bwrap with an empty env and no mount of `~/.config/ogm`), not permissions.
- Confidence and freshness: [M]; [V] aiur docs.
- Contradiction or open question: B4 §2 found the GitHub credential file bind-mounted writable into bwrap (`budget_mount_args`); `~/.aiur/bin/gh` and `git` guard wrappers exist on this host. T03 re-verifies on 0f692a45b.
- Suggested requirement/decision impact: convention `~/.config/ogm/env/<unit>.env` (0600), one `EnvironmentFile=` per unit, a checked-in `.env.example` with names only, startup validation that names missing variables (copy aiur's rule: never values).

### E11-11: Stray listeners on all interfaces: three `python3 -m http.server` preview servers and RDP
- Claim / current behavior: `ss -tlnp` shows `0.0.0.0:8765`, `0.0.0.0:8792`, `0.0.0.0:8793` owned by `python3 -m http.server` (two with no `--bind`; one, 8766, correctly bound to 127.0.0.1 serving the repo), `*:3389` (remote desktop, another user), `0.0.0.0:22` (sshd). `ufw.conf` says `ENABLED=yes`; its rules are root-only, so their effect is unknown. The LAN is behind an AT&T gateway (`attlocal.net`, 192.168.1.174, plus global IPv6 addresses on `eno1`).
- Source and exact locus: host `ss`, `ip -brief addr`, `/etc/ufw/ufw.conf`.
- Why it matters: with global IPv6 on the NIC, an all-interfaces listener is reachable from the internet unless the gateway or ufw blocks it. These are verify-session leftovers, exactly the class of process OGM's build pipeline will spawn hundreds of times.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: whether ufw actually drops inbound IPv6 to 8792/8793 is unknown without sudo.
- Suggested requirement/decision impact: rule for T10/`gm-verify` and every OGM service: bind `127.0.0.1` (or a Unix socket) only; the ingress is Tailscale; a host-hygiene ticket kills stray servers and adds an `ss`-based check to the ops status script.

### E11-12: The aiur daemon can be a user unit through `aiur run --container`; it runs today as a dev release under tmux via `mise`
- Claim / current behavior: `beam.smp` pid 466909 (cwd `/home/orangekid/github/aiur`, release `src/_build/dev/rel/aiur`, listening on 127.0.0.1:4001/4097 and ephemeral ports) is the live aiur; pid 1276 is symphony on 4000. `elixir`/`mix` are not on PATH; they are mise installs (`~/.local/share/mise/installs/{elixir,erlang}`). `aiur run --container` "runs headlessly in the foreground without tmux, streams logs to stdout/stderr, forwards SIGTERM", requires `AIUR_ERLANG_COOKIE` (≥16 chars) or `AIUR_COOKIE_FILE`, and is "suitable as a container's main process". The npm package's `aiur-daemon-supervisor.sh` restarts up to `AIUR_DAEMON_MAX_RESTARTS` (5) per 600 s inside tmux; it is not systemd-aware. `instance.mode: hosted` fails closed and "current production backends remain ineligible until #5701".
- Source and exact locus: `website/docs-app/reference/cli-launch.md` lines 41, 66; `packaging/npm/aiur-cli/libexec/aiur-daemon-supervisor.sh` lines 25–65; `configuration-daemon.md` `instance.mode` row; `scripts/aiurdev` lives in the aiur repo (`/home/orangekid/github/aiur/scripts/aiurdev`), not in this repo as `questions-or-commands.md` row "aiur setup" implies.
- Why it matters: supervision of the coding agents is supervision of this one process tree. A unit `ogm-aiur.service` (`ExecStart=... aiur run --container`, `EnvironmentFile=~/.config/ogm/env/aiur.env` holding `AIUR_ERLANG_COOKIE`, `Slice=ogm-agents.slice`, `Restart=on-failure`, `KillMode=mixed`, `TimeoutStopSec=65`) replaces the tmux supervisor and gets journald logs, and the slice bounds every worker it spawns.
- Confidence and freshness: [V] docs on 0f692a45b; [M] processes.
- Contradiction or open question: `--container` keeps the dashboard; the control commands (`aiur status`, `aiur set`) need the same cookie in the caller's environment. Hosted mode is not usable, so the daemon runs `instance.mode: local`, `deployment_kind: operator` (subscriptions), as it does now. One daemon per repository is aiur's model (`cli-launch.md` line 13); T02 decides one daemon for all game repos vs one per creator repo, which multiplies units.
- Suggested requirement/decision impact: ticket §5 row 1 includes `ogm-aiur.service` as a template unit (`ogm-aiur@<repo>.service` if T02 chooses per-repo daemons).

### E11-13: Backups: no rclone/restic/rsync; one disk; a second tailnet Linux node exists
- Claim / current behavior: `which rclone restic borg rsync` → all missing; `tar`, `gzip`, `zstd`, `openssl`, `ssh` present; `/` and `/home` are the same 3.6 TB NVMe. `tailscale status` lists node `orangekid` (Linux, online) and `applepi` (offline 271 days); Tailscale SSH is enabled on this node (`RunSSH: true`). B6 §6 "V1 minimum" 6 requires "a nightly copy of new blobs to a second account, and a restore drill once".
- Source and exact locus: host; `docs/research/v0.4/B6-asset-storage-cdn.md` lines 223, 132.
- Why it matters: a copy on the same disk is not a backup against the disk. The zero-cost off-machine target is the other tailnet Linux node over Tailscale SSH (`scp`/`tar | ssh`), which needs nothing installed here; Google Drive via the existing read-only service account would need Kevin to grant Editor on a backup folder.
- Confidence and freshness: [M]; target node's disk and access [U].
- Contradiction or open question: nothing known about `orangekid`'s free space or whether this account may SSH to it.
- Suggested requirement/decision impact: `ogm-backup.timer` nightly: SQLite online backup → `tar --zstd` of `data/` + incremental `blobs/` (content-addressed, so "new files since last run" is exact) → `ssh orangekid` over the tailnet; weekly `VACUUM`; a documented restore script run once (B6's drill). Kevin: confirm the target node and key.

### E11-14: Logs: journald holds 2 GB with default limits; aiur keeps up to 1 GB of its own logs and 21 GB of state
- Claim / current behavior: `journalctl --user --disk-usage` → 2 GB; `/etc/systemd/journald.conf` has no overrides (defaults: 10% of the filesystem capped at 4 GB [I]). aiur: `max_log_history_mb` default 1000; `~/.aiur` is 21 GB (worktrees, logs, build gate), `~/.local/share/aiur` 654 MB; `~/.local/share/ogm` 241 MB (the forge venv and caches).
- Source and exact locus: host `du`; `configuration-daemon.md` top-level table.
- Why it matters: build clips and stills for the build chat (decision log "Build chat") are app data, not logs: they belong in the blob store with a retention rule, or they will fill the journal.
- Confidence and freshness: [M].
- Contradiction or open question: `SystemMaxUse=` in `journald.conf` needs sudo; a per-user cap is not available. Accept defaults in V1.
- Suggested requirement/decision impact: services log JSON lines to stdout only; `LogRateLimitIntervalSec=30 LogRateLimitBurst=1000` per unit; an `ogm status` script reports journal size, `~/.aiur` size, blob size, disk free.

### E11-15: Sandbox primitives on the host, for T03's benefit: bwrap and user namespaces yes; KVM device present but not grantable without sudo; no gVisor/podman
- Claim / current behavior: `bwrap` 0.12.0; `/proc/sys/kernel/unprivileged_userns_clone` = 1, `max_user_namespaces` 126305; `/dev/kvm` exists (`root:kvm`, 0660+ACL) and the `kvm` group is empty; `runsc`, `podman`, `firejail`, `nsjail` missing; `systemd-run` present; Docker daemon active but unusable by this account. Chromium 156 and an Intel iGPU (`/dev/dri/renderD128`) are present for headless verify.
- Source and exact locus: host; B4 §2 "OS sandbox" (bwrap `--unshare-all --share-net`).
- Why it matters: the zero-cost isolation available today without any hand step is bwrap + `systemd-run --user` scopes (cgroup limits) + an empty env; Firecracker (E2B Embed) or Docker/gVisor each need Kevin to add `orangekid` to `kvm` or `docker`.
- Confidence and freshness: [M].
- Contradiction or open question: egress allowlisting (B4 D2-A) has no unprivileged primitive here (no `nft` binary, ufw rules root-only); an unprivileged network namespace with no interface (bwrap `--unshare-net`) gives deny-all, and a loopback HTTP proxy with an allowlist gives the allowlist. T03 owns the design; T11 only confirms the host facts.
- Suggested requirement/decision impact: list the optional sudo steps (`usermod -aG kvm,docker orangekid`) as "only if T03 chooses them".

### E11-16: The Drive watch folder service is complete, tested, and waiting on Kevin's five hand steps
- Claim / current behavior: `scripts/drive-sync/` has `drive_sync.py` (Python, 40 KB), `test_drive_sync.py` (21 KB, fake Drive, no network), a venv, an example TOML, and the unit. `~/remind.md` holds "Drive sync 1/5 … 5/5" unchecked items (project, key, folder id, dry run, enable the unit + linger). Linger is already on.
- Source and exact locus: `scripts/drive-sync/README.md` "One-time setup"; `~/remind.md`.
- Why it matters: it is the one hosted component that already exists end to end; its unit is the template for the others, and its hand steps show the format the `remind` skill expects (command, reason, context line).
- Confidence and freshness: [V]/[M].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the bootstrap ticket installs `ogm-drive-sync.service` and drops step 5/5's `loginctl enable-linger` (done).

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Service supervision | `scripts/drive-sync/ogm-drive-sync.service` (systemd unit, no tests); `~/.config/systemd/user/symphony.service` (pattern, outside repo) | Keep; copy its hardening lines into `ops/systemd/ogm-*.service` | Already the house pattern; linger on |
| aiur daemon launch | `/home/orangekid/github/aiur/scripts/aiurdev`, `packaging/npm/aiur-cli/libexec/aiur-daemon-supervisor.sh` (bash, tmux-based) | Replace the tmux supervisor with `ogm-aiur.service` running `aiur run --container` | journald, slices, `Restart=` instead of a bash loop |
| Reverse proxy + TLS | Tailscale 1.104.2 serve/funnel, cert for the node name | Keep (configure) | Nothing else installed; zero cost |
| Frontend hosting + headers | `prototypes/studio-v0/tools/deploy.sh` (bash, writes `_headers`, `netlify deploy`) | Port the `_headers`/`_redirects` writing into the new app's build (T09); keep the site id file | The site and its icons stay |
| Blob store | none (B6 TypeScript interface sketch only) | Write `packages/blob-store` (TS) with a filesystem backend | No S3 server installed |
| Database | none (`node:sqlite` experimental) | T01 decides; `better-sqlite3` + Drizzle recommended | Nothing installed; one host |
| Secrets | `~/.config/ogm/*` (0600), `~/.aiur/.env` | Keep the directory; add `env/<unit>.env` | Established permissions |
| Backups | none | Write `ops/backup/` (bash + TS backup call) | No rclone/restic |
| Drive intake | `scripts/drive-sync/drive_sync.py` + tests (Python) | Keep as Python worker (brief: Python stays where it works) | Done and tested |
| Host checks | none (ad-hoc `ss`, `df`) | Write `ops/bin/ogm-status` (bash) | Operators need one command |

## 4. Interfaces and contracts this track defines or consumes

**Ingress map (owner: T11; consumed by T01, T06, T07, T09, games host).**
```
https://ogm2000.netlify.app/                 Netlify static app (T09)
https://ogm2000.netlify.app/api/*            _redirects: /api/*  https://applekid.tailee0e71.ts.net:8443/api/:splat  200
wss://applekid.tailee0e71.ts.net:8443/ws/*   rooms (T07), voice (T06), build chat stream; token auth, no cookies
https://applekid.tailee0e71.ts.net:8443/blobs/sha256/<hex>?exp=<unix>&sig=<hmac>   signed GET (T05 via BlobStore)
https://applekid.tailee0e71.ts.net:10000/g/<gameId>/<buildId>/   games origin (static, CSP, no cookies)
https://applekid.tailee0e71.ts.net/          untouched (existing tailnet-only serve)
```
`tailscale funnel --bg --https=8443 http://127.0.0.1:${OGM_API_PORT}` and `--https=10000 http://127.0.0.1:${OGM_GAMES_PORT}`; every service binds `127.0.0.1`.

**Unit and slice layout (owner: T11).**
```
~/.config/systemd/user/ogm.slice            CPUWeight=200
~/.config/systemd/user/ogm-agents.slice     CPUWeight=50 MemoryMax=16G TasksMax=4096
ogm-api.service  ogm-rooms.service  ogm-games.service  ogm-drive-sync.service   Slice=ogm.slice
ogm-aiur.service (aiur run --container)                                         Slice=ogm-agents.slice
ogm-backup.timer → ogm-backup.service (OnCalendar=03:30)
```
Each service: `EnvironmentFile=%h/.config/ogm/env/<name>.env`, `Restart=on-failure`, `UMask=0077`, `NoNewPrivileges=yes`, `ProtectHome=` not set (agents need `$HOME`), `WantedBy=default.target`.

**Environment contract (owner: T11; values never in the repo).** Names: `OGM_API_PORT`, `OGM_GAMES_PORT`, `OGM_ROOMS_PORT`, `OGM_PUBLIC_ORIGIN` (`https://applekid.tailee0e71.ts.net:8443`), `OGM_GAMES_ORIGIN`, `OGM_DATA_DIR` (`~/.local/share/ogm/data`), `OGM_BLOB_ROOT`, `OGM_BLOB_SIGNING_KEY`, `OGM_SESSION_SECRET`, `OGM_WS_TOKEN_SECRET`, `AIUR_ERLANG_COOKIE`, `GITHUB_TOKEN`/`GITHUB_APP_*` (aiur's names). A `packages/config` loader validates presence by name and never logs values (aiur's rule).

**Blob signed URL (owner: T05 interface, T11 serving).**
```ts
type SignedGet = { url: string; expiresAt: string }; // exp rounded to next UTC midnight + 24h (B6 §4)
// GET /blobs/sha256/:hex?exp=&sig=  → 200 with Cache-Control: public, max-age=31536000, immutable; 403 on bad sig/expired
```

**Health (owner: T11; every service implements).** `GET /healthz` → `{ ok: true, service: "api", version: "<git sha>", uptimeSec: n }` on the loopback port; `ogm-status` aggregates units, ports, disk, journal size.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| 1 | Host bootstrap: slices and user units | `ops/bin/ogm-host-setup.sh` (idempotent, no sudo) installs `ogm.slice`, `ogm-agents.slice`, `ogm-api/rooms/games/drive-sync/aiur` units and `ogm-backup.timer`; `systemctl --user status` green | `ops/systemd/*.service|*.slice|*.timer`, `ops/bin/ogm-host-setup.sh` | 2 | service entrypoints from T01/T07/games host (names only) | service code; aiur config |
| 2 | Ingress: Tailscale funnel + Netlify proxy | `ops/bin/ogm-ingress.sh` applies the serve/funnel map for 8443 and 10000; app build writes `_redirects` for `/api/*`; curl from outside reaches `/healthz` | `ops/bin/ogm-ingress.sh`, `apps/web/public/_redirects`, `apps/web/public/_headers` | 2 | #1; Kevin's `tailscale set --operator` step | auth logic; CSP content (T04/T09) |
| 3 | Games origin host | Static server on :10000 serving `/g/<gameId>/<buildId>/` from the release store with CSP, `Cross-Origin-Opener-Policy`, no cookies; cross-site test vs the app | `services/games-host/` (TS), unit `ogm-games.service` | 3 | T08 release pointer shape; T04 iframe/CSP contract | the SDK bridge; publish flow |
| 4 | Filesystem BlobStore with signed URLs | `packages/blob-store` implements B6's `BlobStore` on `OGM_BLOB_ROOT`; API route `/blobs/...` with HMAC and day-rounded expiry; GC of unreferenced blobs after 30 days | `packages/blob-store/`, `apps/api/src/routes/blobs.ts` | 3 | T05's manifest/lockfile shape for GC roots | pack import, device tiers |
| 5 | Config and secrets loader | `packages/config` validates named env vars, `.env.example` with names only, `~/.config/ogm/env/` convention, startup message lists missing names | `packages/config/`, `.env.example`, `ops/env/*.example` | 1 | none | any secret value handling beyond presence |
| 6 | Backups and restore drill | `ogm-backup.service` does SQLite online backup + incremental blob tar → tailnet node over SSH; `ops/backup/restore.sh` proven once; report in journal | `ops/backup/backup.sh`, `ops/backup/restore.sh`, `apps/api/src/cli/backup.ts` | 2 | #4; T01 DB choice; Kevin's target-node access | off-site providers; retention policy for releases (T08) |
| 7 | Agent resource bounding | `.aiur/config` for game repos: `agent.max_concurrent_agents: 4`, `max_concurrent_builds: 2`, PSI gates; `ogm-aiur.service` in `ogm-agents.slice`; verify Chromium runs `nice 10`; a load test shows the API p95 unchanged with 4 agents | `.aiur/config` (games repo template), `ops/systemd/ogm-agents.slice`, `skills/gm-verify` nice wrapper | 2 | T02's daemon topology (one vs per-repo) | admission/budget logic (T01) |
| 8 | Host hygiene and loopback rule | Kill stray `http.server` listeners; `gm-verify` and every service bind 127.0.0.1; `ops/bin/ogm-status` flags any OGM listener on 0.0.0.0/[::] | `ops/bin/ogm-status`, `.claude/skills/gm-verify/SKILL.md` (one rule) | 1 | none | firewall changes (sudo) |
| 9 | Ops runbook and Kevin's hand steps | `docs/ops/runbook.md`: start/stop/logs/restore/rotate secrets; the `remind` entries for the sudo steps | `docs/ops/runbook.md`, `~/remind.md` (via the skill) | 1 | #1, #2, #6 | product docs |
| 10 | Health endpoints and status | `/healthz` on each service; `ogm-status` prints units, ports, disk, journal, `~/.aiur` size, aiur `status` summary | `packages/health/`, `ops/bin/ogm-status` | 2 | #1 | metrics/analytics (T01 build analytics) |

## 6. Risks and unknowns

1. **Public exposure vs tailnet-only.** Funnel makes 8443/10000 reachable by anyone (sign-in still required). Kevin's own devices are already on the tailnet, so a stricter V1 is tailnet-only serve, but then the Netlify proxy cannot reach the API and invited friends need Tailscale. Default: Funnel on, because the frontend stays on Netlify and invites are V1 scope. Kevin decides.
2. **Netlify proxy limits** (timeouts, credits per GB) [U]. Default: only JSON through the proxy; everything long-lived is a WebSocket direct to 8443. Spike: one `_redirects` line and a curl, 10 minutes, after #2.
3. **Shared games origin** (E11-7): mic grants and storage shared across a family's games. Default: accept in V1, saves via the bridge only, record the limitation; a domain purchase unlocks per-game subdomains (cloudflared, free). Kevin decides whether to buy a domain.
4. **`ts.net` on the Public Suffix List** [I]. If it is not, `applekid.tailee0e71.ts.net` ports 8443 and 10000 are still different origins and the app on `netlify.app` is still cross-site; nothing in the design relies on it. No action.
5. **Host capacity.** Load 9 on 12 threads before OGM exists; the PZ server shares the box. Default: #7's caps; measure p95 of `/api/healthz` under 4 agents; if the host cannot carry 1+3, T01's admission shows "capacity wait".
6. **Single disk, no RAID.** Default: #6 nightly off-machine copy; accept up to 24 h of loss in V1.
7. **aiur hosted mode is unusable (#5701) and the GitHub-credential exposure in B4 §2 may still hold** [U on current main]. Default: T03 verifies; T11 keeps agents in `ogm-agents.slice` with no `~/.config/ogm` mount (bwrap) and relies on T03's boundary.
8. **One daemon or one per creator repo** (T02). Each daemon is a unit, a cookie and a slice member; per-repo multiplies the aiur RSS (currently ~1.2 GB for one daemon, `ps`). Default: one daemon, one `.aiur/config` per game repo, until T02 says otherwise.
9. **SQLite vs Postgres** (T01). Default: SQLite; revisit only if T07 rooms or T08 merges need cross-process transactions.
10. **IPv6 global addresses on `eno1`** with unknown ufw rules. Default: loopback binding (#8) makes it moot for OGM; stray listeners are a hygiene finding for Kevin.

## 7. Self-hosting notes

What changes because it runs here rather than Railway/E2B:
- No private network: "private" means loopback (`127.0.0.1`) plus Tailscale; there is no service-to-service DNS, so services talk over loopback ports or Unix sockets.
- No per-service containers: isolation between OGM services is the uid plus cgroup slices only; the security boundary is T03's sandbox around agents, not between services.
- No provider bucket: `BlobStore` on the filesystem; B6's backup rule becomes an SSH copy to another tailnet node.
- No API-key profiles: the daemon runs `instance.mode: local`, `deployment_kind: operator`, on the Codex and Claude subscriptions; `agent.accounts` (B8) decides which accounts the game repos may use.
- No vendor cold-start or idle-timeout: cancellation and leak reaping are `systemd-run --user` scopes with `RuntimeMaxSec=` and aiur's `max_agent_duration_minutes` (60).
- Egress control: none available without sudo; T03's choice (`--unshare-net` + loopback proxy) is the only zero-privilege option.

Host facts checked (read-only, 2026-10-31):
- OS Debian 13 (trixie), kernel 6.12.113, systemd 257; user `orangekid` (uid 1001; groups sudo, users, systemd-journal; not docker, not kvm); `Linger=yes`; user manager running, 0 failed units.
- CPU i7-10710U 6C/12T; RAM 31 GiB (13 used, 17 available, 1.5 GiB swap used); disk 3.6 TB NVMe, 2.8 TB free; load 9.16/6.67/4.41.
- Present: Node 24.14.0, npm 11.9.0, pnpm 10.33.0 (nvm), Python 3.13.5, Chromium 156, ffmpeg, gh 2.46, netlify CLI, bwrap 0.12, Docker 26.1.5 (group not granted), Tailscale 1.104.2 (serve active, Funnel capability 443/8443/10000, `OperatorUser=applekid`, Tailscale SSH on), `mise` with elixir/erlang installs (not on PATH), `tar zstd gzip openssl ssh jq dig curl`.
- Missing: caddy, nginx, haproxy, traefik, cloudflared, certbot, acme.sh, minio, mc, garage, seaweedfs, rclone, restic, borg, rsync, psql/postgres, sqlite3 CLI, redis, podman, firejail, nsjail, runsc, nft/iptables binaries, logrotate, fail2ban, elixir on PATH.
- Listening: aiur 127.0.0.1:4001/4097; symphony 127.0.0.1:4000; epmd 4369; tailscale0:80/443 (serve); 0.0.0.0:22; 0.0.0.0:8765/8792/8793 (stray `http.server`); 127.0.0.1:8766 (repo preview, correctly bound); *:3389.
- State sizes: `~/.aiur` 21 GB, `~/.local/share/aiur` 654 MB, `~/.config/aiur` 98 MB, `~/.local/share/ogm` 241 MB, user journal 2 GB.

What Kevin must do by hand (for the `remind` skill; none costs money):
1. `sudo tailscale set --operator=orangekid` — lets the agent account configure serve/funnel without sudo.
2. Approve Funnel (public HTTPS on `applekid.tailee0e71.ts.net:8443` and `:10000`) or say "tailnet only".
3. Decide on a games domain purchase (the only way to per-game subdomains); not needed for V1 if the shared origin is accepted.
4. Confirm the backup target: the `orangekid` tailnet node, and allow SSH from this account (or name another machine or a Drive folder with Editor rights).
5. Only if T03 picks Docker/gVisor or Firecracker: `sudo usermod -aG docker,kvm orangekid` then re-login.
6. Only if T01 picks Postgres: `sudo apt install postgresql`.
7. Optional: `/etc/systemd/journald.conf` `SystemMaxUse=4G` (sudo); and the Drive-sync steps 1/5–4/5 already in `~/remind.md` (5/5's linger part is done).
