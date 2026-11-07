---
name: gm-set-kaykit
description: Load when gm.lock.json names the kaykit set and the game uses its shared-rig 3D adapter.
---

# KayKit set route

Confirm `gm.lock.json` has `set: "kaykit"`. Use `gm assets search --set kaykit`, inspect rig and kit facts with
`gm assets info`, compare candidates with `gm assets sheet`, and fetch focused guidance with
`gm docs pattern <topic>`.

Characters are the KayKit rigged models (`RiggedCharacter`), never capsule or box figures. If no KayKit card loads,
stop and raise it (gm-core, "A pack you cannot reach is a blocker").

## Adapter exports

| Export | Use |
|---|---|
| `kaykitConventions` | verified rig, forward-axis, scale, loop, and grid facts |
| `kaykitVocabulary` | canonical action role to clip name |
| `RiggedCharacter` | shared-rig mesh and clip-library binding |
| `retargetKaykitClip` | rig-id checked clip reuse |
| `snapToKitGrid` | kit placement without drift |
| `kaykitColliderRecipe` | card-bounds collider suggestions |

Use one scale convention for the whole game. Confirm rig ids before clip reuse; a similar joint list is not proof.
Loop locomotion and idle clips, but hold a named terminal pose after a one-shot when the vocabulary provides one.
Contact frames are verified data, never guessed from duration. Kit pieces snap by the card's `grid_m` fact.

## Cards

| Need | Topic |
|---|---|
| shared-rig animation | `clip-retarget` |
| modular placement | `kit-snap` |
| timed interactions | `contact-frame` |

The game still chooses roles, actions, movement, interaction results, camera, difficulty, UI, and story.
