# OGM-030 plan — aiur-client package and zero-cost spike

## 1. Problem frame

The OGM backend needs one typed, tested way to talk to the aiur daemons on this machine: file-time spend caps, usage and progress reads, confirmed cancel, pause/resume, operator messages, the `control todo` nudge, account headroom, and the event feed. aiur `0f692a45b` already serves all of it over `/api/v1` with versioned JSON (E02-1/2); nothing in this repo calls it yet. This ticket is the aiur lane's spine: six tickets fan out from the `AiurClient` contract, so the contract file must merge early and stay stable. The C0 spike settles three open [I] items before the consumers build on them: issue→claim latency with the `control todo` nudge, cancel confirmation time, and whether a spend cap trips on a `fake` provider run.

**Requirements trace**
- R60 → this package is the typed client with usage, progress, spend cap, cancel (confirmed exit), pause/resume, message, `control todo`, accounts and events; every write carries `Origin` and `X-Aiur-Request`; one write token per daemon is accepted as a constructor argument.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur_web/routes/api.ex` — the exact write routes and which pipeline each uses (write token + `api_write` + `require_writable`).
- `/home/orangekid/github/aiur/src/lib/aiur_web/router.ex:88-118` — the `api_write` CSRF rule (Origin/Referer same-origin or loopback, custom header) that the client must satisfy.
- `/home/orangekid/github/aiur/src/lib/aiur_web/api/usage/ticket_usage.ex:139-199` — the `aiur.ticket_usage` v1 field list to encode as a zod schema (`totals.api_equivalent.amount.USD` is a decimal string).
- `/home/orangekid/github/aiur/src/lib/aiur_web/api/usage_progress.ex:56-66` — the `aiur.ticket_progress` v1 fields.
- `/home/orangekid/github/aiur/src/lib/aiur_web/controllers/ticket_cancel_api_controller.ex:10-48` — status codes to map, not throw.
- `/home/orangekid/github/aiur/src/lib/aiur_web/controllers/observability_api_controller.ex:178-242` — `message_id` idempotency and the 202 `outcome_unknown`/`retry_safe` semantics.
- `/home/orangekid/github/aiur/src/lib/aiur_web/controllers/control_controller.ex:14-66` and `src/lib/aiur/control_call/allowlist.ex:179-180` — the control-call envelope and the `todo/2` signature.
- `/home/orangekid/github/aiur/src/lib/aiur_web/events_channel.ex` and `sockets/events.ex:6` — join payload, `record`/`heartbeat` pushes, 500-record pages, `reset`, 25 s heartbeat; `events_auth.ex:9` — 300 s token.
- `/home/orangekid/github/aiur/src/examples/workflows/github-codex.yaml` — the starter config to copy for the spike's scratch `.aiur/config` (set `tracker.kind: memory`, `agent.priority: [fake]`).
- `/home/orangekid/github/aiur/src/lib/aiur/coding_agent/providers/fake.ex:4-20` — the `fake` backend entry (`fake-agent --serve`, model `fake-1`).

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Package scaffold and error types
- Goal: `@ogm/aiur-client` builds and typechecks inside the workspace.
- Files: Create `packages/aiur-client/package.json`, `packages/aiur-client/tsconfig.json`, `packages/aiur-client/src/index.ts`, `packages/aiur-client/src/errors.ts`. Test `packages/aiur-client/test/errors.test.ts`.
- Approach: copy the first package OGM-001 created (`ls packages/*/package.json`) for `exports`, `type: module`, scripts and the `tsconfig` `references`. `errors.ts` defines `AiurHttpError {status, code, message, daemon}`, `AiurContractError {expected, received}`, `AiurUnavailableError {daemon, cause}`. Add `zod` as a package-local dependency pinned at install.
- Interface sketch: `export class AiurHttpError extends Error { constructor(readonly status: number, readonly code: string, message: string, readonly daemon: string) }`.
- Test scenarios: Given a 404 body `{error:{code:"ticket_not_found"}}` when wrapped then `code === "ticket_not_found"` and `status === 404`.

### U2 — Schemas for the versioned contracts
- Goal: every response OGM reads is validated once, at the edge.
- Files: Create `packages/aiur-client/src/schemas.ts`. Test `packages/aiur-client/test/schemas.test.ts` with `test/fixtures/{usage,progress,accounts,issue,state,cancel-exited,cancel-409,message,control,events-page}.json`.
- Approach: `TicketUsage` = `{contract:"aiur.ticket_usage", contract_version:1, schema_version, ticket:{owner,repository,identifier}, currency:"USD", state, authority, freshness, totals:{tokens, provider_reported:Record<string,string>, api_equivalent:{amount:Record<string,string>, coverage:{status,known,unknown,reasons}}}, by_model[], by_provider[], sessions[]{run_id, by_model, by_provider, …}}` (`ticket_usage.ex:139-199`). `TicketProgress` = `{contract:"aiur.ticket_progress", contract_version:1, issue_identifier, repository, phase: 'brainstorm'|'plan'|'work'|'review'|null, progress, events[]{type, phase, transition, at}, sources:{activity}, generated_at}`. `UsageAccounts` = `{contract:"aiur.usage.accounts", contract_version:1, observed_at, accounts[]{name,harness,weekly_percent,five_hour_percent,remaining_percent,freshness,…}}`. `EventRecord` = discriminated on `type`: `event` (`seq, instance, id, topic, payload, observed_at`), `reset` (`oldest_seq, head_seq, epoch`), `error` (`code`), `auth_expiring` (`in_ms`). Use `.passthrough()` on envelopes so new fields never break parsing; `contract_version` is `z.literal(1)` so a bump fails loudly.
- Interface sketch: `export const TicketUsage = z.object({...}); export type TicketUsage = z.infer<typeof TicketUsage>;`
- Worked fixture (`test/fixtures/usage.json`, shape from `ticket_usage.ex:139-199`; values are placeholders until the spike captures real ones):
  ```json
  { "contract": "aiur.ticket_usage", "contract_version": 1, "schema_version": 1,
    "ticket": { "owner": "everdred-games", "repository": "gm-g_01J", "identifier": "142" },
    "currency": "USD", "state": "in-progress",
    "authority": { "schema_version": 1, "aggregate_generation": 7 }, "freshness": { "status": "fresh" },
    "totals": { "tokens": 184210, "provider_reported": { "USD": "0.000000" },
                "api_equivalent": { "amount": { "USD": "0.734512" }, "coverage": { "status": "complete", "known": 3, "unknown": 0, "reasons": [] } } },
    "by_model": [ { "model": "gpt-5.6-terra", "tokens": 184210 } ], "by_provider": [ { "route": "codex:gamebuilder" } ],
    "sessions": [ { "run_id": "r_8f3c", "provider_reported": { "USD": "0.000000" },
                    "api_equivalent": { "amount": { "USD": "0.734512" }, "coverage": { "status": "complete" } } } ] }
  ```
- Test scenarios:
  - Given each fixture when parsed then it succeeds.
  - Given the usage fixture with `contract_version: 2` when parsed then `AiurContractError`.
  - Given an `event` record with an unknown extra field when parsed then it passes.
- Execution note: capture the fixtures from the spike daemon (U5) first; until then write them by hand from the Elixir sources named above and replace them when the spike runs.

### U3 — The HTTP client
- Goal: the verbatim `AiurClient` interface plus the extensions.
- Files: Create `packages/aiur-client/src/client.ts`. Test `packages/aiur-client/test/client.test.ts`.
- Approach: `createAiurClient(daemon: AiurDaemon, fetchImpl = globalThis.fetch): AiurClient & AiurClientExtensions`. One private `request(method, path, {body?, write?, supervisor?})` builds the URL from `baseUrl`, sets `Authorization`, and for `write` also `Origin: baseUrl` and `X-Aiur-Request: 1`; `supervisor` swaps the bearer for `supervisorToken` and throws `AiurConfigError` when it is absent. Map statuses: 2xx → parse with the schema; 409 on `cancel` → return parsed body; 202 on `message` → if `messageId` was given, retry once after 1 s, else return `{request_id: body.request_id ?? ""}` and surface `outcome_unknown` in a `warning` field; everything else → `AiurHttpError`. `nudgeTodo(ids)` validates each id matches `/^[1-9][0-9]{0,18}$/` then posts the control envelope. `setSpendCap(id, usd)` validates the decimal (`/^\d+(\.\d{1,6})?$/`). Never log the token or the body of a 401.
- Interface sketch:
  ```ts
  export type AiurClientExtensions = {
    healthz(): Promise<boolean>;                                   // GET /healthz
    eventsToken(): Promise<{ token: string; expires_in_seconds: number }>; // POST /api/v1/events/token (write token)
    decisions(): Promise<DecisionSummary[]>;                        // GET /api/v1/decisions (supervisor token)
    decision(id: string): Promise<Decision>;
    decide(id: string, body: { option?: string; response?: string; expected_version: number; idempotency_key: string }): Promise<Decision>;
  };
  export function createAiurClient(daemon: AiurDaemon, fetchImpl?: typeof fetch): AiurClient & AiurClientExtensions;
  ```
- Test scenarios:
  - Given a mocked fetch when `setSpendCap("142","12.50")` then PUT `/api/v1/142/spend-cap` with body `{"amount":"12.50","currency":"USD"}` and the three write headers.
  - Given `cancel` answers 409 `{process:{status:"still_running"}}` then the promise resolves with that body.
  - Given `message` answers 202 and `messageId` is set then a second POST with the same `message_id` is sent.
  - Given `nudgeTodo(["abc"])` then it throws before any fetch.
  - Given `decide` without `supervisorToken` then `AiurConfigError`.
  - Given fetch rejects with `ECONNREFUSED` then `AiurUnavailableError`.

### U4 — `events:feed` subscriber
- Goal: a long-lived subscription that yields parsed records and never silently stalls.
- Files: Create `packages/aiur-client/src/events.ts`. Test `packages/aiur-client/test/events.test.ts`.
- Approach: `subscribeEvents(client, {after, patterns, onRecord, onReset, onError, signal})`. Flow: `client.eventsToken()` → `new Socket(baseUrl.replace(/^http/, "ws") + "/events", {params: {token}})` from `phoenix` → `channel("events:feed", {after, patterns})` → `channel.on("record", …)`, `channel.on("heartbeat", …)`. On `auth_expiring` fetch a new token and reconnect at the last pushed `seq`; on `reset` call `onReset(meta)` and continue from `meta.head_seq`; on `error` `feature_disabled` stop and surface it (the daemon config lacks `events.export.enabled: true`); on socket close back off 1 s → 30 s and resume from the last `seq`. The cursor is the caller's (OGM-032 persists it). Node 24 provides a global `WebSocket`; pass it to `Socket` via `transport` if `phoenix` does not pick it up.
- Interface sketch: `export function subscribeEvents(client, opts: { after: number; patterns: string[]; onRecord(r: EventRecord): void; onReset(m: ResetMeta): void; onError(e: Error): void; signal: AbortSignal }): Promise<void>` (resolves on abort).
- Test scenarios (fake Phoenix socket):
  - Given a join with `after: 10` when records 11..13 arrive then `onRecord` is called in order.
  - Given `auth_expiring` then a new token is requested and the channel rejoins with the last seq.
  - Given `reset {head_seq: 900}` then `onReset` and the next join uses `after: 900`.
  - Given the socket closes then it reconnects after 1 s.

### U5 — C0 spike and write-up
- Goal: four measurements and one answer, with no product code and no spend.
- Files: Create `docs/plans/ogm-v1-build/evidence/T02-spike.md`. Scratch (not committed): `/tmp/claude-1001/.../ogm-spike/` with `.aiur/config` copied from `/home/orangekid/github/aiur/src/examples/workflows/github-codex.yaml`, edited to `tracker: {kind: memory}`, `agent: {priority: [fake]}`, `events: {export: {enabled: true}}`, `server: {host: 127.0.0.1, port: 0}`.
- Approach: start `/home/orangekid/github/aiur/scripts/aiurdev run` from the scratch dir (foreground, Ctrl-C to stop); mint `aiurdev token create spike --scope write` from the same dir; file a ticket the way the memory tracker allows (read `src/README.md:163` and `src/lib/aiur/tracker/memory*.ex` at pickup for the memory tracker's intake command); time `nudgeTodo` → first `ticket.N.lifecycle.changed {lifecycle: allocated|running}` on the feed; `PUT spend-cap {amount: "0.000001"}` on a second ticket and watch for `usage.spend_cap_reached` (if the `fake` provider reports no usage, record that the trip is unobservable at zero cost and name the real-run fallback from E02-4); `cancel` a running ticket and time the 200 `exited`; create a scratch git repo with `.claude/skills/x` and a committed `.codex/skills/x` symlink, run `codex sandbox -- ls -l .codex/skills` and note whether Codex lists it (`codex --version` is 0.162.1). Capture every response as a fixture for U2 with tokens redacted. The write-up: one table (measurement, value, command), the config used, and the fallback decision for each unresolved item.
- Interface sketch: none (document).
- Test scenarios: Given the write-up when read then every number has its command beside it.

## 4. Verification

```
pnpm --filter @ogm/aiur-client test
pnpm -r typecheck
pnpm -r lint
```
Paste into `## Local tests`: the Vitest summary (counts per file), the typecheck and lint exit codes, and the four spike measurements copied from `evidence/T02-spike.md` with the aiur commit (`git -C /home/orangekid/github/aiur rev-parse --short=9 HEAD` → `0f692a45b`).

## 5. Deferred to implementation

- Whether `phoenix`'s `Socket` accepts Node's global `WebSocket` without a `transport` option; default: pass `transport: WebSocket` explicitly.
- `IssueEntry` and `/api/v1/state` field sets (no `contract` field, E02-1 gap 9); default: `z.object({...}).passthrough()` with the fields OGM-032 needs (`state`, `labels`, `waiting`, `pr`), captured from the spike.
- Whether `aiur token create` works before the daemon has ever started in that directory; default: start the daemon once, then mint.
- Backoff ceiling for the feed; default 30 s, jittered.

## 6. Scope boundaries

- No issue filing, label sequencing or `gm-job` markers (OGM-031).
- No persistence of cursors, job rows or projections (OGM-032).
- No cancel/pause policy, no usage arithmetic (OGM-033).
- No daemon start, token minting or `remote-instances.yaml` (OGM-034).
- No webhook receiver (`POST /internal/aiur/webhook` waits for OGM-006 TLS).

## 7. Risks

- Spend cap may not trip on the `fake` provider (no usage rows) — default: record it; OGM-033 keeps the OGM-side comparison of `/usage` totals against the cap as the fallback (E02 R3).
- `events:feed` is Phoenix-channel framed, not plain JSON over WebSocket — default: the `phoenix` client; if its Node support fails, hand-frame the v2 protocol (`[join_ref, ref, topic, event, payload]`) in `events.ts` and say so in the PR.
- The memory tracker's intake path may differ from GitHub's — default: read `src/lib/aiur/tracker/` at pickup; the spike measures latency after the nudge, not the filing call.
- `0f692a45b` drifts before pickup — default: fixtures are captured from the running checkout; record the SHA in `T02-spike.md`.
