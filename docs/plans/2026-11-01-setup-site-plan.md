# Setup site plan: splash page, /setup, SETUP.md

Kevin (2026-11-01): "include new OGM splash marketing page + /setup instructions on a website with easy human steps +
agents.md or whatever file for more details to help. this includes accordion large steps with smaller sub steps for
hosting an instance of OGM, installing deps, setting up aiur for agent orchestration, setting up a games private repo,
finding assets, setting up local asset pipeline or optional gdrive assets folder, configuring etc. suggest agent to
help set up easy prompt and steps under it".

Repo paths below are on `main` unless marked `research`. Nothing here is code; the tickets at the end build it.

## Recommendation

1. **One content source, two renderers.** The eight setup steps live in `apps/site/content/setup.yaml`, validated by
   a Zod schema. One build script renders it to the `/setup` page and to `SETUP.md` at the repo root (committed,
   with a `--check` mode in CI like `packages/contracts`' generated schemas). The page and the agent file cannot drift.
2. **A separate static site, `apps/site/`, not new routes in `apps/web`.** `/` in the app is the title town and stays
   so (memory rule "keep the prototype design", `.aiur/prompt.md` "Design is fixed", D-LOOK). The splash is for people
   who are not signed in and may never be; it gets its own origin with `/` (splash) and `/setup`. It is plain HTML
   rendered at build time (no React runtime: indexable, fast on a phone, nothing to hydrate) and reuses
   `apps/web/src/tokens.css`, the Fredoka/Nunito fonts from `apps/web/index.html` and the title-town poster as its hero.
3. **`SETUP.md` at the repo root, not a section of `AGENTS.md`.** `AGENTS.md` is read by every ticket worker on every
   job (token cost each time, memory rule "token economy") and is an Executor-owned surface. Setup is read once, by a
   visitor's agent. `AGENTS.md` gets one line pointing at `SETUP.md`.
4. **Every "Ask an agent" prompt is the same shape:** clone the repo, read `SETUP.md`, do step N, stop at the hand
   steps and hand them back, never add a provider key or spend. The hand steps are the ones Kevin had to do by hand on
   this host (`~/remind.md`, `docs/ops/hand-steps.md`).

## What exists (the steps must cite these, not restate them)

| Area | Where | Gaps the steps expose |
| --- | --- | --- |
| Host units, dirs, placeholders | `ops/bin/ogm-host-setup.sh`, `ops/systemd/*`, `ops/bin/ogm-run`, `ops/bin/ogm-status`, `docs/ops/runbook.md` | The commit service unit is `services/commit/ops/ogm-commit.service` and is **not** installed by `ogm-host-setup.sh` (its `units=` list and `ogm-run` have no `commit`); its env file is `ogm-commit.env`, every other unit uses `<unit>.env`. `ogm-aiur@.service` runs `%h/github/aiur/scripts/aiurdev`, `ogm-run aiur` runs `~/.local/bin/aiur`: two launchers for the same daemon. |
| Ingress | `ops/bin/ogm-ingress.sh`, `docs/ops/ingress.md`, `docs/ops/netlify-proxy.md` | Host name `applekid.tailee0e71.ts.net` is hard-coded in `apps/web/public/_redirects` and `_headers` (CSP) and in `.env.example` comments. A self-hoster edits two files by hand; the steps must say which lines. |
| Env files | `packages/config` (`ogm-env-init <unit>`), `.env.example` (every name, with its unit in brackets), `services/commit/ops/ogm-commit.env.example` | No single page lists which non-secret values a new host must fill per unit (ports, origins, bot logins). |
| Hand steps | `docs/ops/hand-steps.md`, `~/remind.md` | Written for Kevin's host (`orangekid`, backup node). The site version parametrises user, tailnet host, app origin. |
| Sandbox and offline deps | `docs/ops/sandbox.md`, `scripts/sandbox/{probe.sh,seed-store.sh,proof/run.sh}` | None; cite as the step-3 check. |
| aiur | `.aiur/config` (`research`), `~/.local/bin/aiur-main`, `aiur init`, `aiur login <harness> <name>`, `aiur accounts`; game daemons rendered by `services/builder/src/fleet/*` into `~/.local/share/ogm/daemons/<slug>/`, Codex login shared at `~/.config/ogm/codex-gamebuilder/auth.json` | A self-hoster does not need the platform executor (port 4010, builds OGM itself); they need aiur installed plus the two logins. `aiur init` is for a fork that wants agents on OGM's own code. How a visitor obtains aiur: `aiur-team/aiur` is public; its build steps are its own README's. |
| Games repo | `services/builder/src/provision.ts` (`<owner>/gm-<gameId>`), `packages/game-repo-template`, `services/commit` (GitHub App) | `services/commit` has no README: the App's permission list and the installation-id lookup are only in `src/auth/app.ts`. |
| Assets | `docs/reference/local-asset-library.md`, `scripts/assets/*.py` (fetchers, importers, `build_catalog.py`), `packages/asset-cards`, `packages/gm-cli` (`gm assets search`, `gm packs import|blocklist`), skills `gm-assets`, `gm-pack-scout`, `gm-asset-intake` (`research`) | None; the step is a digest with links. |
| Drive drop | `scripts/py/drive-sync/README.md` (one-time setup 1–9), `drive-sync.example.toml`, `ops/systemd/ogm-drive-sync.service`, `services/intake/README.md` (de-dupe by drop id + MD5 set) | None. |
| Sign-in, voice, budgets, backups | `docs/ops/netlify-proxy.md` (Google values), `services/voice-host/README.md` (`OGM_VOICE_PROVIDER=fake` default), `docs/ops/runbook.md` (allowance defaults, backup, restore) | None. |
| Web app delivery | `apps/web/tools/deploy.sh`, `apps/web/tools/town.sh --public`, `apps/web/.netlify-site-id` | Netlify-specific; a self-hoster creates their own site and replaces the site id. |
| E2E proof | #98 "End-to-end proof on this machine" | Step 8 is a short form of #98's walk. |

## Splash page (`/`)

Audience: an adult who got the link from Kevin and wonders what this is; secondary, someone who wants to run their own.

- **Hero:** the title-town poster (`apps/web/title-town/tools/poster.mjs` output, landscape and portrait, committed
  to `apps/site/public/hero/` because `public/town/` is gitignored and built on the host) with the logo
  (`/art/logo.webp` source: `prototypes/ui-v0/site/assets/img/logo.png`) and one line, the only sentence on the hero.
  Kevin approves the line; placeholder for review: "Say a game. Watch it get built. Play it with your family."
- **Three feature blocks**, each a real capture and one short heading, no caption paragraphs: the creation chat
  (`/new`, scope session), the build chat dock while a build runs (`apps/web/src/features/build-chat`), a game being
  played on a phone with a friend watching (`/join/:token`). Captures come from `gm-verify` / `apps/web/tools/loadrec.mjs`
  against the real app, exported as MP4 and WebP poster (memory rule: MP4 for the phone). Paid-pack art is excluded as
  `deploy.sh` and `town.sh --public` already do (no Synty art, no Sidetrax audio).
- **Two CTAs:** "Set up your own" → `/setup`; "Sign in" → the app origin (`https://ogm2000.netlify.app/`, whose Start
  button already runs age → sign-in → GitHub connect; the splash adds no auth of its own).
- **Footer:** repo link, licence line. Nothing else.
- Rule (CLAUDE.md, memory "no needless text"): no taglines beyond the one line, no "Features" headings, no helper
  sentences. Icons carry `aria-label`s.
- Visual language: `apps/web/src/tokens.css` imported as-is (`--night`, `--cream`, `--orange`, `--display`, `--r`,
  `--pop`, 64 px primary targets), `title.css`'s button recipe for the CTAs, `#a69b8d` page background behind the poster
  as `index.html` does. No new brand.

## /setup page

An accordion of eight large steps. Each large step: title, time estimate, a one-line "you end up with", its
sub-steps, then an **Ask an agent** block. Each sub-step: one sentence, a copyable command block (one `<pre>` with a
copy button, `aria-label="Copy"`), a checkbox (persisted in `localStorage` under the step id, wrapped in try/catch;
local only), and a "Check:" line naming the command or file that proves it. Hand steps are marked with a hand icon and
listed again, together, under the Ask-an-agent block so the agent and the human see the same list.

Placeholders are explicit tokens the visitor fills once at the top of the page (a small form, stored locally and
substituted into every command block): `<user>`, `<tailnet-host>` (for example `box.tailXXXX.ts.net`), `<app-origin>`
(the Netlify URL), `<github-owner>`. SETUP.md keeps the tokens literal.

### Steps and sub-steps

**1. Host an instance** (~45 min + hand steps). A Linux box; everything runs as one user under `systemd --user`.
1. Machine: Debian/Ubuntu x86_64, 12 cores and 16 GB suggested (`.aiur/config` comments), ~100 GB disk, a normal user,
   `loginctl enable-linger <user>` (hand if the user cannot run loginctl). Check: `systemctl --user status` answers.
2. Clone to `~/games/open-game-maker-2000` (the commit unit's `WorkingDirectory` and the Drive README assume it).
   Check: `git -C ~/games/open-game-maker-2000 log -1`.
3. Tailscale: install, `tailscale up`; hand: `sudo tailscale set --operator=<user>` (GATE-TS-OPERATOR), enable HTTPS
   certificates and (optionally) Funnel in the tailnet admin console. Decide Funnel (invites work off the tailnet)
   or tailnet-only. Check: `tailscale status`, `tailscale cert <tailnet-host>` succeeds.
4. Directories and units: `ops/bin/ogm-host-setup.sh --dry-run`, then `ops/bin/ogm-host-setup.sh`; plus the commit
   unit by hand: `cp services/commit/ops/ogm-commit.service ~/.config/systemd/user/ && systemctl --user daemon-reload
   && systemctl --user enable --now ogm-commit` (gap above). Check: `systemctl --user list-units 'ogm-*'` shows every
   unit; `PLACEHOLDER` lines in the journal are expected until step 2.

**2. Install dependencies** (~30 min, mostly waiting).
1. Node 24 and pnpm 10.33.0 (`corepack enable`, as `.github/workflows/ci.yml`), `pnpm install --frozen-lockfile`,
   `pnpm build`. Check: `pnpm build` exits 0.
2. Elixir and Erlang through `mise` at `~/.local/bin/mise` (`ops/bin/ogm-run voice-host` expects that path and the
   release at `services/voice-host/_build/prod/rel/voice_host`); build per `services/voice-host/README.md`.
   Check: `curl --fail http://127.0.0.1:40401/healthz` after step 7.
3. Python venvs: `make venv-drive-sync`, `make venv-audio` (`scripts/py/workers.json`); `python3 -m venv` and
   `python3-pip` system packages. Check: `make test-py`.
4. System tools: `ffmpeg`, `p7zip-full`, `git`, `curl`, `openssl`; hand (sudo): `apt install` of those, `unrar` from
   non-free (two RAR methods 7z cannot read, `~/remind.md`), optional `blender`. Check: `ffmpeg -version`, `7z`.
5. Browsers for verify: `pnpm --dir apps/web exec playwright install chromium`; hand: `--with-deps` needs sudo once.
   Check: `pnpm --dir apps/web run e2e` on one spec.
6. Agent CLIs: Codex CLI and Claude Code installed (their own installers; subscriptions, no API keys). Logins are
   step 3. Check: `codex --version`, `claude --version`.
7. Env files: `pnpm --filter @ogm/config build`, then `ogm-env-init` for `api rooms games voice-host intake backup
   drive-sync` and `cp services/commit/ops/ogm-commit.env.example ~/.config/ogm/env/ogm-commit.env`. Fill the ports
   (4300 api, 4301 commit, 4302 rooms, 40400/40401 voice, games and rooms ports of your choice) and
   `OGM_DATA_DIR`, `OGM_BLOB_ROOT`, `OGM_GAMES_ROOT`, `OGM_ASSETS_ROOT`. Secrets are generated; never printed.
   Check: `ops/bin/ogm-status` lists the env file names.
8. Offline store for sandboxed builds: `bash scripts/sandbox/seed-store.sh`. Check: it prints the store size.

**3. Set up aiur for agent orchestration** (~40 min + two browser logins).
1. Clone `aiur-team/aiur` to `~/github/aiur` (`ops/systemd/ogm-aiur@.service` sets `AIUR_REPO_ROOT=%h/github/aiur`)
   and build it per its README; link the launcher the OGM scripts expect. Open question below: which launcher.
   Check: `aiur --help`.
2. `~/.aiur/.env` (mode 600): `GITHUB_TOKEN` = the builder machine user's PAT from step 4, `AIUR_ERLANG_COOKIE` (>= 16
   chars, `openssl rand -hex 16`). Hand if the PAT does not exist yet: come back after step 4.
3. Logins (hand, browser): `aiur login codex gamebuilder` (the account the sandboxed game daemons run under), then
   `aiur login claude default`. Place or link the Codex login at `~/.config/ogm/codex-gamebuilder/auth.json`
   (`docs/ops/sandbox.md`; per-daemon homes symlink it). Check: `aiur accounts`, `ls -l ~/.config/ogm/codex-gamebuilder/auth.json`.
4. Sandbox proof: `bash scripts/sandbox/probe.sh`, `bash scripts/sandbox/proof/run.sh`. Check: no FAIL rows.
5. Daemon env: `AIUR_API_URL`, `AIUR_API_TOKEN`, `OGM_BUILDER_WORKSPACES_ROOT`, `OGM_BUILDER_BOT_TOKEN`,
   `OGM_BUILDER_BOT_LOGIN` in `api.env` (`.env.example` `[api]`/`[aiur]` rows); the fleet (`services/builder`) renders
   `~/.config/ogm/env/ogm-aiur@<slug>.env` itself on the first admitted job. Check: `systemctl --user list-units 'ogm-aiur@*'`
   after the first build in step 8.
6. Optional, a fork that wants agents on OGM's own code: `aiur init` in the checkout (it scaffolds `.aiur/config`;
   the committed one is Kevin's single-identity install: change `github.repo`, `bot_account`, `allowed_users`,
   `human_mergers`), `aiur --bg`. Optional: a Khala channel to talk to the agents from a phone (`khala` skill:
   sign in at khala.aiur.team, create a channel, give the agent the share link).

**4. Set up the games private repo** (~30 min, mostly hand).
1. Decide the GitHub owner for game repos: your account or a free org. Repos are created as `<owner>/gm-<gameId>`,
   private by default (`services/builder/src/provision.ts`, `OGM_GAME_TEMPLATE_REF` default `game-2d@1`).
2. Hand: two free machine users, `ogm-intake` and `ogm-builder` (GATE-MACHINE-USERS); PATs scoped to repo + issues.
   Put them in `api.env` as `OGM_INTAKE_GITHUB_TOKEN`/`OGM_INTAKE_BOT_LOGIN` and `OGM_BUILDER_BOT_TOKEN`/
   `OGM_BUILDER_BOT_LOGIN`; the builder PAT also goes to `~/.aiur/.env` (step 3.2). Your own PAT stays out.
3. Hand: the GitHub App (GATE-GITHUB-APP) at `github.com/settings/apps/new`, installed on the owner; permissions as
   `services/commit/src/auth/app.ts` uses (documented by the ops ticket). `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`
   (`~/.config/ogm/ogm-github-app.pem`, mode 600) and optional `OGM_GITHUB_WEBHOOK_SECRET` in `ogm-commit.env`;
   `OGM_PLATFORM_ISSUE_REPO` = your fork for bug reports. Check: `systemctl --user restart ogm-commit`,
   `journalctl --user -u ogm-commit -n 20` shows the App resolved an installation.
4. Shared tokens: `OGM_COMMIT_SERVICE_TOKEN`, `OGM_INTERNAL_TOKEN` identical in `api.env` and `ogm-commit.env`
   (`docs/ops/runbook.md` "Env files"). Check: `grep -l '^OGM_INTERNAL_TOKEN=' ~/.config/ogm/env/*.env` lists both.

**5. Find assets** (~20 min).
1. Layout: `assets-local/` (gitignored; `docs/reference/local-asset-library.md`): `packs/<vendor>-<pack>/<version>/
   {originals,extracted,pack.json,License.txt}`. `OGM_ASSETS_ROOT` points here.
2. Packs first, free and permissive: Kenney (CC0) with `scripts/assets/import_kenney_bundle.py`, KayKit with
   `import_kaykit_bundle.py`, free itch.io pages with `fetch_itch_free.py <page> <out>`, Poly Pizza with
   `fetch_polypizza_bundle.py --licenses CC0`. Downloads are untrusted data: never run anything from them.
3. `python3 -I scripts/assets/build_catalog.py`, `scripts/assets/build_collection_cards.py`; then
   `gm assets search <words>` and `scripts/assets/pack_thumbnails.py` to look before choosing. Check: your pack id is
   in `assets-local/catalog.json`.
4. Licences and what never leaves the box: licence first, from the author's page; paid packs are personal use, never
   committed, never uploaded, never sent to a cloud model (`gm packs blocklist`, `OGM_BLOCKLIST_FILE`); nothing under
   `assets-local/`, no keys, no download links in git. The skills that do this for the agents: `gm-assets`,
   `gm-pack-scout`, `gm-asset-intake` (`research` branch `.claude/skills/`).

**6. Local asset pipeline, optional Google Drive drop** (~30 min + Google console hand steps).
1. Intake worker: `ogm-env-init intake`, set `OGM_ASSETS_ROOT` and `OGM_STATE_DIR=~/.local/state/ogm`;
   `systemctl --user restart ogm-intake`. It runs `gm packs import` per drop, de-dupes by drop id and MD5 set,
   auto-confirms only Kenney CC0 by licence hash; everything else waits for a named human (`services/intake/README.md`).
   Check: `cat ~/.local/state/ogm/intake/status.json`.
2. Optional Drive drop folder, all free: `scripts/py/drive-sync/README.md` "One-time setup" 1–9. Hand: Google Cloud
   project, Drive API, service account `ogm-drive-sync` with a JSON key to `~/.config/ogm/drive-sa.json` (600), a Drive
   folder shared with the service-account email as Viewer. Then `cp scripts/py/drive-sync/drive-sync.example.toml
   ~/.config/ogm/drive-sync.toml` and set `folder_id`. Check: `<venv>/bin/python -I scripts/py/drive-sync/drive_sync.py
   run --once --dry-run` logs `watching '<folder>' as <email>`; `systemctl --user restart ogm-drive-sync` clears the
   placeholder.
3. First drop: put a small zip in the folder; `drive_sync.py status`; the queue line appears in
   `assets-local/inbox/queue.jsonl`; intake or the `gm-asset-intake` skill handles it. Check: `intake.json` next to the
   manifest.

**7. Configure** (~30 min + hand).
1. Origins in every env file that names them (`.env.example` `[shared]`): `OGM_PUBLIC_ORIGIN=https://<tailnet-host>:8443`,
   `OGM_GAMES_ORIGIN=https://<tailnet-host>:10000`, `OGM_APP_ORIGIN=<app-origin>`, `OGM_VOICE_WS_URL`.
2. Ingress: `ops/bin/ogm-ingress.sh --dry-run`, then `ops/bin/ogm-ingress.sh` or `--tailnet-only`
   (`docs/ops/ingress.md`). Check: from a phone off Wi-Fi, `curl https://<tailnet-host>:8443/healthz`.
3. Web app on Netlify (free tier): create a site, write its id to `apps/web/.netlify-site-id`, edit the two
   hard-coded hosts in `apps/web/public/_redirects` and `_headers` to `<tailnet-host>`, build the town with
   `apps/web/tools/town.sh --public`, then `apps/web/tools/deploy.sh --dry-run` and `deploy.sh`. Check: the title town
   loads at `<app-origin>` and `/api/healthz` answers through the proxy.
4. Sign-in: passkey and magic link work with nothing else. Optional SMTP (`SMTP_URL`, `SMTP_FROM`; without it the
   magic link lands in the admin inbox); optional Google (hand, GATE-GOOGLE-OAUTH: OAuth client, JavaScript origin
   `<app-origin>`, redirect `<app-origin>/auth/callback/google`, `GOOGLE_CLIENT_ID/SECRET`), `OGM_MAINTAINER_EMAILS`.
   Check: `docs/ops/netlify-proxy.md` "iPhone check".
5. Voice stays `OGM_VOICE_PROVIDER=fake` (no key, no spend). A live provider is a key in `voice-host.env` and is the
   visitor's own spending decision; the page says so in one line and does not link a signup.
6. Budgets: `OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD` (default 5000000), `OGM_RESET_ZONE_DEFAULT`; per-family values in
   `/admin/budgets` after sign-in.
7. Backups: `backup.env` with absolute `OGM_DATA_DIR`, `OGM_BLOB_ROOT`, `OGM_BACKUP_TARGET=ssh:<host>:~/ogm-backups`
   or `local:<path>`; hand: the target host exists and has room (GATE-BACKUP-TARGET). `systemctl --user start ogm-backup`.
   Check: `bash ops/test/backup-restore.sh` passes; `ops/bin/ogm-status --check` exits 0.
8. Web push (optional): `OGM_VAPID_KEY_FILE`, `OGM_VAPID_SUBJECT`.

**8. Verify** (~20 min). The short form of #98.
1. `ops/bin/ogm-status --check` exits 0; no `PLACEHOLDER` lines except units you chose not to run.
2. Open `<app-origin>` on a phone: age → sign in (magic link) → connect GitHub → `/new`: describe a game, agree the
   scope; a job is admitted (`/admin/builds`), a `gm-<gameId>` repo appears under `<github-owner>`, an
   `ogm-aiur@<slug>` unit starts, the build chat shows progress, the game opens in `/g/<gameId>`.
3. Edit while playing (a design transaction lands, `/g/<gameId>/versions`), publish (`/g/<gameId>/releases`), open the
   release URL on `<tailnet-host>:10000`, invite a friend (`/join/<token>`).
4. `journalctl --user -u 'ogm-*' --since -1h` has no errors; `bash scripts/sandbox/proof/run.sh` is green.

### Ask an agent

Under every large step, one block with a copy button and this text (step 3 shown; `{{N}}`, `{{title}}` and the hand
list are substituted from the same YAML):

> You are setting up Open Game Maker 2000 on this machine for me. Clone
> `https://github.com/its-everdred/open-game-maker-2000` (I have access) if it is not at
> `~/games/open-game-maker-2000`, read `SETUP.md` at its root, and do **step 3, Set up aiur for agent orchestration**,
> sub-steps in order. Run each step's Check before moving on. Stop when you reach a hand step and print it for me
> exactly as written (sudo, browser sign-ins and consoles are mine); continue after I say done. Never add a provider
> API key, never authorise spending, never print a secret, and never commit anything under `assets-local/` or
> `~/.config/ogm`. Report each sub-step as done, skipped (why) or blocked (what you need from me).
>
> Hand steps in this step: `aiur login codex gamebuilder`; `aiur login claude default`; place the Codex login at
> `~/.config/ogm/codex-gamebuilder/auth.json`.

The prompt works in Claude Code and Codex alike (plain text, no tool names). Because the repo is private today, the
first line says "I have access"; when the repo goes public the sentence is dropped from the YAML and both outputs
change together.

## SETUP.md (agent-facing)

Generated from the same YAML, committed at the repo root; CI fails when it is stale (`pnpm --filter @ogm/site check`).
Shape, per large step:

```
## 3. Set up aiur for agent orchestration
Outcome: ...            Time: ~40 min + two browser logins
Preconditions: step 2 done (`pnpm build` green), `~/.config/ogm/env/api.env` exists
### 3.1 Clone and build aiur
Command: ...
Writes: ~/.local/bin/aiur
Check: aiur --help
### 3.3 Logins (HAND)
Hand back to the human: ...
Check: aiur accounts
```

Fields per sub-step: `kind` (`run` | `hand` | `optional`), `command`, `writes` (files or units), `check`, `cites`
(repo paths; the test below asserts they exist). `AGENTS.md` gains one line under "Layout": "Setting up a host:
`SETUP.md` (generated from `apps/site/content/setup.yaml`; edit the YAML)."

## Where it lives and how it ships

- `apps/site/` in the monorepo: `content/setup.yaml`, `content/splash.yaml` (the hero line, CTA labels, capture
  paths), `src/schema.ts` (Zod), `src/render/html.ts`, `src/render/markdown.ts`, `src/page/` (accordion, copy
  button, checkbox state, placeholder form, one small script, no framework), `tools/build.mts` (writes `dist/`,
  `dist/setup/index.html` and `../../SETUP.md`; `--check` compares), `public/hero/*.webp`, `public/captures/*.mp4`.
  Package scripts follow `AGENTS.md` "New package" (`build`, `typecheck`, `test`, `lint`) plus `check`.
- Delivery: a second Netlify site (free tier; `apps/site/tools/deploy.sh` is `netlify deploy --prod --no-build --dir
  dist --site $(< .netlify-site-id)`, manual like `apps/web/tools/deploy.sh`, no credits spent building). The app stays
  at `ogm2000.netlify.app`; #18's `_redirects`/`_headers` are untouched. When Kevin has a domain, the apex points at
  the site and the app moves to a subdomain; nothing in the pages changes except `<app-origin>` in `splash.yaml`.
  Rejected: GitHub Pages (the repo is private; Pages needs a paid plan for that), and `/about` + `/setup` inside
  `apps/web` (would put marketing copy under the app's `noindex` headers and tie the splash's deploys to app deploys).
- Headers: the site's own `_headers` with no `noindex` (the app keeps its), long cache on `/hero/*` and `/captures/*`.

## Tests

In `apps/site` (Vitest, run by `pnpm test` through the workspace glob):
1. **Content:** `setup.yaml` parses against the schema; every `cites` path exists in the repo (`fs.existsSync` from
   the repo root); every command block that names a repo path (`ops/`, `scripts/`, `services/`, `apps/`, `packages/`,
   `docs/`) names one that exists; every hand step appears in its step's Ask-an-agent block; step numbering is
   consecutive.
2. **Routes:** `dist/index.html` and `dist/setup/index.html` are written; each has one `<h1>`, a `<title>`, the two
   CTAs resolve (`/setup`, `<app-origin>`); no `applekid` or `orangekid` literal in either (the self-host test).
3. **Freshness:** `tools/build.mts --check` exits 0 after a build (SETUP.md and dist match the YAML); CI runs it.
4. **Accordion a11y** (Playwright, `test:browser` so CI's browser job picks it up): every header is a `<button
   aria-expanded aria-controls>` inside an `<h2>`; Enter and Space toggle; the panel is `hidden` when collapsed;
   `prefers-reduced-motion` disables the height transition; checkboxes have labels; copy buttons have `aria-label`;
   tab order is header → copy → checkbox; focus ring visible on a 375 px viewport.
5. **Link check:** a Vitest that collects every `href` in `dist/**/*.html`; internal links resolve to files in
   `dist/`, repo-relative links (`github.com/its-everdred/open-game-maker-2000/blob/main/<path>`) resolve to files in
   the checkout; external hosts are allow-listed (`github.com`, `tailscale.com`, `netlify.com`, `console.cloud.google.com`,
   `khala.aiur.team`) and not fetched (no network in tests).

## Risks

- **Private repo.** The Ask-an-agent prompt needs the visitor's agent to have repo access; the splash advertises a
  product strangers cannot set up. Either the repo goes public before the splash is shared, or the splash is shared
  only with people Kevin has invited (and the "Set up your own" CTA is still useful to them).
- **Kevin-specific paths in code, not docs.** `_redirects`, `_headers`, `ogm-commit.service` (`WorkingDirectory`),
  `ogm-aiur@.service` (`~/github/aiur`), `voice-host/README.md` (`OGM_AIUR_GIT=/home/orangekid/...`). The steps tell the
  visitor which lines to edit; a later platform ticket could render them from env. Out of scope here.
- **Two aiur launchers** (`aiurdev` in the unit, `~/.local/bin/aiur` in `ogm-run`). The steps follow the unit, since
  that is what the fleet manager starts; the ops ticket records which one is canonical once Kevin says.
- **Homage sprites in the hero.** The title town carries Ness and Rampage homages (memory "game-homage micro
  scenes"). Fine inside the family app; on a marketing page they are someone else's characters. The hero poster
  should be rendered without the sprite layer (`city.js` already takes `?capture`; the poster tool gets a flag) or
  cropped to the city. Kevin decides.
- **Content rot.** Every step cites a file; the tests catch deleted files but not changed semantics. The meta-improve
  pass should re-read SETUP.md when `ops/` or `docs/ops/` change (one line in that skill's checklist).
- **Scope creep on the splash.** Three captures, one line, two CTAs. Anything more is a Kevin request.

## Open questions for Kevin

1. The one line on the hero (placeholder above), and whether the splash is shared before the repo is public.
2. Hosting of the site: second Netlify site (recommended, manual deploys), or wait for a domain.
3. Which aiur launcher is canonical for `ogm-aiur@` (`~/github/aiur/scripts/aiurdev` vs `~/.local/bin/aiur`), and
   whether a visitor builds aiur from `aiur-team/aiur` main or a tagged release.
4. The hero without homage sprites: render the city alone, or keep the town as is for a private audience.
5. Do the three captures come from the live app on this host now (needs a build to record) or wait for #98.

## Tickets

Filed with `build-lane:web`, `priority:2`, no `agent:todo` (the Executor queues them). Order of merge: #224 → #225, #226
in parallel → #227 → #228; #229 independent.

| | Title | Touches | Complexity |
| --- | --- | --- | --- |
| A #224 | Setup content source and generated SETUP.md | `apps/site/content/setup.yaml`, `src/schema.ts`, `src/render/markdown.ts`, `tools/build.mts`, `SETUP.md`, `AGENTS.md` (one line) | 2 |
| B #225 | Splash page in the title-town look | `apps/site/content/splash.yaml`, `src/render/html.ts`, `src/page/`, `public/hero`, `public/captures`, `apps/site/tools/deploy.sh` | 2 |
| C #226 | /setup page: accordion, placeholders, Ask-an-agent blocks | `apps/site/src/render/html.ts`, `src/page/accordion.ts`, `src/page/placeholders.ts`, `src/page/copy.ts` | 2 |
| D #227 | Ops docs the setup steps cite: commit unit, per-unit values, GitHub App permissions, self-host edits | `docs/ops/runbook.md`, `docs/ops/hand-steps.md`, new `docs/ops/self-host.md`, `services/commit/README.md`, `ops/bin/ogm-host-setup.sh` (commit unit in `units=`) | 2 |
| E #228 | Site tests: content, routes, freshness, accordion a11y, link check | `apps/site/test/*`, `apps/site/e2e/*`, `package.json` `test:browser` | 2 |
| F #229 | Drive drop folder as a /setup optional path with a dry-run check | `apps/site/content/setup.yaml` step 6, `scripts/py/drive-sync/README.md` (parametrised paths) | 1 |

Filed 2026-11-01 as #224–#229 (plain titles, `build-lane:web`, `complexity:1-3`, `priority:2`, no `agent:todo`).
