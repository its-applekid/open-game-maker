# Netlify proxy and auth origin

Safari blocks third-party cookies, so the browser must only ever see `https://makeopen.games`. The API's auth
routes reach it through Netlify 200 rewrites; cookies never cross to `ts.net` (D-ORIGIN). [ingress.md](ingress.md) has
the full origin map.

## Values to copy

| Where | Value |
| --- | --- |
| `_redirects`, written by `apps/web/tools/deploy.sh` from `OGM_PUBLIC_APP_ORIGIN` in `web.env` | `https://ogm2000.netlify.app/*  https://makeopen.games/:splat  301!` |
| `_redirects`, written by `apps/web/tools/deploy.sh` from `VITE_API_ORIGIN` in `web.env`, before the SPA fallback | `/api/*  https://<tailnet-host>:8443/api/:splat  200` |
| | `/auth/*  https://<tailnet-host>:8443/auth/:splat  200` |
| `OGM_APP_ORIGIN` in `~/.config/ogm/env/api.env` | `https://makeopen.games` (Better Auth `baseURL`, `trustedOrigins`, passkey `origin`) |
| Better Auth `basePath` | `/auth` |
| Passkey `rpID` | `makeopen.games` (host of `OGM_APP_ORIGIN`) |
| Google authorized JavaScript origin | `https://makeopen.games` |
| Google authorized redirect URI | `https://makeopen.games/auth/callback/google` |
| Magic link | `https://makeopen.games/auth/magic-link/verify?token=…` (15 min, one use) |

`ts.net` is never a trusted origin or the RP ID. Google stays off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are both set (GATE-GOOGLE-OAUTH); magic link and passkey work without it.

## Cookies

- `ogm_age`: signed adult attestation from `POST /auth/age`, 24 h, `HttpOnly; Secure; SameSite=Lax; Path=/`. Under 18
  leaves `ogm_age=refused` for 365 days and the API refuses further answers from that browser.
- `__Secure-better-auth.session_token`: the session, 7 days, renewed daily, same attributes.

Neither sets `Domain`, so both stay host-only on `makeopen.games`. `_headers` must not add caching to `/api/*` or
`/auth/*`.

## Sockets

Netlify proxies carry no WebSocket upgrades, so sockets connect to `wss://<tailnet-host>:8443` directly and
authenticate with a token, never a cookie: `POST /auth/ws-token` (an `ogw1` session proof, 5 min), room grants
(OGM-050) or the voice token (OGM-085). Native or CLI callers can send `Authorization: Bearer <session token>` (the
`set-auth-token` response header) instead of the cookie.

## Rate limits

`POST /auth/age` and magic-link sends allow 10 an hour per client address (`x-nf-client-connection-ip`, then the first
`x-forwarded-for` entry) and magic links 10 an hour per email. A caller hitting 8443 directly through Funnel can set
those headers itself, so the per-email limit is the one that holds against it.

## iPhone check (after OGM-006 and OGM-070 are live)

1. Open `https://makeopen.games` in Safari, pass the age screen, sign in by magic link from the admin inbox.
2. Register a passkey, sign out, sign in with the passkey.
3. Note the iOS and Safari versions. If `Set-Cookie` arrives without `Secure` or with a `Domain`, the proxy rewrote it.
