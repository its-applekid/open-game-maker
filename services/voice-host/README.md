# Voice host

The voice host supervises one `voice_converse` instance. It accepts short-lived OGM tokens on a loopback WebSocket, serves briefings from an in-memory cache, and forwards confirmed instruction drafts to the API. It stores no transcript or other durable state.

## Build

The Mix project pins `voice_converse` to commit `0f692a45b04bb4ce3e7d8256e134028894bd128b`. On the OGM host, use the local aiur checkout so dependency resolution does not need GitHub access:

```sh
OGM_AIUR_GIT=/home/orangekid/github/aiur HEX_OFFLINE=1 mise exec -C services/voice-host -- mix deps.get
MIX_ENV=prod mise exec -C services/voice-host -- mix release
```

The release is `_build/prod/rel/voice_host`. `ops/bin/ogm-run voice-host` starts it through the existing `ogm-voice-host.service` unit.

## Configure

Create missing API and voice-host environment files. The initializer refuses to overwrite an existing file and preserves shared secret values across unit files; add new names to an existing file manually.

```sh
pnpm --filter @ogm/config build
pnpm --filter @ogm/config exec ogm-env-init api
pnpm --filter @ogm/config exec ogm-env-init voice-host
```

Set `OGM_API_INTERNAL_URL` to the loopback API base URL and `OGM_VOICE_WS_URL` to the public `/ws/voice` URL. The voice host defaults to `OGM_VOICE_PROVIDER=fake`, which needs no provider key. Live adapters read `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` from `voice-host.env` only when used; set `OGM_VOICE_LLM` with either live provider. Keep every env file mode `0600`.

Batch narration is off until `OGM_VOICE_NARRATION_ENABLED=true`; until then `POST /internal/narration` answers
501 `narration_disabled` and games fall back to browser speech, even with a provider key present. When on, it
writes temporary WAV files to `OGM_VOICE_RENDER_DIR` (the system temporary directory's
`ogm-voice-renders` child by default). The host creates it with mode `0700`; the API deletes each WAV after
transcoding it. `OGM_NARRATION_CONCURRENCY` limits API-side renders to 2 by default.

[`roles/creator.md`](roles/creator.md) is the source of truth for the creator agent's role prompt. When enabling a live provider, paste that file into the provider's agent prompt; the host also includes it in every briefing so local and live behavior use the same guidance.

The service binds the conversation socket to `127.0.0.1:40400` and internal HTTP to `127.0.0.1:40401` by default. The internal surface is:

- `GET /healthz`
- `POST /internal/briefing` with `Authorization: Bearer <OGM_VOICE_INTERNAL_SECRET>`; the legacy
  `X-OGM-Internal` form is also accepted
- `POST /internal/narration` with the same credential and `{ text, voice_id, format: "pcm_24000" }`

Ingress setup remains owned by `ops/bin/ogm-ingress.sh`, which maps `/ws/voice` to `OGM_VOICE_PORT`.

## Run

Build the release before enabling the existing user unit:

```sh
ops/bin/ogm-host-setup.sh
systemctl --user restart ogm-voice-host
curl --fail --silent http://127.0.0.1:40401/healthz
journalctl --user -u ogm-voice-host --since today
```

The health response identifies `voice-host` and the selected provider. Inspect logs only for service state; token and provider secret values must never appear.
