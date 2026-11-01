# Open Game Maker 2000: operating notes for coding agents

## Commands

- Install exactly from the lockfile: `pnpm install --frozen-lockfile`.
- Run the repository gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Test one package with `pnpm --filter @ogm/<pkg> test`; Python workers use `make test` after OGM-009.
- Browser tests use Playwright on Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`; set
  `GM_VERIFY_SOFTWARE_GL=1` for SwiftShader (CI does).

## Layout

Product code lives in `apps/*`, `packages/*`, `services/*`, `skills/*`, `templates/*`, `scripts/py/*`, and `ops/`
(see `docs/plans/ogm-v1-build/architecture.md` §2 on the `research` branch). Package names are `@ogm/<dir>`;
the engine-side exceptions are `@gm/sdk` and `@gm/host`.

## Write-surface rules

- Do not edit the root `package.json` except to add a workspace script; packages own their dependencies and scripts.
- Keep one contract family per file in `packages/contracts/src`; `src/index.ts` is append-only.
- Commands, routes, and screens are directory-scanned; migrations are timestamped files.
- `.aiur/config`, `CODEOWNERS`, `.gitignore`, and `ci.yml` are Executor-owned shared surfaces.

## Services

Bind services to `127.0.0.1` only. Read environment values by name through `@ogm/config` and never log a value.
Secrets live in `~/.config/ogm/env/<unit>.env` with mode `0600`. Do not add provider API keys or authorize spending.

## Dependencies

Pin exact versions. A new dependency with fewer than 1,000 GitHub stars needs the exception named in the PR.

## Tests

Use Vitest for unit tests. Every new test must fail without the production change. Run browser tests with the flags above.

## Pull requests

Start the body with `Closes #<issue>`. Include `## Local tests` with Policy, a 40-character Tested head SHA, Base as
`<ref> @ <sha>`, Selection, and one command/result bullet. Update the evidence after every push.

## Never commit

Never commit `assets-local/`, keys, download links, licence serials, or `prototypes/ui-v0/tools/_pf.mjs`. Prototypes are
frozen. Deploys are manual because Netlify credits are limited.
