# OGM-006 plan — Ingress: Tailscale serve/funnel and Netlify proxy

## 1. Problem frame

Nothing on this machine is reachable from the Netlify app or from a friend's phone until a public HTTPS hostname fronts the loopback services. Tailscale already provides the hostname, the certificate, path routing and (with Funnel) public reach at zero cost (E11-5); the work is a repeatable script for the port map, a shell test that pins the command set, and a document the web app and the services copy their origins from. The one hand step is Kevin's (`--operator`), so everything is testable with a fake `tailscale` before he runs it.

Requirements trace: R69 → reverse proxy with TLS and public hostnames for the API, rooms, voice and the games domain; the frontend proxies `/api/*` and `/auth/*` so cookies stay first-party.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/ops/bin/ogm-host-setup.sh` and `ops/test/lib.sh` (OGM-002): `set -euo pipefail`, `--dry-run`, fake-binary tests; reuse the helpers.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T11-hosting-and-ops.md` §4 "Ingress map": the lines to reproduce in `docs/ops/ingress.md`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T09-web-app.md` §4 "Netlify": `_redirects` order (`/api/*` proxy before `/* /index.html 200`).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/deploy.sh` line 11: today's `_headers` content (noindex, cache rules) that OGM-070 keeps alongside the new lines.

## 3. Implementation units

### U1 `ops/bin/ogm-ingress.sh`

Goal: apply the serve/funnel map idempotently; never touch 443.

Files: Create `ops/bin/ogm-ingress.sh` (executable).

Approach: `TS=${OGM_TAILSCALE:-tailscale}`; `ENV_DIR=${OGM_ENV_DIR:-$HOME/.config/ogm/env}`; `port() { grep -E "^$2=" "$ENV_DIR/$1.env" | cut -d= -f2 | tr -d '[:space:]'; }` with a loud failure (`missing $ENV_DIR/$1.env or $2`) when empty. Build the command list into an array of strings (one per line) so `--dry-run` prints it and the live path runs it in order; after the live run, `$TS serve status` is printed. Flags: `--dry-run`, `--off` (the `off` forms, same order reversed, funnel first), `--tailnet-only` (skip the funnel commands). Host facts used: Funnel ports 443/8443/10000; 443 reserved (E11-5). Exit non-zero with the Tailscale error text if a command fails (typically "operator" permission: print the GATE-TS-OPERATOR hand step).

Interface sketch:

```
ops/bin/ogm-ingress.sh [--dry-run] [--off] [--tailnet-only]
env: OGM_TAILSCALE (tests), OGM_ENV_DIR (tests)
commands (on):
  tailscale serve  --bg --https=8443                      http://127.0.0.1:${OGM_API_PORT}
  tailscale serve  --bg --https=8443 --set-path=/ws/rooms http://127.0.0.1:${OGM_ROOMS_PORT}
  tailscale serve  --bg --https=8443 --set-path=/ws/voice http://127.0.0.1:${OGM_VOICE_PORT}
  tailscale serve  --bg --https=10000                     http://127.0.0.1:${OGM_GAMES_PORT}
  tailscale funnel --bg 8443 on
  tailscale funnel --bg 10000 on
```

Test scenarios (`ops/test/ingress.sh`):
- Given temp env files with `OGM_API_PORT=3100`, `OGM_ROOMS_PORT=3200`, `OGM_VOICE_PORT=3300`, `OGM_GAMES_PORT=3400` and a fake `tailscale` that appends `$*` to a log, when the script runs, then the log equals the six lines above with those ports.
- Given a second run, then the log has the same six lines again and `diff` of the two runs is empty (the script is a pure function of the env files; Tailscale itself is idempotent on repeated `serve --bg`).
- Given `--dry-run`, then the log is empty and stdout contains the six commands.
- Given `--off`, then the log contains only lines ending in `off` for 8443/10000, and no line contains `--https=443` or ` 443 `.
- Given `--tailnet-only`, then no `funnel` line is recorded.
- Given `rooms.env` missing, then exit 1 and the message names `rooms.env` and `OGM_ROOMS_PORT`.
- Given the fake `tailscale` exits 1 with `Access denied: operator`, then the script exits 1 and prints `sudo tailscale set --operator=orangekid`.

Execution note: write the test first with the fake; the command text is the contract.

### U2 `docs/ops/ingress.md`

Goal: the single page OGM-070, OGM-010, OGM-051, OGM-085, OGM-007 and OGM-100 read for origins.

Files: Create `docs/ops/ingress.md`.

Approach, sections in order: (1) the origin map table from the ticket; (2) Netlify lines for `apps/web/public/_redirects`:

```
/api/*   https://applekid.tailee0e71.ts.net:8443/api/:splat   200
/auth/*  https://applekid.tailee0e71.ts.net:8443/auth/:splat  200
/*       /index.html                                           200
```

and `_headers` additions (keep today's noindex and cache lines from `deploy.sh`):

```
/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://applekid.tailee0e71.ts.net:8443 wss://applekid.tailee0e71.ts.net:8443; frame-src https://applekid.tailee0e71.ts.net:10000; img-src 'self' data: blob: https://applekid.tailee0e71.ts.net:8443; media-src 'self' blob: https://applekid.tailee0e71.ts.net:8443; worker-src 'self' blob:
```

(3) the hand step and gate; (4) what the script does, dry-run, off, tailnet-only; (5) the verification: `tailscale serve status`, `tailscale funnel status`, the phone `curl`; (6) caveats: Netlify proxy credits per GB and timeouts (JSON only through the proxy), Funnel relay bandwidth, shared games origin (E11-7), mount-path pass-through as observed on the first real run (fill in); (7) the upgrade path when a domain exists (cloudflared or Caddy DNS-01; not V1).

Test scenarios:
- Given the doc, when `grep -c 'applekid.tailee0e71.ts.net:8443/api/:splat'` runs, then 1 (OGM-070 copies that exact line); add this grep to `ops/test/ingress.sh` so the doc and the script cannot drift on the hostname and ports.

### U3 Real run and record (after the gate)

Goal: the map is live and the observed behaviours are recorded.

Files: Modify `docs/ops/ingress.md` (fill the observed section).

Approach: once Kevin has run the operator command, run `ops/bin/ogm-ingress.sh`; paste `tailscale serve status` into the PR; start a loopback stand-in on `$OGM_API_PORT` if OGM-010 is not merged (`node -e "require('node:http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({ok:true,service:'stand-in',version:'0',uptimeSec:0}))}).listen(process.env.OGM_API_PORT,'127.0.0.1')"`), then `curl` from outside; record whether `/ws/rooms` reaches the upstream with or without the prefix (`nc -l 127.0.0.1 $OGM_ROOMS_PORT` and a `curl` to `/ws/rooms/x` shows the request line).

Test scenarios:
- Given Funnel on, when `curl -sS https://applekid.tailee0e71.ts.net:8443/healthz` runs from a non-tailnet network, then the JSON is returned and the TLS certificate is valid (no `-k`).
- Given the stand-in stopped, then the same curl returns a Tailscale 502-style error, proving the upstream is loopback-bound and nothing else answers.

## 4. Verification

```
bash ops/test/ingress.sh
ops/bin/ogm-ingress.sh --dry-run
# after GATE-TS-OPERATOR, on this host:
ops/bin/ogm-ingress.sh && tailscale serve status && tailscale funnel status
curl -sS https://applekid.tailee0e71.ts.net:8443/healthz        # from a phone on cellular (Kevin), pasted
```

Paste into `## Local tests`: the shell test summary, the dry-run output with the real ports, and (when the gate is cleared) the two status outputs and the curl JSON; if the gate is still open at merge time, say so and name the gate.

## 5. Deferred to implementation

- Exact `tailscale funnel` toggling form on 1.104.2 (`funnel --bg <port> on` vs `funnel --bg --https=<port> <target>`): default the `on` form after the `serve` mounts; `tailscale serve --help` decides.
- `--set-path` prefix pass-through: default assume preserved (upstreams mount under `/ws/rooms`, `/ws/voice`); record the observation and flip the services' mount prefix if stripped.
- Whether `/blobs` gets its own mount: default no, the API serves it (OGM-005 handler).
- Tailnet-only mode for V1: default Funnel on (invites), Kevin can choose otherwise.

## 6. Scope boundaries

- `_redirects`/`_headers` files: OGM-070. Service listeners and `/healthz`: OGM-010/051/085/007. Auth and tokens: OGM-011/052.
- Status reporting of serve/funnel: OGM-008's `ogm-status`. Domain purchase, cloudflared: deferred.

## 7. Risks

- The operator step may wait on Kevin past the 5:30am checkpoint: the script and doc merge regardless (CI-tested with the fake); the human step is recorded in the PR as pending and in OGM-008's hand-steps list.
- Netlify's proxied bandwidth has a credit cost: only JSON crosses it; a `curl -w` size check of one API call is pasted to show scale.
- Funnel exposes two ports to the internet before auth exists (OGM-011): until OGM-011 merges, run with `--tailnet-only` (the Executor's call at the real run).
