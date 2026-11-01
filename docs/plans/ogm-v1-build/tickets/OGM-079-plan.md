# OGM-079 — Admin and build analytics screens: implementation plan

## 1. Problem frame

Admins need one place to run the family (members, invites, allowances, slots, the cap, oversight, intake status) and one place to see what builds cost and where the time went. Both APIs are merged before this ticket; the work is screens, conversions at the edge, and a timeline drawn without a chart library. History cannot be backfilled (C2 §1), so the view must handle partial data honestly from day one.

Requirements trace:
- R3 → members, peer admins, invites, allowances, concurrency, oversight actions; no editing of another adult's game (U1, U2, U3).
- R66 → per-build timeline (aiur phases plus activities), cost, retries, roll-ups per game and member (U4, U5).
- R84 → read-only intake status and reports; the folder id stays in the TOML (U3).

## 2. Patterns to follow

- OGM-073's `apps/web/src/routes/games/route.tsx` (at pickup): the screen module and its TanStack Query hooks.
- OGM-076's `apps/web/src/features/build-chat/units.ts`: `formatUnits`; add `parseUnits` next to the import site here, not a second formatter.
- OGM-072's `apps/web/src/lib/api/auth.ts`: `useSession()` shape for the guard.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/drive_sync.py` `status` output (fields `pending | ready | downloaded | skipped | rejected | failed | removed`, `README.md:12`): the intake counts to render.
- `/home/orangekid/github/aiur/website/tests/visual.spec.ts`: the viewport matrix for the e2e.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added; bars are inline SVG); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Route module, layout, guard, API client

Goal: `/admin/*` exists, is admin-only in the UI, and has one typed client for OGM-017 and OGM-014.
Files: Create `apps/web/src/routes/admin/{route.tsx,AdminLayout.tsx,guard.ts,api.ts}`; Test `guard.test.ts`, `api.test.ts`.
Approach: `route.tsx` exports the nested routes (index Oversight, members, invites, budgets, builds, builds/:jobId, intake). `guard.ts`: `requireAdmin(session)` → `'ok' | 'redirect'` for `platformRole in ['admin', 'maintainer']` (field from OGM-012's `Actor`); `AdminLayout` calls it and navigates to `/games` on `redirect`; a 403 from any call refetches the session and re-runs the guard. `api.ts`: one `adminFetch(path, init)` over OGM-075's fetch wrapper with typed errors, and hooks `useMembers`, `useInvites`, `useBudgets`, `useGamesOversight`, `useIntakeStatus`, `useBuilds(filters)`, `useBuildTimeline(jobId)`, `useRollups(window)`; mutations invalidate their list. Side navigation with six 44 px entries; on phones a top tab strip.
Interface sketch:
```ts
export function requireAdmin(session: { platformRole: 'maintainer' | 'admin' | 'none' } | null): 'ok' | 'redirect';
export function useBuildTimeline(jobId: string): { data?: BuildTimeline; status: 'loading' | 'ok' | 'error' };
```
Test scenarios:
- Given `platformRole: 'none'`, then `redirect`; given `admin`, then `ok`; given no session, then `redirect`.
- Given a 403 on `useMembers`, when received, then the session query is invalidated once and no retry storm occurs.

### U2 — Members, invites, budgets

Goal: the family settings screens with confirmations and edge conversions.
Files: Create `apps/web/src/routes/admin/{Members.tsx,Invites.tsx,Budgets.tsx,confirm.tsx}`; Test `Members.test.tsx`, `Budgets.test.tsx`, `Invites.test.tsx`.
Approach: `Members`: rows (name, email, role, joined); actions Make admin / Remove admin / Remove member, each through `confirm.tsx` (a two-button dialog with the member's name); the owner row (`role === 'owner'`) and the current user have no Remove. `Invites`: form (email, kind `member`), list (email, kind, state, expires), Revoke; the family allowlist switch (`allowFriends`) as a labelled toggle writing OGM-017's setting. `Budgets`: a table of members with allowance edited in units (`parseUnits(text, unit)` → micro-dollars, validated ≥ 0, one decimal), remaining today read-only, reset zone `<select>` from `Intl.supportedValuesOf('timeZone')`, concurrency (creation 1, edit 3 defaults) and the platform cap in units; Save per row; the unit comes from `GET /api/v1/budget/status` `unitLabel` and `perUnitMicroUsd` (OGM-013/018).
Interface sketch:
```ts
export function parseUnits(text: string, unit: { perUnitMicroUsd: number }): number | null;   // micro-dollars, null when invalid
```
Test scenarios:
- Given the owner row, then no Remove button; given the signed-in admin's own row, then no Remove.
- Given "2.5" with a unit of `1_000_000`, then `2_500_000`; given "-1", then null and Save disabled; given `2_500_000` formatted and parsed again, then equal.
- Given Revoke confirmed, then one POST and the list refetches.
- Given the allowlist toggle, when changed, then one PUT with `{ allowFriends: true }`.

### U3 — Oversight and intake

Goal: the games list with delist/flag, and a read-only intake view.
Files: Create `apps/web/src/routes/admin/{Oversight.tsx,Intake.tsx}`; Test `Oversight.test.tsx`, `Intake.test.tsx`.
Approach: `Oversight`: rows (title, owner, visibility, published version, last build state, last activity) with Delist (sets `visibility: 'private'` in the family listing through OGM-017) and Flag abuse (records a flag; the route is OGM-017's), each confirmed; no Edit action exists anywhere on this screen (R3). `Intake`: cards for the listener (last poll `observed_at`, running or not) and counts per drop state, a list of recent drops (name, kind, state, licence decision pending or not) and intake reports (from `intake.json` as OGM-017 surfaces them); fields are rendered from an allowlist of keys; `folder_id`, `drive_folder` and any key containing `folder` are never rendered.
Test scenarios:
- Given a game owned by another adult, then no Edit or Open-in-editor control.
- Given the fixture includes `folder_id`, when rendered, then the DOM contains no such text.
- Given `observed_at` older than 15 min, then the status shows "stale" with the time.

### U4 — Build list and timeline

Goal: a per-build timeline of aiur phases with activities nested inside `implement`.
Files: Create `apps/web/src/routes/admin/builds/{BuildsList.tsx,BuildDetail.tsx,Timeline.tsx,ActivityBars.tsx,layout.ts}`; Test `layout.test.ts`, `Timeline.test.tsx`.
Approach: `BuildsList`: filters (game, member, state), rows (game, member, kind, state, started, duration, cost in units, retries) linking to detail. `layout.ts`: `layoutTimeline(t: BuildTimeline, width)` → `{ phases: Segment[], activities: Segment[], scale }` where phases come from the aiur lifecycle events (`dispatch … pr_merged`, start/end pairs; point events as ticks), activities are OGM events with `boundary: start | end` paired by `(activity, attemptId)` and clamped inside the `implement` segment; unmatched starts end at the next event of the same activity or the phase end and are marked `open: true`; durations sum per activity for `ActivityBars`. `Timeline`: inline SVG, one row for phases, one for activities, text labels with `<title>`; a legend lists the nine activities with their minutes; unknown usage renders "unknown". `BuildDetail` adds cost (units), retries, repair attempts and verification results (from the timeline payload's `verify` block when OGM-014 provides it; otherwise omitted).
Interface sketch:
```ts
export type Segment = { id: string; label: string; x: number; w: number; row: 'phase' | 'activity'; open?: boolean };
export function layoutTimeline(t: BuildTimeline, width: number): { phases: Segment[]; activities: Segment[]; minutesByActivity: Record<Activity, number> };
```
Test scenarios:
- Given phases at 0–2 s, 2–62 s, 62–70 s and width 700, then widths 20, 600, 80.
- Given an activity `playtesting` from 10 s to 20 s inside `implement`, then its segment lies within the implement segment.
- Given a start without an end, then `open: true` and the width reaches the phase end.
- Given no usage, then the cost cell reads "unknown".
Execution note: test-first on `layoutTimeline`; it is the only non-trivial logic and the fixtures define the expected arithmetic.

### U5 — Roll-ups

Goal: minutes by activity per game and per member over a window.
Files: Create `apps/web/src/routes/admin/builds/Rollups.tsx`; Test `Rollups.test.tsx`.
Approach: window selector (7 / 30 / 90 days) → OGM-014's roll-up route; two stacked-bar groups (by game, by member) as inline SVG with text values and a shared legend; a totals row; empty window renders "no builds in this window".
Test scenarios:
- Given a fixture with two games, then two bar groups with nine labelled segments each and totals equal to the sums.
- Given an empty payload, then the empty-state text and no SVG.

### U6 — Phone layout and e2e

Goal: cards under 600 px, 64 px targets, a Playwright run over mocked routes.
Files: Create `apps/web/src/routes/admin/admin.css`, `apps/web/e2e/admin.spec.ts`.
Approach: tables switch to a card list at `max-width: 600px` using the same components; primary actions (Save, Create invite, Delist) 64 px; secondary 44 px. The e2e mocks OGM-017 and OGM-014 routes with fixtures, seeds an admin session through `__ogmHost` (OGM-070's test seam) and a non-admin session for the redirect case.
Test scenarios:
- Given a non-admin, when `/admin` opens, then the URL is `/games`.
- Given `/admin/builds/j1` at 390×844, then nine activity labels are visible without horizontal scroll.
- Given `/admin/members`, when Remove is pressed on a member, then a confirm appears and no request is sent until confirmed.

## 4. Verification

```
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/web test -- routes/admin
pnpm --filter @ogm/web e2e -- admin
pnpm --filter @ogm/web build
```
Paste into `## Local tests`: Vitest counts, Playwright summary (three viewports, renderer string), head SHA, base.

## 5. Deferred to implementation

- Exact admin route paths and payloads: default, copy from OGM-017's merged `routes.ts`; the hook names here are fixed, the paths are not.
- Verification results in the timeline: default, render the `verify` block only when present in OGM-014's payload.
- Reset zone list: default, `Intl.supportedValuesOf('timeZone')` with the family's current value first; no search box.
- Flag abuse semantics: default, a boolean flag with a reason select (`spam | harmful | other`) if OGM-017 accepts one, else the flag alone.
- Roll-up window default: 30 days.

## 6. Scope boundaries

- No admin API, policy, allowance storage or reset scheduling (OGM-017, OGM-012, OGM-013).
- No analytics ingestion, aiur join or roll-up computation (OGM-014); no event emission (OGM-060, OGM-090, OGM-075, OGM-022).
- No intake processing or TOML editing (OGM-064, `scripts/drive-sync`); no creator analytics (OGM-047); no picker or sign-in (OGM-073, OGM-072).

## 7. Risks

- Payload shapes differ from T01 §4 sketches: default, characterise against OGM-014/017 fixtures at pickup and keep `layout.ts` pure so the mapping is one function.
- Timelines with hundreds of activity events: default, merge adjacent segments of the same activity under 1 px; the per-activity minutes stay exact.
- Admin screens leak into the phone shell: default, the admin layout is its own route tree with the shared top bar only.
- `formatUnits` not yet merged if OGM-076 slips: default, this ticket waits; it is phase 7 and OGM-076 is phase 5.
