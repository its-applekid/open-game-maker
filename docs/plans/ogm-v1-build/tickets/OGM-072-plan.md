# OGM-072 plan — Age screen, sign-in and GitHub connect

## 1. Problem frame

No sign-in exists. V1 is adults only, so a neutral age screen must precede every sign-up control and the OAuth start; the backend enforces that with a signed cookie (OGM-011) and this ticket renders the screen, the three sign-in methods and the GitHub connect step, all against same-origin `/auth/*` routes proxied by Netlify so cookies and the passkey RP ID stay first-party. Nothing about a refused visitor is kept in the client.

Requirements trace: **R2** → `/age` screen, neutral wording, `POST /auth/age`, refused state stores nothing. **R1** → magic link, passkey, Google through the Better Auth client; no password UI. **R6** → `/connect/github` links the creator's GitHub and records the default repo visibility the creation flow reads.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (`better-auth` 30k+, no exception); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- OGM-070's `src/routes/<screen>/route.tsx` placeholder and `ScreenRoute` (`chrome: 'bare'`, `auth: 'none'` for all three screens).
- OGM-070's `src/lib/api/client.ts` `ApiError` for the 403 branch; `src/app/testHook.ts` `registerTestApi('auth', …)` for e2e.
- OGM-011's `services/api/src/auth/*` (Better Auth server options: plugins `passkey()`, `magicLink()`, social `google` and `github`, `basePath: '/auth'`) — the client plugin list must mirror it.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/index.html` lines 338–373: glass `.btn`, `.sheet-card`, `.opt` looks for the method buttons and the visibility tiles.
- `/home/orangekid/github/aiur/website/tests/brand.spec.ts`: `page.route` + `addInitScript` style for mocking `/auth/**` in e2e.

## 3. Implementation units

### U1 — Auth client module

Goal: one typed client and session hook the router and screens share.
Files: Create `src/lib/api/auth.ts`, Test `src/lib/api/auth.test.ts`; Modify `src/lib/api/session.ts` (OGM-070 stub → `export { useSession } from './auth'`), `apps/web/package.json` (add `better-auth`, `@better-auth/passkey` at OGM-011's pinned minor).
Approach: `createAuthClient({ baseURL: window.location.origin, basePath: '/auth', plugins: [passkeyClient(), magicLinkClient()] })`; `useSession = authClient.useSession`; `requireAge(next)` wraps a call: catches Better Auth's error object or `ApiError` with status 403 and body `{ code: 'age_required' }` (OGM-011's error code; confirm at pickup) and `router.navigate('/age?next=' + encodeURIComponent(next))`; `getGitHubStatus()` → `authClient.listAccounts()` → finds `provider === 'github'`; `getRepoVisibilityDefault`/`set…` on `localStorage['ogm.repoVisibility']` (default `'private'`, the safe default for paid packs); `signOut()` → `authClient.signOut()` then navigate `/`.
Interface sketch: as in the ticket contract.
Test scenarios: Given `listAccounts` returns a github entry, when `getGitHubStatus()` runs, then `{ connected: true, login }`. Given it returns none, then `connected: false`. Given a call rejecting with 403 `age_required`, when wrapped by `requireAge('/signin')`, then navigation goes to `/age?next=%2Fsignin`. Given no stored value, then the default visibility is `'private'`.

### U2 — Age screen

Goal: the neutral gate before any sign-up control.
Files: Create `src/routes/age/{route.tsx,AgeScreen.tsx,age.css}`, Test `src/routes/age/AgeScreen.test.tsx`.
Approach: `route`: `{ path: '/age', chrome: 'bare', auth: 'none' }`. Form: `<select name="birthMonth">` 1–12 (month names) and `<select name="birthYear">` from the current year down to 1900, one 64 px Continue. Copy: a single question line asking for the birth month and year; no threshold, no reason. Submit → `fetch('/auth/age', { method: 'POST', credentials: 'include', json })` through `api()`'s sibling `authFetch()` (same client, `/auth` base). 204 → `navigate(next ?? '/signin')`. 403 → render the refused state: one neutral sentence, no controls, no storage. Other errors → inline retry. If a session already exists, redirect to `next` immediately (returning users never see the screen).
Interface sketch: `AgeScreen(): JSX.Element` reading `?next`.
Test scenarios: Given the screen, when rendered, then the text contains no "18" and no "adult". Given month 5 and year 1990, when submitted and the mock returns 204, then `navigate('/signin')`. Given 403, then a `role="status"` line renders, no `localStorage` key is written, and the form is gone. Given an existing session, then it redirects without rendering the form.
Execution note: write the "no threshold wording" and "nothing stored on 403" tests first; they encode R2.

### U3 — Sign-in screen

Goal: the three methods, each one tap, with the age gate enforced by the backend's 403.
Files: Create `src/routes/signin/{route.tsx,SignInScreen.tsx,PasskeyOffer.tsx,signin.css}`, Test `src/routes/signin/SignInScreen.test.tsx`.
Approach: `route`: `{ path: '/signin', chrome: 'bare', auth: 'none' }`. Layout: email input + "Send link" (`authClient.signIn.magicLink({ email, callbackURL: next })`), "Use passkey" (`authClient.signIn.passkey()`; on page load also try `authClient.signIn.passkey({ autoFill: true })` when `PublicKeyCredential.isConditionalMediationAvailable()` resolves true), "Google" (`authClient.signIn.social({ provider: 'google', callbackURL: next })`) rendered only when `GET /auth/ok`-style capability says Google is configured — OGM-011 exposes which providers are configured; default read: `api<{ providers: string[] }>('/auth/providers')` behind one function `getAuthCapabilities()` (name confirmed at pickup). Every call goes through `requireAge(next)`. States: idle, `sent` (shows the admin-inbox hint when the backend reports `delivery: 'admin_inbox'`), error. After a magic-link completion the session exists and no passkey is registered → `PasskeyOffer` (one card: "Add a passkey" → `authClient.passkey.addPasskey()`, skip). Signed-in visitors are redirected to `next ?? '/games'`.
Interface sketch: `SignInScreen(): JSX.Element`; `PasskeyOffer({ onDone })`.
Test scenarios: Given an email, when "Send link" is pressed, then `signIn.magicLink` is called with it and the `sent` state renders. Given the capability list lacks `google`, then no Google button exists. Given `signIn.passkey` rejects with 403 `age_required`, then navigation goes to `/age?next=/signin`. Given a session with no passkey, then `PasskeyOffer` renders and `addPasskey` is called on accept. Given a session, when the screen mounts, then it redirects to `/games`.

### U4 — GitHub connect screen

Goal: link the creator's GitHub and record the default visibility.
Files: Create `src/routes/connect/{route.tsx,ConnectGitHubScreen.tsx,connect.css}`, Test `src/routes/connect/ConnectGitHubScreen.test.tsx`.
Approach: `route`: `{ path: '/connect/github', chrome: 'bare', auth: 'required' }`. On mount `getGitHubStatus()`. Not connected: one 64 px button "Connect GitHub" → `authClient.linkSocial({ provider: 'github', callbackURL: '/connect/github?next=…' })` (the backend's provider config requests the `repo` scope; OGM-011). Connected: the login and two visibility tiles (public / private, `.opt` look, `aria-pressed`), persisted with `setRepoVisibilityDefault`; Continue → `next ?? '/games'`. If OGM-035 later requires a GitHub App installation step, it adds a second button here (noted in that ticket), nothing else changes.
Interface sketch: `ConnectGitHubScreen(): JSX.Element`.
Test scenarios: Given not connected, when "Connect GitHub" is pressed, then `linkSocial` is called with `provider: 'github'`. Given connected as `octocat`, then the login renders and choosing "public" writes `ogm.repoVisibility = 'public'`. Given Continue, then navigation goes to `next`.

### U5 — Router integration and e2e

Goal: `RequireSession` uses the real session; the end-to-end path runs with mocked auth routes.
Files: Modify `src/app/router.tsx` only if OGM-070's `RequireSession` imports the stub by path (prefer the re-export so no edit is needed); Create `e2e/auth.spec.ts`, `e2e/fixtures/auth-routes.ts`.
Approach: `auth-routes.ts` installs `page.route('**/auth/**', …)` handlers: `/auth/age` 204/403 by a query flag, `/auth/get-session` null or a fixture user, `/auth/sign-in/magic-link` 200, `/auth/list-accounts`. Spec: Start → `/age` → `/signin` → sent; `/games?test` signed out → `/signin?next=%2Fgames`; signed in → `/connect/github` renders the login.
Interface sketch (OGM-070's wrapper, consumed unchanged; shown so the `?next` round trip is explicit):
```tsx
function RequireSession({ children }) {
  const { data, isPending } = useSession();                       // this ticket's hook via src/lib/api/session.ts
  if (isPending) return null;
  if (!data) return <Navigate to={'/signin?next=' + encodeURIComponent(location.pathname + location.search)} replace />;
  return children;
}
```
Test scenarios: as listed; the phone project checks the Continue and Send buttons are ≥ 64 px tall; a signed-out `/connect/github` deep link lands on `/signin?next=%2Fconnect%2Fgithub` and, after the mocked session appears, returns to `/connect/github`.

### Worked fixtures

`src/test/auth-mock.ts` (Vitest; installs a `fetch` mock keyed by path, Better Auth client calls go through `fetch` so no module mocking is needed):
```ts
export function mockAuth(overrides: Partial<Record<string, { status: number; body?: unknown }>> = {}) {
  const routes: Record<string, { status: number; body?: unknown }> = {
    'POST /auth/age': { status: 204 },
    'GET /auth/get-session': { status: 200, body: null },
    'POST /auth/sign-in/magic-link': { status: 200, body: { status: true } },
    'POST /auth/sign-in/passkey': { status: 200, body: { user: { id: 'u1' } } },
    'GET /auth/list-accounts': { status: 200, body: [{ provider: 'github', accountId: 'octocat' }] },
    'POST /auth/link-social': { status: 200, body: { url: 'https://github.com/login/oauth/authorize?…', redirect: true } },
    'GET /api/v1/auth/providers': { status: 200, body: { providers: ['magic-link', 'passkey'] } },
    ...overrides };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input), location.origin).pathname}`;
    const r = routes[key] ?? { status: 404, body: { error: 'not_mocked', key } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }));
  return routes;
}
```
Refused-age test: `mockAuth({ 'POST /auth/age': { status: 403, body: { code: 'age_refused' } } })`; signed-in test: `'GET /auth/get-session': { status: 200, body: { user: { id: 'u1', email: 'k@example.com' }, session: { id: 's1' } } }`; age-required test: `'POST /auth/sign-in/magic-link': { status: 403, body: { code: 'age_required' } }`.

`e2e/fixtures/auth-routes.ts` mirrors the same table with `page.route('**/auth/**', …)` and `page.route('**/api/v1/auth/**', …)`, switching the age answer on a `?refuse=1` flag the spec sets.

## 4. Verification

```
pnpm --filter @ogm/web test -- routes/age routes/signin routes/connect lib/api/auth
pnpm --filter @ogm/web e2e -g auth          # GM_VERIFY_SOFTWARE_GL=1 fallback
pnpm -r typecheck && pnpm -r lint
# with OGM-011 running locally (OGM_API_PORT) and the Vite proxy:
pnpm --filter @ogm/web dev   # open http://127.0.0.1:5173/age, submit, then /signin → magic link appears in the admin inbox
```
Paste into `## Local tests`: Vitest summary; Playwright summary; whether the local round trip against OGM-011 was run and which Better Auth version was pinned.

## 5. Deferred to implementation

- The 403 error code name (`age_required`) and the providers capability route: defaults as above; confirm against OGM-011's merged routes and change one function each.
- Whether the passkey conditional UI is attempted on load: default yes when available, silently skipped otherwise.
- Refused-state copy: one neutral sentence; no link, no retry (the backend cookie stops re-entry).
- Where sign-out lives: default a link on `/settings` placeholder is not touched; expose `signOut()` for OGM-079/settings to use.

## 6. Scope boundaries

- No family, roles, invites, `authorize()`: OGM-012.
- No server auth config, cookies, `trustedOrigins`, mail: OGM-011.
- No repo creation, per-game visibility, paid-pack forcing: OGM-074 / OGM-036 / OGM-035.
- No join-page wording for invitees: OGM-052 (it reuses these screens through `?next`).

## 7. Risks

- **Passkey RP ID through the proxy** (E01-8, T09 §6). Default: RP ID is `ogm2000.netlify.app` (OGM-011); the client does nothing special; a real-iPhone spike is listed under human evidence.
- **Better Auth client/server version skew.** Default: the same minor as OGM-011, read from `services/api/package.json` at pickup.
- **Google OAuth client missing** (GATE-GOOGLE-OAUTH). Default: hide the button from the capability list; no error state.
- **Magic links with the admin-inbox sender** confuse testers. Default: the `sent` state names where the link appears when the backend reports `admin_inbox`.
