# OGM-003 plan — Config and secrets loader

## 1. Problem frame

Every service on this machine gets its configuration from one env file systemd injects (D-HOSTING, E11-10). Nothing enforces today that a service reads only known names, fails loudly when one is missing, or never logs a value. `@ogm/config` is that enforcement: a registry of names, a typed loader that throws names-only errors, an example file kept in sync by test, and a tiny initializer that creates the per-unit file at the right mode. It is one package so the rule has one owner.

Requirements trace: R69 → "every service is a `systemd --user` unit with an env file (0600) it alone reads": this ticket defines the names, the file convention and the loader; OGM-002 wires `EnvironmentFile=`.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/website/docs-app/reference/configuration-daemon.md` ("Environment variables"): the names-not-values rule and `.env.example` discipline; copy the wording into `README.md`.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/test_drive_sync.py` (the config-refuses-secrets-inside-the-repo test): same shape for `ogm-env-init`.
- `/home/orangekid/github/aiur/packages/aiur-contracts/tsconfig.json`: package tsconfig shape (via OGM-001's base).

## 3. Implementation units

### U1 Kinds and loader

Goal: `loadEnv` returns typed values or throws a names-only `ConfigError`.

Files: Create `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/kinds.ts`, `packages/config/src/index.ts`. Test `packages/config/test/load-env.test.ts`.

Approach: `kinds.ts` exports `parseKind(kind, raw): {ok:true,value}|{ok:false,reason}`: `port` → integer 1–65535; `int` → integer; `bool` → `true|false|1|0`; `url` → `new URL(raw)` must succeed and have `http:`/`https:`; `path` → non-empty, `~` expanded with `os.homedir()`; `secret` → length ≥ 16; `string` → non-empty. `index.ts`: `loadEnv(service, spec, source = process.env)`: for each key, assert it is in `OGM_ENV_NAMES` (else throw `ConfigError` with `invalid:[key]` and message `unregistered env name`), read `source[key] ?? spec[key].default`, collect `missing` (required and undefined) and `invalid` (parse failure, with the reason but never the raw value), throw one `ConfigError` if either is non-empty, else return the typed object. `redact(name)` returns `<set>`/`<unset>`. `ConfigError.toString()` is `config(<service>): missing OGM_X, OGM_Y; invalid OGM_Z (port: not an integer)`.

Interface sketch: see the ticket's contract block (`EnvSpec`, `EnvValues`, `loadEnv`, `ConfigError`, `redact`).

Test scenarios:
- Given a source with every required name valid, when `loadEnv('api', spec)` runs, then it returns `{ OGM_API_PORT: 3000, OGM_PUBLIC_ORIGIN: 'https://…' }` with `typeof OGM_API_PORT === 'number'`.
- Given `OGM_BLOB_SIGNING_KEY` set to `'hunter2-hunter2-hunter2-hunter2'` and `OGM_API_PORT` absent, when `loadEnv` runs, then it throws `ConfigError` whose `missing` is `['OGM_API_PORT']` and whose message does not contain `hunter2`.
- Given `OGM_API_PORT='abc'`, then `invalid` contains `OGM_API_PORT` and the message contains `port` but not `abc`.
- Given a spec key `NOT_REGISTERED`, then it throws before reading the source.
- Given `OGM_DATA_DIR='~/.local/share/ogm/data'`, then the returned value starts with `os.homedir()`.
- Given `secret` of 8 characters, then `invalid` names it.

Execution note: test-first; the loader is small and the tests are the spec.

### U2 Name registry and `.env.example` sync

Goal: one source of truth for names; the example file cannot drift and cannot carry values.

Files: Create `packages/config/src/names.ts`, root `.env.example`. Tests `packages/config/test/names.test.ts`, `packages/config/test/env-example.test.ts`.

Approach: `names.ts` is the array in the ticket (24 rows). `.env.example` is generated once by hand in the same order:

```
# Open Game Maker 2000: environment names. Real files live in ~/.config/ogm/env/<unit>.env (0600), one per unit.
# Values never go in this file or in git. Create a unit's file with: pnpm --filter @ogm/config exec ogm-env-init <unit>
# [api] loopback port of the API
OGM_API_PORT=
# [rooms] loopback port of the Colyseus relay
OGM_ROOMS_PORT=
…
```

`env-example.test.ts` parses the file (`^([A-Z0-9_]+)=(.*)$`), asserts the ordered name list equals `OGM_ENV_NAMES.map(n => n.name)`, every value is empty, and every comment line before a name contains `[<unit>]`. `names.test.ts` asserts names are unique, uppercase, and every `secret` kind has `unit` not equal to `'shared'` only when the doc names its readers (documentation guard, keep simple: assert docs are non-empty).

Test scenarios:
- Given a row added to `names.ts` but not `.env.example`, when the test runs, then it fails naming the row.
- Given `OGM_SESSION_SECRET=abc` in `.env.example`, then it fails with `value present for OGM_SESSION_SECRET`.
- Given a duplicate name in the registry, then `names.test.ts` fails.

### U3 `ogm-env-init`

Goal: create `~/.config/ogm/env/<unit>.env` at 0600 with generated secrets and blanks for the operator to fill.

Files: Create `packages/config/bin/ogm-env-init.mjs` (add `"bin": {"ogm-env-init": "bin/ogm-env-init.mjs"}` to `package.json`). Test `packages/config/test/env-init.test.ts` (runs the script with `HOME` set to a temp dir).

Approach: plain ESM, no build step (it imports the registry from `../dist/names.js`, so `pnpm --filter @ogm/config build` first; document). Args: `<unit>` (one of the `unit` values plus `shared`), `--dir <path>` (default `$HOME/.config/ogm/env`), `--force` (never overwrites otherwise). Writes rows where `unit === <unit> || unit === 'shared'`: for a `secret` row, first scan every existing `<dir>/*.env` for a non-empty `NAME=value` and reuse it (so a secret two units share, such as `OGM_WS_TOKEN_SECRET` for api and rooms, is identical in both files), else `randomBytes(32).toString('hex')`; others blank. One `EnvironmentFile=` per unit stays true (OGM-002); there is no `shared.env`. Writes with `fs.writeFileSync(path, data, { mode: 0o600 })` after `mkdirSync(dir, { recursive: true, mode: 0o700 })`. Refuses when `realpath(dir)` is inside `git rev-parse --show-toplevel`. Prints `wrote <path> (<n> names, <k> generated)`, never a value.

Interface sketch:

```
ogm-env-init <api|rooms|games|commit|voice-host|intake|drive-sync|aiur|backup> [--dir DIR] [--force]
```

Test scenarios:
- Given a temp `HOME`, when `ogm-env-init api` runs, then `~/.config/ogm/env/api.env` exists with mode `0600`, contains `OGM_API_PORT=` and `OGM_BLOB_SIGNING_KEY=<64 hex>`, and stdout contains no hex string of length 64.
- Given the file exists, when run again without `--force`, then exit 2 and the file is unchanged.
- Given `--dir` inside the repo, then exit 2 with `refusing to write inside the repository`.
- Given `api.env` already holds `OGM_WS_TOKEN_SECRET=<v>`, when `ogm-env-init rooms` runs, then `rooms.env` holds the same `<v>` (shared secrets are reused from any existing unit file, never regenerated) and stdout still shows no value.
- Given no unit file holds a shared secret yet, when `ogm-env-init api` runs, then it generates it once; a later `ogm-env-init rooms` copies it.

### U4 README

Goal: the convention in one page an agent copies from.

Files: Create `packages/config/README.md`.

Approach: sections: the rule (names in logs, never values; `process.env` only here, enforced by the ESLint rule from OGM-001); the files (`~/.config/ogm/env/<unit>.env`, 0600, `EnvironmentFile=` in OGM-002's units); local runs (`set -a; . ~/.config/ogm/env/api.env; set +a; node services/api/dist/index.js`); adding a name (append a row to `names.ts`, a line to `.env.example`, run the tests); non-TS readers (voice host, hooks) read the same file. Under 60 lines.

Test scenarios: covered by the lint check in OGM-001 (`AGENTS.md` names `@ogm/config`), no code test.

## 4. Verification

```
pnpm --filter @ogm/config build
pnpm --filter @ogm/config test
pnpm --filter @ogm/config typecheck && pnpm --filter @ogm/config lint
HOME=$(mktemp -d) node packages/config/bin/ogm-env-init.mjs api && ls -l $HOME/.config/ogm/env/api.env
```

Paste into `## Local tests`: the Vitest summary (file count, test count, 0 failed), the `ls -l` line showing `-rw-------`, and a line stating that each test was run once against the stubbed production code to confirm it fails.

## 5. Deferred to implementation

- Minimum secret length: default 16 (aiur's cookie rule); `ogm-env-init` generates 64 hex.
- `bool` accepted spellings: default `true|false|1|0`.
- Whether `loadEnv` freezes the returned object: default yes (`Object.freeze`).
- Registry row for `OGM_VOICE_PORT` vs letting OGM-085 add it: default add now (listed in the ticket) so OGM-002's `voice-host.env` has a name.

## 6. Scope boundaries

- Unit files and `EnvironmentFile=` lines: OGM-002. Ingress hostnames: OGM-006. Backup target semantics: OGM-008.
- Sandbox `deny_read` list and `CODEX_HOME`: OGM-037. aiur daemon config rendering: OGM-034.
- Service-specific names: appended by their tickets (OGM-010, OGM-035, OGM-051, OGM-085, OGM-064).

## 7. Risks

- Name registry becomes a hot surface: it is append-only, one line per name, so conflicts are trivial rebases (D-WRITE-SURFACES).
- Importing `names.js` from `dist` in the bin script couples it to a build: documented; the test builds first.
- The `process.env` lint rule may catch legitimate reads in test files: tests may read env for `HOME`; scope the rule to `src/**` in OGM-001's config (noted there).
