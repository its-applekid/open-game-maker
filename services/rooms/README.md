# `@ogm/rooms`

The rooms service is a relay-only Colyseus process. The owner's browser remains authoritative for simulation and design transactions; the service keeps only membership, the room pin, phase, presence, and `lastRev`.

The OGM-002 systemd unit starts it with:

```ini
ExecStart=node services/rooms/dist/main.js
```

It reads `OGM_ROOMS_PORT`, `OGM_WS_TOKEN_SECRET`, `OGM_ROOMS_INTERNAL_SECRET`, `OGM_API_INTERNAL_URL`, and `OGM_GAMES_ORIGIN` through `@ogm/config`. The process binds only `127.0.0.1`; real values belong in `~/.config/ogm/env/rooms.env` with mode `0600`.

The pinned multiplayer packages are `colyseus@0.18.10`, `@colyseus/core@0.18.24`, `@colyseus/ws-transport@0.18.4`, `@colyseus/schema@5.0.43`, `@colyseus/testing@0.18.6`, and `@colyseus/sdk@0.18.9`.

For local development:

```sh
pnpm --filter @ogm/rooms dev
```
