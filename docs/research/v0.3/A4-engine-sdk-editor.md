# A4 — Engine SDK, agent-defined editor, cross-device input, extensible game architecture

**Spikes:** R01 (SDK boundaries and game contract), R02 (agent-defined editor and natural-language control execution), R13 (cross-device presentation and input), S01 (software engineering), S11 (extensible game architecture).
**Access date for all sources:** 2026-10-21.
**Status:** Research proposal. All interfaces below are **illustrative**, not selected APIs. Saves, releases, achievements, analytics and rewind are covered by a sibling report. This report defines only the **hook points** those systems plug into.

> **Version scope (2026-10-25):** The SDK, trust boundary, capability map, editor and undo model, overrides (§7a), NL routing, extensible architecture and cross-device input are **V1**. The `rewind` and `multiplayer` capabilities, and collaborative editing (Yjs/Automerge), are **V2**. Adult approval of a child's capability request and child-authored text handling are **V3**, tagged inline.
> The kid-first framing is superseded: V1 is for adult creators (18+). "Kid-readable" and "child-facing" now read as plain-language and beginner-facing.
> Superseded in part by **B7** (input: mouse/keyboard, touch and controllers; palette rail, gizmos, placement validity, override handoff and the user-text options) and **B14** (sourcing the `gm-editor-sdk` skill; `gm-verify` built on `develop-web-game`). Repo visibility is now the creator's own public/private choice (decision log).
> Canonical scope: `docs/spec/release-plan.md`.

---

## 1. Requirement (traced)

- §3.3: the platform standardizes responsibilities and APIs. Games supply mechanics, data, editor declarations, state serialization and achievement definitions. The platform must not hard-code one universal property list.
- §5.6: every game has an agent-defined, "thoughtfully comprehensive" editing surface inside a consistent framework. That includes direct manipulation, panels and a microphone. Anything natural language can do must also be possible by hand. Undo needs an explicit transaction model. Draft hot reload is not the same as forcing an update on published sessions.
- §5.11: pause, saves, achievements, settings and game info belong to the platform HUD. Opt-outs are allowed.
- §7.2 and §7.5: a formal SDK capability map, versioning policy, trust boundary and lifecycle contracts. Graceful behavior when a capability is disabled. The debug interface is controlled, not a bare `window.__game`.
- R13: the platform handles aspect ratio, orientation, touch, reading size and safe play for non-responsive games. The game remains responsible for actually being designed for small screens.
- S11: lighter follow-up agents must be able to modify a game safely.

## 2. Verified versions and licenses

All figures below come from `npm view` and `gh api` on 2026-10-21.

| Package | Version | License | Stars | Last push / publish | Use here |
|---|---|---|---|---|---|
| phaser | **4.2.1** (4.0.0 stable shipped 2026-04-10; 4.1.0 on 04-30; 4.2.0 on 06-19; 4.2.1 on 07-09) | MIT | 40.5k | 2026-08-21 | 2D engine. Phaser 4 is **released and stable**, not a release candidate. |
| three | **0.186.1** (r186, 2026-09-24) | MIT | 116.7k | daily | 3D engine |
| zod | **4.6.7** | MIT | 44.2k | 2026-10-19 | Manifest and message schemas. Zod 4 has built-in `toJSONSchema` (verified in the package `.d.ts`), so `zod-to-json-schema` is unnecessary. |
| immer | **11.2.7** | MIT | 29.0k | 2026-10-21 | Patch and inverse-patch undo |
| mutative | 2.0.0 | MIT | 2.0k | 2026-10-14 | Faster Immer-compatible alternative. Only if profiling demands it. |
| valibot | 1.5.0 | MIT | 9.0k | active | Smaller alternative to Zod. Not needed. |
| @standard-schema/spec | 1.1.0 | MIT | 3.7k | active | Keeps validators swappable |
| vite | **8.3.5** | MIT | 83.4k | daily | Build and HMR |
| tweakpane | 4.0.5 (last npm publish 2024-11) | MIT | 4.6k | 2026-03 | Developer-only debug panel; **not** the creator-facing editor |
| leva | 0.10.1 | MIT | 6.3k | 2025-11 | React-only, pre-1.0. Reject for the creator UI. |
| lil-gui | 0.21.0 | MIT | 1.65k | 2025-10 | Debug only |
| nipplejs | 1.0.4 | MIT | 1.95k | 2026-05 | Virtual joystick |
| comlink | 4.4.2 (last npm 2024-11) | Apache-2.0 | 12.8k | 2026-10 | RPC over postMessage. Not recommended at the trust boundary (§4). |
| penpal | 8.0.1 | MIT | 567 (**below the 1k rule**) | 2026-08 | Reject under the §3.4 rule |
| bitECS / miniplex / koota | — | MPL-2.0 / MIT / ISC | 1.5k / 1.1k / 0.76k | — | ECS options (Alternative C) |
| @modelcontextprotocol/sdk | 1.32.1 | MIT | — | 2026-10 | Optional transport for exposing the manifest as tools |

Phaser 4 includes Scale Manager modes `FIT`, `ENVELOP`, `RESIZE` and `EXPAND`, `DataManager` `changedata-<key>` events, and a `VisibilityHandler`. All were verified in the 4.2.1 source.

## 3. Prior art: what transfers

| System | Mechanism | Lesson for Game Maker |
|---|---|---|
| **Godot** `@export`, `@export_range`, `@export_enum`, `@export_group`, `@export_tool_button`, `@tool` (docs fetched) | The script declares which fields the inspector shows, with hints. `@export_storage` persists a field without showing it. | Declarations live **next to the code that uses them**. Hints such as range, step, enum and group are a small vocabulary that covers most needs. "Persist but don't show" is a distinct flag. Tool buttons are commands, not just properties. |
| **Unity** `[SerializeField]`, `[Range]`, `[Header]`, `[Tooltip]`, PropertyDrawers, `Undo.RecordObject` (from documentation knowledge, not re-fetched) | Opt-in serialization, attribute-driven widgets, custom drawers for unusual types, explicit undo recording | Exposure is opt-in. Undo is **explicitly recorded**, never automatic. Custom drawers are the escape hatch for rich types. |
| **Roblox** Attributes, CollectionService tags, ChangeHistoryService (`TryBeginRecording`/`FinishRecording`/`SetWaypoint`, docs fetched) | Typed key/value data on any instance. Tags select groups. Undo is recorded as named transactions. | This is the closest analogue to "make all enemies blue": **tags as selectors**, typed attributes as controls, **named recording transactions**. Copy this model. |
| **Construct 3** behaviors | Reusable attachable logic with its own properties panel | A feature module = behavior + properties. This maps onto the "feature module" pattern (§10). |
| **Mario Maker / Game Builder Garage / Dreams** | Fixed part palettes with modifiers. Nodons have settings panels. Dreams' "tweak" menus and scope-in. | The beginner-facing UX is **place, select, tweak**. A few big obvious widgets beat a dense inspector. Mario Maker shows that a narrow palette caps game range. The spec forbids that ceiling, so the vocabulary is shared but **declarations are per game**. |
| **Scratch** | Sprites with per-sprite variables; everything visible and manipulable | Selection is per object, and the inspector shows the selected thing's controls. |
| **Core (Manticore, closed 2023)** | Script "custom properties" exposed on templates in the editor | Same pattern as Godot. The platform shut down, so there is no reuse. |
| **Immer patches** (docs fetched) | `produceWithPatches` → `[next, patches, inversePatches]`. Paths are arrays and the format is close to RFC 6902. Patches are correct but **not minimal**. | Undo and redo come almost for free on a **JSON document**, but only for state that lives in that document. |
| **Vite HMR** (`import.meta.hot.accept/dispose/data`) | Module-level hot-swap boundaries | Fine for creator drafts on **data and leaf modules**. Unsafe for arbitrary sim code with live closures. A full scene restart from the design doc plus a snapshot is the reliable boundary (§9). |
| **Tweakpane / Leva / lil-gui** | Developer tweak panels | Good evidence for widget vocabulary. Wrong audience and wrong touch targets for beginners, and Leva is React-only and pre-1.0. Build platform widgets. Keep Tweakpane as an optional `?debug` panel for agents and Kevin. |

## 4. Trust boundary

```text
 platform origin (gamemaker.app)                      game origin (games-usercontent.app, per-build path)
┌──────────────────────────────────────┐            ┌─────────────────────────────────────────┐
│ Platform UI (HUD, editor chrome,     │            │ <iframe sandbox="allow-scripts           │
│ widgets, mic, save slots, auth)      │            │   allow-same-origin"* allow="gamepad;    │
│                                      │  MessageChannel port (transferred once on handshake)│
│  HostBridge ──── validate(Zod) ◄─────┼────────────┼──── GameSDK (bundled, pinned version)    │
│   • origin + source check on hello   │  JSON msgs │   • validate(Zod) host→game msgs         │
│   • per-message schema + size cap    │  {v,id,t,  │   • game code: Phaser / Three.js         │
│   • capability allowlist per session │   payload} │   • no tokens, no mic, no account data   │
│   • rate limit (e.g. 120 msg/s)      │            │                                         │
│   • role check BEFORE command apply  │            │                                         │
│                                      │            └─────────────────────────────────────────┘
│  Platform API client (auth cookie)───┼──► Railway API (saves, releases, jobs → aiur)
└──────────────────────────────────────┘
 * allow-same-origin is acceptable ONLY because the game origin is a different registrable domain with no
   cookies. Without that, use sandbox="allow-scripts" only (origin "null").
```

Rules:

1. **The game never holds credentials, the microphone or account data.** Voice capture, speech-to-text and the routing agent all run on the platform side. The game receives only resolved commands. This sidesteps iframe microphone permission problems entirely.
2. **The host treats every inbound message as untrusted.** It parses against a discriminated-union Zod schema, caps the size (e.g. 256 KB, larger for save blobs routed straight to the API), and drops unknown `t` values. A game can *request* `save.write` but cannot address another user's slot. The host fills in the identity.
3. **Commands are authorized on the host before they are forwarded.** The game applies a command only when the host sends it. The game's manifest is *data the host renders*. It is validated and its strings are rendered as text, never as HTML, so a malicious manifest cannot inject UI.
4. **The debug adapter** (`state`, `seed`, `step`, `input`; the old `window.__game` idea) exists only in draft and test builds. It is reachable through the bridge for Playwright when a test-only capability token is granted. It is not exposed globally in published builds.
5. **Transport:** hand-write roughly 150 lines: `postMessage` hello with an origin check, transfer of a `MessageChannel` port, request/response correlation by `id`. Comlink proxies arbitrary calls, which is the wrong shape for a validated allowlist. Penpal fails the stars rule. Make this a small **reusable package** (§12).
6. **Unverified:** the `allow="gamepad"` Permissions Policy on iPadOS Safari; Fullscreen API on iPad versus iPhone (iPhone Safari historically lacks element fullscreen); audio unlock inside a cross-origin iframe on iOS. These need a 1-day device spike on a real iPad.

## 5. SDK capability map

Rule: **a game declares capabilities in its manifest. The host negotiates them at handshake. Missing or disabled capabilities must leave a playable game.** Unknown capability IDs are ignored. This is the same rule `aiur/packages/aiur-contracts` already uses ("clients ignore unknown IDs and additive fields; a breaking change adds v2 beside v1"). Reuse that convention.

| Capability | Req? | Game supplies | Platform supplies | If disabled or unavailable |
|---|---|---|---|---|
| `core.lifecycle` (mount, start, pause, resume, dispose) | **Required** | Honors pause within 1 frame and stops audio and timers | HUD pause, visibility/blur auto-pause, edit-toggle pause | n/a. Conformance fails and the build cannot publish. |
| `core.manifest` (id, sdk range, title, inputs, presentation) | **Required** | Static JSON plus Zod-validated metadata | Validation, game-info UI | n/a |
| `input.actions` | **Required** | Named actions (`jump`, `move`, `interact`) and their meaning | Keyboard, touch overlay and later gamepad mapping, remapping UI | n/a |
| `presentation` | **Required** (declaration only) | Orientation, min logical size, `responsive \| fixed` | Letterboxing, safe areas, rotate prompt, text scale | `fixed` → letterbox plus a "best on bigger screen" badge |
| `editor.design` (design doc + controls + commands) | **Required for creator-editable games** | Schema, controls, command handlers, `applyDesign` | Widgets, selection, undo, NL routing, persistence of the doc | Edit toggle shows game info and "ask for controls" only |
| `editor.manipulate` (pick, drag, place, delete) | Optional (expected for level games) | Hit-testing, world↔screen mapping, placement rules | Gesture recognition, handles, snapping UI | Panel-only editing |
| `state.serialize` / `restore` | **Required unless the manifest says `saves:false`** (e.g. a stateless toy) | Logical state → JSON with `saveSchemaVersion` | Slots, cloud, transfer (sibling report) | Save UI hidden; resume on another device restarts the level |
| `state.migrate` (previous release only) | Required when `saveSchemaVersion` changes | One `migrate(prev)` function plus fixtures | Orchestration, warnings | Old saves marked unsupported, never silently loaded |
| `achievements` | Optional | Definitions plus `sdk.events.emit('achievement', id)` conditions | Catalog, storage, UI | Emits become no-ops; the HUD tab is hidden |
| `analytics.events` | Optional | Genre events (`level_complete`) | Transport, sampling, dashboards | No-op |
| `audio` | Optional | Sound assets and buses (`music`, `sfx`, `voice`) | Master volume, mute, captions channel | Game uses its own audio but must obey `mute` and `volume` events |
| `rewind` | Optional (later) | `snapshot()` / `restoreSnapshot()` cheap enough to call every N frames | Ring buffer and UI | Hidden |
| `multiplayer` | Optional (later) | Shared-sim contract | Rooms, identity | Single-player only |
| `debug` | **Required in draft/test builds** | `getState`, `setSeed`, `step(n)`, `inject(action)` | Playwright harness, bug bundle | Stripped from published builds |
| `hud.optOut` | Optional | e.g. `["achievements"]` | Consistent omission | **Cannot opt out:** pause, exit, report-bug, settings/mute, safety and account controls (proposal; Kevin decides, §14). |

## 6. Illustrative TypeScript (ILLUSTRATIVE, not an API decision)

```ts
// ILLUSTRATIVE ONLY
import { z } from "zod";

export const sdkProtocol = 1;               // wire-protocol major; separate from the npm version

export interface GameModule<D, S> {
  manifest: GameManifest;                    // static, also emitted to manifest.json at build
  designSchema: z.ZodType<D>;                // the editable "design document"
  controls: ControlDecl<D>[];                // what the editor shows
  commands?: CommandDecl<D, any>[];          // non-property operations (spawn, rule cards…)
  mount(host: HostApi, design: D, save?: S): Promise<GameInstance<D, S>>;
}

export interface GameInstance<D, S> {
  pause(): void; resume(): void; dispose(): void;
  applyDesign(next: D, patches: Patch[]): "live" | "restart-scene"; // game picks the reload boundary
  serialize?(): { saveSchemaVersion: number; data: S };
  pick?(screen: { x: number; y: number }): TargetRef[];             // editor.manipulate
  worldToScreen?(t: TargetRef): { x: number; y: number } | null;
  debug?: DebugAdapter;                                             // stripped in published builds
}

export interface HostApi {
  capabilities: ReadonlySet<string>;          // negotiated; check before optional calls
  input: { on(action: string, cb: (v: ActionValue) => void): () => void };
  viewport: { onChange(cb: (v: Viewport) => void): () => void; current(): Viewport };
  events: { emit(kind: "achievement" | "analytics" | "checkpoint", payload: unknown): void }; // no-op if disabled
  settings: { onChange(cb: (s: PlayerSettings) => void): () => void }; // mute, textScale, reduceMotion
}

// ---- Control manifest ----
export type ControlDecl<D> = {
  id: string;                       // stable forever: "enemy.color". Renames need an alias entry.
  label: string; icon?: string; help?: string;  // icon/help are plain-language, voice-readable
  group?: string;                   // "Enemies", "Physics"
  scope: "global" | { selector: Selector };     // which targets it applies to
  path: string;                     // JSON pointer into design doc, relative to each target: "/color"
  widget: Widget;                   // shared vocabulary below
  default: unknown;                 // "reset to default"
  tier?: "basic" | "advanced";      // progressive disclosure for beginners
  aliases?: string[];               // NL hints: ["colour","paint"]
};

export type Widget =
  | { kind: "slider"; min: number; max: number; step?: number; unit?: string }
  | { kind: "toggle" } | { kind: "choice"; options: { value: string; label: string; icon?: string }[] }
  | { kind: "color"; palette?: string[] } | { kind: "count"; min: number; max: number }
  | { kind: "text"; maxLength: number }        // dialogue lines; passes the content filter on the host
  | { kind: "place"; prefab: string }          // drag-to-place palette entry
  | { kind: "path" } | { kind: "tilemap"; tileset: string }
  | { kind: "rule"; template: string; slots: Record<string, Widget> } // "When [player] touches [coin], [score +1]"
  | { kind: "custom"; renderer: "game-overlay"; id: string };          // escape hatch, rendered in-iframe

export type Selector = { tag?: string; prefab?: string; ids?: string[]; where?: Record<string, unknown> };

// ---- Commands & transactions ----
export type EditorCommand =
  | { op: "set"; control: string; targets: Selector | "global"; value: unknown }
  | { op: "invoke"; command: string; args: unknown; targets?: Selector }
  | { op: "reset"; control: string; targets: Selector | "global" };

export type Transaction = {
  id: string; label: string;                 // "Make all enemies blue"
  origin: "manual" | "voice" | "text" | "agent";
  commands: EditorCommand[];
  patches: Patch[]; inverse: Patch[];        // Immer, computed on the host against the design doc
  baseRev: number;                           // optimistic concurrency (multi-editor later)
};
```

**Key design decision:** editor state is a **design document**: plain JSON for levels, entity placements, tunables, dialogue and rules, validated by `designSchema`. It is owned and diffed by the **host**. The game *reads* it. It is **not** runtime simulation state. This one choice is what makes undo, persistence, NL batch edits, forks and draft-vs-published comparisons deterministic and agent-free.

## 7. Command manifest and undo transaction model

1. **Apply:** a widget, gesture or agent produces `EditorCommand[]`. The host resolves selectors against the doc, validates each value against the control's widget constraints *and* `designSchema`, then runs `produceWithPatches` → `{next, patches, inverse}`. The game receives `applyDesign(next, patches)`. The game returns `live` (it mutated running objects) or `restart-scene` (the host re-mounts the scene from the doc and keeps play state only when the game opts in).
2. **One transaction per user intent.** A drag is one transaction, coalescing pointer-move patches until pointer-up. This mirrors Roblox `TryBeginRecording`/`FinishRecording`. A slider scrub is one transaction. An NL request is **one** transaction even when it touches 40 enemies, so one tap undoes it.
3. **Undo stack** = `Transaction[]` with a cursor. Undo applies `inverse`; redo re-applies `patches`. Cap it at about 200 entries per session. Persist the doc, not the stack. Optionally persist the last 20 transactions with the draft so undo survives reload.
4. **Scope of undo:** design doc only. Play-mode progress, saves and published releases are **outside** editor undo. Releases have their own rollback (sibling report). The UI must say so: "Undo changes your game's design, not your progress."
5. **Validation failure** → the whole transaction is rejected and nothing partial is applied. The message is plain-language ("Speed can be 1–10").
6. **Persistence (revised for Kevin's 2026-10-21 decision, see §7a):** the *base* doc lives in the game repo (`design/*.json`) and ships with each build. Creator edits are **not** commits. Each transaction writes immediately to a **database override layer**, so edits survive while a coding job is building and get re-applied to the next build. Overrides are folded into source only at Publish. No agent, no tokens. Transaction labels feed changelog inputs.
7. **Reset to default** is an ordinary `reset` command, so it is also undoable.
8. **Code changes** made by agents are *not* in the undo stack. They become a new draft build. "Undo" for code is draft version history (the release report covers this).
9. **Caveat:** Immer patches are correct but not minimal. Array index paths shift under concurrent edits, so entities need **stable IDs as map keys**, not array positions (`entities: Record<id, Entity>`). Collaborative or multiplayer editing later probably wants Yjs or Automerge instead. Not MVP.

## 7a. Editor overrides across builds (Kevin's decision, 2026-10-21)

**Decision being designed for:** while a coding job is queued or building, the creator keeps playing *and editing* the current draft. Those manual edits must carry into the next build. New builds may invalidate some edits. The creator always has both the newest build and the latest published release available until they choose and Publish.

**Where overrides live: database, not source.** Effective design = `baseDoc(build) ⊕ overrides(game, draft lane)`.
- The base doc is immutable per build: source, Git, agent-authored.
- Overrides are mutable creator data in the backend.
- Writing source during a build would race the coding agent's branch and would need a rebuild for every slider nudge. The DB layer avoids both.

Illustrative records (ILLUSTRATIVE, not a schema decision):

```ts
// ILLUSTRATIVE ONLY
type OverrideEntry = {
  gameId: string; lane: "draft";            // published releases hold frozen snapshots, never live overrides
  key: string;                               // `${controlId}@${targetId|"global"}`, unique per lane
  controlId: string;                         // stable manifest id, e.g. "enemy.color"
  targetId: string | "global";               // stable entity id from the design doc
  value: unknown;
  baseValueAtEdit: unknown;                  // base value the creator was overriding (conflict detection)
  baseBuildId: string;                       // build the edit was made against
  origin: "manual" | "voice" | "text";
  rev: number; updatedBy: string; updatedAt: string; // optimistic concurrency across the creator's devices
};
type EntityOverride =                       // structural edits from place/delete tools
  | { kind: "create"; entityId: string /* host-minted "ov_…" */; parent: string /* levelId */; prefab: string; props: Record<string, unknown> }
  | { kind: "delete"; entityId: string };   // tombstone for a base entity
type ReapplyReport = { buildId: string; carried: string[]; adjusted: Item[]; conflicts: Item[]; dropped: Item[] };
```

**Keyed by resolved targets, not by the original sentence.**
- "Make all enemies blue" is stored as 12 entries, `enemy.color@<id>`, one per enemy that existed.
- The transaction label is kept for display.
- Proposal: do **not** auto-apply a past selector edit to enemies a later build adds. That is predictable and easy to explain ("you changed these 12").
- Kevin can choose "sticky" selector edits instead (§21).

**Re-application to a new build.** This is deterministic host code, run when the creator switches to the new build:
1. Load the new build's manifest and base doc. The manifest may carry agent-supplied **override hints**:
   - `aliases: {"enemy.tint": "enemy.color"}` for renamed controls;
   - `retired: ["bat.wingFlaps"]` for removed controls;
   - an optional pure `migrateOverride(controlId, value) → value | drop` for unit or shape changes, covered by `gm-sdk check` fixtures.
   The feature handoff contract (§10.2) makes these hints mandatory whenever a control is renamed or removed.
2. Apply entity creates first, then deletes, then property sets, in stable key order.
3. Classify each entry:

| Case | Detection | Default handling |
|---|---|---|
| Carried | Control and target exist; value passes the new widget validation | Applied silently |
| Renamed | Id found in `aliases` | Re-key and apply. Counts as carried. |
| Re-ranged / re-typed | Value fails new validation (e.g. 15, new max 10) | **Not silently clamped.** Shown as "adjusted?" with *Use 10* / *Discard*. Until the creator answers, the build's value applies. |
| Conflict | New base value ≠ `baseValueAtEdit` (the builder changed the same thing) | Creator's value wins by default, because it is the more recent explicit intent. Flagged "Builder also changed this: keep yours / use new". |
| Control removed | Id missing and not aliased, or in `retired` | Dropped and kept in an archive for 30 days (proposal). |
| Target removed | `targetId` gone (enemy or level deleted by the build) | Dropped and archived. A created entity whose parent level is gone is offered "place in another level". |
| Migration throws | Exception in `migrateOverride` | Dropped and archived, and a bug signal is filed against the build |

4. Persist the surviving set re-based on the new build. Update `baseBuildId` and `baseValueAtEdit`. Store the `ReapplyReport`.

**Telling the creator.**
- A new build **never swaps in underfoot**. A "New build ready" chip offers *Try it*. Switching shows a short card: "Your 23 changes: 20 kept, 1 needs a choice, 2 couldn't carry over."
- Each item shows the control label and icon, old and new value, and a one-line reason ("The bat's wing setting was removed").
- Actions: *Use new*, *Keep mine*, *Discard*, *Ask a builder* (turns a dropped edit into a capability request).
- Every message is read aloud on request, consistent with §5.10 captions.
- The creator can flip back to the previous build. Its overrides are re-computed from the archive, so nothing is lost by trying the new build.

**Lanes the creator sees:** *Newest build + my edits* (draft) and *Published*. Creators may also keep the previous build selectable until Publish; that serves the spec's "fall back on existing logic". A failed build or failed conformance never replaces the current draft.

**Undo across a build switch:** the session undo stack covers override transactions. The switch itself is one transaction ("Switched to build 14"). Undo returns to the prior build and its override set. Edits made after the switch stack normally on top.

**Coding agents and overrides:**
- When a job starts, the agent receives a **read-only snapshot** of the current effective design. That way "make the jump feel better" starts from the creator's tuned values, not stale base values.
- The agent cannot write the DB layer.
- Edits the creator makes during the build are not visible to that agent. Re-application reconciles them afterwards.

**Publish: bake or not?** Recommended two-step approach, both deterministic:
1. **Publish pins `release = { buildId, overrideSnapshot (immutable, content-hashed) }`.** No rebuild is needed, so Publish is instant and players get exactly what the creator tested.
2. **Fold:** right after Publish, a deterministic job writes the snapshot into `design/*.json` as a commit on the game's main line. It records an "equivalent build" whose effective doc must byte-equal the published one; conformance check plus a hash comparison. The draft override layer is then cleared relative to that new base.

Why fold at all:
- source stays the single truth for forks, open-source visibility and future agents;
- the override layer stays small;
- rollback can target a release that has its own snapshot.

Why not fold on every edit: it races the build branch, costs a CI/build cycle per nudge, and creates commit noise.

Consequences:
- **Forks** copy source plus the effective override snapshot, folded into the fork's first commit.
- **Rollback** to an old release restores that release's `{buildId, snapshot}`. The draft override layer is untouched unless the creator chooses "start editing from this version".
- **Privacy:** creator-authored dialogue text sits in the DB until Publish, then enters Git through the fold. In V1 that is the creator's own repo, public or private by their choice. Child-authored text is V3 (see B7). An alternative is for text-bearing controls to stay DB-only even after publish (§21).

**Scale note:** tilemap painting is stored as cell overrides (`tilemap@level/layer` → sparse cell map). It is fine at Game Maker scale. `ponytail:` revisit if a single override exceeds about 256 KB.

**Cost:** zero tokens. One DB write per transaction and a re-apply pass per build switch, which is milliseconds for hundreds of entries.

## 8. Natural-language routing ("make all enemies blue" vs "add a grappling hook")

**Context given to the control-operating agent.** It stays small and is regenerated per request:
- A compact manifest digest: control id, label, group, widget constraints, aliases and selector tags (about 1–4k tokens for a typical game).
- A target census from the doc: `{tag:"enemy", count: 12, prefabs:["slime","bat"]}`, plus the current selection.
- The user's role and permissions, and remaining budget.
- **No source code and no full doc dump.**

**Tools exposed.** Use a fixed set of about 5 generic tools, not one tool per control. That keeps tool definitions stable and cacheable no matter how large the manifest grows:

| Tool | Effect |
|---|---|
| `find_targets(selector)` | Returns ids and count |
| `propose_transaction(label, commands[])` | Host validates and returns a preview diff; nothing is applied yet |
| `ask_clarification(question, options[])` | Shown with big buttons and read aloud |
| `request_new_capability(summary, examples, affected_controls)` | Creates a *proposed* coding job; nothing runs without approval |
| `explain_controls(topic)` | Points at the manual widget, which serves the "learn the manual path" goal |

**Walkthrough A: "Make all of the enemies blue."**
1. The platform mic produces a transcript (STT costs money; the routing call costs tokens).
2. **Optional deterministic pre-pass:** fuzzy-match against control labels and aliases plus color names. A hit lets it skip the LLM entirely. Value: medium. Build it after measuring.
3. The agent calls `find_targets({tag:"enemy"})` → 12 targets. Control `enemy.color` is a `color` widget whose palette includes `#3b82f6`.
4. `propose_transaction("Make all enemies blue", [{op:"set", control:"enemy.color", targets:{tag:"enemy"}, value:"#3b82f6"}])`.
5. The host validates, applies it as **one transaction**, highlights the 12 enemies, and shows a toast: "Made 12 enemies blue. Undo." The panel visibly shows the color widget that did it, which reinforces manual parity.
6. No code changes, no coding agent, no build.

**Walkthrough B: "Add a grappling hook."**
1. The census and manifest contain no matching control, command or prefab. The agent **must not** fake it by abusing existing controls (e.g. huge jump height).
2. It calls `request_new_capability({summary:"Player can fire a grappling hook at ceilings and swing", examples:[...], affected_controls:["player.*"]})`.
3. The host (deterministic code, not the agent) checks the role. Proposal: the request goes to a budget check against the admin's limits (a pending adult approval for a child's request is V3). The host attaches a cost estimate band and shows "This needs a builder. It will take a few minutes."
4. On approval, an aiur job with a **feature handoff contract** (§10) is created for the game repo only. The coding agent must deliver the feature module *and* its controls (`grapple.range`, `grapple.pullSpeed`, `grapple.enabled`), input action `grapple` with a touch button, save-state fields with a migration if needed, and tests.
5. The output is a new draft build, and the creator gets a notification. The new controls appear in the editor automatically because they come from the manifest.

**Gray zone.** "Make the enemies scarier" is ambiguous. Resolve it with `ask_clarification`: bigger / faster / red eyes / more of them, or a builder request. "Make enemies chase me" exists only if a `enemy.behavior` choice control has a `chase` option; otherwise it is a capability request.

**Eval method.** Label 150 utterances across the 3 fixture games (existing / batch / clarify / new-code / out-of-policy). Measure routing accuracy, false "new-code" escalations (expensive) and false "existing" fakes (harmful). Collect tokens per request. Run every routing model candidate on this set. Pass target (proposal): ≥95% correct on unambiguous existing-control requests and **0** silent code-path escalations without approval.

**Cost (estimate, not measured).** About 2–6k input tokens plus about 200 output tokens per request on a small or fast model. Prompt caching of tool definitions and the manifest digest applies across a session. Prices are deliberately not quoted here; the cost spike (R15) should price them.

## 9. Reload and resume boundaries (draft only)

| Change type | Boundary | Mechanism |
|---|---|---|
| Design-doc edit (override layer) | `live` or `restart-scene` (game decides per patch path) | `applyDesign`; written to the DB override layer. No build. Keeps working while a coding job builds (§7a). |
| Asset swap | Scene restart | Host invalidates the asset URL |
| Agent code change | **New draft build**, offered and never auto-swapped → on switch, re-apply overrides (§7a) → full iframe reload → `restore(snapshot)` | Vite build in the sandbox. Do not hot-patch running sim code. |
| Vite HMR | Agent and Kevin dev loop only, in the build workspace | `import.meta.hot` on leaf/data modules. Not exposed to players. |
| Published update | Never pushed into a running session | The sibling report's update indicator |

The last working draft stays loadable. If a new draft fails boot or conformance, the host keeps the previous one.

## 10. Extensible architecture (S01/S11)

### 10.1 Recommended game repo shape (proposal)

```text
game.json                    # manifest (generated from src/manifest.ts at build; validated)
design/                      # design document (host-edited JSON; agents may also edit)
src/main.ts                  # mount(): wires engine + modules; ≤ ~150 lines, no mechanics
src/core/                    # state types, rng (seeded), clock, event bus
src/features/<name>/         # ONE feature module each:
    schema.ts                #   design-doc slice (Zod) + defaults
    controls.ts              #   ControlDecl[] + commands for this feature
    system.ts                #   runtime logic; reads design, owns its runtime state slice
    save.ts                  #   serialize/restore slice + migrate(prevSlice)
    input.ts                 #   actions it adds
    feature.test.ts          #   unit + control round-trip + save round-trip
    FEATURE.md               #   ≤ 30 lines: purpose, controls, events, invariants
tests/fixtures/saves/<prev-release>.json
```

**Patterns:**
- **Feature modules register** with a tiny registry: `defineFeature({id, schema, controls, system, save})`. The manifest, design schema and save schema are **composed** from registered features, so a new feature cannot "forget" the editor: no controls is a type error, or an explicit `controls: []` with a reason.
- **Explicit state:** each feature owns a named slice of runtime state as plain data. Engine objects (Phaser sprites, Three meshes) are *views* rebuilt from state. This is what makes serialize, rewind and debug feasible. Phaser `DataManager` or Three `userData` must not be the source of truth.
- **Seeded RNG and an injected clock** in `core/` make replay *possible*. Replay is still not guaranteed (spec §5.7).
- **Stable IDs** for entities, controls and achievements. Renames keep an alias.
- **Events, not reach-ins:** features talk through a typed event bus (`player.landed`). The grappling hook subscribes; it does not edit the jump module.

### 10.2 Feature handoff contract (what a follow-up agent receives and must return)

**Input:** the feature request, `game.json` digest, the list of `FEATURE.md` files, the relevant feature folders, the SDK skill, and the conformance checklist.

**Must return:**
1. A new or changed feature folder.
2. Controls for every new creator-meaningful parameter.
3. Input actions with a touch affordance.
4. A save slice plus `migrate` if the shape changed, with a fixture from the current published save.
5. A changelog line, plus override hints (`aliases`, `retired`, `migrateOverride`) for any renamed or removed control (§7a).
6. `gm-sdk check` green.
7. No edits outside `src/features/<name>`, `design/`, `tests/` and `main.ts` registration without stating why.

Lighter models succeed more often on this narrow footprint. That claim is an **inference to test**, not a measured result.

### 10.3 Conformance suite (`gm-sdk check`, deterministic, runs in CI and before every draft)

1. Manifest validates and its control ids are unique.
2. Every control: set to min, max and default → `applyDesign` doesn't throw → undo restores a byte-equal doc.
3. Save round-trip: `restore(serialize(x)) ≈ x`.
4. Previous-release save fixture migrates.
5. Booting with each optional capability disabled still reaches a playable frame.
6. Pause halts the sim within 1 frame.
7. Desktop 16:9 and iPad 4:3 screenshots render with no element outside the safe area.
8. Debug adapter is absent from the published bundle.
9. Override hints: the previous build's control ids are all present, aliased or retired; `migrateOverride` fixtures pass; folding a sample override set yields a byte-equal effective doc.

This suite is the main defense for "lighter agents modify safely".

### 10.4 S01 skill note

Kevin's environment already has compound-engineering (plan/work/review). Recommendation: **one custom `gm-editor-sdk` skill** (manifest vocabulary, feature-module template, handoff contract, conformance commands, 3 worked examples), loaded only for game-coding jobs, plus the pinned-version Phaser and Three skills (the prior catalog notes Phaser 3/4 API drift). Evaluate the skill by A/B on 10 feature tasks across the 3 fixtures: conformance pass rate, files touched, tokens, and reviewer rework. Do not take its usefulness on faith.

## 11. Worked examples

**(a) Simple UI game: "Snack Sorter", tap snacks into the right bin (DOM or Phaser, `presentation: responsive`, portrait or landscape).**
- Design doc: `{ rounds: 10, timeLimitSec: 30, bins: Record<id,{label,icon,color}>, snacks: Record<id,{icon,bin}> }`.
- Controls: `rounds` (count 3–30), `timeLimitSec` (slider 10–120), `bin.color` (color, selector `{tag:"bin"}`), `bin.label` (text ≤ 12), `snack.bin` (choice), "Add snack" (`invoke spawnSnack`).
- No `editor.manipulate` needed; the panel is enough. Saves: `saves:false`, or just best score. Achievements: `perfect_round`.
- NL example: "make it easier" → clarify between more time and fewer rounds.

**(b) Platformer: "Moss Jumper" (Phaser 4 Arcade, `presentation: fixed 16:9`, landscape required on iPad).**
- Design doc: `{ physics:{gravity,jumpVelocity,coyoteMs,runSpeed}, levels: Record<id,{tilemap,entities:Record<id,{prefab,x,y,tags,props}>}> }`.
- Controls: physics sliders (`tier:"advanced"` for coyote time), `enemy.color`, `enemy.speed` (selector `{tag:"enemy"}`), `place` widgets for slime/bat/coin/spring, `tilemap` brush, `level.music` choice.
- `editor.manipulate`: `pick()` via Arcade body bounds and `worldToScreen` via the camera. Drag = one transaction.
- Saves: `{levelId, checkpointId, coins, collected:Set<id>}` with `saveSchemaVersion`.
- Input: `move` (axis), `jump`. The touch overlay shows a nipplejs stick plus a jump button, generated by the platform from the declared actions.
- The grappling hook arrives later as `features/grapple/` with `grapple.range`, a new action, a save field `grappleUnlocked`, and a migration defaulting it to `false`.

**(c) RPG: "Lantern Vale" (Three.js or Phaser top-down, `responsive`).**
- Design doc: `npcs`, `dialogue` (node graph: `{id, speaker, text, choices:[{text,goto,setFlag}]}`), `quests` (`{id, steps:[{flag}], reward}`), `items`, `maps`.
- Controls: `npc.name`, `npc.color`, a `text` widget per dialogue line (content-filtered on the host), `rule` cards ("When [flag] is set, [npc] says [line]"), `quest.reward` choice, `place` for NPCs and chests, plus a `custom` game-overlay widget for the dialogue graph if the rule cards prove too weak.
- Saves are the hard part: `{flags, inventory:Record<itemId,count>, questState, mapId, pos}`. The previous-release migration must handle removed item ids (drop and refund) and removed quests (mark complete or abandoned). The sibling saves report owns the policy; this report owns the `migrate` hook.
- Achievements are quest-completion events. Analytics: `quest_started`, `dialogue_choice`.

All three use the same `GameModule`, the same manifest vocabulary and the same host. Only the declarations differ, which shows there is no fixed property ceiling.

## 12. Cross-device responsibilities (R13; iPad and desktop first)

| Concern | Platform (host + SDK) | Game |
|---|---|---|
| Viewport and aspect | Iframe sized to the safe-area-aware container (`env(safe-area-inset-*)`, `visualViewport`); emits `Viewport{w,h,dpr,orientation,safe}` | Lays out for the given logical size. `fixed` games use Phaser `Scale.FIT` (or `EXPAND`) with letterboxing; Three uses camera aspect plus FOV policy. |
| Orientation | Rotate prompt when the declared orientation doesn't match. `screen.orientation.lock` is **not** relied on (unsupported on iOS Safari; unverified for current iPadOS). | Declares `orientation: landscape \| portrait \| any` |
| Touch controls | Renders the virtual stick and buttons from declared actions, placed in thumb zones, ≥44 pt targets, hidden when a keyboard or gamepad is in use | Chooses actions that work on touch. A 9-key action scheme is a design failure the overlay cannot fix. |
| Reading size | `textScale` and `reduceMotion` settings broadcast; HUD and editor text are always platform-rendered | Uses `textScale` for in-game text; minimum readable size at iPad 1x is checked in conformance screenshots |
| Camera framing | Supplies safe rect and HUD-occluded insets | Keeps the player and important targets inside the safe rect |
| Editor on touch | Long-press = select, drag handles, two-finger pan/zoom, no hover-only affordances, panel as bottom sheet on narrow and side panel on wide (a direction, not a layout spec) | `pick`, `worldToScreen`, placement validity |
| Input abstraction | Keyboard, pointer, touch, and later Gamepad API → actions; remapping UI | Meaning of each action |
| Controller and mic loop (later) | Focus-navigable HUD and editor (roving tabindex); hold-to-talk on a reserved button; the edit toggle on a controller button | Nothing extra beyond actions |
| Non-responsive games | Letterbox and badge, plus a "best on desktop" flag on the wall | Declares it honestly |

Distinction the spec asks for: the input adapter makes a game *operable* on iPad. Only the game's design makes it *good* on iPad. The conformance screenshots and a specialist UI/game-feel critique enforce the second.

## 13. Architectural alternatives

| | **A. Host-owned design document + feature modules (recommended)** | **B. Live-object inspector (Godot/Unity-style decorators on runtime objects)** | **C. ECS-everywhere (bitECS/miniplex/koota), editor over components** |
|---|---|---|---|
| Undo | Immer patches on JSON, simple and exact | Must record before and after per object; easy to miss fields | Good if components are plain data |
| NL batch edits | Selector over the doc, trivial | Must query live objects; fails when not spawned (e.g. other levels) | Query by component, good |
| Persistence and forks | Base doc in source plus DB override layer, folded at Publish (§7a) | Must serialize runtime objects back to source, the hardest part | Needs a scene format anyway |
| Agent ergonomics | Familiar Phaser/Three code plus a schema per feature | Most familiar code; decorators are natural in TS | Unfamiliar to many models; Phaser/Three objects mismatch |
| Range of games | Unlimited (custom widgets, rule cards) | Unlimited | Unlimited but heavy for tiny games |
| Initial build cost | Medium (doc + composition + host) | Low | High |
| Later change cost | **Low** (narrow module footprint, conformance-checked) | Medium-high (drift between runtime and saved data) | Low-medium |
| Deps | zod, immer | reflect-metadata/decorators | Each ECS lib is ≤1.5k stars; bitECS is MPL-2.0 |

**Rejected: D.** Each agent writes a bespoke editor. The spec forbids it, and it makes undo and NL impossible to standardize.

**Hybrid allowed within A:** a feature may expose a *runtime-only* tweak (e.g. live camera shake strength while playing) as a `scope:"runtime"` control that is not persisted. Use it sparingly.

## 14. Where things belong

| Layer | Contents |
|---|---|
| **aiur** (reuse, don't duplicate) | Job orchestration for capability requests and repair jobs, git and PR automation for build branches and the post-Publish fold commit, cost accounting, skill delivery to agents, and the capability/contract versioning convention from `aiur-contracts` (JSON Schema 2020-12, ignore unknown IDs, v2 beside v1). Do **not** put SDK runtime code in aiur. |
| **Reusable packages** (Kevin-wide, platform-agnostic) | `iframe-bridge` (validated MessageChannel RPC with schema allowlist, about 150 lines), `command-manifest` (ControlDecl/Selector/Transaction plus an Immer undo stack, no game concepts), voice (separate report) |
| **Game Maker-specific** | `@gm/sdk` (game side), `@gm/host` (HUD, editor chrome, widgets, touch overlay), override layer service (DB records, re-apply, report, publish snapshot and fold job), NL routing prompt and tools, `gm-sdk check` conformance, `gm-editor-sdk` skill, game repo template |
| **Game repo** | Feature modules, design doc, assets, tests, fixtures |

Backend touchpoints: only the host calls the Railway API. The SDK has no network access to platform services except asset fetches from its own origin.

## 15. Versioning policy for the SDK (proposal)

- **Two versions.** (1) The `@gm/sdk` npm semver is **bundled into each game build and pinned exactly**, so a published build is immutable. (2) The **wire protocol major** (`sdkProtocol`) is checked in the handshake.
- The host supports protocol **N and N-1**. Dropping N-1 requires that no *published* game still uses it, or that the deterministic upgrade job has bumped them.
- Minor protocol and SDK changes are **additive only**: new capabilities and optional fields. Unknown capabilities and fields are ignored on both sides.
- Manifest `sdk: "^2.3"` is recorded in release metadata. The game template upgrades the SDK via an aiur job that runs `gm-sdk check` and produces a draft. That is never automatic publication.
- Widget vocabulary grows by minor versions. A game using a widget the host doesn't know falls back to a read-only display plus "ask a builder". It is never silently dropped.
- Deprecations: one major of overlap, a codemod where feasible, and a `gm-sdk check` warning.

## 16. Findings and limitations

- Phaser 4 is stable (4.0.0 on 2026-04-10, now 4.2.1). Three is at r186. Zod 4's native JSON Schema output lets one Zod source feed the TS types, the host validator *and* the LLM tool schema.
- No off-the-shelf beginner-grade editor-widget library meets the stars rule and fits the brief. Tweakpane, Leva and lil-gui are developer panels. The widget set must be built (about 10 widgets), in the platform UI framework, which is still unselected.
- iPad specifics (gamepad policy in iframes, fullscreen, audio unlock, orientation lock) are **unverified** and need a device test.
- The routing accuracy and token figures in §8 are **estimates**. Nothing was benchmarked, per the no-paid-benchmark rule.
- The prior-art rows for Unity, Construct, Mario Maker, Dreams and Core come from documentation knowledge, not re-fetched (Godot, Roblox and Immer were fetched).

## 17. Reuse / adapt / build

**Reuse:** Zod 4, Immer 11, Phaser 4 Scale Manager, Vite 8, nipplejs, and the aiur-contracts versioning convention.
**Adapt:** the Roblox tag/attribute/recording model and Godot export hints, turned into the manifest vocabulary.
**Build:** iframe bridge, host undo stack, widgets, selector engine, touch overlay, NL tools, conformance suite, skill, game template.

**Rough build estimate (inference):** about 3–5 focused weeks for an MVP SDK and host covering the capability-map "Core" rows plus the 3 fixture games.

## 18. Licensing and data handling

Everything recommended is MIT. comlink (Apache-2.0) is not recommended. bitECS is MPL-2.0, which matters only for Alternative C. Nothing in this design sends children's data to new vendors. The routing agent sees the manifest digest, the census and the transcript. The transcript goes to the selected LLM and STT providers, which falls under the vendor register (§10.5). Creator overrides (including dialogue text) live in the backend DB until Publish. The fold then puts them in Git, which ties into the public/private decision (§9.3).

## 19. Evaluation method

1. Build 3 fixture games against the illustrative interfaces. The conformance suite must pass on all three.
2. The 150-utterance NL routing set (§8).
3. A follow-up-agent A/B: 10 feature tasks, with and without the feature-module template and skill, measuring conformance pass, files touched, tokens and rework.
4. iPad (real device) plus desktop Playwright profiles: screenshots, touch overlay, letterbox.
5. An undo fuzz test: random command sequences → undo all → byte-equal doc.
6. Override re-apply fixtures: scripted build N→N+1 changes (rename, re-range, remove control, remove target, builder-changed-same-value) → expected `ReapplyReport`. A creator test asks whether a first-time creator understands the "couldn't carry over" card.

## 20. Next steps

1. A 2-day prototype of the bridge, host undo and one Phaser fixture (platformer) to validate `applyDesign` live vs restart.
2. The iPad device spike (§4.6).
3. Draft the `gm-editor-sdk` skill and game template.
4. Write the NL routing eval set.
5. Align hook names with the sibling saves/releases report and the R15 cost report.

## 21. Decisions for Kevin

1. **Non-opt-out HUD set:** is "pause, exit, bug report, mute/settings, safety/account controls are always present" right?
2. **(V3)** **Child capability requests:** (In V1, an adult's request runs within the admin's budget.) when NL escalates to new code ("grappling hook"), does a supervised child's request run within a budget automatically, or wait for adult approval?
3. **Override carry-over semantics (§7a):** should a past "all enemies" edit also apply to enemies a *later build* adds ("sticky" selectors), or only to the ones that existed (recommended: only existing, which is more predictable)? And on conflict with a builder change, does the creator's value win by default (recommended)?
4. **Publish behavior:** Publish pins build + override snapshot instantly, then deterministically folds overrides into source (recommended). Or should Publish require a full rebuild from folded source first, which is slower but has a single code path?
5. **Architecture A** (host-owned design document + DB override layer + feature modules) as the default for all generated games, accepting a modest up-front template cost?
6. **Creator-authored text** (child text: V3)**:** the post-Publish fold puts dialogue and labels into Git, which inherits the public/private source decision. Is that acceptable, or should text-bearing controls stay DB-only even after Publish?
7. **Dropped-edit archive retention:** is 30 days right?
