# OGM-021 — iframe-bridge: implementation plan

## 1. Problem frame

The game iframe is cross-origin and untrusted (A4 §4); every message between host and game must pass an origin check, a size cap, a rate limit and a schema. The prototypes use `postMessage(…, '*')` with no checks (E04-5). This ticket writes the transport only: hello with origin check, one `MessagePort` transferred once, id-correlated request/reply, caps and counters. It knows nothing about games; validators and handlers are injected.

**Requirements trace.** R40 "a hand-written MessageChannel bridge with origin check, size cap and rate limit": this package; the "versioned envelope, Zod schemas" half of R40 is OGM-020, consumed here as a `Validator` function and two constants.

## 2. Patterns to follow

- `docs/research/v0.3/A4-engine-sdk-editor.md` §4 (lines 63–91): the trust-boundary diagram and rule 5; copy the sequence (hello by `postMessage`, port transfer, `id` correlation) exactly.
- `docs/plans/ogm-v1-build/evidence/T04-engine-sdk.md` §4 "Rules carried from A4 §4": the four numeric and behavioural rules (drop unknown `t`, 256 KB, 120 msg/s, role check belongs to the host wrapper).
- `prototypes/title-city/city.js:947` (`addEventListener('message', e => { if (e.data?.tap) … })`): the shape of a game-side listener to replace; shows why `origin` and `source` must be checked.
- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md` "Receiving signed events": the habit of verifying before parsing, applied here as "measure length, then parse, then validate".
- Vitest jsdom tests: no in-repo example yet (OGM-001 sets up Vitest); use `environment: 'jsdom'` per file with the `// @vitest-environment jsdom` pragma.

## 3. Implementation units

### U1 — Package skeleton
- **Goal:** `@ogm/iframe-bridge` builds, tests and typechecks inside the workspace with one dependency.
- **Files:** Create `packages/iframe-bridge/package.json`, `tsconfig.json` (extends `tsconfig.base.json`, `references: [{ path: '../contracts' }]`), `src/index.ts`, `vitest.config.ts`.
- **Approach:** `"name": "@ogm/iframe-bridge"`, `"type": "module"`, scripts `build` (`tsc -b`), `test` (`vitest run`), `typecheck` (`tsc -b --noEmit` or the workspace convention), `lint`; dependency `@ogm/contracts: workspace:*`; devDependency `jsdom` (pinned at install; jsdom is well above 1k stars). No root edits: the workspace glob `packages/*` picks it up (D-WRITE-SURFACES).
- **Interface sketch:** `export { openHostBridge } from './host'; export { openGameBridge } from './game'; export { BridgeError } from './errors'; export type { Bridge, Validator } from './types';`
- **Tests:** Given the package, when `pnpm --filter @ogm/iframe-bridge test` runs with one placeholder test, then it passes (replaced in U2).

### U2 — Shared port layer: `attachPort`
- **Goal:** one function both sides use once a port exists: send, receive with caps, correlate replies.
- **Files:** Create `src/port.ts`, `src/limits.ts`, `src/errors.ts`, `src/types.ts`; Test `test/port.test.ts`, `test/limits.test.ts`, `test/request.test.ts`.
- **Approach:** `attachPort(port: MessagePort, { validate, onMessage, maxChars = BRIDGE_MAX_BYTES, perSecond = BRIDGE_MAX_MSGS_PER_S, now = () => performance.now() })` returns `Bridge` minus `ready`. `port.onmessage = ({ data }) => { if (typeof data !== 'string') return count('invalid'); if (data.length > maxChars) return count('tooLarge'); if (!bucket.take(now())) return count('rateLimited'); let raw; try { raw = JSON.parse(data) } catch { return count('invalid') } const env = validate(raw); if (!env) return count('invalid'); const p = env.replyTo && pending.get(env.replyTo); if (p) { pending.delete(env.replyTo); clearTimeout(p.timer); p.resolve(env); return; } onMessage(env); }`. `send(env)`: `const s = JSON.stringify(env); if (s.length > maxChars) throw new BridgeError('too_large'); port.postMessage(s); sent++`. `request(env, timeoutMs = 5000)`: register in `pending` keyed by `env.id`, `send`, reject with `BridgeError('timeout')` on timer. `close()`: `port.close()`, reject all pending with `'closed'`. `TokenBucket(capacity = perSecond, refillPerSecond = perSecond)` with fractional refill from the injected clock so tests use fake timers. Error throttle: at most one `{t:'error', payload:{code:'dropped', message}}` sent per second, summarising counts.
- **Interface sketch:** the `Bridge` interface from the ticket; `class TokenBucket { constructor(capacity: number, refillPerSecond: number); take(nowMs: number): boolean }`.
- **Tests:** Given two ports from `new MessageChannel()`, when A sends a valid envelope, then B's `onMessage` receives the parsed object and `stats().received === 1`. Given a 262,145-char string, when posted, then `tooLarge === 1` and `onMessage` is not called; given 262,144 chars, then delivered. Given fake timers, when 121 sends happen at t=0, then `rateLimited === 1`; when the clock advances 1 s and one more is sent, then it is delivered. Given `validate` returns `null`, then `invalid === 1`. Given `request(env)`, when B answers with `replyTo === env.id`, then the promise resolves with the reply and `onMessage` is not called for it. Given `request` with `timeoutMs: 10`, when nothing answers, then it rejects with code `timeout`. Given pending requests, when `close()` runs, then each rejects with `closed`.
- **Execution note:** test-first on the caps; the counters are the acceptance evidence.

### U3 — Host side: `openHostBridge`
- **Goal:** accept exactly one hello from the expected origin and source, reply with the hello envelope plus a transferred port.
- **Files:** Create `src/host.ts`; Test `test/hello.test.ts`.
- **Approach:** `const chan = new MessageChannel(); const onHello = (e: MessageEvent) => { if (e.origin !== gameOrigin || e.source !== iframe.contentWindow) return; if (typeof e.data !== 'string') return; const raw = safeParse(e.data); const env = raw && validate(raw); if (!env || env.t !== 'hello') return; window.removeEventListener('message', onHello); iframe.contentWindow!.postMessage(JSON.stringify(hello), gameOrigin, [chan.port2]); bridge = attachPort(chan.port1, …); resolveReady(); }; window.addEventListener('message', onHello)`. The game's hello payload is passed to `onMessage` so OGM-022/OGM-028 can read the protocol number. `ready` rejects if `close()` is called first.
- **Interface sketch:** `openHostBridge(iframe, { gameOrigin, validate, onMessage, hello }): Bridge`.
- **Tests:** Given a `JSDOM` at `https://app.test` and an iframe whose `contentWindow` is a second `JSDOM` at `https://games.test`, when a `MessageEvent` with `origin: 'https://evil.test'` is dispatched, then `ready` is still pending after a tick and nothing was posted. Given `origin: 'https://games.test'` but `source` another object, then ignored. Given the right origin and source and a hello string, then `ready` resolves, the game window received one message with `ports.length === 1`, and `window` has no remaining `message` listener (spy on `removeEventListener`).

### U4 — Game side: `openGameBridge`
- **Goal:** post the hello to the parent with an exact `targetOrigin`, accept the port only from that origin.
- **Files:** Create `src/game.ts`; Test `test/hello.test.ts` (same file, second describe).
- **Approach:** `window.parent.postMessage(JSON.stringify({ v: 1, id: newId(), t: 'hello', payload: helloPayload }), hostOrigin)`; listener accepts the first message with `e.origin === hostOrigin && e.ports[0]`, validates the hello envelope from the host, attaches the port, resolves `ready`; any other message is ignored. Re-posts the hello every 250 ms up to 20 times until the port arrives (the host may attach its listener after the iframe script starts), then rejects `ready` with `BridgeError('timeout')`. `newId()` is a counter prefixed by side (`g-1`, `h-1`), no randomness (lint bans `Math.random` in sim code; the bridge is not sim code but keeps the habit).
- **Interface sketch:** `openGameBridge({ hostOrigin, validate, onMessage, helloPayload }): Bridge`.
- **Tests:** Given the game window with `parent` set to the host window, when `openGameBridge` runs, then the host window receives a hello string posted with `targetOrigin === 'https://app.test'` (spy on `postMessage`). Given a port message from the wrong origin, then ignored. Given the right origin with a port, then `ready` resolves and a subsequent `send` goes over the port, not `postMessage`. Given no port in 20 retries (fake timers), then `ready` rejects with `timeout`.

### U5 — Integration: both sides end to end
- **Goal:** one test wires U3 and U4 together through real `MessageEvent`s and a real `MessageChannel`.
- **Files:** Test `test/e2e.test.ts`.
- **Approach:** patch `hostWindow.postMessage` and `gameWindow.postMessage` to dispatch `MessageEvent`s on the other window with the correct `origin`, `source` and `ports`; then run the worked example (`test.advanceTime` request → `test.result` reply).
- **Tests:** Given both bridges opened, when the host `request`s `test.advanceTime {ms: 500}` and the game handler sends `test.result` with `replyTo`, then the host promise resolves with `payload.ok === true` and both `stats().sent === 1`-ish counts match.

## 4. Verification

```sh
pnpm install
pnpm --filter @ogm/iframe-bridge test
pnpm --filter @ogm/iframe-bridge build
pnpm -r typecheck
pnpm lint
wc -l packages/iframe-bridge/src/*.ts
```

`## Local tests`: policy `full`; head SHA; base `main`; selection `@ogm/iframe-bridge`; the commands above; expected ≥ 18 tests, 0 skipped; the `wc -l` total.

Conventions: pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest with jsdom; no Playwright here; no service, no secrets; `jsdom` pinned at install (above 1k stars); PR first line `Closes #<issue>`.

## 5. Deferred to implementation

- jsdom `postMessage` fidelity: default to constructing `MessageEvent`s by hand in tests (U3–U5) rather than relying on jsdom's origin handling.
- Whether `request` ids are prefixed per side: default yes (`h-<n>` / `g-<n>`) so logs read clearly.
- Error-throttle message shape: default one `error` envelope per second with `{ code: 'dropped', message: 'tooLarge=1 rateLimited=3 invalid=0' }`.
- Retry cadence of the game hello: default 250 ms × 20.
- Whether `send` on a not-ready bridge queues or throws: default throws `not_ready`; callers await `ready`.

## 6. Scope boundaries

- No Zod unions, no knowledge of `t` values beyond `'hello'` (OGM-020 supplies validators; OGM-028 and OGM-022 wrap).
- No role check before `design.apply` (OGM-028).
- No iframe creation, `sandbox`/`allow` attributes, gamepad, touch overlay (OGM-028).
- No `test.*` dispatch or window globals (OGM-022).
- No binary framing: base64 strings per OGM-020 amendment 1; a binary channel would be a v2 of the bridge envelope.

## 7. Risks

- **jsdom lacks `MessageChannel` or sets no `event.origin`** → use Node's global `MessageChannel` and hand-built `MessageEvent`s; default taken.
- **Length in UTF-16 code units is not bytes** → the cap is documented as code units (`BRIDGE_MAX_BYTES` is the name OGM-020 fixed; the JSDoc says "JSON string length"); within 2× of bytes for any text, acceptable.
- **Hello race (game script runs before the host listener)** → game retries for 5 s; default taken.
- **Line budget creep** → report `wc -l`; if over 220, move the error throttle into the host wrapper (OGM-028).
