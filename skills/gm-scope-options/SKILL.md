---
name: gm-scope-options
description: Load when a creation brief is vague or a choice could materially change the game.
---

# Scope and options

## Recover the source of truth

Read the job's scope ticket, current Agent Workpad, and `gm.lock.json` before proposing anything. The scope ticket
carries genre, vibe, world, and players; the lock records the chosen template, family, set, and point of view. Treat
the creator's own words as the quality bar. Never replace a specific request with a generic interpretation.

Start with the five-line plan and "defaults I'd reach for" pass from `gm-core`. Drop every default that is not
supported by the brief, or state why it is necessary to deliver an accepted item.

## Decide whether a choice is needed

A creation brief is vague when it names no playable mechanic or has fewer than three concrete game nouns. A narrow
edit stays narrow: use the existing acceptance list plus the requested delta, and do not reopen the whole game.

Ask only when the answer materially changes code, assets, tests, player count, point of view, or the core loop. Keep
working when a sensible reversible default does not change those things.

## Offer one bounded choice

For a vague creation brief, offer three clearly different takes in one question. Give each take one line with its
core verb, short loop, and boundary; recommend one. Different palettes or names are not different takes.

Use one non-blocking checkpoint:

`gm checkpoint open --question "Which game loop should I build?" --option "a=Gather and craft" --option "b=Race and deliver" --option "c=Defend and repair" --recommend a`

Open at most three checkpoints during an edit or a single-ticket build. A new game from the New Game flow follows `gm-new-game-design` instead (no cap). Do not add `--blocking` unless the next dependent step truly
cannot be built before the creator chooses; continue independent work either way.

## Lock the agreed scope

Record the chosen direction under `## Acceptance` in the ticket's Agent Workpad with observable keep and kill criteria:
what the player can do, what evidence proves it, and which tempting mechanics remain excluded. Preserve
unchosen ideas separately instead of quietly blending them into the build.

For a scope ticket, encode the same agreement in `.gm/scope/<session-id>.json`, including explicit included and
excluded lists plus ticket acceptance criteria, then run
`gm scope done --file .gm/scope/<session-id>.json`. Do not start game implementation until the agreed scope is filed.
