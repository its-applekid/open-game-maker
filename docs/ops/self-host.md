# Self-hosting: the lines to change

The repo is set up for one existing host. On another host, fill these placeholders once and edit these lines by hand;
everything else comes from env files ([runbook.md](runbook.md) "Per-unit values").

- `<user>`: the Linux account that runs OGM.
- `<tailnet-host>`: the machine's Tailscale name, for example `box.tailXXXX.ts.net`.
- `<app-origin>`: the Netlify site URL, for example `https://<site>.netlify.app`.

## Files

| File | Line today | Change to |
| --- | --- | --- |
| `apps/web/public/_headers` | no host today | nothing; sockets take their hosts from `OGM_PUBLIC_ORIGIN` and `OGM_VOICE_WS_URL` |
| `apps/web/.netlify-site-id` | the current site's id | your Netlify site's id; `apps/web/tools/deploy.sh` reads it |

Two host values are set when you deploy the app, never stored in the repo. `VITE_API_ORIGIN` is the API's public
origin: `apps/web/tools/deploy.sh` writes Netlify's `_redirects` (the `/api/*` and `/auth/*` proxies) from it and stops
if it is missing. `VITE_GAMES_ORIGIN` is baked into the web build for the games frame
(`apps/web/src/routes/game/GameScreen.tsx`, falling back to `http://127.0.0.1:10000`):

```
VITE_API_ORIGIN=https://<tailnet-host>:8443 VITE_GAMES_ORIGIN=https://<tailnet-host>:10000 apps/web/tools/deploy.sh
```

The commit unit needs no edit: `ops/systemd/ogm-commit.service` uses `@REPO@` like every other unit, and
`ops/bin/ogm-host-setup.sh` fills in the checkout path.

`.env.example` and `packages/config/src/names.ts` show placeholders in the comments for `OGM_PUBLIC_ORIGIN`,
`OGM_GAMES_ORIGIN` and `OGM_VOICE_WS_URL`; set the real values in the env files:

```
OGM_PUBLIC_ORIGIN=https://<tailnet-host>:8443
OGM_GAMES_ORIGIN=https://<tailnet-host>:10000
OGM_APP_ORIGIN=<app-origin>
OGM_VOICE_WS_URL=wss://<tailnet-host>:8443/ws/voice
```

## Lingering

The units are `systemd --user` units, so they stop at logout and do not start at boot unless the account lingers.
Once, as root or with sudo:

```
loginctl enable-linger <user>
```

Check: `loginctl show-user <user> --property=Linger` prints `Linger=yes`.

## Funnel or tailnet-only

`ops/bin/ogm-ingress.sh` mounts the API on `:8443` and games on `:10000` ([ingress.md](ingress.md)). It needs
`sudo tailscale set --operator=<user>` once, plus HTTPS certificates enabled in the tailnet admin console.

- Funnel (default): public HTTPS. Needed for invite links opened by people who are not on your tailnet, and for the
  Netlify app's `/api` and `/auth` rewrites, which come from Netlify's servers. Funnel must be allowed for the node in
  the tailnet policy.
- `--tailnet-only`: `tailscale serve`, reachable only from devices on your tailnet. The Netlify-hosted app cannot
  reach the API this way, so sign-in through `<app-origin>` stops working.
