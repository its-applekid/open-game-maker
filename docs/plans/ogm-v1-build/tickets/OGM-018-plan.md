# OGM-018 plan — budget status, estimate model, briefing push

## 1. Problem frame

The voice agent must know what the creator has left today, roughly what a request costs, and how to queue it for the reset (R12, R21, C2 §5). `voice_converse` offers no host tools (E06-8) and its ports have 100–300 ms deadlines (E06-9), so the backend pushes a briefing into the host's cache and exposes the same facts over HTTP for the web app. The estimate is deterministic: a seeded size-class table refined from completed jobs. Admission stays the backstop.

Requirements trace: R12 → `budget/status` (remaining, reset, free slots, queued), `fits` in the estimate, the verified `at_reset` queue path. R21 → the briefing push that makes two-way voice budget-aware when a key exists, tested against OGM-085's fake host; nothing here needs a paid provider.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T06-voice-and-build-chat.md` lines 202 (briefing push shape, copied verbatim into `briefing-push.ts`), 192 (token minting shape, for the bearer header style) and E06-8 (what each C2 tool maps to).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C2-v1-scope-additions.md` lines 215–233 (tool semantics and conversation rules; the rules themselves are OGM-086's role file, the facts are this ticket's).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-013-plan.md` U3 (`remaining`, `nextReset`, `getSettings`) and U1 (`size_classes` seed rows).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U5 (`AppEvents`) and U3 (mounting).

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest (with a local `http.createServer` fake for the push); API binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — units helper and status route

Goal: one conversion, one route, friendly by default.

Files: Create `services/api/src/budget/units.ts`, `services/api/src/budget/routes.ts`. Test `services/api/test/units.test.ts`, `services/api/test/budget-routes.test.ts`.

Approach: `toUnits(microUsd, settings)` → `{ units: Math.round(microUsd / settings.microUsdPerUnit * 10) / 10, label: settings.unitLabel }`; `formatUnits` → `"20 energy"`. `GET /api/v1/budget/status?userId=&unit=`: `requirePrincipal(['user'])`; `userId` defaults to self; another user → `authorize(actor, 'admin.budget.set', { familyId })` (admin read); `unit=usd` → admin only, else 403 `unit_not_allowed`; compose `BudgetStatus` from `remaining()`, `nextReset`, `getSettings`, slot counts (`slots − holdsSlot count`) and `queued` job ids for the user. The `routes.ts` file is new in this ticket (OGM-013 placed its routes under `jobs/`), prefix `/api/v1/budget`.

Interface sketch:
```ts
export function toUnits(microUsd: number, s: Pick<FamilyBudgetSettings,'unitLabel'|'microUsdPerUnit'>): { units: number; label: string };
// GET /api/v1/budget/status?userId=&unit=units|usd → BudgetStatus (plus { units, label } additive when unit=units)
```

Test scenarios: Given 2000000 remaining of 5000000 and `microUsdPerUnit` 100000, then `remainingPercent: 40` and `units: 20`. Given a member asking for another member, then 403; an admin, then 200. Given `unit=usd` as a creator, then 403. Given one queued job, then `queued: [id]` and `freeSlots` unchanged (queued holds no slot).

### U2 — estimate model

Goal: deterministic size class, refined from history.

Files: Create `services/api/src/budget/estimate.ts`. Modify `services/api/src/budget/routes.ts` (`POST /estimate`), `services/api/src/main.ts` (one call). Test `services/api/test/estimate.test.ts`.

Approach: `classify(summary, kind, complexity?)`: explicit `complexity` → OGM-013's mapping (1 small, 2 medium, 3 large, 4–5 huge); else the regex and word-count table from the ticket, applied in order huge → large → medium → small; `new_game` kind is at least `large`. `estimate(deps, { familyId, gameId, summary, kind = 'feature', complexity? })`: `resolveGame` → 404; class → `size_classes` row → `rangeMicroUsd: [p50, p80]`, `confidence` from `samples` (≥20 high, ≥5 medium, else low), `fits = p80 <= remaining(creator)`. `refineSizeClasses(db)`: for each `(kind, sizeClass)` select `usage_micro_usd` of `done` jobs with usage > 0 and that `reservation.sizeClass`; if count ≥ 5, update `p50`, `p80` (nearest-rank percentiles), `samples`; else leave the seed. `startEstimateRefinement(deps)`: run at boot, then daily at 03:00 local, and on `job.changed` with a terminal state (debounced 60 s).

Interface sketch:
```ts
export function classify(summary: string, kind: JobKind, complexity?: number): SizeClass;
export function estimate(deps, input: { familyId: string; creatorId: string; gameId: string; summary: string; kind?: JobKind; complexity?: number }): Estimate;
export function refineSizeClasses(db): { updated: { kind: JobKind; sizeClass: SizeClass; samples: number }[] };
```

Test scenarios: the ten-summary table ("fix the jump" → small; "add a coin sound" → medium; "add three new enemies and a boss" → large; "make it multiplayer" → huge; a 70-word small-sounding summary → large; `complexity: 1` with "multiplayer" → small). Given 4 done `feature/large` jobs, when refined, then the seed stays; given 6 with usages `[3,4,5,6,7,8]` million, then `p50 = 6000000`, `p80 = 7000000`, `samples: 6` and other classes untouched. Given remaining 2000000 and `large`, then `fits: false`.

Execution note: test-first on `classify` and `refineSizeClasses` (pure over a seeded DB).

### U3 — briefing builder

Goal: the text the voice host serves inside its deadlines.

Files: Create `services/api/src/voice/briefing-push.ts` (builder half). Test `services/api/test/briefing-push.test.ts`.

Approach: `buildBriefing(deps, target)`: `scope` target → `summary` = the game title (or "a new game") and the scope session id; `current_task` = `"Agreeing the scope"`; `next_steps` = `["Confirm the plan", "Start the build or queue it for the reset"]`; `build` target → `current_task` from the job's `JobStage` words (OGM-032's mapping when present; else the `state`), `waiting_on` = `"an admin"` when `paused_budget`, `questions` = open checkpoint questions if OGM-082's table exists (else `[]`). `extra[0]` = `{ title: 'Budget', text }` with the two sentences from the ticket (units, percent, reset in the family zone as `HH:MM`, free edit slots, queued count; then the size-class table in units). `sections` = `[{ id: 'budget', text: <same budget text plus the four offers in one line: "If it does not fit: trim, split, queue for the reset, or ask an admin."> }, { id: 'progress', text: <stage line or "No build running."> }]`. `observed_at = now`.

Interface sketch: as the ticket's `Briefing`/`buildBriefing`.

Test scenarios: Given the worked settings, then `extra[0].text` starts with `"20 energy left today (40%)"` and contains `"small ≈ 5–15"`. Given a `build` target with `paused_budget`, then `waiting_on: 'an admin'`. Given no job stage mapping module, then `current_task` is the state word. The text never contains `$` or `USD`.

### U4 — push, target registry, subscriptions

Goal: the cache in the voice host is fresh whenever it matters.

Files: Modify `services/api/src/voice/briefing-push.ts` (push half), `services/api/src/main.ts` (subscribe). Test `services/api/test/briefing-push.test.ts` (shared).

Approach: `registerVoiceTarget(target, ttlSec = 1800)` stores `target` in a `Map<creator_id, { target; expiresAt }>` (one active target per creator; the newest wins); `activeTargetFor(creatorId)`. `pushBriefing(deps, target)`: `fetch(`${env.OGM_VOICE_HOST_INTERNAL_URL}/internal/briefing`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(300) })`; log failures at most once per minute per `target_key`; never throw. At startup refuse any `OGM_VOICE_HOST_INTERNAL_URL` whose host is not `127.0.0.1` or `localhost`. Subscriptions: `events.on('budget.changed', e => activeTargetFor(e.userId) && push)`, `events.on('job.changed', e => target of the job's creator && push)` with a 500 ms debounce per target. OGM-085 calls `registerVoiceTarget` right after minting the voice token and triggers one immediate push.

Interface sketch:
```ts
export function registerVoiceTarget(target: VoiceTarget, ttlSec?: number): void;
export async function pushBriefing(deps, target: VoiceTarget): Promise<void>;   // never rejects
```

Test scenarios: Given a fake HTTP server on `127.0.0.1`, when pushed, then it receives the T06 body with the bearer. Given the server sleeps 1 s, then `pushBriefing` resolves within ~300 ms and logs once. Given a registered target and `budget.changed` for that creator, then exactly one push after debounce; for another creator, none. Given `OGM_VOICE_HOST_INTERNAL_URL = http://10.0.0.5:4000`, then boot fails naming the variable.

### U5 — `queue_change` path check

Goal: prove the voice queue path with no new code.

Files: Test `services/api/test/budget-routes.test.ts` (one integration case).

Approach: Given a creator whose `status` shows `remaining` 2000000, `POST /api/v1/jobs` with `start: 'at_reset'` and a `large` plan returns 202 `queued`, then `status.queued` contains the job and `freeSlots` is unchanged; advancing OGM-013's scheduler clock to `resetsAt` starts it and `budget.changed` fires a push to a registered target.

Test scenarios: as described, one `it`.

## 4. Verification

```
pnpm --filter @ogm/api test -- budget voice
pnpm -r typecheck && pnpm -r lint
curl -s "http://127.0.0.1:$OGM_API_PORT/api/v1/budget/status" -H "cookie: $SESSION"
curl -s -X POST http://127.0.0.1:$OGM_API_PORT/api/v1/budget/estimate -H "cookie: $SESSION" -H 'content-type: application/json' -d '{"gameId":"g_…","summary":"add three new enemies and a boss"}'
```
Paste into `## Local tests`: test counts, the status JSON, the estimate JSON, and the fake-host log line showing the pushed `target_key`.

## 5. Deferred to implementation

- Unit rounding: one decimal; percent integer.
- Refinement schedule: boot + daily 03:00 host-local + debounced terminal events.
- Whether `estimate` records its inputs for later calibration: yes, a small `estimate_log(game_id, size_class, p80, at)` table is allowed if the agent wants it (add a migration); default no.
- Keyword table wording: as in the ticket; extend only with a test row per addition.

## 6. Scope boundaries

- Voice host, ports, cache, `/internal/briefing` implementation: OGM-085. Conversation rules, `[later]` parsing, instruct routing to admission: OGM-086. Narration: OGM-087. Scope ticket: OGM-088. Admission and scheduler: OGM-013. Settings writes: OGM-017. Offers UI: OGM-074.

## 7. Risks

- The keyword estimator is crude: default: low confidence until history exists; admission re-checks (C2 §5); refinement replaces it per class at 5 samples.
- The voice host's cache may show stale budget after an admin change: default: `budget.changed` is emitted by OGM-017 and OGM-013 (allowance, settings, ledger rows) and pushes within ~0.5 s; `observed_at` lets the host render staleness.
- Without a provider key the push is only exercised against the fake host: accepted (D-VOICE-ZERO); the e2e with `FakeProvider` is OGM-085/086's.
