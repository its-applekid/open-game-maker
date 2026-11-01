# `@ogm/intake`

This no-port service consumes open Drive queue entries one at a time. It blocks drops that failed integrity checks, deduplicates by drop id and sorted MD5 set, and runs `gm packs import` under `nice -n 10`. Unknown licences remain quarantined for a named-human confirmation.

The systemd unit is owned by OGM-002. Its entrypoint is:

```sh
node services/intake/dist/main.js
```

Configure the unit with `OGM_ASSETS_ROOT` (the `assets-local` library) and `OGM_STATE_DIR` (normally `~/.local/state/ogm`). It polls every 30 seconds, backs off for five minutes after an import error, and writes `OGM_STATE_DIR/intake/status.json` with counts and the last 50 completed jobs. It emits newline-delimited `intake.*` events to stdout for the journal and binds no socket.

The service never reads Drive credentials and never moves or deletes Drive or quarantine files.
