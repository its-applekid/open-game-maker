# OGM-073 plan — Games picker

## 1. Problem frame

The prototype's Games screen (spotlight above an edge-to-edge grid, FLIP glides, building chips) was designed with Kevin over several UX passes but runs on hand-written demo data and canvas covers. V1 needs the same screen over real rows: games from the API, building state from the job list, versions from the branch list, keyboard and controller browsing, phone layout. Nothing here writes; the screen is a read model with navigation.

Requirements trace: **R112** → the "games picker with versions on the card" entry of the screen list: tiles, spotlight, Play/Edit, building state, keyboard and controller browsing. (R113 phone rules and R37 version display are consumed, not owned.)

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js` lines 97–112 (`tileFor`: tile markup, `aria-label`, building chip), 145–175 (`glide`, `glideTiles`: FLIP with `element.animate`), 176–241 (`select`: spotlight content, Play/Edit, close returning focus).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/index.html` lines 71–166 (`#lib-hero`, `.tile`, hover gating at 128/137, reduced motion at 166) and 443–479 (glass restyle, `svh` sizing at 459, landscape-phone block at 461–477).
- OGM-070's `src/routes/<screen>/route.tsx`, `src/lib/api/client.ts`, `src/app/query.ts`, `src/app/store.ts` `registerSlice`, `src/app/testHook.ts`.
- OGM-072's `useSession` (through `RequireSession`; no direct use).

## 3. Implementation units

### U1 — Data hooks

Goal: typed queries for games, active jobs and branches with graceful 404s.
Files: Create `src/routes/games/{useGames.ts,useActiveJobs.ts,useBranches.ts,types.ts}`, Test `src/routes/games/useActiveJobs.test.ts`.
Approach: `types.ts` imports `Game` from `@ogm/contracts` (OGM-012's `api.ts`) and `Branch` from `@ogm/contracts` (OGM-040's `branches.ts`) when present; until the branches file exists, declare the T08 §4 `Branch` type locally in `types.ts` with a comment naming the producer. `useGames()` → `useQuery({ queryKey: ['games'], queryFn: () => api<Game[]>('/games') })`. `useActiveJobs()` → `useQuery({ queryKey: ['jobs','active'], queryFn: () => api<Job[]>('/jobs?state=active'), refetchInterval: data => data?.length ? 10_000 : false })`; a 404 resolves `[]`. `useBranches(gameId)` → `api<Branch[]>('/games/'+g+'/branches')`, 404 → `[{ id: 'main', name: 'main', … }]` synthesized. `jobForGame(jobs, gameId)` picks the newest non-terminal job.
Interface sketch:
```ts
export function useGames(): UseQueryResult<Game[]>;
export function useActiveJobs(): UseQueryResult<Job[]>;           // Job from @ogm/contracts jobs.ts (OGM-010)
export function useBranches(gameId: string | null): UseQueryResult<Branch[]>;
// Job fields this screen reads (T01 §4 row fields + T02 §4 projection words; the full type is OGM-010's jobs.ts):
export type JobView = Pick<Job, 'jobId' | 'gameId' | 'kind' | 'state'> & { friendlyState?: string; progressPercent?: number };
export function jobForGame(jobs: Job[], gameId: string): Job | undefined;   // newest with state ∉ {done, failed, cancelled}
```
Test scenarios: Given two active jobs, when the hook mounts, then `refetchInterval` is 10 000. Given none, then it is `false`. Given `/jobs` 404, then `data` is `[]` and no error state. Given `/branches` 404, then one `main` branch is returned.

### U2 — Grid navigation hook

Goal: arrow keys, Enter and Escape browse a 2D grid of tiles with roving tabindex.
Files: Create `src/routes/games/useGridNav.ts`, Test `src/routes/games/useGridNav.test.ts`.
Approach: `useGridNav({ count, columns(): number, onSelect(i), onOpen(i), onClose() })` returns `{ focused, tabIndexFor(i), onKeyDown }`; columns are measured from the first two tiles' `offsetLeft` (fallback 1); ArrowLeft/Right ±1, ArrowUp/Down ±columns clamped; Home/End; Enter on an unselected tile → `onSelect`, on the selected tile → `onOpen`; Escape → `onClose`. Focus follows `focused` via `ref.current.children[focused].focus()` in an effect. OGM-071's poller dispatches the same keys, so pads work with no code here.
Interface sketch: as above.
Test scenarios: Given 7 tiles in 3 columns, when ArrowDown from 1, then focused is 4; ArrowDown from 5 stays 5 (clamped). Given Enter on 2 then Enter again, then `onSelect(2)` then `onOpen(2)`. Given Escape, then `onClose`. Given Home, then 0.
Execution note: test-first; the hook has no DOM dependency except `columns()`.

### U3 — Tile and spotlight components

Goal: the prototype's tile and spotlight as React components over real rows.
Files: Create `src/routes/games/{Tile.tsx,Spotlight.tsx,Cover.tsx,games.css}`, Test `src/routes/games/GamesScreen.test.tsx` (covers these through the screen).
Approach: `Tile({ game, job, selected, tabIndex, onClick })`: `<button class="tile" aria-label>` with `<Cover>` (`<img src={coverUrl}>` or a placeholder `<div>` with the title set in the family's accent colour), the four tag icons, a `build-chip` when `job` (`friendlyState` + `progressPercent`), a `badge` "New" when `publishedReleaseId` is null. `Spotlight({ game, branches, job, onPlay, onEdit, onClose })`: `#lib-hero` layout, title, tags, version list (`<ul>` of branch names, active marked by `aria-current`), Play and Edit (`.tap-primary`, disabled when no `latestBuildId` on the chosen branch or `job` is running a `new_game`), Close (44 px). `games.css` ports the grid, tile and hero rules including the `svh` and landscape-phone blocks and hover gating.
Interface sketch: props as above; no internal state beyond the chosen branch.
Test scenarios: Given the fixture with one building game, when rendered, then that tile shows "Building" and "40%". Given a game with no release, then "New" badge. Given branches `[main]` only, then the version list has one item. Given `latestBuildId: null`, then Play and Edit are disabled.

### U4 — Screen, FLIP glide, URL state, test hook

Goal: `/games` composes the parts, keeps the selection in `?spotlight=`, glides tiles, exposes the test API.
Files: Create `src/routes/games/{route.tsx,GamesScreen.tsx,flip.ts,slice.ts}`.
Approach: `route`: `{ path: '/games', chrome: 'app', auth: 'required' }`. `GamesScreen` reads `useGames`, `useActiveJobs`, `useSearchParams` (`spotlight`), `useBranches(selected)`; layout: hero (hidden when nothing selected) + grid + fixed New game button (`navigate('/new')`, bottom-right, safe-area offsets as `#new-game` in `index.html` line 144). Selecting sets `?spotlight=`; closing removes it and returns focus to the tile. `flip.ts`: `measure(tiles)` before a reorder and `glide(el, before, after)` after layout with `element.animate` (skip under `prefers-reduced-motion`). Play → `navigate('/g/' + id + '?v=' + branchId + '&mode=play')`; Edit likewise with `mode=edit`. `registerTestApi('games', { selected: () => id, tiles: () => ids })`. Sort: building first, then by `updatedAt` desc.
Interface sketch: `GamesScreen(): JSX.Element`.
Test scenarios: Given `/games?spotlight=g2`, when mounted, then the spotlight shows g2. Given a click on g1, then the URL has `spotlight=g1`. Given Close, then the URL has no `spotlight` and focus is on g1's tile. Given reduced motion, then `animate` is not called on reorder.

### U5 — e2e

Goal: browser proof on desktop and phone with mocked routes.
Files: Create `e2e/games.spec.ts`, `e2e/fixtures/games-routes.ts`, `e2e/fixtures/games.json`.
Approach: `page.route('**/api/v1/games', …)`, `**/api/v1/jobs**`, `**/api/v1/games/*/branches` → 404, `**/auth/get-session` → fixture user. Spec: load `/games?test`; three tiles; `ArrowRight` then `Enter` → `__ogmHost.get('games').selected()` equals the second id; `Escape` clears; phone project: Play/Edit bounding boxes ≥ 64 px, the hero's height ≤ viewport height; New game visible above the safe area.
Test scenarios: as listed, plus: the building tile's chip text equals the fixture's `friendlyState`.

### Worked fixture

`e2e/fixtures/games.json` (also imported by `GamesScreen.test.tsx`; field names are the expectation of OGM-012's `Game` and OGM-010's `Job`, to be aligned at pickup):
```json
{ "games": [
    { "id": "g1", "title": "Midnight Crumbs", "ownerId": "u1", "familyId": "f1", "repo": { "owner": "its-everdred", "name": "midnight-crumbs", "visibility": "private" },
      "coverUrl": null, "publishedReleaseId": null, "choices": { "genre": ["adventure"], "vibe": ["cozy", "creepy"] },
      "createdAt": "2026-11-01T05:00:00Z", "updatedAt": "2026-11-01T05:10:00Z" },
    { "id": "g2", "title": "Goblin Cellar", "ownerId": "u1", "familyId": "f1", "repo": { "owner": "its-everdred", "name": "goblin-cellar", "visibility": "public" },
      "coverUrl": "https://applekid.tailee0e71.ts.net:8443/blobs/sha256/ab12?exp=1&sig=x", "publishedReleaseId": "r7",
      "choices": { "genre": ["rpg", "roguelike"] }, "createdAt": "2026-10-20T00:00:00Z", "updatedAt": "2026-10-30T00:00:00Z" },
    { "id": "g3", "title": "Sky Delivery", "ownerId": "u1", "familyId": "f1", "repo": null, "coverUrl": null, "publishedReleaseId": null,
      "choices": {}, "createdAt": "2026-10-25T00:00:00Z", "updatedAt": "2026-10-25T00:00:00Z" } ],
  "jobs": [
    { "jobId": "j1", "gameId": "g1", "kind": "new_game", "state": "running", "friendlyState": "Building", "progressPercent": 40,
      "reservation": { "amountMicroUsd": 3000000, "sizeClass": "medium", "confidence": "low" } } ],
  "branches": { "g2": [
    { "id": "main", "gameId": "g2", "name": "main", "gitRef": "main", "forkPoint": null, "headRev": 40, "latestBuildId": "b13", "status": "active", "createdBy": "u1", "createdAt": "2026-10-20T00:00:00Z" },
    { "id": "b_spooky", "gameId": "g2", "name": "Spooky monsters", "gitRef": "branch/b_spooky", "forkPoint": { "parentBranchId": "main", "parentRev": 40, "gitSha": "abc" }, "headRev": 12, "latestBuildId": "b14", "status": "active", "createdBy": "u1", "createdAt": "2026-10-28T00:00:00Z" } ] } }
```
Expected render: g1 first (building, chip "Building 40%", Play/Edit disabled), then g2 (cover image, two versions, Play enabled), then g3 (placeholder cover, "New" badge, Play disabled: no build). `branches` for g1 and g3 are served 404 by the fixture routes, so their cards list `main` only.

## 4. Verification

```
pnpm --filter @ogm/web test -- routes/games
pnpm --filter @ogm/web e2e -g games          # GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm -r typecheck && pnpm -r lint
# against OGM-012 locally: pnpm --filter @ogm/web dev, sign in, open /games, see real rows
```
Paste into `## Local tests`: Vitest summary; Playwright summary for both projects with the phone screenshot path; whether the local run against OGM-012 showed real rows.

## 5. Deferred to implementation

- Exact `Game` field names (`coverUrl`, `publishedReleaseId`, `repo`): take them from OGM-012's merged `packages/contracts/api.ts`; adapt `useGames.ts` and the fixture together.
- Whether `GET /api/v1/jobs?state=active` exists or the list must be filtered client-side: default filter client-side from `GET /api/v1/jobs`.
- Tag icons source: default `src/icons.ts` from OGM-071; fallback a local copy of the eight genre icons.
- Sort order: default building first, then `updatedAt` desc.
- Placeholder cover look: default title in the display font on a tinted glass panel; no generated art.

## 6. Scope boundaries

- No cover rendering pipeline (builds supply stills: OGM-090 `gm shot`; blobs: OGM-005).
- No creation (OGM-074), no admission (OGM-013), no branch creation/switch/merge (OGM-077), no game host (OGM-075).
- No chat dock or job detail (OGM-076); no SSE (the picker polls).
- No family-wide or admin game lists, no delist (OGM-079, OGM-017).

## 7. Risks

- **Games API lands with different field names.** Default: one adapter in `useGames.ts`; tests use the fixture, so the change is local.
- **Branches API not merged when this ships.** Default: synthesize `main`; the version list is read-only and correct by construction (D-BRANCH-BASE: nothing else exists until OGM-043).
- **FLIP on phones with many tiles** costs frames. Default: glide only tiles within the viewport; skip under reduced motion.
- **Controller browsing untested on iPad** (E09-14 [U]). Default: keyboard parity is the gate; the pad path is OGM-071's responsibility and a real-device check there.
