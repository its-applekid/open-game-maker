---
title: Roadmap — next phases
type: roadmap
status: active
date: 2026-10-29
origin: Kevin, 2026-10-29
---

# Roadmap: next phases

Kevin's plan from here, in order.

1. **Prototype UX passes.** Kevin gives feedback on the prototype, and we make several change passes together on the whole experience: creating a game, editing it and playing it.
2. **Full research spike for the entire build.** Uses an IR build-order skill.
   - Run research spikes on each element.
   - Break all the work into many tickets.
   - Research each ticket deeply with the compound-engineering skills.
   - Map each ticket's anticipated code areas so tickets don't overlap.
   - Build the dependency tree that sets the build order.
   - Include **direction checkpoints** in the research (scope doc, "Creating a game"): for the most important decisions in a new game or feature, the agent shows 2–5 rapid prototypes (art style, animations, music, levels, feel) and the player picks. Research how they map to aiur commands so they pause only dependent work and bubble up to the player, how the agent decides which decisions deserve one, and their time and cost budget.
3. **Model switch.** Before step 2, Claude reminds Kevin to switch to a higher model (Fable). The aim is to do as much planning up front as possible, so the implementation agents can be lower-level models.
4. **IR config and implementation.** Claude sets up an IR config so that Claude or Fable can run IR (very likely **aiur**, Kevin's agent orchestrator at `~/.local/bin/aiur`, configured by `.aiurconfig`; "likely with codecs" probably means Codex; both to be confirmed) and carry out the final implementation end to end.

Until step 2 starts, the standing rule holds: no tickets and no build order until Kevin asks.
