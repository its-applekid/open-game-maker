---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/level-design/SKILL.md
modified: true
name: level-design
description: >
  Design and build playable levels — the blockout/whitebox-to-playable workflow,
  player metrics and grid layout, pacing and flow (tension/rest curve), gating
  and the critical path, and encounter design. Engine-neutral practice. Use when
  the user mentions level design, blockout/whitebox/greybox, level layout, level
  pacing, encounter design, or the critical path through a level.
---

# Level design

A level is a **sequence of intentional experiences** delivered through space.
Good level design is a *process*: define the metrics movement is built on, block
out geometry with primitives, play it, then dress it — never the reverse. This
skill is the engine-neutral practice; use the vendored Phaser `tilemaps` skill to
lay out 2D grids.

## When to use

- Use to plan a level's structure: critical path, pacing, gating, encounters,
  and where the player learns vs is tested.
- Use the **blockout → test → iterate → dress** workflow to build a level that
  plays well before any art exists.
- Use to derive level **metrics** from the character's movement so geometry is
  reachable and fair.

**When *not* to use:** to *generate* levels algorithmically, use `procedural-gen`
(authored and procedural design are complementary). For the engine's tile/grid
painting tools, use the Phaser `tilemaps` skill. For the movement
abilities the metrics come from, that's the engine movement skill + `input-systems`.

## Core workflow

1. **Derive metrics first.** Measure the character: max jump height and distance,
   run speed, reach, camera range. Every gap, ledge, and corridor is sized in
   these units. Lock them before building geometry.
2. **Blockout (whitebox/greybox).** Build the whole level from untextured
   primitives at correct scale. Validate flow, sightlines, and reachability while
   changes are cheap. No art yet. Tools: a plain grey tileset or
   `this.add.rectangle` blocks with static Arcade bodies for 2D, and
   `THREE.BoxGeometry` meshes for 3D.
3. **Define the critical path** (start → goal) and the **golden path** you expect
   most players to take. Layer optional/secret paths off it.
4. **Pace the experience.** Alternate tension and rest in a deliberate curve;
   don't run combat-combat-combat. Give the player room to breathe and to
   anticipate.
5. **Teach, then test.** Introduce each mechanic in a safe space, let the player
   practice, then test it under pressure. Difficulty rises in a sawtooth, not a
   straight line.
6. **Gate with intent.** Use locks/keys, abilities, and one-way drops to control
   order and pacing; guide with light, lines, and landmarks rather than walls.
7. **Playtest and iterate.** Run `gm run` and read the sheet. Fix the
   blockout; only dress when it plays well.

## Patterns

### 1. Player metrics drive every dimension

```ts
// Derive the metrics from the SAME constants the character controller uses, then
// size geometry in these units. If the jump changes, the numbers follow.
export const RUN_SPEED = 240;        // px/s (or m/s in 3D)
export const JUMP_VELOCITY = 420;    // initial upward speed of a full jump
export const GRAVITY = 980;          // px/s², the value the controller applies
export const MAX_JUMP_H = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);   // 90: peak height
export const AIR_TIME = (2 * JUMP_VELOCITY) / GRAVITY;   // ~0.86 s, take-off to same height
export const MAX_JUMP_DIST = RUN_SPEED * AIR_TIME;       // ~206: running jump, level ground
export const SAFE_GAP = MAX_JUMP_DIST * 0.7;    // comfortable, not pixel-perfect
export const HARD_GAP = MAX_JUMP_DIST * 0.95;   // a deliberate skill check
// Build platforms so required jumps use SAFE_GAP; reserve HARD_GAP for optional reward.
```

The formulas are the ideal arc. Variable jump height, a separate fall gravity,
air acceleration, the fixed physics step and the collider's width all move the
real numbers, and landing higher shortens the reach. Confirm them once in a
test room with a measured gap ladder, then treat the measured values as the
truth. A platform placed `MAX_JUMP_DIST + 1` away is impossible; one at
`SAFE_GAP` is fair. Keep these constants beside the level data so designers and
code agree.

### 2. Encounter / pacing as data (a tension timeline)

```ts
// Author the level as a sequence of beats with an intended intensity (0..1).
// This makes the pacing curve explicit and reviewable before you build rooms.
type Beat = { room: string; type: 'teach' | 'combat' | 'rest' | 'climax'; intensity: number };

export const BEATS: Beat[] = [
  { room: 'entry', type: 'teach', intensity: 0.1 },
  { room: 'hall_1', type: 'combat', intensity: 0.5 },
  { room: 'vista', type: 'rest', intensity: 0.1 },       // breather + reward
  { room: 'gauntlet', type: 'combat', intensity: 0.8 },
  { room: 'save_room', type: 'rest', intensity: 0.2 },   // before the boss
  { room: 'boss', type: 'climax', intensity: 1.0 },
];
// Read the intensity column top-to-bottom: it should rise overall but dip for rests
// (a sawtooth), never flatline high. Drive spawns/music intensity from this.
```

### 3. Gating and the critical path (a small graph)

```ts
// Model the level as rooms + gated connections. Validate that the goal is
// reachable with the keys/abilities the player can actually obtain in order.
type Exit = { to: string; needs?: string };
type Room = { exits: Exit[]; grants?: string };

export const ROOMS: Record<string, Room> = {
  entry: { exits: [{ to: 'hall_1' }] },
  hall_1: { exits: [{ to: 'vista', needs: 'double_jump' }, { to: 'side_room' }] },   // optional branch
  side_room: { exits: [{ to: 'hall_1' }], grants: 'double_jump' },
  vista: { exits: [{ to: 'boss', needs: 'red_key' }] },
};

// Grow the reachable set until nothing new opens: collect what each reached room
// grants, then follow every exit whose `needs` is already held. Assumes keys are
// never used up and doors never re-lock; model consumable keys as counts.
export function goalReachable(rooms: Record<string, Room>, start: string, goal: string): boolean {
  const have = new Set<string>();      // keys/abilities collected
  const reached = new Set([start]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const room of [...reached]) {
      const info = rooms[room] ?? { exits: [] };
      if (info.grants && !have.has(info.grants)) {
        have.add(info.grants);
        changed = true;
      }
      for (const exit of info.exits) {
        const open = !exit.needs || have.has(exit.needs);
        if (open && !reached.has(exit.to)) {
          reached.add(exit.to);
          changed = true;
        }
      }
    }
  }
  return reached.has(goal);
}
// goalReachable(ROOMS, 'entry', 'boss') is FALSE for the table above: no room
// grants 'red_key'. That is exactly the soft-lock this check exists to catch.
// Run it in a Vitest test whenever the room graph changes.
```

## Pitfalls

- **Dressing before it plays.** Detailing a blockout you haven't validated wastes
  the most expensive work on a layout you'll change. Greybox and test first.
- **Geometry that ignores metrics**: gaps the jump can't clear, ledges below
  reach, corridors narrower than the camera needs. Size everything in player units.
- **Flat pacing.** Wall-to-wall combat (or wall-to-wall calm) numbs the player.
  Alternate tension and rest; place a breather and a save before the climax.
- **Testing a mechanic before teaching it.** Players meet a hazard for the first
  time in a lethal spot. Introduce safely, let them practice, then test.
- **Soft-locks and dead ends.** A gate needs an ability/key obtainable only past
  the gate. Validate the critical path's key/ability order, not just connectivity.
- **No readability / guidance.** Players get lost when nothing draws the eye. Use
  light, leading lines, color, and landmarks to point toward the path.
- **One-way drops with no signposting** strand or surprise players. Telegraph
  irreversible moves.
- **Confusing procedural with authored.** Generation gives variety, not
  authored pacing. Use `procedural-gen` for variety; hand-author for intent.

## References

- `references/pacing-and-flow.md` — the difficulty/tension curve in depth,
  teaching-loop design (introduce→develop→twist→test), readability and guidance
  techniques, 2D vs 3D layout considerations, and a blockout review checklist.

## Related skills

- Phaser `tilemaps` (vendored) — paint 2D level grids.
- `procedural-gen` — generate variety to complement authored structure.
- `platformer` — the genre that composes this skill.
