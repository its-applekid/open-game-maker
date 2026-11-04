# New-game Aiur dependencies

The new-game workflow uses Aiur as the durable home for operator Commands and agent conversations. Open Game Maker supplies the game context and embeds Aiur-owned UI; it does not fork Aiur's Command, transcript, or voice behavior.

This dependency split follows the decisions recorded in [Open Game Maker #474](https://github.com/its-everdred/open-game-maker/issues/474) and [the new-game decision register](https://github.com/its-everdred/open-game-maker/pull/473).

## Filed Aiur work

| Dependency | Aiur issue | New-game use |
| --- | --- | --- |
| Rich Commands | [aiur-team/aiur#7486](https://github.com/aiur-team/aiur/issues/7486) | Creation and editing questions can show reference images, animated images, video, or audio on the prompt and choices, and retain media submitted with an answer. Text choices, free response, and the recommended choice remain available. |
| Embeddable Commands | [aiur-team/aiur#7487](https://github.com/aiur-team/aiur/issues/7487) | The Games area gets one pending-Command inbox scoped to the game's Aiur tickets. The same component renders contextual Commands inside jobs and conversations and sends answers through Aiur's canonical human-answer path. |
| Embeddable conversation | [aiur-team/aiur#7488](https://github.com/aiur-team/aiur/issues/7488) | Creation, editor, and job-detail chat surfaces embed Aiur's activity/reply feed, text composition, dictation and two-way voice, right-edge minimap, inline media, and pending Commands. |

## Integration boundary

Open Game Maker owns the mapping from a game to its Aiur ticket identifiers. It passes that allowed ticket set, an authenticated end-user client, and feature availability into the embedded components. It also decides where the fixed prototype surfaces mount the components.

Aiur owns Command persistence, revisions, recommendations, answer validation, conversation history, live updates, media authorization, and voice transports. Its dashboard and Open Game Maker must consume the same extracted components so their states and accessibility behavior do not drift. Open Game Maker must never receive or expose Aiur supervisor credentials.

The conversation component should reuse Aiur's existing conversation API and `voice_converse` work, including [#4104](https://github.com/aiur-team/aiur/issues/4104), [#4143](https://github.com/aiur-team/aiur/issues/4143), and [#7485](https://github.com/aiur-team/aiur/issues/7485). It consumes the embeddable Commands boundary for inline pending Commands and the rich-media contract when media is present.

## New-game dispatch exception

No Aiur change is required for the optional new-game dispatch exception. Aiur already separates Executor ownership from event subscription:

```sh
aiur take <ticket-id>
aiur executor-subscribe 'ticket.<ticket-id>.#'
```

`aiur take` assigns the ticket to the Executor and keeps it out of fleet dispatch without consuming an agent slot. `aiur executor-subscribe` persists the ticket-specific event subscription. When the exception ends, `aiur release <ticket-id>` returns the ticket to normal dispatch ownership; the subscription can be removed separately if it is no longer useful.
