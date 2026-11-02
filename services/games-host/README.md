# Games host

`@ogm/games-host` serves completed game builds from a loopback-only process. Tailscale ingress owns the public
games origin; this service owns immutable file responses and the browser security headers around untrusted game code.

## Environment

- `OGM_GAMES_PORT`: loopback port for the HTTP server.
- `OGM_GAMES_ROOT`: directory containing `<gameId>/<buildId>/` build trees.
- `OGM_APP_ORIGIN`: one or more space-separated HTTP(S) origins allowed by CSP `frame-ancestors`.
- `OGM_GAMES_BIND`: optional assertion; if set, it must be `127.0.0.1`.

A build is invisible until its directory contains `.complete`. Publishers should use the exported
`@ogm/games-host/layout` helpers and call `markComplete` only after every build file has been durably written.
The API's build publisher (`services/api/src/builds`) is the production writer.

The service exposes `GET /healthz` and `GET|HEAD /g/<gameId>/<buildId>/<path>`. It never sets cookies, never lists a
directory, and applies the game CSP and immutable caching headers to every `/g/` response.
