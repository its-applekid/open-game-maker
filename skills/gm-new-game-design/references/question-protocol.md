# Question, sample and decision protocol (new games)

## When to ask

Ask when the answer changes code structure, assets, controls, camera, player count, the core loop, the world's shape,
the story's spine or the music direction. Do not ask about anything the creation choices, chat, voice or pastes already
answer. Do not ask about details with a safe, reversible default (exact numbers, minor names, menu wording).

Prefer an open question when the player clearly has an idea in mind ("What happens when you reach the top of the
tower?"). Prefer a choice of 2–4 options when they are unsure or the space is large.

## How an option set looks

```
Question: How should the hero move?
  a. Tight platformer jump with wall-slide       (sample: short clip of the SDK platformer template)
  b. Floaty double jump, slower and forgiving    (sample: same clip with tuned values)
  c. No jump, top-down dash                       (sample: mock-up still)
Recommended: a, because the vibe is "retro" and the world is vertical.
```

- Options must differ in what the player experiences, not only in names or colours.
- Attach a sample when it helps the player decide: an asset lineup (`gm assets sheet`), a still or clip (`gm shot`,
  `gm-video`), a library music or sound clip, a story paragraph, or a tiny playable sketch. Label anything made up or
  approximated as "mock-up".
- Always name the recommended option and why, in one line.

## Blocking, defaults and late changes

- A question blocks only the tickets that depend on it. Everything else proceeds.
- After about five minutes without an answer, the Executor records the recommended option as a **provisional default**
  (origin: default) and unblocks the dependent work. The threshold is approximate and configurable.
- The player may skip a question; treat a skip as "use your recommendation".
- A later answer always wins. Record it as a new decision that supersedes the old one; the Executor works out which
  tickets and code it affects and re-plans, reworks or reverts only what it must.

## Decision record

```
- id: D-07
  question: How should the hero move?
  options: [a, b, c]
  recommended: a
  chosen: a
  origin: player | default
  at: 2026-11-03T21:14Z
  supersedes: null | D-03
  affects: [controls, levels, tuning]
```

## Privacy

GitHub issues may be public. Issues and the spec's public summary never contain raw chat, raw voice transcripts, large
pastes or personal details; they hold a short summary and an opaque reference to private storage, where authorised
agents read the full text (speech already transcribed, never raw audio by default).
