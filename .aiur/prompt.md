# Working on Open Game Maker 2000

You are implementing one ticket of the V1 build of Open Game Maker 2000, a voice-first web game maker. The whole plan is in `docs/plans/ogm-v1-build/` on branch `research` (the architecture in `architecture.md`, your ticket's contract in `tickets/<ID>.md`, its deep research in `tickets/<ID>-plan.md`). Your GitHub issue carries the ticket document verbatim and links to those files; read the research plan before writing code, then implement what the ticket says and nothing beyond it.

Rules that hold on every ticket:

- Read `AGENTS.md` at the repository root first when it exists; it names the package manager, the test runner and the commands CI runs. Use those commands in your `## Local tests` section.
- TypeScript everywhere (React in `apps/web`, Node services in `services/*`, shared packages in `packages/*`). Python stays only in `scripts/*` workers that already exist.
- Never commit secrets, tokens, download links, licence serials or anything under `assets-local/`. Never add a provider API key or any paid service. Never deploy to Netlify.
- Do not edit `docs/plans/ogm-v1-build/` (the planning pack is frozen); put design notes in the PR description or `docs/` pages your ticket names.
- Keep the PR to your ticket's write surface; if you must touch a shared file (root `package.json`, CI workflow, `packages/contracts`), keep the change minimal and say so in the PR.
- Tests must fail without the production change they guard. Report the exact commands you ran and their results.
- Open the PR with `Closes #<issue>` as its first line and the `## Local tests` section the aiur-agent skill requires.
- Before opening the PR, run the `ce-code-review` skill on your branch's full diff against `main` and fix every finding it rates blocking (re-run until it reports none). Add a `## Review` section to the PR body: which reviewer personas ran, each blocking finding and the commit that fixed it, and the non-blocking findings you left with a one-line reason each. The Executor's check only verifies that the PR does what the ticket says; a PR without a `## Review` section is sent back without being read.

## Design is fixed
The web screens (title town, games selection, creation, editor, chat panel) keep the design landed in the studio-v0 / title-town prototype (`apps/web/title-town`, archived `prototypes/`): same layout, flow, motion and copy. Implement the logic behind it; never redesign, restyle or add chrome (no new nav, panels, labels or helper text). Where a ticket and the prototype differ in look or flow, the prototype wins; say so in the PR.

## Host names

The repo is public. Docs, fixtures, config examples and `_redirects` never contain a real host, tailnet node, service-account
or user name or a home path: use placeholders (`<tailnet-host>`, `<user>`); hosts come from env files at deploy time (#313,
#317). The apps/site tests enforce it for the site; a repo-wide check is #317.

## Browser tests

A package that adds `test:browser` picks a preview/dev port in the 4317x range that no other package uses (`git grep 4317`
first) and passes `--strictPort` (vite otherwise falls back to the next port and collides with another package): CI runs every package's browser tests concurrently, so a shared port fails main for everyone (#307 vs templates/game-2d
on 4174, hotfix #315). Tests that depend on ffmpeg use `it.skipIf(!ffmpegAvailable)`.

## Database migrations

Before opening or un-drafting a PR that adds a migration under `packages/db`: merge main first, then re-timestamp your
migration so it sorts after main's latest, give it the next `_journal.json` idx, and regenerate its snapshot by running
`drizzle-kit generate` on top of main's chain (prettier the JSON); never hand-edit `prevId` or copy an old snapshot: a
hand-chained snapshot (#265) lacked another migration's columns and made the next regen (#256) try to rebuild a table.
Three PRs in one night (#176, #188, #189) failed review on exactly this; the reviewer bounces it every time. If the
reviewer says it is renumbering your migration, stop touching the journal and do not push until told to pull.
Never modify an already-merged migration or its journal or snapshot entry: the journal is append-only (a PR that
re-timestamped main's entry was bounced too).

## Tests that need ffmpeg

ffmpeg is not on every CI runner. Any test that encodes video or audio through ffmpeg must `it.skipIf(!ffmpegAvailable)`
with the reason in the test name (the audio WAV test shows the pattern), or inject a fake encoder so the result shape
does not depend on the runner. Three PRs tonight (#231, #212, #220) bounced on this.
