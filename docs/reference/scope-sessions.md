# Scope session revisions

The scope-session API exposes the latest agreed plan and a monotonic `revision`. Clients use the revision to distinguish the plan that was rejected by admission from the replacement produced after a `trim` or `split` choice.

## Session shape

`GET /api/v1/games/:gameId/scope/sessions/:sessionId` returns:

```json
{
  "sessionId": "s_...",
  "status": "open | revising | agreed | abandoned",
  "revision": 1,
  "chatJobId": "j_...",
  "scope": { "session_id": "s_...", "revision": 1 }
}
```

An initial `open` session has revision `0` and no `scope`. An `agreed` session has revision `1` or greater, and `scope` is the latest agreement with the same revision. A `revising` session keeps exposing the prior agreement and its revision while the replacement is discussed. Accepted agreements are also retained in append-only server-side revision history for audit.

## Trim or split flow

After admission returns a `trim` or `split` offer for agreed revision `N`:

1. Call `POST /api/v1/games/:gameId/scope/sessions/:sessionId/revisions` with `{ "expectedRevision": N }`.
2. On `200`, post the creator's selected offer and instructions to `/api/v1/jobs/:chatJobId/chat`, including that the replacement agreement must use revision `N + 1`.
3. Keep the prior plan visible while the session status is `revising`.
4. Wait until the session is `agreed` at revision `N + 1`, then retry admission with that latest `scope`.

Repeating the revision request with the same `expectedRevision` while the session is already `revising` is idempotent. A lower version returns `scope_revision_stale`; a higher version returns `scope_revision_mismatch`. The outbox accepts only the expected next agreement, treats an exact repeated delivery as a no-op, and rejects stale content or a skipped revision.

The first agreement may omit `scope.revision` for compatibility and is interpreted as revision `1`. Every replacement agreement must carry its explicit revision; omitting it during revision discussion is stale revision `1`.
