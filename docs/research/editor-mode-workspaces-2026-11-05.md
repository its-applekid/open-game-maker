# Editor mode: game-owned workspaces, the editor steward, ask-an-agent

**Requirement source:** Kevin, 2026-11-04 (editor-mode vision, issue #507). **Access date:** 2026-11-05.
**Status:** Research proposal for discussion. Every shape below is a proposal; nothing here is an API decision and no
code changed in this ticket.

> Read with `docs/spec/release-plan.md` (V1 scope), `docs/research/v0.3/A4-engine-sdk-editor.md` §6–§7a (control and
> transaction model) and `docs/research/v0.4/B7-editor-sdk-input.md` §3 (mockup-to-contract mapping). The planning
> pack in `docs/plans/ogm-v1-build/` (on branch `research`) is frozen and is not edited by this ticket.

---

## 1. Requirement

Kevin's editor-mode vision has three touch points, and this design sits under the third while respecting the other
two:

| Touch point | Shape today | What this design changes |
|---|---|---|
| Creation conversation → Build Order | a scope chat produces a whole-game Build Order | each system ticket in the Build Order must also declare its editor surface, so a built system is editable on arrival |
| Editor chat → **one ticket** | `Ask for a change` opens the build-chat dock and files one edit job | unchanged; a per-control ask uses the same path with the control as context |
| Editor mode → knobs and direct tools | one flat Inspector list driven by `manifest.controls` | knobs get a small set of **game-owned workspaces**, safe ranges, presets, and an ask affordance on every control |

The ask, in Kevin's words: *design an editor description format each game system publishes (controls, editable
objects, tools), a small set of workspaces (World, Encounters, Loot, Sound, Look, Rules), an editor steward that merges
and retires controls as a game evolves, "ask an agent" on every control, presets and safe ranges.*

The problem this solves is real today: a game's `controls` array is one undifferentiated list. A six-system game
produces 60–120 controls in a single Inspector scroll, ordered by however the systems happened to be written, with no
statement of which system owns a knob, what a safe value is, or who to ask when a knob's meaning is unclear. Every
new build is also an uncontrolled rename/removal event for the creator's overrides.

---

## 2. What is already shipped (the design builds on it, not beside it)

| Piece | Where | What it already gives us |
|---|---|---|
| `ControlDecl` (`id`, `label`, `help`, `group`, `scope`, `path`, `widget`, `default`, `tier`) | `packages/contracts/src/game.ts` | the knob vocabulary and the dotted-id rule `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$` |
| `manifest.controls` + `manifest.overrides { aliases, retired, migrate }` | `packages/contracts/src/game.ts` | a place to publish the surface and to record continuity |
| Editor reads controls; Inspector renders scopes `global` / `instance` / `prefab` / selector | `apps/web/src/features/editor/Inspector.tsx`, `EditorChrome.tsx` | the per-scope labels (`Game`, `This <prefab>`, `All <prefab>s`, `Matching`) already exist |
| Palette categories carry `kind: 'items' \| 'tools' \| 'panel'` | `packages/contracts/src/game.ts`, `EditorChrome.tsx`, `Rail.tsx` | the rail is already the multi-surface selector B7 §3 asked for |
| Gizmos, tools, grid, placement validation | `GizmoOverlay.tsx`, `Tools.tsx`, `canvas.ts` | direct manipulation, workspace-agnostic |
| Transactions, undo/redo, one transaction per intent | `apps/web/src/features/editor/transactions.ts`, `packages/design-log` | presets and bulk edits are undoable for free |
| Override layer: `OverrideStatus` (`carried`/`renamed`/`needs_choice`/`conflict`/`dropped`), `ReapplyReport` buckets with reasons | `packages/contracts/src/design-log.ts`, `ReapplyCard.tsx` | the creator's edits already survive builds with named statuses |
| Conformance `C2` controls round-trip, `C9` override hints, `C10` entity ids | `packages/sdk-conformance/src/checks/` | continuity is already a *checked* invariant, not a hope |
| Pattern-card tunables with `range: [lo, hi]` and a `from:` rationale | `skills/gm-genre-platformer/references/cards/*.md` | the honest source of "safe range" and of the *why* |
| Build-chat edit job: one message → one ticket, `complexity: 2`, `kind: 'feature'` | `apps/web/src/features/build-chat/edit.ts` | the "one ticket" path exists, unmodified |
| `gm-editor-tuning` skill: tuneable ownership, `applyDesign` `'live'`/`'restart-scene'`, tune by outcome | `skills/gm-editor-tuning/SKILL.md` | the discipline the steward enforces mechanically |

Two consequences follow. First, the format must be an **extension** of `ControlDecl` and `palette.categories`, not a
second editor model. Second, the steward's job is mostly *bookkeeping plus validation* — the mechanisms it needs
(aliases, retirements, migrate hook, reapply statuses, C9/C10) all exist.

---

## 3. The editor description format

One new aggregate rides inside the `manifest` the existing `ready` bridge envelope already carries
(`packages/contracts/src/bridge.ts`), as `manifest.editor`. `gameManifestSchema` is a `looseObject`, so the envelope
shape does not change. Games declare it per system; the steward merges the per-system fragments (section 5).

### 3.1 Workspace

```ts
export type EditorWorkspaceDecl = {
  id: string; // 'loot' — stable, lowercase, matches the dotted control-id prefix
  label: string; // 'Loot'
  system: string; // 'loot' — the game system that owns and publishes this workspace
  kind: 'items' | 'panel'; // reuse of the existing palette category kind
  order: number; // rail order inside the game's own 1..6 budget
  sections: { id: string; label: string; controls: string[] }[]; // ordered control ids
  objects?: EditorObjectDecl[];
  presets?: EditorPresetDecl[];
  ask?: { prompt: string }; // one line, plain language, voice-readable
};
```

Rules:

- **W1.** `workspace.id` is the prefix of every control it owns (`loot.gold.chance` lives in `loot`). The Inspector
  can then derive the workspace without a second declaration, and a control declared with no matching workspace is a
  build failure, not an orphan row.
- **W2.** A workspace with no controls, objects or presets is not published — a game without a loot system has no Loot
  workspace. Empty surfaces are worse than absent ones.
- **W3.** A workspace is a *rail entry*, not a new panel: `kind: 'items'` renders the existing palette flow (World),
  `kind: 'panel'` renders the existing Inspector flow filtered to that workspace's sections (Encounters, Loot, Sound,
  Look, Rules). No new chrome, no new navigation.
- **W4.** At most six workspaces; at most one `items` workspace per game (placement is one mental model).
- **W5.** `sections[].controls` lists control ids in creator-facing order. `ControlDecl.group` stays for
  finer sub-headings inside a section and keeps working for games that never adopt workspaces.

### 3.2 Control additions

Two optional fields, both inside today's `looseObject` tolerance so existing games keep parsing:

```ts
export type ControlSafeRange = { min: number; max: number; why: string };
// added to ControlDecl:
//   workspace?: string;      // defaults to the id prefix (W1)
//   safe?: ControlSafeRange; // narrower than widget.min/max, justified in `why`
//   ask?: string[];          // curated starter questions, 0-3, plain language
```

- **K1.** `safe.min`/`safe.max` must sit inside the widget range. The widget range stays the *hard* bound the editor
  enforces (`Inspector`'s slider min/max); the safe range is advisory and explains itself.
- **K2.** `safe.why` quotes the pattern card or the design decision that produced it — the same `from:` line pattern
  cards already carry, so a knob never invents a rationale.
- **K3.** `ask[]` are seeds, not free text generated per build: "What does this do?", "Make it easier", "What breaks
  if I change this?". They become the per-control ask sheet (section 6).

### 3.3 Editable objects

```ts
export type EditorObjectDecl = {
  prefab: string; // 'treasure_chest'
  label: string; // 'Treasure chest'
  thumbnail?: string;
  gizmos?: ('translate' | 'rotateYaw' | 'elevate' | 'splinePoints')[];
  controls?: string[]; // instance/prefab-scope control ids this object shows first
};
```

Objects declare *identity and affordance* only. Which knob applies to which object is still decided by
`ControlDecl.scope` — one source of truth. The World workspace is the main consumer; Loot may list a chest prefab so
opening it shows the drop knobs immediately.

### 3.4 Presets

```ts
export type EditorPresetDecl = {
  id: string; // 'loot.generous'
  label: string; // 'Generous'
  help: string; // 'More gold, more often. Good for a short game.'
  values: Record<string, unknown>; // control id -> value
};
```

- **P1.** A preset is a bundle of ordinary `set` commands applied as **one transaction**, so one tap undoes it.
- **P2.** Every value must lie inside its control's `safe` range where one exists, and inside the widget range always.
- **P3.** A preset is game-owned data, never steward-invented. The steward may *report* that a preset no longer suits
  the current ranges; it may not pick new numbers.
- **P4.** Preset ids survive via the same alias/retire machinery as controls; a preset that references a dropped
  control fails the build until it is updated or retired.

### 3.5 Tools

The format adds no tools array, because the tools a workspace can offer are already game-owned. `manifest.tools`
names the tools the editor renders (`Tools.tsx`) and `manifest.gizmos[prefab]` names the gizmos each prefab exposes
(`GizmoOverlay.tsx`). A workspace selects among them with its `kind`: `items` gives the palette plus the `place` tool
(World), `panel` gives knobs only. An `EditorObjectDecl.gizmos` list narrows the manifest's set for one object and
defaults to `manifest.gizmos[prefab]` when omitted, so it is never a second declaration of the same fact. A workspace
that would need a *new* direct tool (a spawner brush, a chest tapper) is out of V1 — see Q5.

### 3.6 What the game still owns

Nothing above changes `applyDesign`: the game still returns `'live'` or `'restart-scene'` per transaction, and a
preset that touches structural knobs is one `'restart-scene'` transaction, not several. `gm-editor-tuning`'s rule
stands — prove one live control and one structural control, asserting both the runtime value and the exact result
string.

---

## 4. The six workspaces

Each row is a workspace a game may publish. "Stays agent-only" is deliberate: not everything a system knows is a
knob.

| Workspace | Owner system | Knobs (examples) | Stays agent-only |
|---|---|---|---|
| **World** | level/world | level width and length, spawn point, palette of placeable prefabs, camera framing, grid size | map painting, tile sets, multi-room topology |
| **Encounters** | encounters | which enemies appear, how many per wave, spacing between waves, aggression, elite chance, difficulty curve | wave scripting, boss choreography, new enemy behaviours |
| **Loot** | loot | drop chance per tier, gold per drop, item weight, rarity bias, chest refill | new item types, new economy rules, crafting recipes |
| **Sound** | audio | music per state (explore/fight/win), sfx level, voice-line level | new music sourcing, adaptive-music layering |
| **Look** | rendering | palette variant, light level, fog density, outline strength, particle amount | new art, new materials, new asset variants |
| **Rules** | rules | lives, round timer, score target, friendly fire, respawn delay, win/lose thresholds | new win conditions, new scoring rules |

Notes that matter for the prototype pair:

- **Encounters** is mostly numbers with a strong "feel" component, so it is the best first proof that a workspace can
  carry a safe range and a preset ("Gentle", "Standard", "Brutal") that a creator can feel inside one play session.
- **Loot** is where a change is least visible immediately (drop chance), so it proves the *ask* path: the creator
  needs an explanation more than a control. It is also the workspace whose presets are most likely to be re-tuned by
  a later build, which exercises the steward.
- The pair is deliberately one `panel`-heavy workspace with a numeric feel (Encounters) and one with delayed,
  statistical feedback (Loot). Together they cover the two failure modes: "I cannot tell what this did" and "I want
  to know why before I touch it".

---

## 5. The editor steward

### 5.1 Inputs and outputs

- **Inputs:** the previous published build's `manifest.editor` + `manifest.overrides`, and the new build's per-system
  fragments (`EditorWorkspaceDecl[]`, `ControlDecl[]`).
- **Outputs:** `manifest.editor` (merged, ordered, validated), `manifest.overrides` (aliases, retired, migrate), and a
  human-readable `editor-report.json` next to the build artifacts: kept, renamed, retired, migrated, and any knob whose
  safe range moved.
- **Never:** touches gameplay values, defaults, ranges outside the declared safe range, or another system's workspace.

### 5.2 Merge and retire rules

| Situation | Steward action | What the creator sees |
|---|---|---|
| control id unchanged | keep, re-resolve scope and path | override `carried` |
| id present, widget/label/range changed compatibly | keep, update declaration | override `carried`, plus a note when the new value leaves the safe range |
| id renamed by the system | record `aliases[old] = new` | override `renamed` |
| id genuinely gone | record `retired`, with `reason` and `replacedBy` | override `dropped` with reason `control_removed`, or the ReapplyCard's `needs_choice` when a value cannot be mapped |
| widget kind changed (slider → choice) | require `overrides.migrate` + `migrateOverride` | override `dropped` on failure, never silently coerced |
| section or workspace removed | retire its controls; drop the workspace | rail entry disappears; overrides follow their controls |
| two systems declare one control id | build failure | the build does not publish; the systems must agree |

Retirement records the build and a plain-language reason, so the reapply card can say *"Gold per drop went away because
the Loot system now uses drop weights"* rather than *"3 edits were dropped"*.

### 5.3 Validation (extends the conformance suite)

Existing: `C2` (every control accepts its min, max and default and reverts byte-equal), `C9` (previous control ids
resolve via kept/alias/retired; `overrides.migrate` names a real hook), `C10` (entity ids survive unless retired).

New, in the same suite and the same report format:

- **C12 workspace-shape** — every control resolves to exactly one published workspace; every section control id
  exists; at most six workspaces and at most one `items` workspace; no empty workspace.
- **C13 safe-ranges** — `safe` sits inside the widget range, `safe.why` is non-empty, and a preset value is inside
  both.
- **C14 ask-coverage** — every `advanced`-tier control and every control whose widget is a `slider` or `rule` carries
  `help` or a non-empty `ask[]` (a knob nobody can explain is a knob nobody should ship).

All three are static manifest checks; none needs a running game, so they cost milliseconds in the build gate.

### 5.4 Where it runs

`gm editor steward` as a new directory-scanned `gm` command (no registry edit, per the architecture's command-scan
rule), invoked by `gm build` before `dist/` is written and by `gm check` in CI. It is deterministic and has no model
call: agents author declarations in each system's source, the steward only merges, validates and writes. A failing
steward run fails the build the same way an invalid `manifest.json` does today
(`packages/gm-cli/src/commands/build/index.ts`).

### 5.5 How creator edits survive

The steward's output is exactly the input the override layer already consumes:

1. a renamed control arrives as `aliases` → existing reapply marks the override `renamed`;
2. a retired control arrives in `retired` → override `dropped` with `reason: 'control_removed'`;
3. a value now outside the new safe range stays `carried` — nothing about it is dropped — and the editor's
   once-per-control safe-range line (§7) tells the creator the value left the band, so they decide;
4. a widget-type change without `migrateOverride` fails C9 before publish.

No new statuses, no new screens: the first, second and fourth cases are statuses `ReapplyCard` already renders, and the
third is a line the editor already draws under a slider.

---

## 6. Ask an agent, on every control

### 6.1 The affordance

The control heading in the Inspector gains an ask affordance that follows the pattern the editor already ships: the
`Ask for a change` button in `PlayEditBar` opens the build-chat dock (`useDock.startEdit`). The per-control version
opens the same dock with `EditDraft` carrying a control context — same component, same flow, no new panel, no new
modal. If the prototype's editor chrome has no room for a per-control affordance at phone width, the fallback ships
the *same* behaviour from the existing Ask button, scoped to the selected control: the ticket's ask is satisfied and
the design keeps its no-new-chrome promise.

### 6.2 Context packet

The seed is a structured block the agent receives with the message, not prose the creator must write:

```json
{
  "workspace": { "id": "loot", "label": "Loot" },
  "control": {
    "id": "loot.gold.dropChance",
    "label": "Gold drop chance",
    "help": "How often a defeated enemy leaves gold.",
    "scope": "global",
    "value": 0.4,
    "widget": { "kind": "slider", "min": 0, "max": 1, "step": 0.05, "unit": "×" },
    "safe": { "min": 0.25, "max": 0.6, "why": "below 0.25 the fight loop stops paying for itself" }
  },
  "recentTransaction": "Gold drop chance 0.55 → 0.40"
}
```

`value`, `safe.why` and `recentTransaction` are the three facts that make an answer specific instead of generic. The
packet is data about the creator's own game; it carries no credentials, no host, and no player identity beyond the
requesting actor.

### 6.3 What an answer does

Unchanged: the message becomes **one** edit job through `editJobRequest` (one ticket, `kind: 'feature'`,
`complexity: 2`). A suggestion that is a plain value change still goes through the chat by design — the creator asked
a question, so the reply belongs in the conversation, and the agent may answer "set it to 0.3" without a job at all.
Nothing in this design lets a control ask bypass admission, budgets or the publish gate.

### 6.4 Guardrails

- An ask is scoped to one control and its workspace; it cannot publish, roll back or spend.
- `ask[]` seeds are plain language, voice-readable, and never carry numbers the design has not chosen.
- The reply is text-first: an agent may change the design through a job, but it never edits values behind the
  creator's back inside the same turn the creator is dragging a knob.

---

## 7. Presets and safe ranges

- **Where ranges come from.** `widget.min/max` is what the game can survive; `safe.min/max` is what the design
  believes in, quoted from the pattern card's `tunables[].range` and its `from:` line. `gm editor steward` refuses a
  `safe` range that is not inside the widget range and a `safe.why` that is empty.
- **How a creator meets them.** The slider keeps its full widget range — a creator can always go outside the safe
  band — but the band is drawn inside the track and the first time a value leaves it, one plain line appears under the
  control ("Outside the comfortable range: below 0.25 gold stops paying for the fight"). No clamping, no blocking: the
  creator owns their game.
- **Presets are the fast path.** "Generous / Standard / Scarce" for Loot, "Gentle / Standard / Brutal" for Encounters:
  each is one transaction, each is inside the safe band, each is explained in one line. Presets exist so the common
  case never requires understanding a number.
- **Presets age.** When a build moves a safe range, the steward reports a preset whose values no longer fit rather than
  rewriting it, and the preset is marked in the editor as needing an update until the owning system fixes it.

---

## 8. Effect on the three touch points

1. **Creation → Build Order.** The Build Order's per-system tickets gain one requirement: declare your workspace
   (controls, objects, tools, presets) or state in one line why the system has none. The planner can then budget
   editor work per system instead of discovering it at the end.
2. **Editor chat → one ticket.** Unchanged mechanically. The per-control ask only improves what the ticket contains.
3. **Editor mode → knobs and direct tools.** Unchanged interaction model. The Creator sees at most six rail entries
   instead of one list of a hundred rows, and each row states what it is safe to change.

---

## 9. What V1 needs, and what is deferred

**V1 (the prototype pair only):**

- the `EditorWorkspaceDecl` shape and `manifest.editor` publication for two systems (encounters, loot);
- `workspace`, `safe` and `ask` on `ControlDecl`, validated by C12–C14;
- `gm editor steward` merge/retire for those two systems, writing `manifest.overrides` and `editor-report.json`;
- rail rendering for `kind: 'panel'` workspaces (filtered Inspector sections), no new chrome;
- presets as one-transaction bundles, one per workspace in the prototype;
- the per-control ask seed and context packet.

**Deferred:** the other four workspaces; object thumbnails rendered per workspace; steward-proposed safe ranges; any
steward autonomy beyond merge/retire/validate; per-workspace permissions.

---

## 10. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Rail crowding on a phone | six entries plus palette at 390px is tight | hard cap of six, one `items` workspace only, measure at phone width before the second workspace lands |
| Control-count explosion | every system wants 20 knobs | `tier: 'advanced'` collapses the long tail; C12 can hold a per-workspace budget once the first game exists |
| Safe ranges becoming a second source of truth | two numbers that disagree confuse a creator | `safe` must be inside the widget range (C13) and must quote a pattern card; the steward never invents one |
| Steward silently changing gameplay | a merge bug in a knob is a bug in the game | the steward writes declarations only, and every apply still round-trips through C2 |
| Ask-an-agent cost | 100 controls × curious clicking is 100 tickets | asks are single control scoped, admitted through the normal budget, and unanswered asks cost nothing |
| The format arriving before a game exists | a contract with no consumer drifts | prototype is gated on the first game that has both systems (see the plan's phase 0) |

---

## 11. Open questions for Kevin

Discussion stays open on this ticket; these are the choices that change product feel, not engineering detail. Each has
a recommendation, so the prototype can start on the recommended answer.

- **Q1. Empty workspaces.** Show all six with empty states, or only the ones the game has?
  *Recommend: only the ones the game has.* An empty Loot tab on a game with no items is a promise the game will never
  keep.
- **Q2. Presets.** Game-owned only, or may the steward propose new presets from a pattern card?
  *Recommend: game-owned only for V1.* A preset is a design opinion, and the steward's authority is bookkeeping.
- **Q3. Ask-an-agent entry.** Per-control affordance in the Inspector, or the existing Ask button with the selected
  control as context?
  *Recommend: per-control if it fits at phone width; otherwise the existing Ask button.* Same behaviour, no new chrome.
- **Q4. Outside the safe range.** Warn once, warn every time, or clamp?
  *Recommend: warn once per control per session, never clamp.*
- **Q5. Direct tools per workspace.** Should Encounters and Loot ever gain placement tools (drag a spawner, tap a
  chest), or stay knob-only in V1?
  *Recommend: knob-only in V1.* Placement stays in World; a spawner is an object in World with the encounter knobs
  attached.

---

## 12. Sources

- Issue #507 (Kevin's 2026-11-04 editor-mode vision).
- `docs/plans/ogm-v1-build/architecture.md` §2–§6 (packages, hot write surfaces), `decisions.md` (D-WRITE-SURFACES).
- `docs/research/v0.3/A4-engine-sdk-editor.md` §5–§7a (capabilities, `ControlDecl`, transactions, overrides).
- `docs/research/v0.4/B7-editor-sdk-input.md` §2–§4 (what was dropped, mockup-to-contract map, override model).
- `docs/reference/editor-mockups/README.md` and the two mockup frames (category rail with items/tools/panel kinds).
- Shipped code as listed in section 2, read at `main` on 2026-11-05.
