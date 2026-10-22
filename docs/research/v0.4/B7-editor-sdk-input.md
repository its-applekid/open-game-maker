# B7: Engine SDK and editor contract, delta after v0.4 (input, overrides, handoff)

**Updates:** A4 (R01, R02, R13), A5 §2.9. **Spec inputs:** v0.4 §§4.2, 5.7–5.9, 5.12, 5.15–5.17, 7.4–7.5, 9.2, 10.7, and §14.2 U10, U11, U17, U18.
**Access date for all sources:** 2026-10-21. **Tags:** [V] verified against a primary source or the registry today; [I] inferred; [U] unverified, needs a device test or a decision.
**Status:** Research proposal. All shapes are illustrative. Nothing was purchased, deployed, or sent to vendors. The mockups in `docs/reference/editor-mockups/` were used only to test what the contract can express. They are not a design spec.

---

## 1. TL;DR

- A4's natural-language control agent goes (§8 routing, its tools, its eval set, NL synonyms on controls). The command and transaction core stays because undo, validation, overrides, conformance tests, and admin edits all depend on it.
- Both mockups fit the A4 model with five additions: a **palette and category rail** declaration, a fixed **tool-mode** vocabulary (including terrain brushes), **inspector scope** (this one, all of this kind, whole game), **socket snapping and placement validity**, and **editor preferences** (snap and grid) kept outside the design document.
- Public source changes the text question. Build commits can carry children's text into Git even if overrides never do, so making overrides "DB-only" alone does not keep text private. The leading option is one **publication content gate** over every write to the public repo, with an opt-in "keep private" flag for text controls.
- No spatial-navigation library meets the ~1k-star rule. Norigin (491 stars, MIT, active, framework-agnostic core) is the best candidate for an explicit exception. The host should be the **only** gamepad reader and forward actions into the game iframe.
- Controller placement should use a **grid-stepping reticle** when snapping is on and a **free cursor** when it is off. Touch uses tap-to-place as well as drag, which WCAG 2.5.7 requires anyway. On-screen text entry: simple-keyboard (2.4k stars, MIT), with voice and pickers preferred.
- Owner/admin handoff: a **single-writer edit lease** per game with a visible "Take over". Every write is checked against a fencing token, so a stale tab can never overwrite. This is not co-editing.

## 2. Keep and drop from A4

| A4 element | Disposition | Why |
|---|---|---|
| §8 NL routing: control-operating agent, `find_targets`, `propose_transaction`, `ask_clarification`, `explain_controls` | **Drop** | The spec removes it (§5.7, §14.3). |
| §8 deterministic fuzzy pre-pass, 150-utterance eval, routing cost estimate | **Drop** | These existed only to serve the agent. |
| `ControlDecl.aliases` used as NL synonyms ("colour", "paint") | **Drop** | NL-only. Keep the *rename* alias map from §7a, which serves a different purpose. |
| `Transaction.origin: "voice" \| "text" \| "agent"` | **Replace** with `actor` (userId) and `kind: "manual" \| "system"` (re-apply, fold, reset-on-switch) | Admin edits need attribution (§6). There is no agent origin anymore. |
| `@modelcontextprotocol/sdk` as a manifest transport | **Drop** | No agent consumes the manifest at runtime. Coding agents read it from source and the skill. |
| `request_new_capability` | **Move**: an "Ask a builder" button in the editor opens the V1 voice/feature-scoping flow with the selected control/target as context | Scoping new code is V1. Operating controls by voice is not. |
| Control manifest, widget vocabulary, `EditorCommand`, `Transaction`, Immer patches and inverse patches, one transaction per intent, ~200-entry undo | **Keep** | Undo, validation, and persistence. |
| Selectors (`tag`, `prefab`) | **Keep, narrower** | Manual bulk actions ("all skeletons", see §3) and conformance tests still need them. A1/B1's sticky question now applies only to manual bulk edits. |
| Host-side validation before apply; strings rendered as text only | **Keep** | This is the trust boundary, independent of the agent. |
| Override layer, re-apply classification, ReapplyReport, Publish pin then fold | **Keep, revised in §4** | Spec §5.8 decides the outcome. |
| `gm-sdk check` conformance, feature handoff contract, override hints (`aliases`, `retired`, `migrateOverride`) | **Keep, extend** | Add: entity IDs in `design/` must survive across builds unless retired, and every palette item and tool must round-trip through undo. |
| Debug adapter in draft/test builds only | **Keep** | Tests and bug bundles. |
| §12 "controller and mic loop (later)" | **Upgrade to V1** | Spec §1.4 and §5.9 require it. See §5. |
| `baseRev` "for multi-editor later" | **Keep, repurpose** | It becomes the fencing check for the edit lease (§6) and the V2 observer stream (§7). |

What survives is a deterministic editor command bus, operated only by widgets, gestures, the controller layer, and system jobs.

## 3. Mockup to contract mapping

Primitives: **M** = manifest declaration (game supplies), **H** = host-owned UI/behavior, **G** = game hook (`pick`, `worldToScreen`, `validatePlacement`, `applyDesign`), **gap** = not expressible in A4 as written.

| Mockup element | Contract primitive | Status |
|---|---|---|
| Top bar: game title with rename pencil | H: game metadata (not design doc) | OK |
| Undo / redo | H: transaction stack | OK |
| "Saved ✓" indicator | H: override write acknowledged (rev confirmed) | OK. Must show "Not saved / retrying" honestly. |
| "Try it!" / "Test Drive" | H: play/edit lifecycle, `pause/resume`, `applyDesign` | OK. The label should be per-game: **gap** `manifest.editor.playLabel`. |
| Category rail (Rooms, Monsters, Treasure, Decor / Track, Terrain, Scenery, Racers, Rules) | M: `palette.categories[]` | **Gap.** The rail mixes three kinds: item categories (Monsters), a **tool set** (Terrain = paint/raise), and a **panel** (Rules = global settings/rule cards). Needs `category.kind: "items" \| "tools" \| "panel"`. |
| Item palette ("Pick a monster": Skeleton, Slime …; Straight, Curve, Ramp …) | M: `palette.items[] {prefab, label, thumbnail}`; A4 `place` widget | Partial. A4 had one `place` widget per prefab and no grouping. Thumbnails need a host-rendered or build-generated asset (ties to accepted scene thumbnails). |
| Contextual hint ("Drag a monster into your dungeon", "Drag to place \| Grid 1 m") | H: hint strip driven by tool + selection state, narrated on request | OK as host. **Gap:** an optional `palette.items[].hint`. |
| Drag-to-place with ghost preview (translucent track piece) | H: gesture/ghost; G: `validatePlacement(prefab, pose) → ok \| {reason}` | **Gap:** A4 had no placement-validity hook. Needed for ghost red/green and for controller placement. |
| Snap to grid toggle, "Grid 1 m" | H: **editor preference**, per user/device, **not** in the design doc and not undoable | **Gap.** A4 treated all state as design or runtime. Add `editorPrefs`. Game declares `grid: {size, units}`. |
| Track pieces joining end to end | G: `sockets` on prefabs (connection points); host snaps to the nearest compatible socket | **Gap.** Grid snapping alone cannot express track continuity. Rooms joining at doorways need the same mechanism. |
| Selection highlight (glowing tile under skeleton) | H draws using G `worldToScreen` / `pick` bounds | OK for 2D and isometric. For 3D depth-correct outlines, the game draws them (`setSelection(ids)` hook). **Gap:** `setSelection`. |
| Floating mini-toolbar (move, delete) over the selection | H: context actions anchored by `worldToScreen` | OK. |
| Gizmos: move handle, rotate arc, raise arrow, spline control points | M: per-prefab `gizmos: ["translate","rotateYaw","elevate","splinePoints"]` with step and limits; H renders 2D overlay; G maps drags to design paths | **Gap.** A4 had a `path` widget but no gizmo declaration. Recommend a fixed gizmo vocabulary. Anything else uses `custom`. |
| Tool modes: Select, Build, Paint, Raise, Erase | M: `tools[]` chosen from host vocabulary `select \| place \| brush \| sculpt \| erase \| path` | **Gap.** A4 had `tilemap` only. `sculpt` (heightfield raise/lower) and `brush` (surface paint) need radius/strength options and stroke-as-one-transaction. |
| Inspector header (name + large preview image) | H from `palette.items[].thumbnail` | OK |
| "How many?" − 3 + stepper | A4 `count` widget | **Semantic gap.** Is it the number of *placed* skeletons in this room, or a spawn parameter? If it is derived from placed entities, + must auto-place (needs `validatePlacement` + a free-spot finder) and − must choose which instance to remove. The manifest needs `count.semantics: "param" \| "instances"`. |
| Strength: Easy / Medium / Tough | A4 `choice`; host renders segmented when ≤4 options, dropdown otherwise | OK. **Gap:** scope. Does it apply to *this* skeleton or *all* skeletons? See next row. |
| Inspector mixes instance and type settings (Copy/Remove = this one; How many = all skeletons) | M: `control.scope: "instance" \| "prefab" \| "global"` | **Gap.** A4 had `global \| selector`. Host must label scope visibly ("This skeleton" / "All skeletons") or children will be confused [I]. |
| Copy / Remove buttons | Built-in commands `duplicate`, `delete` (entity create/tombstone overrides) | OK. A4 §7a already has create/delete overrides. |
| Sliders with units (Width 8 m, Banking 12°, Elevation 2 m) | A4 `slider {min,max,step,unit}` | OK |
| Surface dropdown with swatch | A4 `choice` with icon | OK |
| Race Settings card (Laps, Rivals) visible beside the selection | M: `group` with `scope: "global"`, `pinned: true` | **Gap (minor):** pinned global groups. |
| Numbered checkpoints 1, 2, 3 | M: prefab flag `ordered: true`; host shows order and offers reorder | **Gap:** ordered-sequence semantics, renumbering on delete. |
| XYZ orientation cube, isometric/3D camera | H: camera orbit/pan/zoom commands; G: `camera` hook. Camera is not design state. | **Gap.** No camera contract in A4. A controller needs a camera on the right stick (§5). |
| Racers (AI cars) as a category | `items` category of prefabs | OK |
| Undoable stroke (Paint/Raise drag) | One transaction per stroke, coalesced patches | OK in principle. Heightfield patches can be large: store per-chunk sparse diffs (A4's 256 KB ponytail note applies). |

**Minimum additions** (all host vocabulary plus optional game hooks, none game-specific): `palette` (categories with kind, items with thumbnail/hint), `tools`, `gizmos`, `control.scope` incl. `prefab`, `count.semantics`, `editorPrefs` (snap/grid), `sockets` + `validatePlacement`, `setSelection`, `camera`, `ordered`, `playLabel`. Everything a game cannot express with these falls back to A4's `custom` in-iframe widget. That fallback has to be controller-operable too: it receives the same forwarded actions (§5).

## 4. Override model and public source (U10, U17)

### 4.1 Revised rules

| Rule | Revision after v0.4 |
|---|---|
| Stable IDs | Control IDs `feature.control`, stable forever, renames via alias. **Build-authored entity IDs** in `design/*.json` must also stay stable. Conformance fails if a prior entity ID disappears without a `retired` entry. Creator-placed entities get host-minted globally unique IDs (needed again for V2, §7). |
| Bulk edits | Manual only now. A bulk action resolves to concrete targets at edit time, with no sticky behavior. Unchanged proposal (B1). |
| Builder vs creator conflict | Creator wins unless the job explicitly targeted the control. With no NL agent, "explicitly" must be **structured**: the scoped feature request records `targetControls[]`, and the build may emit `supersedes: [controlId]` only for IDs in that list. The host enforces it. A build cannot claim supersession on its own. |
| Out-of-range | Do not clamp silently. Show "Speed can only go up to 10 now. Use 10?" The build's value applies until the creator answers. Unchanged. |
| Removed control/target | Orphan and keep it, as A5 says. Retention is a policy choice (B5). Orphans can hold child text, so they fall under the content rules below. |
| Coding agent input | Read-only effective snapshot. Note that this already sends creator text to the coding model and the build's commits, which matters below [I]. |
| Fold on Publish | Pin `(buildId, overrideSnapshot)` instantly, then deterministically fold. **What** gets folded is now the open question (4.2). Fold commits use a bot author with no child name or email in Git metadata (spec §9.2). |
| Admin edits | Overrides record `actor`. Owner-facing change summary: "Mom changed 3 things". This is the least intrusive oversight record (§4.5) and needs no transcript. |

### 4.2 Where child-authored labels and dialogue live

The key fact [I, from spec §9.2/§9.3]: game source is public, and builds merge to it continuously. Kid text reaches Git **through build commits**, not only through the fold. Examples: the creation interview's character names, and dialogue the coding agent writes from the scoping conversation. So any option that guards only the override fold leaves a hole.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Fold everything** (A4/A5 default) | Overrides, text included, go into `design/*.json` at Publish | Simplest. Source is self-contained and forkable outside the product. | Kid text is permanent and public in Git history. Recall needs a history rewrite, which cannot reach existing clones. Build commits are ungated. |
| **B. Text controls DB-only** | `widget: text` values never fold. Source holds keys and defaults. The runtime fetches text from the platform with auth. | Text stays revocable and private. | Does **not** cover build-authored text. Public source is not playable as authored outside the product. Forks must copy DB text (fine in-product per §5.17). Adds a runtime text service. |
| **C. Publication content gate** (recommended) | Every write to the public repo (build merge and fold) passes one deterministic gate: a PII screen against known family names, emails, addresses, and school terms, plus the existing content filter. A per-control or per-line flag `private: true` keeps flagged text DB-only, as in B. Child-account games show "these words will be public" at Publish, with an admin approval setting. | Covers both paths. Keeps source mostly self-contained. Privacy is opt-in where it matters. | A screen can miss things [I]. Needs a review UX. Still irreversible once merged. |
| **D. Separate private content store per game** | All dialogue and labels live in a private repo or bucket. The public repo holds code only. | Strongest privacy | Revives the rejected "private monorepo" idea in another form. Public source becomes a hollow shell, which conflicts with "open/forkable" intent. |

**Recommendation: C**, because it is the only option that also catches build-authored text. B's flag is folded into it as the escape hatch. Gate timing is a real question: gating at merge means drafts carrying flagged text cannot merge to the public branch until resolved [I]. One way out is to keep draft builds on an unpublished branch and gate only at Publish. That depends on A7/aiur branch mechanics, and this report did not inspect aiur code.

## 5. Controllers and touch in Game Maker's own UI

### 5.1 Platform facts

| Claim | Tag | Source |
|---|---|---|
| Gamepad API is "Baseline widely available … since March 2017". `getGamepads` is in Safari 10.1+. BCD lists `safari_ios` as **"mirror"**, inferred from desktop Safari, not separately recorded. | [V] for the data. iPad behavior with current controllers is [U]. | MDN Gamepad API; mdn/browser-compat-data `api/Gamepad.json`, `api/Navigator.json` |
| `getGamepads()` returns an empty list until a "gamepad user gesture" (a button press) is seen. Input requires a document with user attention. | [V] | W3C Gamepad spec (editor's draft, "work in progress") |
| Permissions-Policy `gamepad`, default allowlist `*`: Chrome 103+. **Safari does not support the directive.** | [V] | MDN; BCD `http/headers/Permissions-Policy.json` |
| Chromium restricts gamepads to secure contexts. Firefox did so from 81 and requires policy for third-party iframes from 82. | Firefox [V] (Mozilla Hacks). Chromium [I] (blink-dev intent thread; final shipped state not confirmed) | Mozilla Hacks 2020-07; blink-dev "Intent to Ship: Restrict Gamepad usage" |
| `vibrationActuator`: Chrome 68+, Safari 16.4 (macOS); **not** Safari iOS | [V] | BCD |
| Chrome on iPad uses WebKit: App Review 2.5.6 requires WebKit, with alternative-engine entitlements only for the EU and Japan. So "Chrome on iPad" behaves like Safari for gamepad, focus, and keyboard. | Rule [V]; the behavioral consequence [I] | Apple App Store Review Guidelines 2.5.6 |
| VirtualKeyboard API (`navigator.virtualKeyboard.show()`): Chrome 94+, **not Safari/iOS, not Firefox** | [V] | MDN; BCD `api/VirtualKeyboard.json` |
| Pointer Events: Chrome 55, Safari 13 (iOS mirrored) | [V] | BCD |
| WCAG 2.2 SC 2.5.7 (AA): dragging must have a single-pointer non-drag alternative. Examples: select, then press an arrow button; tap the track to set a slider. | [V] | W3C Understanding 2.5.7 |
| Whether a PS/Xbox controller paired to an iPad produces `standard` mapping and `gamepadconnected` in Safari, inside or outside a cross-origin iframe | [U] | No primary source found. Needs a device test (A4 §4.6 still open). |

### 5.2 Library survey (stars from `gh api`, downloads from npm, 2026-10-21)

| Library | Stars | License | Activity | Verdict |
|---|---|---|---|---|
| NoriginMedia/Norigin-Spatial-Navigation (`-core` 4.1.2, framework-agnostic, depends only on `lodash-es`; `-react` 3.3.0) | **491** | MIT | pushed 2026-09-25; ~23.7k weekly downloads | **Best fit, but below the 1k rule.** It has `navigateByDirection()` (so a gamepad poller can drive it), `pause()`/`resume()`, `setKeyMap`, `setFocus(focusKey)`, focus boundaries, and distance modes [V, API reference in repo]. Recommend it as an **explicit exception** (spec §3.4 allows "explicit exceptions where warranted"). |
| luke-chang/js-spatial-navigation | 431 | MPL-2.0 | last push 2024-05; 139 weekly downloads | Reject (stale, MPL) |
| bamlab/react-tv-space-navigation | 321 | MIT | 2025-10 | Reject (React Native TV focus) |
| WICG/spatial-navigation polyfill | 224 | — | **archived** | Reject. The CSS spatnav proposal is not a shipping path. |
| bbc/lrud | 103 | Apache-2.0 | **archived** 2023 | Reject |
| NoriginMedia/react-spatial-navigation | 226 | MIT | **archived** | Reject (superseded) |
| hodgef/simple-keyboard | **2,456** | MIT | pushed 2026-10-20; ~28k weekly downloads | **On-screen keyboard: adopt.** Framework-agnostic, custom layouts (a big-key ABC layout for kids). Focusable keys work with spatial nav [I]. |
| alvaromontoro/gamecontroller.js, joypad.js | 275, 168 | MIT | stale since 2023 | Reject. The raw Gamepad API is ~100 lines in the host. |

**Fallback if Kevin refuses the exception:** build a small spatial-nav module in the host (nearest focusable in a direction within a zone, using `getBoundingClientRect`, with remembered last focus per zone) [I: a few hundred lines]. Norigin's algorithm is the reference.

### 5.3 Recommended input architecture

- **One gamepad reader, in the host.** The host polls `getGamepads()` in its rAF loop and maps input to platform actions (`nav.*`, `confirm`, `back`, `menu`, `zone.next/prev`, `editor.*`). In play mode it forwards game actions to the iframe over the bridge. This avoids Safari's unsupported Permissions-Policy and cross-origin iframe focus quirks. Two documents never read the same pad [I]. The game never calls `getGamepads()` itself. (This revises A4 §4, which had `allow="gamepad"` on the iframe.)
- **Keyboard focus and the iframe.** When the iframe holds DOM focus, key events go to the game document, not the host [I]. In edit mode, keep focus in the host. In play mode, the SDK forwards raw keys to the host for the pause/edit toggle.
- **Focus zones** = top bar, category rail, palette, canvas, inspector. Each is a Norigin focus boundary. Shoulder buttons cycle zones. The d-pad moves within a zone. A confirms, B goes back or leaves the zone. Focus highlight is a thick, high-contrast ring, not color alone (§5.9).
- **The canvas zone captures directions.** When the canvas has focus, the host calls Norigin `pause()` and routes d-pad and sticks to the editor, not to UI focus. B returns to zone navigation.
- **Placement with a controller:**
  - **Snap on → grid-stepping reticle** (recommended default). The d-pad moves the reticle one grid cell or one socket at a time. The ghost shows validity from `validatePlacement`. A places. X rotates by the declared yaw step. Y opens the context actions (copy/remove). Shoulder buttons cycle palette items. Accessible, precise, and needs no fine motor control [I].
  - **Snap off → free cursor.** The left stick moves a virtual cursor with acceleration. The right stick drives the camera (orbit/pan), and triggers zoom. Gizmos are grabbed with A, then the stick adjusts by step.
  - Every gizmo also has a **stepper equivalent** in the inspector (Elevation slider = raise arrow), so nothing *requires* stick precision.
- **Touch:** tap a palette item, then tap the world to place. Drag also works. Tap selects (A4's long-press for select is dropped as non-discoverable [I]). Two-finger pan/zoom. Sliders accept a track tap (2.5.7). Gizmo handles have targets of at least 44 px, which is the A3 proposal and still unvalidated.
- **Text entry without a physical keyboard:**
  1. Prefer not to type: pickers, suggested names, and voice dictation through the V1 voice component.
  2. iPad touch → the native keyboard (the iOS system keyboard appears on focus; the VirtualKeyboard API is unavailable).
  3. Controller → simple-keyboard in a host modal, large-key layout, focus-navigable.
  4. Physical keyboard → native.
- **External auth screens** (Google sign-in) are outside Game Maker's focus system. Show "use touch or ask a grown-up", and test it (§5.9).

## 6. Owner and admin edit handoff (U11)

**Model: a single-writer edit lease per game draft.** This is not co-editing. Precedent: WordPress post locking, which uses a lock with a heartbeat and a "Take Over" dialog. Its Trac history shows how background-tab throttling can falsely expire locks [V, WordPress Codex "Post Locking", Trac #24894, #65171].

- `editLease {gameId, holderUserId, sessionId, token (monotonic), expiresAt}` in the backend. The host acquires it on entering edit mode and heartbeats it (e.g. every 15 s, expiry around 2–3 min) [I].
- **Fencing:** every override write carries `token` and `baseRev`. The server rejects writes from a stale token. A backgrounded or reconnecting tab cannot overwrite a takeover, whatever its heartbeat did. This is the correctness guarantee. The lease UI is only a courtesy.
- **Entering a held game:** "Mom is editing *My Dungeon*." Actions: *Play*, *Watch changes* (read-only, live), and *Take over* for those authorized (owner, or a family admin per §4.1/§4.2 policy).
- **On takeover:** the previous holder drops to read-only with "Mom took over editing". Saved transactions are already persisted, since the "Saved" indicator means the server acknowledged them. Only an in-progress drag or stroke is lost. The previous session's undo stack is discarded, because its inverse patches are against a stale rev.
- **Same user, second device:** silent takeover.
- **Builds hold no lease.** They never write overrides (§4.1).
- **Owner record:** a change summary attributed by `actor`, as in §4.1.

Open policy (§7 Q4): can a child owner take the lease back from a parent immediately?

## 7. Decisions for Kevin

**Q1. Spatial navigation library below the ~1k-star rule.**
Options: (a) Norigin core as an explicit exception; (b) build a ~300-line host module; (c) roving-tabindex grids only, with no directional geometry.
**Recommend (a):** it is actively maintained, MIT, framework-agnostic, has the exact programmatic API a gamepad poller needs, and no ≥1k alternative exists.
Consequences: (a) one small dependency, pinned, wrapped behind a host interface so (b) remains possible; (b) costs about a week and needs its own edge-case tests; (c) gets awkward for spatial palettes and the inspector.

**Q2. Where children's labels and dialogue live given public source.**
Options: (A) fold everything; (B) text controls DB-only; (C) one publication gate over build merges and fold, with an opt-in private flag; (D) a separate private content store.
**Recommend (C):** only C covers text that builds write, not just text the editor writes.
Consequences: C needs a PII screen and a Publish review step for child games; anything that passes is permanent in public history. B and D keep text revocable but make public source incomplete.

**Q3. When is a game's in-progress work public?**
Options: (a) drafts merge to the public repo continuously, gate at merge; (b) drafts live on an unpublished branch or store, gate and publish at Publish only.
**Recommend (b)** if aiur's branch model allows it: a child's half-finished work and dialogue only become public by a deliberate act.
Consequences: (b) needs a confirmed aiur/repo mechanism (not inspected here). (a) blocks merges on gate failures.

**Q4. Edit takeover between parent and child.**
Options: (a) either side takes over instantly; (b) an admin takes over instantly, and the child owner must "Ask to edit"; (c) takeover always requests consent from the current holder, with a timeout.
**Recommend (b):** it matches §4.2's admin assistance and keeps a parent's in-flight help from being yanked mid-stroke.
Consequences: (b) needs a request/notify path; with (a), parent and child can ping-pong.

## 8. Uncertainty

- **Real iPad behavior is unverified [U]:** controller pairing → `gamepadconnected`, `standard` mapping for DualSense and Xbox pads, polling while a cross-origin iframe is present, and focus behavior. BCD's iOS rows are mirrored from desktop. Needs a real-device spike on desktop Chrome, iPad Safari, and iPad Chrome with two controllers.
- **Chromium's secure-context restriction:** the final shipped state was not confirmed. Irrelevant in production (HTTPS) but matters for LAN dev.
- **Child comprehension is untested [I]:** instance vs prefab scope labels, "How many?" with `instances` semantics, and the reticle model.
- **PII screening quality is unknown [I].** Option C reduces risk but does not eliminate it.
- **Not inspected:** aiur branch and merge code (Q3), A7's multiplayer room design (§9 hooks are only reservations), and the A3/A5 citations beyond the sections used.
- **UI framework is unselected.** Norigin core is framework-agnostic and the React binding is optional.

## 9. Multiplayer hooks to reserve now (V2, brief)

1. **The transaction stream is broadcastable:** `{actor, rev, patches}` are already serializable. V2 observers receive the same stream the override layer persists.
2. **Lease = editor authority in a room.** Entering edit mode pauses the session (§5.12). Watching is a read-only subscription, as in §6's *Watch changes*.
3. **Presence channel separate from design state:** cursor, reticle, selection, and focused control are ephemeral, never persisted or undoable, and filtered so private panels never broadcast (§5.12).
4. **Input carries `playerIndex`:** the host gamepad layer assigns devices to players now. In edit mode the editor claims exactly one device.
5. **Globally unique, host-minted entity IDs** (§4.1), not per-session counters.
6. **`applyDesign` must be deterministic given the doc**, so every client converges on the same effective design.

---

### Sources (accessed 2026-10-21)

- MDN, Gamepad API: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- MDN, Permissions-Policy `gamepad`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/gamepad
- mdn/browser-compat-data (`api/Gamepad.json`, `api/Navigator.json`, `api/VirtualKeyboard.json`, `api/PointerEvent.json`, `http/headers/Permissions-Policy.json`): https://github.com/mdn/browser-compat-data
- W3C Gamepad (editor's draft): https://w3c.github.io/gamepad/
- MDN, VirtualKeyboard API: https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API
- Mozilla Hacks, "Securing Gamepad API" (2020-07): https://hacks.mozilla.org/2020/07/securing-gamepad-api/
- blink-dev, "Intent to Ship: Restrict Gamepad usage": https://groups.google.com/a/chromium.org/g/blink-dev/c/B1QUuICApvc/m/RRxZLqG4HQAJ
- Apple App Store Review Guidelines 2.5.6: https://developer.apple.com/app-store/review/guidelines/
- W3C, Understanding SC 2.5.7 Dragging Movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- Norigin Spatial Navigation (repo, `docs/api-reference/SpatialNavigation.md`, npm `-core` 4.1.2): https://github.com/NoriginMedia/Norigin-Spatial-Navigation
- simple-keyboard: https://github.com/hodgef/simple-keyboard
- WordPress Codex, Post Locking: https://codex.wordpress.org/Post_Locking ; Trac #24894: https://core.trac.wordpress.org/ticket/24894 ; Trac #65171: https://core.trac.wordpress.org/ticket/65171
- GitHub REST `repos/*` and `search/repositories` (stars, license, archived, pushed_at); npm registry and `api.npmjs.org` weekly downloads (2026-10-12 to 2026-10-18).
