---
name: gm-new-game-design
description: Load when a player starts the dedicated New Game flow and the game must be scoped with them. Runs the design conversation (typed or voice), front-loads rich creative questions, records every answer or provisional default as a decision, and produces the game design spec the Executor plans from.
---

# New-game design conversation

Only the dedicated New Game flow uses this skill. A change to an existing game is one ticket for one coding agent
(`gm-scope-options`); never turn it into a new-game design session.

## Inputs to read first

The creation choices (genre, vibe, style family and set, world, players, point of view), the scope chat, any voice
transcript, pasted text and attachments. Treat everything the player already said as known: use it silently and never
ask them to repeat or reconfirm it. Large pastes arrive as attachments; read them in full.

Then read `references/resources.md` (what the engine, hosting and asset library can really do) and
`references/question-protocol.md` (how to ask, recommend, default and revise).

## The conversation

- Talk like a friendly game designer, in short turns. Typed and spoken replies are equal; a spoken answer may be loose,
  so restate it in one line only when the meaning is genuinely ambiguous.
- **Front-load the big decisions.** Early choices shape everything downstream: core loop, controls, camera, world
  structure, art direction inside the chosen style, main characters, tone of story, music direction, win and loss.
  There is no question cap; ask as many high-leverage questions as the game needs, and stop asking about details a
  sensible default covers.
- **Show, don't only tell.** Offer options as concrete samples where they help: an asset lineup or mock-up still, a
  short GIF or clip, a music or sound clip from the library, a story beat in prose, a tiny playable sketch. Pick the
  format that best answers that decision; label mock-ups as mock-ups.
- **Always recommend.** Each question with options names the recommended option and why, in one line.
- **Never block on the player.** They may skip, go quiet or leave. Each open question gets a provisional default after
  about five minutes (the Executor applies it); work that does not depend on it proceeds immediately.
- **Late changes are normal.** A new answer replaces the old decision; record it and let the Executor re-plan.
- Ask questions as aiur Commands (`gm checkpoint open` wraps them) so the Executor, the app inbox and voice all see the
  same open questions. The three-checkpoint cap in `gm-scope-options` does not apply to new-game design.

## What to record

Every decision, whether the player's or a default, goes in the spec's decision log with: id, question, chosen option,
recommended option, origin (player or provisional default), time, and the spec sections it affects. Keep the player's
raw words, voice transcript and pastes in private storage only; the spec and every GitHub issue carry a privacy-safe
summary and an opaque reference.

## Finish

When the player says it's ready, or the important decisions are answered or defaulted, write the spec using
`references/spec-template.md` and hand it to the Executor (the new-game parent issue's private context). The Executor
plans the whole game with `gm-new-game-plan`; you do not create tickets.

A spec is complete when the Executor can plan without a second interview: core loop, controls, camera, world and
levels, characters, style and asset picks, UI, audio, progression, win and loss, prototype milestone, acceptance
criteria, and the open questions with their defaults.
