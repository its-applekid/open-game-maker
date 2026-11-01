# OGM-080 — Build chat backend: implementation plan

## 1. Problem frame

The creator and the build agent need one conversation per job that carries text both ways and media one way (agent → creator), while the agent runs inside a Codex sandbox with no network (D-SBX, E03-4) and aiur carries no media (E06-13). This ticket builds the OGM-owned store, the SSE stream, the creator→aiur mirror, the agent→OGM outbox relay and the aiur→system-row projection, and publishes the contract every other chat ticket copies.

Requirements trace: **R22** (stills and clips at each visible step; creator replies mid-build; posts are text, image, clip or choice) → agent rows via the outbox relay with media in the blob store, creator rows mirrored to aiur messages. **R24** (chat shows aiur phase and friendly progress) → `progress` system rows from aiur progress events, deduplicated; usage and queued-at-reset rows are rendered by OGM-076 from job data, not stored here.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/examples/webhook-receiver.ts` — a small typed module with an injectable id store; copy its shape for `outbox-relay.ts` (pure `applyLine()` core, I/O at the edge).
- `/home/orangekid/github/aiur/packages/aiur-contracts/scripts/validate.mjs` — fixture-against-schema check; copy for the `chat.ts` fixture test.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs` — this repo's existing ajv validator (negatives in `tools/negative/`); copy the "one negative fixture per rule" habit.
- OGM-010's first context under `services/api/src/<context>/` (routes mounted by directory scan, Drizzle schema in `packages/db`, timestamped migration) — copy its file layout exactly; refresh at pickup.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/drive_sync.py` — the settle-then-process loop with an offset ledger; the relay copies the idea (offsets per file, idempotent replay), not the code.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (`sharp` 30k, `ulid` 3k; both fine); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Contract `packages/contracts/src/chat.ts`

Goal: the Zod source of truth for `BuildChatMessage`, `AgentOutboxLine`, the stream and post bodies; JSON Schema and fixtures emitted and checked in.
Files:
- Create `packages/contracts/src/chat.ts`, `packages/contracts/fixtures/chat/{creator-text,agent-clip,progress-row,checkpoint-row}.json`, `packages/contracts/fixtures/chat/negative/{unknown-kind,media-without-size}.json`.
- Modify `packages/contracts/src/index.ts` (append `export * from "./chat.js"`).
- Test `packages/contracts/test/chat.test.ts`.
Approach: transcribe T06 §4 field for field (quoted in the ticket); `kind` is a `z.enum`; `media` requires `width` and `height`; `checkpoint.status` enum `open|answered|moot`; `AgentOutboxLine.type` is `z.string().regex(/^[a-z_]+\.[a-z_]+$/)` with the four known values documented; `ChatPostBody = { text: z.string().min(1).max(8000) }` (aiur's message cap is 8,000 chars, E06-13); `since` is `z.coerce.number().int().nonnegative()`. Emit JSON Schema with the contracts package's existing emitter (OGM-004) into `packages/contracts/schemas/chat.schema.json`.
Interface sketch:
```ts
export const BuildChatMessage = z.object({...});  export type BuildChatMessage = z.infer<typeof BuildChatMessage>;
export const AgentOutboxLine = z.object({ v: z.literal(1), id: z.string().ulid(), job_id: z.string(), at: z.string().datetime(), type: z.string(), payload: z.record(z.unknown()) });
export const ChatPostBody = z.object({ text: z.string().min(1).max(8000) });
```
Test scenarios:
- Given the four positive fixtures, when parsed, then all pass.
- Given `negative/unknown-kind.json`, when parsed, then it fails naming `kind`.
- Given `negative/media-without-size.json`, then it fails naming `media.width`.

### U2. Store and migration

Goal: an append-only table with a monotonic `seq` for `since`.
Files:
- Create `packages/db/src/schema/build-chat.ts`, `packages/db/migrations/<YYYYMMDDHHmmss>_build_chat.sql`, `services/api/src/build-chat/store.ts`.
- Test `services/api/src/build-chat/__tests__/store.test.ts`.
Approach: table `build_chat_messages(seq integer primary key autoincrement, id text unique, job_id text not null, at text not null, actor text, kind text, text text, media_json text, checkpoint_json text, aiur_json text, mirror_state text /* null|pending|sent|failed */, blob_sha256 text, poster_sha256 text)`, index `(job_id, seq)` and unique `(job_id, aiur_event_id)` via a generated column from `aiur_json.event_id`. `store.ts` exports `insert(row)` (ignores duplicate `id`, returns the stored row), `listSince(jobId, since, limit=200)`, `updateCheckpoint(id, patch)` (used by OGM-082), `markMirror(id, state)`. Rows are mapped to `BuildChatMessage` in `toMessage(row, signer)` where `signer` mints `media.url`/`poster` from the sha256 (U4).
Test scenarios:
- Given two inserts with the same `id`, when listed, then one row.
- Given rows seq 1..5, when `listSince(job, 3)`, then rows 4 and 5 in order.
- Given a row with `aiur.event_id = 7` twice, then the second insert is ignored.
Execution note: write the duplicate-id test first; it fails on a plain insert.

### U3. Routes and SSE stream

Goal: `GET /api/v1/jobs/:jobId/chat` (SSE), `GET …/chat/messages?since=`, `POST …/chat`.
Files:
- Create `services/api/src/build-chat/routes.ts`, `services/api/src/build-chat/stream.ts`.
- Test `services/api/src/build-chat/__tests__/routes.test.ts`.
Approach: Hono router; every route calls `authorize(actor, "game.edit", { gameId: job.gameId, ownerId })` from `packages/policy` (deny wins; players never read a build chat). SSE via `streamSSE` from `hono/streaming`: on connect, replay `listSince(jobId, since)` then subscribe to an in-process `EventEmitter` keyed by job (`stream.ts` exports `publish(jobId, msg)` and `subscribe(jobId, fn)`); heartbeat comment every 25 s; `id:` = `seq`, `event: message`, `data:` = `BuildChatMessage` JSON. `POST` validates `ChatPostBody`, inserts `{actor:"creator", kind:"text", mirror_state:"pending"}`, publishes, then hands the row to U5. Rate limit creator posts at 30/min per job (in-memory token bucket; the API is one process, D-DB).
Interface sketch: `GET /api/v1/jobs/:jobId/chat?since=0` → `text/event-stream`; `POST /api/v1/jobs/:jobId/chat {"text":"make the door red"}` → `201 BuildChatMessage`.
Test scenarios:
- Given a creator session, when posting, then 201 and the SSE client receives the row.
- Given another family member, when posting, then 403.
- Given `since=2` and rows 1..3, when connecting, then only row 3 is replayed.
- Given 31 posts in a minute, then the 31st is 429.

### U4. Media into the blob store

Goal: copy outbox media into the content-addressed store and compute dimensions.
Files:
- Create `services/api/src/build-chat/media.ts`.
- Test `services/api/src/build-chat/__tests__/media.test.ts` with fixtures `fixtures/chat/tiny.png` and `fixtures/chat/tiny.mp4` (generate once with `ffmpeg -f lavfi -i testsrc=size=64x64:rate=10 -t 1`).
Approach: `putMedia(absPath, workspaceRoot)` → asserts `path.resolve(absPath).startsWith(workspaceRoot + "/.gm/outbox/media/")`, streams into `BlobStore.put()` (OGM-005) returning sha256; `probe()` uses `sharp(file).metadata()` for images and `execFile("/usr/bin/ffprobe", ["-v","error","-show_entries","stream=width,height:format=duration","-of","json", file])` for clips; returns `{ sha256, width, height, duration_ms? }`. `signed(sha256)` wraps the blob store's day-rounded signed GET (T11 §4). Limits: 25 MiB per file, image kinds `png|webp|jpg`, clip `mp4` only (gm-verify emits H.264 MP4, E06-14).
Test scenarios:
- Given `tiny.png`, then `{width:64,height:64}` and the blob exists.
- Given `tiny.mp4`, then `duration_ms ≈ 1000`.
- Given a path outside `.gm/outbox/media/`, then it throws `outbox_path_outside_workspace`.
- Given a 30 MiB file, then `media_too_large`.

### U5. Creator → aiur mirror

Goal: every creator row reaches the worker as an aiur operator message, retried, never blocking the post.
Files:
- Create `services/api/src/build-chat/aiur-mirror.ts`.
- Test `__tests__/aiur-mirror.test.ts` with a fake `AiurClient`.
Approach: `mirror(row)` reads the job row (`aiurRepo`, `aiurIssueNumber`); if no ticket yet (queued or `at_reset`), leave `mirror_state: "pending"` and let `flushPending(jobId)` run when OGM-031 records the issue number (export `flushPending`; OGM-031 calls it, documented in the ticket's sibling section). With a ticket: `client.message(String(issue), row.text, row.id)` (T02 §4 `message(id, text, messageId?)`; the client adds `Authorization`, `Origin`, `X-Aiur-Request: 1`). On failure: exponential backoff 1 s → 60 s, five tries, then `mirror_state: "failed"` and a system row "Your message didn't reach the builder; try again".
Test scenarios:
- Given a job with issue 142, when a creator row is mirrored, then the fake client saw `message("142", text, row.id)`.
- Given no issue, then state stays `pending` and `flushPending` later sends it once.
- Given the client throws five times, then state `failed` and one system row exists.

### U6. Outbox relay and handler scan

Goal: ship agent-side `.gm/outbox/*.jsonl` lines into the API with no network in the sandbox.
Files:
- Create `services/api/src/build-chat/outbox-relay.ts`, `services/api/src/build-chat/outbox-handlers.ts`, `services/api/src/build-chat/outbox.ts` (the `chat.post` handler itself).
- Test `__tests__/outbox-relay.test.ts`.
Approach: `startRelay({ root: config.OGM_BUILDER_WORKSPACES_ROOT, offsetsDir: OGM_DATA_DIR + "/outbox-offsets" })` uses `fs.watch(root, { recursive: true })` (Node 24, Linux) plus a 5 s rescan to catch missed events; for each `**/.gm/outbox/*.jsonl` it reads from the stored byte offset, splits complete lines (a trailing partial line waits), parses with `AgentOutboxLine`, derives `workspaceRoot` as the directory above `.gm`, and dispatches by `type`. Handlers are modules `services/api/src/*/outbox.ts` exporting `{ type: string, handle(line, ctx) }`, collected by the same directory scan OGM-010 uses for routes; unknown types are logged once and skipped. The `chat.post` handler (this ticket) builds the row: `kind`, `text`, `media` via U4 (`payload.file`, `payload.poster`), `actor: "agent"`, `id = line.id`, inserts, publishes. `ctx` carries `{ jobId, workspaceRoot, store, publish }` and `recordWorkspace(jobId, workspaceRoot)` so OGM-082 can write inbox files later. A line > 64 KiB or failing validation is logged with the file and line number and skipped; offsets advance regardless (no poison loops).
Interface sketch:
```ts
export interface OutboxHandler { type: string; handle(line: AgentOutboxLine, ctx: OutboxContext): Promise<void> }
export interface OutboxContext { jobId: string; workspaceRoot: string; store: ChatStore; publish: (m: BuildChatMessage) => void }
```
Test scenarios:
- Given a temp root with `<ws>/.gm/outbox/chat.jsonl` holding one `chat.post` image line, when the relay runs, then one agent row with media exists and the SSE emitter published once.
- Given the same line appended again, then no new row.
- Given a line with `file: "../../etc/passwd"`, then no row and one log entry.
- Given a `scope.agreed` line and no handler registered, then skipped and logged once.
- Given the relay restarted, then offsets resume and nothing is re-delivered.
Execution note: characterization-first on `fs.watch` recursion: assert the watcher fires for a nested new file on this host before relying on it; keep the 5 s rescan regardless.

### U7. aiur progress → system rows

Goal: phase changes and `checkin` events become `kind: "progress"` rows until OGM-032's feed subscriber takes over.
Files:
- Create `services/api/src/build-chat/progress-poller.ts`.
- Test `__tests__/progress-poller.test.ts`.
Approach: every `OGM_CHAT_POLL_MS` (10 s) for jobs in states `filed|running|paused_budget`: `client.progress(issue, 20)` (contract `aiur.ticket_progress` v1: `phase`, `progress{percent,source,freshness}`, `events[]{id,type,topic,label,summary,at}`); insert a row per event id not yet stored (`aiur: { ticket, event_id, topic }`, `text: label || summary`), and a row when `phase` changes (`text: phase`, `aiur: { ticket, topic: "phase" }`, dedupe on `(job, phase)` in memory). Export `ingestProgress(jobId, progress)` so OGM-032 can call the same function from the feed and retire the timer.
Test scenarios:
- Given a fake `progress()` with events 3 and 4, then two rows; polled again, none.
- Given `phase` changes `implement → verify`, then one phase row.
- Given the client throws, then no row and the next tick still runs.

### U8. Wiring, config and docs

Goal: the context mounts, the relay and poller start with the API, names are declared.
Files:
- Modify `packages/config/src/names.ts` (append `OGM_BUILDER_WORKSPACES_ROOT`, `OGM_CHAT_POLL_MS`), `services/api/.env.example` (names only), `services/api/src/build-chat/index.ts` (start/stop hooks for the relay and poller, invoked by OGM-010's service bootstrap).
Approach: nothing starts if `OGM_BUILDER_WORKSPACES_ROOT` is missing; the loader names the missing variable and never logs a value (aiur's rule, T11 E11-10).

## 4. Verification

```
pnpm --filter @ogm/contracts test
pnpm --filter @ogm/api test -- build-chat
pnpm -r typecheck && pnpm -r lint
# manual smoke on this host (optional): start the API on 127.0.0.1, then
curl -N -H "Cookie: $SESSION" "http://127.0.0.1:$OGM_API_PORT/api/v1/jobs/j_test/chat?since=0" &
mkdir -p /tmp/ws/.gm/outbox/media && cp fixtures/chat/tiny.png /tmp/ws/.gm/outbox/media/ && \
printf '%s\n' '{"v":1,"id":"01JTESTULID000000000000000","job_id":"j_test","at":"2026-11-01T05:00:00Z","type":"chat.post","payload":{"kind":"image","text":"first room","file":".gm/outbox/media/tiny.png"}}' >> /tmp/ws/.gm/outbox/chat.jsonl
```
Paste into `## Local tests`: the three pnpm commands with counts, and the SSE line received from the smoke test (media URL redacted to its path).

## 5. Deferred to implementation

- Relay offsets store: default a JSON file per outbox file under `OGM_DATA_DIR/outbox-offsets/`; a SQLite table is acceptable if OGM-010 already has a kv helper.
- SSE heartbeat interval: default 25 s (matches aiur's events channel).
- Clip probing when `ffprobe` is absent: default store the clip without `duration_ms` and log once.
- Row text for phase rows: default the raw phase string; OGM-032/076 map it to creator words.

## 6. Scope boundaries

- Checkpoint correlation, `/decide`, inbox files: OGM-082.
- The commands that write outbox lines: OGM-081 (`gm chat`, `gm checkpoint`), OGM-088 (`gm scope done`), OGM-090 (`gm progress`).
- The panel and FAB states: OGM-076. The scope-chat screen: OGM-074.
- Friendly stage projection and the events-feed subscriber: OGM-032.
- Creator image upload and EXIF stripping: OGM-074 (reuses `putMedia`).

## 7. Risks

- `fs.watch` recursive misses events on some filesystems → default: keep the 5 s rescan; the watcher only lowers latency.
- Workspace root unknown until the builder lane lands (OGM-034/037 choose the game-builder `.aiur` dir) → default: config name with no default value; the relay refuses to start without it and says so.
- Two writers to one outbox file (parallel `gm` calls) could interleave lines → default: `gm` appends with `O_APPEND` and one `write()` per line (≤ 64 KiB, atomic on Linux); the relay tolerates a partial trailing line.
- aiur progress endpoint latency under many jobs → default: at most four daemons (D-DAEMONS) and a 10 s period; the poller is retired by OGM-032.
