---
name: gm-design-loop
description: Use for any creator request to make or change part of a game, scene, screen or effect ("add a scene", "make the city...", "change how X looks"). The core loop Game Maker's agents follow: assets first, options before the final build, verify by looking, deliver something the creator can watch on a phone, then persist what was decided. Dogfooded by Claude in this repo.
---

# gm-design-loop

The creator talks; the agent designs. Designing is the product's core loop, so do it the same way every time.

## The loop

1. **Restate** the ask in one line, plus the constraints already known: the creator's taste and past decisions
   (memory, the scene list), the game's style, what must not change. Ask only if the choice is genuinely theirs.
2. **Assets first** (`gm-assets`). Search the packs, render a lineup of candidates, and pick from it (show the creator
   when the choice is visible). Missing? Fetch a free pack (tier 2) or clone a variant (`gm-asset-variants`).
   Building a model procedurally is the last resort, and you say so.
3. **Options before the final build.** For a big or visible decision (a scene, a style, a character, a layout) make
   2-5 quick variations (A/B/C) and recommend one. Small changes skip this.
   - One step at a time: the creator signs off a scene before the next starts. Don't build several at once.
4. **Build.** Every moving thing runs on its own loop with its own period. Keep a capture mode (time set from
   outside) so recordings are exact.
5. **Verify by looking** (`gm-verify`) before anything is sent: stills at desktop and phone sizes, a timeline of the
   motion, and a look at every frame you cite.
6. **Deliver for a phone.** MP4 clips on an artifact page with posters and one line per option, then the specific
   questions (which option, what to change). Deploy only when the creator says so.
7. **Persist decisions** where the next agent will find them: the scene list and taste in memory, product-level
   decisions in the scope. Lessons about the process itself go through `meta-improve`.

## Taste and pushback

Each creator's preferences live in memory (feedback notes). Read them before step 3 and apply them without being
asked again. When the creator pushes back, fix the instance and update the note or skill that would have prevented
it (one line, in place).
