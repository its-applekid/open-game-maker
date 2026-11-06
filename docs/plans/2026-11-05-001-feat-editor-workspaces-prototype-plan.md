---
title: Editor workspaces (Loot, Encounters) - Prototype Plan
type: feat
date: 2026-11-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Editor workspaces (Loot, Encounters) - Prototype Plan

Companion design: `docs/research/editor-mode-workspaces-2026-11-05.md` (issue #507). That document is the proposal;
this one is the build order for its first slice.

## Goal Capsule

- **Objective:** Prove the editor-workspace model end to end on two workspaces — **Loot** and **Encounters** — inside
  the editor that already exists, with no new chrome and no redesign.
- **Authority:** Issue #507 (Kevin's editor-mode vision), the companion design doc, the shipped editor
  (`apps/web/src/features/editor/`), `gm-editor-tuning`, and the repository's prototype-fidelity rule.
- **Execution profile:** One contract change (`ControlDecl` + `manifest.editor`), one `gm` command (the steward), one
  host rendering change (panel-kind workspace filtering), one ask path (context seed into the existing dock), plus
  presets and conformance checks.
- **Stop condition:** Stop if a workspace cannot be expressed without new navigation, a new panel, a new label the
  prototype does not have, or a change to `applyDesign`/transaction semantics.
- **Tail ownership:** The implementing agent owns focused tests, the conformance checks, review, commit, push and PR
  handoff.

---

## Product Contract

### Summary

A game publishes small, system-owned editor **workspaces**. The editor's existing category rail becomes the workspace
selector, the Inspector shows one workspace at a time, each control carries a safe range and a one-line rationale, each
workspace carries presets, and every control can seed an "ask an agent" message into the existing build-chat dock.

### Problem Frame

`manifest.controls` is one flat list per game. With six systems a game produces dozens of rows in arbitrary order, with
no statement of ownership, no safe range, and no way to ask about a single knob without describing it by hand. Builds
also rename and remove controls without telling the creator which of their edits stopped applying.

### Requirements

**The declaration**

- R1. A game can publish `EditorWorkspaceDecl` entries (`id`, `label`, `system`, `kind`, `order`, `sections`,
  `objects?`, `presets?`, `ask?`), aggregated as `manifest.editor`; the shape ships in `packages/contracts/src/game.ts`
  beside `ControlDecl`.
- R2. `ControlDecl` gains optional `workspace`, `safe { min, max, why }`, and `ask[]`, all inside today's loose-object
  tolerance so existing games keep parsing unchanged.
- R3. A control's workspace defaults to its dotted-id prefix; a control whose prefix matches no published workspace is
  a build failure.
- R4. `manifest.editor` reaches the editor beside `manifest` in the existing bridge `ready` envelope — no new channel.

**The editor**

- R5. The rail lists published workspaces in `order`. A `kind: 'panel'` workspace filters the Inspector to its
  sections; a `kind: 'items'` workspace keeps today's palette flow. No new rail, panel, header or helper copy.
- R6. A workspace with no controls, objects or presets is not published.
- R7. A control with a `safe` range shows that band inside its slider track and, the first time a value leaves it, one
  plain line of text under the control. Values are never clamped and never blocked.
- R8. A preset applies every value in it as **one** transaction, so one undo reverts it.
- R9. Each control's ask affordance opens the existing build-chat dock with the control context packet; the message
  becomes one edit job through `editJobRequest` unchanged. If the affordance does not fit at phone width, the existing
  `Ask for a change` button carries the selected control as context instead.

**The steward**

- R10. `gm editor steward` merges per-system fragments into `manifest.editor`, writes `manifest.overrides`
  (`aliases`, `retired`, `migrate`), and writes `editor-report.json` (kept / renamed / retired / migrated / safe-range
  moves). It runs inside `gm build` before `dist/` is written and inside `gm check`.
- R11. The steward never changes a gameplay value, a default, or a range outside the declared safe band, and it never
  invents a preset or a rationale.
- R12. Conformance gains `C12 workspace-shape`, `C13 safe-ranges`, `C14 ask-coverage`, reported in the existing check
  format.

**The prototype pair**

- R13. The Encounters workspace publishes at least: enemy count per wave, spawn interval, aggression, elite chance —
  one of them a safe-ranged slider with a rationale, and three presets (Gentle / Standard / Brutal).
- R14. The Loot workspace publishes at least: gold drop chance, gold per drop, rarity bias — one safe-ranged slider
  with a rationale, and three presets (Scarce / Standard / Generous).
- R15. Both workspaces round-trip: change a live knob and see it in play; change a structural knob and see
  `'restart-scene'` behave; undo restores the previous design.

### Scope Boundaries

- No World, Sound, Look or Rules workspace in this slice; the declarations must not assume them.
- No new navigation, panel, modal or helper text; the rail, Inspector, dock and Ask button are the surfaces.
- No change to `applyDesign`, `EditorCommand`, `Transaction` semantics, the override layer or `ReapplyReport` statuses.
- No agent autonomy: the steward is deterministic and model-free.
- No in-editor map painting, and no per-workspace permissions.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Workspace is derived from the control-id prefix** (R3) so ownership has one representation; a second
  declaration of "which controls belong here" would drift from the ids that overrides are keyed by.
- KTD2. **`safe` is advisory, the widget range stays authoritative** (R7). Clamping would silently override a
  creator's decision; blocking would make an experimental game unbuildable.
- KTD3. **The steward writes declarations only** (R11) and runs in the build, not in a model turn. Merge/retire is a
  deterministic function of two manifests, so it belongs in CI where a regression fails the build.
- KTD4. **Reuse the existing ask path** (R9) rather than adding a second chat surface; the dock already carries one
  message → one ticket.
- KTD5. **`kind` reuse of palette categories** (R5) keeps the rail binding unchanged, so no new chrome and the
  prototype's editor look is preserved.

### Assumptions

- The first game with both a loot and an encounters system is not yet chosen (planning pack T2). Until it exists, the
  automated slice runs against the stub game in `packages/sdk-conformance/test/fake-session.ts`, and R13–R15 are checked against
  that fixture; the human prototype pass runs on the first real game in phase 0.
- Two workspaces fit the rail at phone width alongside the palette; if measurement says otherwise, the pair ships with
  one workspace visible at a time and the plan pauses for Kevin (open question Q1 in the design doc).
- Preset values can be authored from the pattern cards' tunable ranges without new research.

### Sequencing

Phase 0 gate first (a game, or the fixture, that actually has both systems). Then declaration + steward + conformance
(they can be reviewed from manifests alone), then host rendering, then presets and the ask seed, then the fixture
round-trip proof, then the real-game prototype pass.

---

## Implementation Units

### U0. Confirm the target game (gate, no code)

- **Goal:** Identify the first game (or fixture) whose build declares both a loot and an encounters system, and record
  its two system tickets.
- **Requirements:** R13, R14.
- **Dependencies:** None.
- **Files:** none (recorded in the issue and the PR body of the implementing ticket).
- **Approach:** Check the Build Order of the first game in `games/`. If no such game exists, use the conformance
  fixture game module and proceed; the human prototype pass is then deferred to the first real game and named in the
  PR as a post-deploy check.
- **Test scenarios:** n/a.
- **Verification:** The chosen target is named in the PR body with the file paths of its two systems.

### U1. Declare the format in contracts

- **Goal:** Ship `EditorWorkspaceDecl`, `EditorObjectDecl`, `EditorPresetDecl`, `ControlSafeRange`, and the three new
  `ControlDecl` fields, with fixtures.
- **Requirements:** R1, R2, R4.
- **Dependencies:** U0.
- **Files:** `packages/contracts/src/game.ts`, `packages/contracts/src/index.ts` (append only),
  `packages/contracts/fixtures/` (workspace fixtures + `check-fixtures.mjs` coverage),
  `packages/contracts/test/game.test.ts`.
- **Approach:** Add the shapes beside `controlDeclSchema`, extend `gameManifestSchema` with an optional `editor`
  (loose objects so unknown future fields survive), and publish the generated JSON Schema through the existing
  generator rather than by hand.
- **Execution note:** Write the fixture and the failing schema test first; a shape that accepts a workspace whose
  section names an unknown control is not acceptable.
- **Patterns to follow:** `controlDeclSchema` + `gameSchemas` at the end of `game.ts`; fixture style in
  `packages/contracts/fixtures/` (`*.v1.json` plus a negative case under `*-negative/`).
- **Test scenarios:** a valid two-workspace manifest parses; a `safe` range outside the widget range is rejected by
  C13 rather than the schema; an unknown extra field on a workspace survives a parse/re-serialize round trip; the
  generated schema includes the new definitions.
- **Verification:** `pnpm --filter @ogm/contracts test` passes and the generated schema diff is additive.

### U2. The steward and its checks

- **Goal:** Merge per-system fragments deterministically, retire and alias what disappeared, and verify the result.
- **Requirements:** R10, R11, R12.
- **Dependencies:** U1.
- **Files:** `packages/gm-cli/src/commands/editor/steward.ts`,
  `packages/gm-cli/src/commands/editor/steward.test.ts`,
  `packages/gm-cli/src/commands/build/index.ts` (call the steward before artifact checks),
  `packages/sdk-conformance/src/checks/c12-workspace-shape.ts`, `c13-safe-ranges.ts`, `c14-ask-coverage.ts`,
  `packages/sdk-conformance/src/checks/index.ts`, mirrored test files under `packages/sdk-conformance/test/checks/`
  plus a two-system fixture game beside `packages/sdk-conformance/test/fake-session.ts`.
- **Approach:** A pure function `mergeEditor(previous, fragments) → { editor, overrides, report }` with the table from
  the design doc §5.2, plus the three static checks over the merged manifest. The `gm` command prints the report and
  fails non-zero when a merge would drop a control without retirement.
- **Execution note:** Start from the merge table as a test table, including the two failure cases (two systems
  declaring one id, and a control with no workspace); observe them fail before implementing.
- **Patterns to follow:** existing `gm` command modules (`packages/gm-cli/src/commands/build/index.ts` for
  `CommandError`/`EXIT`), and the check shape in `packages/sdk-conformance/src/checks/c09-hints.ts`.
- **Test scenarios:** unchanged control is kept; renamed control produces an alias; removed control is retired with a
  reason; widget-type change without `migrateOverride` fails C9; duplicate id across two systems fails the merge; a
  control whose prefix has no workspace fails C12; a preset value outside the safe band fails C13; an advanced slider
  with no help and no ask seed fails C14; `editor-report.json` is byte-identical across two runs on the same inputs.
- **Verification:** `pnpm --filter @ogm/gm-cli test`, `pnpm --filter @gm/sdk-conformance test`, and
  `pnpm conformance` stay green.

### U3. Rail and Inspector render one workspace

- **Goal:** Render published workspaces through the existing rail and Inspector, filtered by section, with the safe
  band shown.
- **Requirements:** R5, R6, R7.
- **Dependencies:** U1.
- **Files:** `apps/web/src/features/editor/EditorChrome.tsx`, `Inspector.tsx`, `Rail.tsx`, `editor.css`,
  `apps/web/src/features/editor/workspace.ts` (new, small: workspace resolution and section filtering),
  plus `workspace.test.ts`, `Inspector.test.tsx`, `EditorChrome.test.tsx`.
- **Approach:** Resolve controls into workspaces once per manifest, drive the rail from `manifest.editor` when present
  and fall back to today's palette categories when it is not, and pass the active workspace to `Inspector` as a filter.
  The safe band is a CSS region inside the existing range input and one line of text under the row.
- **Execution note:** The no-chrome rule is the review gate: the diff must not add a heading, tab bar or button that
  the editor does not already have.
- **Patterns to follow:** `manifestControls()` parsing in `EditorChrome.tsx`; `controlContext()` scoping in
  `Inspector.tsx`; existing `tap-secondary` control classes.
- **Test scenarios:** a manifest with two panel workspaces shows two rail entries and only the active workspace's
  controls; a manifest with no `editor` keeps today's behaviour; a control not named by any section is never rendered
  (C12 catches it at build instead); a slider with `safe` shows the band and the warning line appears once when a value
  leaves it and not again in the same session; an empty workspace is not rendered.
- **Verification:** `pnpm --filter @ogm/web test` passes; `pnpm --filter @ogm/web lint` and `typecheck` pass.

### U4. Presets as one transaction

- **Goal:** Apply a preset's values as a single undoable transaction.
- **Requirements:** R8.
- **Dependencies:** U1, U3.
- **Files:** `apps/web/src/features/editor/presets.ts` (new, small),
  `apps/web/src/features/editor/presets.test.ts`, `Inspector.tsx` (render preset buttons for the active workspace).
- **Approach:** Map a preset to `EditorCommand[]` (`op: 'set'` per value) and submit them through the existing
  `createIntent`/`coalesceIntents` path so undo, validation and the `applyDesign` result string are unchanged.
- **Test scenarios:** a three-value preset produces one transaction with three commands; one undo restores all three
  values; a preset naming a retired control fails validation with a readable error; a preset taking a structural knob
  reports `'restart-scene'` exactly once.
- **Verification:** `pnpm --filter @ogm/web test` passes and the affected editor specs are green.

### U5. Per-control ask seed

- **Goal:** Seed the dock with the control context packet and file one edit job as today.
- **Requirements:** R9.
- **Dependencies:** U3.
- **Files:** `apps/web/src/features/build-chat/dock.ts` (`EditDraft` gains an optional `control` context),
  `apps/web/src/features/build-chat/ask.ts` (new, small: packet builder),
  `apps/web/src/features/build-chat/ask.test.ts`, `apps/web/src/features/build-chat/dock.test.ts`,
  `apps/web/src/features/editor/Inspector.tsx`.
- **Approach:** The affordance calls `startEdit` with a draft carrying the workspace and control context; the composer
  pre-fills one seed question and attaches the packet as the message's structured prefix. `editJobRequest` is not
  changed.
- **Test scenarios:** the packet contains id, label, value, widget range, safe range with its rationale and the last
  transaction label; a control with no `safe` omits the field; a filed ask produces exactly one job request with the
  packet in the summary; no credential, host or player identity appears in the packet.
- **Verification:** `pnpm --filter @ogm/web test` passes; a manual dock check is recorded in the PR.

### U6. Round-trip proof on the target

- **Goal:** Prove both workspaces against a real build: one live knob, one structural knob, one preset, one ask.
- **Requirements:** R13, R14, R15.
- **Dependencies:** U1–U5.
- **Files:** the target game's two system modules (declarations), the two-system fixture game in
  `packages/sdk-conformance/test/`, `packages/sdk-conformance/test/checks/` (fixture-driven C12–C14 coverage).
- **Approach:** Declare the two workspaces in the systems, run `gm build` (steward + checks), then exercise the four
  interactions in the editor and record what changed.
- **Test scenarios:** gold drop chance change is visible in the next fight's rewards without a reload; wave size change
  is visible on the next wave; a structural knob (enemy type set) returns `'restart-scene'` and the scene rebuilds;
  undo after each interaction restores the previous design; a preset applies and undoes as one step.
- **Verification:** `gm build` writes a valid `manifest.editor` and a clean `editor-report.json`; the conformance suite
  is green; the four interactions are recorded with the values used.

---

## Verification Contract

| Gate | Scope | Done signal |
|---|---|---|
| Contracts | `pnpm --filter @ogm/contracts test` | new shapes and fixtures parse; generated schema is additive |
| Steward | `pnpm --filter @ogm/gm-cli test` | merge table including both failure cases passes |
| Conformance | `pnpm --filter @gm/sdk-conformance test` and `pnpm conformance` | C12–C14 pass on all three templates and the fixture |
| Web unit | `pnpm --filter @ogm/web test` | workspace filtering, safe band, presets and ask packet pass |
| Static | `pnpm lint`, `pnpm typecheck`, `pnpm build` | repository gates pass |
| Browser | affected editor spec only, with the repository GPU flags | the editor renders two workspaces at phone width |
| Manual | the four interactions in U6 | live, structural, preset and ask each observed and recorded |

## Definition of Done

- A game can publish `manifest.editor` with two workspaces and the editor renders exactly those two, in `order`, with
  no new chrome.
- Every control resolves to one workspace; the steward retires and aliases what changes and writes a readable report.
- Safe ranges are advisory, justified, and shown; presets apply as one transaction; every control can seed an ask that
  becomes one ticket through the existing path.
- C12–C14 are in the conformance suite and fail a build that breaks the workspace shape.
- No change to `applyDesign`, `EditorCommand`, `Transaction`, `ReapplyReport`, or the publish gate.
- Focused tests pass, the full-diff review reports no blocking findings, and the four U6 interactions are recorded in
  the PR.
