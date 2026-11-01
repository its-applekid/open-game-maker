# OGM-074 plan — Creation flow and scope chat

## 1. Problem frame

The prototype's New Game wizard and "talk it through" panel were designed with Kevin but run on hand-written option lists, a scripted conversation and fake builds. V1 needs the same six steps over catalog data (families and views from `style-families.json`), a scope chat that talks to a real worker through the aiur "scope" ticket (the only zero-spend model path), dictation and key-gated voice from the voice client, an image attach, and an ending that is a real admission with the four budget offers rendered as choices. The client never estimates, never chooses an offer, and never edits the agreed plan.

Requirements trace: **R20** → six steps, families from the catalog, views filtered by family and genre, "Other" by typing or dictation, choices sent with the game and the session (the lockfile write is the agent's). **R21** → text and dictation always; voice when `voice.conversation` is on. **R25** → any image, downscaled client-side, EXIF stripped server-side. **R12** → the 402 offers rendered and acted on: trim, split, queue (`start: 'at_reset'`), ask an admin.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js` lines 264–302 (`startWizard`, `renderStep`: dots, body per step, Next/Skip label), 303–318 (`togglePick`: limits, the "nope" shake, `pop`), 320–360 (`otherTile`: flip → type/say, filled state with edit/remove).
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js` lines 402–541 (`VoiceSession`): the you/builder two-column captions and "Type instead"; keep the layout, drop the scripted turns.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/data.js` lines 72–96: the genre, vibe, world and players option lists (ids, labels, max picks) become `options.ts`; the `art` step is replaced by the catalog families.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/index.html` lines 359–377 and 397–411 (`.opt`, `.opt-grid`, `.other`, `.vs`, 56 px icons on phones).
- OGM-070's `api()`/`ApiError`/`sse()`, `registerSlice`, `registerTestApi`; OGM-072's `getRepoVisibilityDefault()`; OGM-083's `packages/voice-client/src/{dictation,client}.ts`.

## 3. Implementation units

### U1 — Options and catalog hooks

Goal: every step's options come from one typed source; families and views from the API.
Files: Create `src/routes/new/{options.ts,useCatalog.ts,types.ts}`, Test `src/routes/new/options.test.ts`.
Approach: `options.ts` exports `STEPS: StepDef[]` for `genre` (14, max 3), `vibe` (11, max 3), `world` (11, max 3), `players` (`solo | multi`, max 1) with ids and labels from `data.js`, plus the step order `['genre','vibe','family','world','players','view','talk']`. `useCatalog()` → `useQuery(['catalog','style-families'], () => api<StyleFamilyOption[]>('/catalog/style-families'))` (the path OGM-066 mounts; `/api/v1` prefix handled by `api()` or an absolute `/api/catalog` if OGM-066 chose no version prefix; one constant). `viewsFor(family, genres)` → `family.views` intersected with a small genre default map (`platformer → side|follow`, `shooter → fps|topdown|side`, else all); `isPaidFamily(family)` → any pack licence starting with `LicenseRef-` (field name from OGM-066's response; default `packs[].license`).
Interface sketch:
```ts
export type StepKey = 'genre'|'vibe'|'family'|'world'|'players'|'view'|'talk';
export type StepDef = { key: StepKey; ask: string; max: number; opts?: { id: string; label: string; icon?: string }[] };
export type Choices = Partial<Record<Exclude<StepKey,'talk'>, { picks: string[]; other?: string }>>;
```
Test scenarios: Given a family with views `[iso, follow]` and genre `platformer`, when `viewsFor` runs, then `[follow]`. Given no genre overlap, then the family's full list. Given a pack with `LicenseRef-synty-personal`, then `isPaidFamily` is true.

### U2 — Step screen, tiles and "Other"

Goal: the wizard with URL-driven steps and the prototype's pick mechanics.
Files: Create `src/routes/new/{route.tsx,NewGameScreen.tsx,Step.tsx,OptionTile.tsx,OtherTile.tsx,FamilyStep.tsx,slice.ts,new.css}`, Test `src/routes/new/NewGameScreen.test.tsx`.
Approach: `route`: `{ path: '/new', chrome: 'app', auth: 'required' }`; `?step=` is the source of truth (Back/Next write it; missing → `genre`). `slice.ts` registers `newGame: { choices, sessionId, gameId, setPick, setOther, reset }`. `Step` renders the ask, dots (`aria-label="Step n of 7"`), the `.opt-grid` of `OptionTile`s (`aria-pressed`, 64 px, 56 px icon on phones), the `OtherTile` (flip → Type (textarea, Add) or Say it (dictation button from U4's `Composer` in single-utterance mode); filled state shows the text with Edit/Remove), Next/Skip label by pick count, limit toast "Unpick one first". `FamilyStep` renders catalog families with pack thumbnails (`thumbnailUrl`), the `license_note`, and the lock badge when `isPaidFamily` (sets `visibility: 'private'`). `players` has two tiles. `view` tiles come from `viewsFor`. The `talk` step shows the summary chips and mounts `ScopeChat` (U5).
Interface sketch: `NewGameScreen(): JSX.Element`; `OptionTile({ id, label, icon, pressed, onToggle })`.
Test scenarios: Given `/new`, when mounted, then step `genre` with 14 tiles. Given 3 genre picks, when a 4th is tapped, then it is not pressed and the toast shows. Given the family step with the fixture, then two tiles with thumbnails and the Synty one shows the lock. Given the paid family picked, then `choices.family` is set and `visibility` in the slice is `'private'`. Given "Other" → Type → "a bakery" → Add, then the filled tile shows it and counts toward the limit. Given `?step=view` after picking `chunky-low-poly` and `platformer`, then only `follow` renders.
Execution note: build the step mechanics test-first from the prototype's rules (limit, Skip/Next label, Other counting).

### U3 — Game creation

Goal: the game row exists before the chat starts, with the visibility rule applied.
Files: Create `src/routes/new/useCreateGame.ts`, Test in `NewGameScreen.test.tsx`.
Approach: on entering `talk` with no `gameId`: `POST /api/v1/games { visibility, choices }` (OGM-012; title omitted, the scope session names it; if OGM-012 requires `title`, send "Untitled game") → store `gameId`. `visibility = isPaidFamily ? 'private' : getRepoVisibilityDefault()`. Idempotent per wizard run (the slice keeps `gameId`; Back then Finish reuses it).
Interface sketch: `useCreateGame(): { ensureGame(): Promise<string> }`.
Test scenarios: Given the talk step entered twice, when `ensureGame` runs, then one POST. Given a paid family, then the body has `visibility: 'private'` even with a `'public'` default stored.

### U4 — Composer: text, dictation, voice toggle, image attach

Goal: one composer with three input modes and an attach control, reusable by OGM-076.
Files: Create `src/features/scope-chat/{Composer.tsx,Captions.tsx,ImageAttach.tsx,useVoiceMode.ts}`, Test `src/features/scope-chat/Composer.test.tsx`.
Approach: `Composer({ onSend(text, images), caps })`: textarea (Enter sends on desktop, button on phone), a 64 px push-to-talk button (`onPointerDown` → `startDictation({ onPartial, onFinal })`; `onPointerUp` → stop; Space key equivalent); partials show in `Captions` as a draft; the final transcript lands in the textarea for review and is sent only on Send (review-before-send, E06-11); a mic-missing state hides the button when `SpeechRecognition` is absent. `useVoiceMode(caps)`: when `caps.voice.conversation` is true renders a Voice button that fetches `POST /api/voice/token` and opens the OGM-083 client against `url`; frames `transcript{partial|final}` feed `Captions`; the button is absent otherwise (D-VOICE-ZERO). `ImageAttach`: `<input type="file" accept="image/*">`, draws onto a canvas ≤ 2048 px long edge, `toBlob('image/webp', .9)`, returns a `Blob` list (≤ 10 MB each) to `onSend`; the server strips EXIF (the canvas path happens to drop it; not relied on). `Captions({ turns })` is the two-column you/builder list, `aria-live="polite"`. Capabilities come from `GET /api/v1/capabilities` (OGM-010/086; default `{ voice: { conversation: false } }` on 404).
Interface sketch: `Composer({ onSend: (text: string, images: Blob[]) => Promise<void>; caps: Caps })`.
Test scenarios: Given a mocked `startDictation` emitting a final "a bakery at night", when the hold ends, then the textarea contains it and `onSend` was not called. Given Send, then `onSend('a bakery at night', [])`. Given `caps.voice.conversation` false, then no Voice button. Given a 3000×1000 image, when attached, then the blob's longest edge is 2048. Given a non-image file, then it is refused with one line.

### U5 — Scope session transport and chat panel

Goal: the chat talks to OGM-088's session and ends with an agreed plan.
Files: Create `src/features/scope-chat/{transport.ts,useScopeSession.ts,ScopeChat.tsx,index.ts}`, Test `src/features/scope-chat/useScopeSession.test.ts`.
Approach: `transport.ts` holds every route of the scope session in one place: `createSession(gameId, choices) → { sessionId }`, `postMessage(sessionId, text, imageIds?)`, `uploadImage(sessionId, blob) → { imageId }`, `events(sessionId) → EventSource` (names and paths copied from OGM-088's merged `services/api/src/scope/routes.ts`; the defaults are `POST /scope/sessions`, `POST /scope/sessions/:id/messages`, `POST /scope/sessions/:id/images`, `GET /scope/sessions/:id/events`). `useScopeSession(gameId, choices)`: creates the session on mount, subscribes to events, reduces `builder.text` into turns, `scope.agreed { plan }` into `plan`, `error` into a one-line state; exposes `send(text, images)`, `plan`, `turns`, `status`. `ScopeChat` composes `Captions`, `Composer`, the `Offers` (U6) and Finish (enabled when `plan` exists). Reconnect SSE with backoff; a 404 on create shows the summary and a disabled Finish.
Interface sketch:
```ts
export function useScopeSession(gameId: string | null, choices: Choices):
  { turns: Turn[]; plan: JobPlan | null; status: 'connecting'|'open'|'agreed'|'error'|'unavailable'; send(text: string, images: Blob[]): Promise<void> };
```
Test scenarios: Given a mocked create and an SSE emitting `builder.text`, when mounted, then one builder turn. Given `scope.agreed` with a plan, then `plan` is set and status `agreed`. Given create 404, then status `unavailable` and `send` rejects. Given `send('x', [blob])`, then `uploadImage` runs before `postMessage` with the returned id.

### U6 — Admission and the four offers

Goal: Finish admits the job; a 402 becomes four choices the creator picks from.
Files: Create `src/features/scope-chat/{admit.ts,Offers.tsx}`, Test `src/features/scope-chat/{admit.test.ts,Offers.test.tsx}`.
Approach: `admit({ gameId, plan, complexity, start, sessionId, attempt })` → `api('/jobs', { json: { gameId, branchId: 'main', kind: 'new_game', complexity, plan, start, idempotencyKey: 'scope:' + sessionId + ':' + attempt } })`; `complexity` comes from the plan if the worker set it, else 3. 202 → `navigate('/games?spotlight=' + gameId)`. `ApiError 402` → `Offers({ body, onChoose })` renders one 64 px card per id in `body.offers` (labels: "Trim it", "Split it", "Queue for the reset", "Ask an admin"), with `remainingMicroUsd` and `resetsAt` shown through `formatUnit(microUsd, unitLabel)` from `GET /api/v1/budget/status` when available. `queue` → `admit` again with `start: 'at_reset'`, `attempt + 1`. `trim`/`split` → `send('[trim] …' | '[split] …')` to the session and wait for a new `scope.agreed`, then Finish again. `ask_admin` → a waiting card polling `budget/status` every 30 s; Finish re-enables when `remainingMicroUsd` covers the last reservation hint or `freeSlots.new_game > 0` and the creator taps Try again.
Interface sketch: `admit(input): Promise<{ jobId } | { offers: Offer402 }>`.
Test scenarios: Given 202, then navigation to `/games?spotlight=g1`. Given 402 with `["trim","queue"]`, then exactly two cards. Given queue chosen, then a second POST with `start: 'at_reset'` and key `scope:s1:2`. Given trim chosen, then `send` is called with a message starting `[trim]` and no POST. Given 402 with no `offers`, then the ask-an-admin card alone.

### U7 — e2e

Goal: the whole flow on desktop and phone with mocked routes.
Files: Create `e2e/new.spec.ts`, `e2e/fixtures/{new-routes.ts,style-families.json}`.
Approach: mock `/api/catalog/style-families`, `POST /api/v1/games`, the scope routes (SSE via a `page.route` streaming body: one `builder.text`, then `scope.agreed` after the first message), `POST /api/v1/jobs` → 402 then 202, `budget/status`, `capabilities` → voice off. Spec: walk the steps with taps; assert tiles ≥ 64 px on the phone project; type in the composer; Finish; choose queue; land on `/games?spotlight=`; `__ogmHost.get('new').picks()` matches.
Test scenarios: as listed; plus "Other" by typing on the vibe step appears in the summary chips.

## 4. Verification

```
pnpm --filter @ogm/web test -- routes/new features/scope-chat
pnpm --filter @ogm/web e2e -g new             # GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm -r typecheck && pnpm -r lint
# against the running API with OGM-013, OGM-066 and OGM-088 merged: pnpm --filter @ogm/web dev → /new → finish → a job row appears in /games
```
Paste into `## Local tests`: Vitest summary; Playwright summary per project; whether the local run reached a real `scope.agreed` and a 202/402 from admission; whether the iPhone dictation check was done.

## 5. Deferred to implementation

- Scope route names and event names: defaults in U5; copy from OGM-088's merged `routes.ts`; one file.
- Catalog path prefix (`/api/catalog` vs `/api/v1/catalog`): one constant in `useCatalog.ts`.
- Capabilities route: default `GET /api/v1/capabilities`; voice off on 404.
- Genre → view defaults map: default the three rows in U1; the family's `views` always bounds it.
- Default complexity when the plan lacks one: 3.
- Friendly unit formatting: default `unitLabel` from `budget/status` with one decimal; fallback "units".

## 6. Scope boundaries

- No estimation, reservation, slots, reset scheduler, admin raise: OGM-013 / OGM-017.
- No scope worker, skill or ticket lifecycle: OGM-088 / OGM-095. No voice host or token minting: OGM-085 / OGM-086.
- No dictation or voice client code: OGM-083 (consumed as a package).
- No `style-families.json` content or search enforcement: OGM-066.
- No post-admission chat, checkpoints, media cards: OGM-076 (it imports `Composer`/`Captions` from here).
- No EXIF stripping in the client as a guarantee: the upload route's server does it.

## 7. Risks

- **OGM-088's session shape differs from the expectation.** Default: `transport.ts` isolates it; the unit tests mock the transport, so only that file and the e2e fixture change.
- **Web Speech on iPhone Safari** behaves differently (T06 §6). Default: review-before-send makes partial errors harmless; a real-device check is listed; the button hides when the API is absent.
- **402 handling loops** (queue → 402 again). Default: `queue` re-posts once; a second 402 shows the offers again with the attempt number; never auto-retry.
- **Catalog thumbnails from paid packs reach the client.** Default: thumbnails are the catalog's own previews served by the API (OGM-066/005); the client shows what the API returns and never requests `assets-local/` paths.
- **Long SSE through the Netlify proxy** (E11-6). Default: the scope session's SSE is short-lived; if it drops, the hook reconnects with `since`; the worker's replies are idempotent by id.
