# OGM-076 — Build chat panel: implementation plan

## 1. Problem frame

The creator watches a build take shape and talks back without leaving the screen they are on. The backend (OGM-080) stores every post and streams it; agents post stills and clips with `gm chat post`; aiur phases become system rows. This ticket is the React side: the dock with its three states, the per-job chat, the composer in three modes, and the phone sheet. The prototype tracker is the layout reference, not code.

Requirements trace:
- R22 → stills and clips at each visible step render as media rows; the creator replies mid-build through the composer (U3, U4).
- R24 → phase in creator words, friendly progress, usage in the friendly unit, queued-at-reset rows with Edit and Cancel (U2, U5).

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js:561-615`: the three dock states, the ring (`stroke-dashoffset = 113 * (1 - p)`), the glow rule ("read when opened, cleared when closed") and the `aria-label` wording; port the behaviour, rewrite in React.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/index.html:632-643`: the tracker markup as the DOM outline for `Fab`, `Bar`, `JobList`.
- `/home/orangekid/github/aiur/website/tests/visual.spec.ts`: the viewport matrix for the e2e.
- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md`: ignore unknown fields and ids; the message reducer follows it.
- OGM-073's `apps/web/src/routes/games/*` (at pickup) for the TanStack Query hook shape the app uses.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added here); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Dock state and shell mount

Goal: the FAB → bar → list → chat state machine, mounted once over every screen.
Files: Create `apps/web/src/features/build-chat/{BuildChatDock.tsx,Fab.tsx,Bar.tsx,dock.ts}`; Test `dock.test.ts`, `Fab.test.tsx`.
Approach: `dock.ts` is a zustand store `{ state: 'collapsed' | 'open' | 'expanded' | 'chat', openJobId, seen: Set<jobId>, fresh: boolean }` with `openFab()`, `toggleList()`, `openChat(jobId)`, `back()`, `markSeen()`; `fresh` becomes true when a job's state turns terminal-success and clears on `openFab()`; done-and-seen jobs are pruned on collapse. `Fab` draws the ring from `combinedProgress(jobs)` (sum of elapsed over sum of expected; expected from the reservation size class) and the count; the glow class when `fresh`. `BuildChatDock` composes the pieces and is exported for OGM-071's shell to mount (one import). `body.builds-on` class so the sound button slides (prototype rule).
Interface sketch:
```ts
export type DockState = 'collapsed' | 'open' | 'expanded' | 'chat';
export const useDock: UseBoundStore<{ state: DockState; openJobId?: string; fresh: boolean; openFab(): void; toggleList(): void; openChat(id: string): void; back(): void }>;
```
Test scenarios:
- Given two active jobs at 25 % and 75 %, when rendered, then the ring offset equals `113 * 0.5`.
- Given a job turns `done` while collapsed, when rendered, then the FAB has the glow and `aria-label` "A build finished. Show it"; when opened, the glow clears.
- Given a done job already seen, when the dock collapses, then it is pruned.
- Given no jobs, then the dock is hidden.

### U2 — Jobs list and rows

Goal: one row per job with phase words, progress, usage, time left, and queued-at-reset actions.
Files: Create `apps/web/src/features/build-chat/{JobList.tsx,JobRow.tsx,jobs.ts,units.ts}`; Test `units.test.ts`, `JobRow.test.tsx`.
Approach: `jobs.ts`: `useMyJobs()` (TanStack Query over the jobs list route in `packages/contracts/jobs.ts`, `refetchInterval` 30 s while any job is non-terminal; invalidated by `build.done` and `job.started` events from the notifications SSE, OGM-016). `units.ts`: `formatUnits(microUsd: number, unit: { label: string; perUnitMicroUsd: number })` → one decimal, singular/plural by label; the unit comes from `GET /api/v1/budget/status` (`unitLabel`; OGM-013/018). `JobRow`: kind chip, title, `phaseText` (projected by OGM-032), bar, `usage / reservation` in units, time-left when the projection carries an estimate; `state === 'queued' && start === 'at_reset'` → "starts at HH:MM" from `resetsAt`, Edit → `navigate('/new?job=' + id)`, Cancel → `POST /api/v1/jobs/:id/cancel` with a confirm, hidden if the route returned 404 once this session.
Interface sketch:
```ts
export function formatUnits(microUsd: number, unit: { label: string; perUnitMicroUsd: number }): string;
export function useMyJobs(): { jobs: Job[]; active: Job[]; isFetching: boolean };
```
Test scenarios:
- Given `1_500_000` and a unit of `1_000_000` labelled "coin", then "1.5 coins"; given `1_000_000`, then "1 coin"; given `2_345`, then "0.0 coins" is never shown: "less than 0.1 coin".
- Given a queued-at-reset job, when rendered, then the start time and both actions exist; given a running job, then neither.
- Given `build.done` on the SSE, when received, then the query is invalidated once.

### U3 — Message stream and list

Goal: the per-job chat renders every message kind as it arrives, in order, without duplicates.
Files: Create `apps/web/src/features/build-chat/{Chat.tsx,MessageList.tsx,stream.ts,rows/{index.ts,TextRow.tsx,MediaRow.tsx,ProgressRow.tsx,CheckpointRow.tsx}}`; Test `stream.test.ts`, `MessageList.test.tsx`.
Approach: `stream.ts`: `subscribeChat(jobId, since, onMessage)` over `EventSource('/api/jobs/' + jobId + '/chat?since=' + since)`; reconnect with backoff from the last id; `reduceMessages(state, msg)` inserts by `id` (ULID order), drops duplicates, and reconciles an optimistic creator row by matching `clientId` echoed in `text` metadata or by `(actor, text, at ± 5 s)` when the server does not echo. `rows/index.ts` exports `rowFor(kind)`: `text → TextRow` (agent rows get a read-aloud button calling `speak()` from `@ogm/voice-client`), `image | clip → MediaRow` (reserved aspect box from `width/height`; `<video playsInline muted poster>` tap to unmute), `progress → ProgressRow`, `checkpoint → CheckpointRow` (read-only in this ticket; OGM-082 swaps the import). `MessageList` is a plain scrolled list with `aria-live="polite"`, pinned to bottom unless the user scrolled up.
Interface sketch:
```ts
export function reduceMessages(list: BuildChatMessage[], incoming: BuildChatMessage): BuildChatMessage[];
export const rowFor: (kind: BuildChatMessage['kind']) => React.FC<{ m: BuildChatMessage }>;
```
Test scenarios:
- Given messages arriving `[b, a, b]`, when reduced, then the list is `[a, b]`.
- Given a disconnect after id `m3`, when reconnecting, then the URL carries `since=m3`.
- Given a `clip` row, when rendered, then the video is muted with the poster set and a caption.
- Given an unknown kind, when rendered, then a text row with its `text` and no crash.
Execution note: test-first on `reduceMessages`; it is the only logic that can silently duplicate or reorder posts.

### U4 — Composer: text, dictation, voice

Goal: the creator replies by typing, by push-to-talk, or by two-way voice when available.
Files: Create `apps/web/src/features/build-chat/{Composer.tsx,voice.ts}`; Test `Composer.test.tsx`, `voice.test.ts`.
Approach: `Composer` has a text field and a 64 px Send; a push-to-talk button (hold on touch, space on keyboard) driving `@ogm/voice-client` `createDictation()` (OGM-083) and showing partial captions, then the final text in the field for review; Send posts `POST /api/jobs/:id/chat { text }` and adds an optimistic row. `voice.ts`: `probeVoice()` once per session → `POST /api/voice/token` with `VoiceTarget {kind: 'build', …}`; 200 → `{ token, url }` and the voice button appears; 503 or 404 → hidden. Voice mode mounts the two-sided layout (you / builder captions, the seismograph and orb canvases from the prototype as components) using `@ogm/voice-client` `createClient({ url, token })`; "Type instead" always visible; `end` on leaving the chat.
Interface sketch:
```ts
export function probeVoice(target: VoiceTarget): Promise<{ available: true; token: string; url: string; expiresAt: string } | { available: false }>;
```
Test scenarios:
- Given a dictation final transcript, when it arrives, then the field holds it and nothing is posted until Send.
- Given the token route answers 503, when the composer mounts, then no voice button exists.
- Given a typed message, when Send is pressed, then one POST and one optimistic row with `actor: 'creator'`.
- Given the voice client emits `agent_text`, when rendered, then it appears as a caption in the builder column.

### U5 — Phone layout and test seam

Goal: the chat is a full-height sheet on phones; `__ogmHost.jobs` exposes state for e2e.
Files: Modify `apps/web/src/features/build-chat/BuildChatDock.tsx`; Create `apps/web/src/features/build-chat/dock.css`; Test `apps/web/e2e/build-chat.spec.ts` (Create).
Approach: CSS from OGM-070's `tokens.css`: `height: 100svh` sheet with `padding-bottom: env(safe-area-inset-bottom)`, `@media (max-height: 540px) and (orientation: landscape)` two-column layout (list left, chat right), `@media (prefers-reduced-motion: reduce)` disables the ring transition and glow pulse. Register `window.__ogmHost.jobs = { get dockState, get jobs, get messagesByJob }` when `?test` is present (OGM-070's hook). The e2e mocks `GET /api/v1/jobs*` and the SSE with `page.route` fulfilling a `text/event-stream` body of six fixture messages from `packages/contracts/fixtures/chat/`.
Test scenarios:
- Given 390×844, when the chat opens, then the sheet's bounding box height equals the viewport and the FAB is ≥ 64 px.
- Given 844×390, when open, then list and chat are side by side.
- Given the fixture stream, when complete, then `__ogmHost.jobs.messagesByJob[j].length === 6`.

## 4. Verification

```
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/web test -- features/build-chat
pnpm --filter @ogm/web e2e -- build-chat
pnpm --filter @ogm/web build
```
Paste into `## Local tests`: Vitest counts, Playwright summary with the three viewports and the renderer string, the iPhone dictation check result (pass, fail, or not run with the reason), head SHA and base.

## 5. Deferred to implementation

- Optimistic reconciliation key: default, send a `clientId` in the POST body if OGM-080 accepts it; else the `(actor, text, at)` match.
- Time-left source: default, hide the figure unless the job projection carries `etaSeconds`; never estimate locally.
- Where the shell mounts the dock: default, OGM-071's root layout, one import line (agreed seam; coordinate in the PR).
- Cancel confirmation wording: default, a two-button dialog with the job title; no extra sentence.
- Read-aloud trigger: default, per agent text row, never automatic.

## 6. Scope boundaries

- No message storage, media upload, aiur mirroring (OGM-080); no checkpoint answering (OGM-082); no `gm chat post` (OGM-081).
- No dictation or voice internals (OGM-083); no token minting or voice host (OGM-085); no budget conversation rules (OGM-086).
- No admission, offers, reset scheduling (OGM-013); no phase-word projection (OGM-032); no cancel semantics (OGM-033).
- No scope chat (OGM-074); no admin analytics (OGM-079).

## 7. Risks

- Web Speech on iOS Safari unverified: default, ship push-to-talk; if the real-iPhone check fails, text stays the fallback and the button hides on `SpeechRecognition === undefined`.
- SSE through the Netlify proxy may buffer: default, the chat stream goes through `/api` (D-ORIGIN); if buffering is observed, OGM-080 adds a heartbeat comment every 15 s (filed in the PR).
- Media weight on phones: default, images are webp at phone width from the agent (`gm chat post` resizes, OGM-081); the panel never requests originals.
- Job list route shape: default, read `packages/contracts/jobs.ts` at pickup; the row renders only fields the contract declares.
