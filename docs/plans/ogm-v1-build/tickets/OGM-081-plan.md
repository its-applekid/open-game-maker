# OGM-081 — gm chat post and gm checkpoint: implementation plan

## 1. Problem frame

Agents build inside a Codex sandbox with no network (D-SBX). They must still show their work (R22) and ask the creator bounded questions (R23). The channel out is a file: `.gm/outbox/*.jsonl` lines that OGM-080's relay ships. The channel in for answers is a file too: `.gm/inbox/checkpoints/<id>.json` written by OGM-082. The aiur Command itself is raised by the agent's `emit_event` tool, so `gm checkpoint open` prepares everything and prints the call.

Requirements trace: **R22** → `gm chat post` (text, image, clip with poster) writes the outbox line the relay turns into a `BuildChatMessage`. **R23** → `gm checkpoint open` posts 2–5 candidates (option ids = candidate media ids) and prints the `decision.requested` payload; `gm checkpoint wait` lets the agent pause only the dependent step.

## 2. Patterns to follow

- `packages/gm-cli/src/commands/assets/search.ts` (OGM-060, refresh at pickup) — argument parsing, `--json`, exit 2 with a one-line cause and the suggested command (T05 §4).
- `/home/orangekid/github/aiur/.agents/skills/aiur-agent/emit-and-subscribe.md` lines 141–175 — the `decision.requested` payload shape to print (question, context, options with descriptions, recommendation, authority, reversibility, kind, consequence_of_delay).
- `/home/orangekid/github/aiur/src/lib/aiur/decision.ex` lines 29–30 — option fields `%{id, label, description, benefits, drawbacks, risk}` and `recommendation %{option_id, reason}`; only `id`, `label`, `description` are required by the validator (`decision_validation.ex`).
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-design-loop/SKILL.md` lines 30–32 — the "show as you go" rule the command serves (read, do not edit; T10 edits it).
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/drive_sync.py` — the repo's existing example of one-JSON-object-per-line queue writing (`queue.jsonl`).

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1` (no service here); secrets only from `packages/config` names (none read here); no new dependency below 1k GitHub stars without naming the exception (`ulid` 3k); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Shared outbox helpers

Goal: one place that finds the workspace, the job id and appends a line atomically.
Files:
- Create `packages/gm-cli/src/commands/chat/outbox.ts`.
- Test `packages/gm-cli/src/commands/chat/__tests__/outbox.test.ts`.
Approach: `workspaceRoot(cwd)` runs `git rev-parse --show-toplevel` (fallback: walk up to a dir containing `.gm/` or `package.json`); `jobContext({ job })` resolves `--job` → `process.env.GM_JOB` → `<root>/.gm/context/job.json` (`{ job_id, ticket, game_id }`, written by OGM-036's hook bundle) → exit 2 "no job id: pass --job or run inside a build workspace"; `appendLine(root, file, line)` validates with `AgentOutboxLine.parse`, serializes to one line, refuses > 65,536 bytes, `fs.openSync(path, "a")` + one `writeSync` (atomic append on Linux), `mkdir -p` first; `newId()` = `ulid()`; `mediaInto(root, src, kind)` copies `src` to `.gm/outbox/media/<sha256>.<ext>` (ext by kind: `png|webp|jpg|mp4`), size cap 25 MiB, returns the relative path; `eventsSink(event, jobId, payload)` appends to `$GM_EVENTS_FILE` when set (E05-19).
Interface sketch:
```ts
export function jobContext(o: { job?: string; cwd?: string }): { jobId: string; root: string; ticket?: string }
export function appendLine(root: string, file: "chat.jsonl" | "checkpoint.jsonl", line: AgentOutboxLine): void
export function mediaInto(root: string, src: string, kind: "image" | "clip" | "poster"): string
```
Test scenarios:
- Given a temp git repo and `GM_JOB=j1`, when `jobContext()`, then `{jobId:"j1"}`.
- Given no env and `.gm/context/job.json`, then its `job_id`.
- Given neither, then it throws a `UsageError` (exit 2).
- Given a 70 KiB line, then `line_too_large`.
- Given two `appendLine` calls, then the file has two complete lines.

### U2. `gm chat post`

Goal: the post command and the exported function OGM-090 reuses.
Files:
- Create `packages/gm-cli/src/commands/chat/index.ts` (registers `post`), `packages/gm-cli/src/commands/chat/post.ts`.
- Test `packages/gm-cli/src/commands/chat/__tests__/post.test.ts` with fixtures `fixtures/media/tiny.png`, `fixtures/media/tiny.mp4`.
Approach: flags `--job`, `--text` (required for `text`, optional otherwise; ≤ 500 chars, one line), `--image <png|webp|jpg>`, `--clip <mp4>` with required `--poster <png>`, `--json`. `postChat({ jobId?, text?, image?, clip?, poster?, cwd? })` → `kind` derived (`clip` > `image` > `text`), media copied via `mediaInto`, line `{ v:1, id, job_id, at: new Date().toISOString(), type:"chat.post", payload:{ kind, text, file?, poster? } }`, `appendLine(root, "chat.jsonl", line)`, `eventsSink("chat.post", …)`, returns `{ id, line }`. Output: the id on stdout (or the line with `--json`). Refusals: `--clip` without `--poster` (exit 2 "clips need a poster: add --poster shots/phone/t0.png"), wrong extension, missing file.
Interface sketch: `export async function postChat(opts: PostOpts): Promise<{ id: string; line: AgentOutboxLine }>`.
Test scenarios:
- Given `--text "first room"`, then one `chat.post` line with `kind:"text"` and the printed id equals `line.id`.
- Given `--clip tiny.mp4 --poster tiny.png`, then both copied under `.gm/outbox/media/` named by sha256 and `payload.file/poster` are relative paths.
- Given `--clip` without `--poster`, then exit 2.
- Given `$GM_EVENTS_FILE` set, then one `chat.post` event line appended.
Execution note: test-first on the `--clip`-without-`--poster` refusal; it passes trivially if the check is missing, so assert on exit code and message.

### U3. `gm checkpoint open`

Goal: write the candidates and print the `emit_event` call.
Files:
- Create `packages/gm-cli/src/commands/checkpoint/index.ts`, `packages/gm-cli/src/commands/checkpoint/open.ts`, `packages/gm-cli/src/commands/checkpoint/payload.ts` (pure builder).
- Test `packages/gm-cli/src/commands/checkpoint/__tests__/open.test.ts`.
Approach: flags `--job`, `--question` (≤ 2,000 chars), repeated `--option id=label` (2–5, ids `[a-z0-9_-]{1,32}`, unique), `--recommend id` (must be an option), repeated `--media id=<chat message id>` (each id must appear as a line id in `.gm/outbox/chat.jsonl`), `--blocking`, `--json`. Checkpoint id `cp_` + ulid. Write `checkpoint.open` line to `checkpoint.jsonl` with `CheckpointOpenPayload`. `buildEmitEvent(payload)` returns the JSON in the ticket's contract: `name:"decision.requested"`, `message` = question, `payload.kind:"direction_checkpoint"`, `authority:"supervisor_allowed"`, `reversibility:"reversible"`, `urgency:"normal"`, `blocking`, `context.short_summary` fixed, `context.long_context_markdown` starting with `<!-- gm-checkpoint:cp_… -->`, `options[]` with `description` = `"Preview " + label` when no description flag (optional `--describe id=text`), `recommendation` when given, `consequence_of_delay` fixed text. Print: line 1 `cp_…`; then a heading `emit_event call:` and the JSON (pretty, 2-space); with `--json` print `{ checkpoint_id, emit_event }` only.
Interface sketch: `export function buildEmitEvent(p: CheckpointOpenPayload): { name: "decision.requested"; message: string; payload: Record<string, unknown> }`.
Test scenarios:
- Given two options and `--recommend a`, then the line and the printed JSON contain the marker and `recommendation.option_id === "a"`.
- Given `--media a=<unknown>`, then exit 2 "unknown chat message id".
- Given one option, then exit 2 "2–5 options".
- Given six options, then exit 2.
- Given no `--blocking`, then `blocking:false`.

### U4. `gm checkpoint wait`

Goal: block until OGM-082 writes the answer file; print the option id.
Files:
- Create `packages/gm-cli/src/commands/checkpoint/wait.ts`.
- Test `packages/gm-cli/src/commands/checkpoint/__tests__/wait.test.ts`.
Approach: argument `<cp_id|decision_id>`; poll `<root>/.gm/inbox/checkpoints/<id>.json` every 2 s (`--interval` hidden flag for tests) up to `--timeout` (default 600 s); parse `{ checkpoint_id, decision_id, option_id, status, at }`; on `answered` print `option_id` and exit 0; on `moot` print `moot` to stderr and exit 4; on timeout print "no answer after N s; make sure the emit_event call was made" and exit 3. Also accept the file by either name (OGM-082 writes both).
Test scenarios:
- Given the file appears after 100 ms with `option_id:"b"`, when waiting with `--interval 0.05`, then stdout `b`, exit 0.
- Given `status:"moot"`, then exit 4.
- Given no file and `--timeout 0.2`, then exit 3.

### U5. Registration and docs

Goal: the commands are found by the directory scan and documented for skills.
Files:
- Modify nothing central (scan picks up `commands/chat/` and `commands/checkpoint/`).
- Create `packages/gm-cli/src/commands/chat/README.md` and `packages/gm-cli/src/commands/checkpoint/README.md` (the one-screen cheat sheet T10 copies into `gm-core`).
Approach: each README is ≤ 40 lines: synopsis, the three example invocations from the ticket, exit codes, the inbox/outbox paths.

## 4. Verification

```
pnpm --filter @ogm/gm-cli test -- chat checkpoint
pnpm -r typecheck && pnpm -r lint
# manual, in any git checkout:
GM_JOB=j_demo node packages/gm-cli/dist/index.js chat post --text "hello"            # prints a ULID
GM_JOB=j_demo node packages/gm-cli/dist/index.js checkpoint open --question "Which look?" \
  --option a=Chunky --option b=Flat --recommend a                                     # prints cp_… and the emit_event JSON
cat .gm/outbox/chat.jsonl .gm/outbox/checkpoint.jsonl
```
Paste into `## Local tests`: test counts per file, the printed ULID and the first 10 lines of the `emit_event` JSON.

## 5. Deferred to implementation

- Text length cap for `--text`: default 500 characters, one line (longer text is a `kind:"text"` post the agent writes separately).
- Whether `gm chat post` accepts `--kind` explicitly: default no; derive from flags.
- Exact `description` wording when `--describe` is absent: default `"Preview " + label`.
- Poll interval for `wait`: default 2 s; hidden `--interval` for tests.

## 6. Scope boundaries

- Relay, store, blob upload, SSE: OGM-080.
- Correlation of Commands, cards, `/decide`, inbox answer files: OGM-082.
- `gm progress` and the verify report: OGM-090 (imports `postChat`).
- `gm scope done`: OGM-088.
- Skill text naming these commands and the ≤3/≤1 checkpoint budget: OGM-091, OGM-093.

## 7. Risks

- Agents may skip the `emit_event` call after `checkpoint open` → default: the printed output starts with an imperative one-liner ("Now call emit_event with this payload"), `wait` times out with the same reminder, and OGM-082's card shows "waiting for the builder to ask"; T10's skill makes the call part of the checkpoint recipe.
- `git rev-parse` unavailable or cwd outside a repo → default: walk up for `.gm/`, else exit 2.
- `.gm/context/job.json` shape depends on OGM-036 → default: read `job_id` only; tolerate extra fields; `GM_JOB` env wins.
- ULID collisions across restarts: negligible; the relay also dedupes on id.
