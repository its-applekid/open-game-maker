# New Game request parent issue

When the New Game flow finishes in the scope chat, Open Game Maker files one parent issue and stops: the parent is the
root of the game's Build Order and only the Executor plans from it. No worker ever claims it. Everything raw — the scope
conversation, voice transcripts as text, pastes, attachments and the agreed spec — stays in the app's private storage
and reaches an authorised agent through the internal API described below. Nothing raw reaches GitHub.

## The parent issue

One issue per New Game request, in the game's repository, filed by the intake when the request's `new_game` job reaches
filing:

- **Labels:** `request:new-game` and `feature:gm-<jobId>`. Never a dispatch label — no `<slug>:todo`, no lifecycle
  state — so no daemon queues or claims it. The daemon's dispatch set is the game's `<slug>:todo` label, so a parent
  without it is invisible to workers.
- **Title:** the agreed title, at most 120 characters.
- **Body:** the creation choices as short labelled lines, one paraphrased brief sentence, the game id and the request's
  opaque reference, then a fixed note that the private context is not in the issue. An address-shaped value is
  redacted and the brief is cut at 400 characters. The body ends with the job's markers
  (`<!-- gm-job:<id> gm-ticket:new-game gm-sig:<sha256> -->`), so a retried create is found instead of filed twice.
- **No spend cap and no aiur nudge:** the request's obligation ends at filing. The job goes to `done`, releasing the
  `new_game` slot; the build's own tickets carry their own caps when the Executor files them.

The request's opaque reference is its job id. It names the private context but grants nothing on its own: the internal
API needs a scoped token or the internal credential, and the parent issue carries neither.

## Private context

`GET /internal/new-game/requests/:requestId` returns the request's context for an authorised agent:

```json
{
  "request": "j_...",
  "game": { "id": "g_...", "title": "Lantern Bay", "slug": "lantern-bay" },
  "choices": { "genre": "platformer", "vibe": "cozy", "players": "single" },
  "brief": "A cozy island platformer about relighting harbour lanterns.",
  "spec": { "session_id": "s_...", "revision": 1 },
  "revisions": [{ "revision": 1, "agreedAt": "2026-11-04T18:00:00.000Z" }],
  "messages": [{ "at": "…", "actor": "creator", "kind": "text", "text": "Keep it calm at dusk.", "media": false }],
  "attachments": [{ "id": "att_...", "kind": "text", "name": "mood-board.md", "mime": "text/markdown", "bytes": 7 }],
  "parent": { "repo": "owner/game", "number": 12 }
}
```

The context is read from the app's own storage — the request and scope-session rows, the append-only chat table (a voice
turn lands there as text, never as audio), the scope revision history and the blob store. `spec` is the latest agreed
scope, `revisions` its agreement history. Only a `new_game` request with a filed parent resolves; an ordinary job is not
a request and returns `404`.

A pasted file or an image's bytes are served one at a time from
`GET /internal/new-game/requests/:requestId/attachments/:attachmentId`, with the row's content type. An attachment id
that belongs to another request is `404`.

### Authorisation

The route accepts either credential and nothing else — a user session cannot read it:

- **Scoped token** in `Authorization: Bearer ngc1.…`. It names one request and its game, lives an hour, and is signed
  with a secret derived from the API's job token secret (domain-separated), so no extra secret is distributed. A token
  minted for another request is `403`. The token travels to an agent in its prompt or environment, never to GitHub.
- **The internal credential** in `x-ogm-internal`, the same shared secret the API already accepts for internal calls.
  The Executor's unit carries it.

`POST /internal/new-game/requests/:requestId/token` mints a scoped token and needs the internal credential. It returns
`{ request, game, token, expiresAt }` with `201`, so the Executor can hand a worker exactly one request's context.

Credentials are checked before the request's existence: an unauthenticated caller gets `401` and learns nothing about
which request ids exist.

## The Executor receives the parent

The parent is filed for aiur's Executor, not for a worker. The Executor runs an aiur executor subscription on the
`request:new-game` label — the mechanism aiur documents in [the new-game Aiur dependencies](../new-game/aiur-dependencies.md)
(`aiur take <ticket-id>` plus `aiur executor-subscribe 'ticket.<ticket-id>.#'`), so the parent reaches the Executor without
an agent slot and without entering the fleet's dispatch. From there the `gm-new-game-plan` skill plans the whole game and
files the children; this intake never creates them.

Two invariants keep a worker off the parent:

1. The parent carries no label in the daemon's dispatch set. A game daemon dispatches on `<slug>:todo` and reads only its
   own lifecycle states; `request:new-game` is neither.
2. The request's job is `done` once the parent is filed. Nothing stays `running` or `filed` against the parent, so no
   daemon lifecycle event nudges it.

If filing fails — GitHub unavailable, or the summary missing — the request stays `admitted`, the intake alerts, and the
sweep retries. A create whose outcome is unknown is recovered by its marker rather than filed a second time.

The intake still runs the game's daemon preflight before filing the parent, so the daemon is up when the Executor's
children arrive and carry `<slug>:todo`; the request's own job ends at filing regardless.

## Editor changes are not requests

Only the New Game flow produces `request:new-game`. A chat request from an existing game's editor is a `feature` job: it
files one ordinary ticket with its dispatch label, spend cap and aiur nudge, for one agent. The parent path is guarded
on the job's `new_game` kind, so an editor ticket can never carry the request label.
