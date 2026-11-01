# `@ogm/config`

This package is the only TypeScript code allowed to read `process.env`. Services define an `EnvSpec`, call `loadEnv`, and fail startup if required names are missing or malformed. Logs may contain environment variable names, never their values; use `redact` when reporting presence.

## Environment files

Each systemd user unit reads one private file at `~/.config/ogm/env/<unit>.env`. The directory is private and each file has mode `0600`; OGM-002's unit definitions reference the file with `EnvironmentFile=`.

Build the package, then create a file without overwriting an existing one:

```sh
pnpm --filter @ogm/config build
pnpm --filter @ogm/config exec ogm-env-init api
```

The initializer generates secret values, reuses shared secrets from existing unit files, and leaves non-secret values blank for the operator. It never prints a secret.

For a local run, source the same unit file explicitly:

```sh
set -a
. ~/.config/ogm/env/api.env
set +a
node services/api/dist/index.js
```

## Adding a name

Append one row to `src/names.ts`, add the matching commented empty line to the root `.env.example`, and run this package's tests. Do not commit real values or another `.env` file.

Non-TypeScript readers, including the voice host and hooks, read the same unit files and use names from this registry.
