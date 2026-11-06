# Game Command inbox

The Commands inbox lists the open aiur Commands of one game's tickets and answers them through the same path as the
build chat. Aiur owns Command persistence, revisions and answer validation; Open Game Maker owns the mapping from a
game to its ticket identifiers and never receives aiur supervisor credentials.

## Reading the inbox

`GET /api/v1/games/:gameId/commands` returns the open Commands of every job in the game that the caller may edit:

```json
{
  "commands": [
    {
      "job_id": "j_...",
      "ticket": "478",
      "title": "Build the moon gate",
      "checkpoint_id": "cp_...",
      "decision_id": "d_...",
      "version": 3,
      "question": "Which gate should the courtyard use?",
      "options": [
        { "id": "stone", "label": "Stone arch", "media": { "url": "...", "width": 640, "height": 360 } },
        { "id": "wood", "label": "Wooden door" }
      ],
      "recommend": "stone",
      "blocking": true,
      "opened_at": "2026-11-04T10:00:00.000Z"
    }
  ]
}
```

Commands are newest first. A Command appears only once aiur's decision is correlated, so `decision_id` and `version`
are always present; answered, moot and uncorrelated checkpoints are left out. `media` is a signed blob URL, the same
one the build chat renders for an option that carries an image, GIF, video or audio.

## Answering

Answer through the job's checkpoint route, not the inbox route:
`POST /api/v1/jobs/:jobId/checkpoints/:checkpointId/answer` with `{ "option_id": "stone" }`. It validates the option
against the job's checkpoint and calls aiur's canonical Decision API with the checkpoint's `version`, so an answer
from the inbox, from the job conversation modal and from an inline checkpoint card are the same operation. A `409`
means another writer answered first and the returned status is the winner's.

## Embedding

The browser renders the inbox and every job conversation through aiur's embeddable components (aiur#7487, #7488) when
they are installed, and through Open Game Maker's own markup until then. That covers the per-job modal opened from the
menu, the editor's feature scoping dock and New Game creation, whose scope session is job-backed. The adapter in
`apps/web/src/features/aiur/embed.tsx` hands each element a scope (`game`, the game's aiur `tickets`, and Open Game
Maker's proxy URLs for `commands`, `conversation` and `stream`) plus its features, and reads answers back from the
element's `aiur-answer` event. Every URL in that scope is an Open Game Maker route: the browser never calls aiur.
