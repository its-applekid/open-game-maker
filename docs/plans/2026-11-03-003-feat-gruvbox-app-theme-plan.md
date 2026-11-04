---
title: Gruvbox App Theme - Plan
type: feat
date: 2026-11-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Gruvbox App Theme - Plan

## Goal Capsule

- **Objective:** Move all web-app chrome to a single Gruvbox dark token contract, use flat fills, and make neutral green the primary action colour without changing layout, motion, copy, or title-town artwork.
- **Authority:** Issue #451 defines the palette and visual boundaries; the existing prototype defines layout and interaction fidelity; repository instructions define validation and PR evidence.
- **Execution profile:** Styling and regression coverage across `apps/web`, followed by phone-sized visual verification.
- **Stop condition:** Stop if satisfying the palette requires changing artwork, content imagery, layout, copy, or interaction behavior.
- **Tail ownership:** The implementing agent owns focused tests, visual evidence, review, commit, push, and PR handoff.

---

## Product Contract

### Summary

Replace the web app's brown, purple, teal, and orange-primary chrome with a flat Gruvbox dark theme shared by every screen while preserving the accepted interface shape.

### Problem Frame

The web app already carries part of the Gruvbox palette, but its semantic tokens still resolve to translucent purple surfaces, its global backdrop paints moving multicolour gradients, and several screens define their own colours and gradients. The result is inconsistent with the requested Gruvbox scheme and makes the sign-in surface orange-led.

### Requirements

**Palette and token ownership**

- R1. `apps/web/src/tokens.css` owns the canonical Gruvbox dark colours: bg `#282828`, bg0_h `#1d2021`, bg1 `#3c3836`, bg2 `#504945`, fg `#ebdbb2`, fg4 `#a89984`, red `#fb4934`, neutral green `#98971a`, bright green `#b8bb26`, yellow `#fabd2f`, blue `#83a598`, purple `#d3869b`, aqua `#8ec07c`, and orange `#fe8019`.
- R2. App screens consume semantic values derived from that token file instead of defining independent chrome colours.

**Flat app chrome**

- R3. Buttons, cards, and app backgrounds use flat fills with no CSS or canvas gradients.
- R4. The page background is plain Gruvbox bg without the animated brown, teal, or other radial glow treatment.
- R5. Primary actions use flat neutral Gruvbox green `#98971a` with no highlight border and bg-dark text; secondary controls use bg1 with fg text, keyboard `focus-visible` rings use a thin aqua outline, and danger states use red.
- R6. Yellow is reserved for highlights and statuses. Orange is not a primary action colour and appears only where it carries a non-primary semantic distinction.

**Scope and fidelity**

- R7. Sign-in, age, games, creation, editor, settings, admin, shared chat, notifications, and app chrome follow the shared palette.
- R8. Title-town 3D and logo artwork remain unchanged; the title Start and mute controls plus the embed's document chrome follow the Gruvbox tokens.
- R9. Existing layout, sizing, motion, interaction flow, and copy remain unchanged.
- R10. Text and control combinations meet WCAG AA contrast, with focused checks for normal text and primary actions.
- R11. Phone screenshots record sign-in, title, games, one creation step, and the editor before and after the change.

### Scope Boundaries

- Static title-town artwork, game cover images, style preview media, and user-authored game content are not recoloured.
- This work does not redesign components, introduce new navigation or helper copy, or change product behavior.
- Shadows and artwork drop-shadows may remain when they do not create a gradient fill.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Keep one source token file and express both canonical palette names and compatibility semantic aliases there. This lets existing screens migrate without creating a second theme layer.
- KTD2. Enforce the palette contract with a source-level regression test that detects forbidden gradients and chrome colour literals outside the token file. Pure visual review alone would allow future drift.
- KTD3. Remove the animated canvas backdrop rather than repaint it in Gruvbox. A moving multi-stop glow is itself the forbidden background treatment.
- KTD4. Preserve media and title-town art as content. The flat-fill rule applies to app chrome and CSS-generated placeholders, not imported visual assets.

### Assumptions

- A flat single-colour placeholder is app chrome and should replace the current generated gradient when cover art is absent.
- Semantic orange may remain for a non-primary data series or category. Yellow remains available only for highlights and statuses, never primary actions.
- Existing shadows remain in scope only for colour-token migration; their geometry and blur are unchanged.

### Sequencing

The token contract and its regression test land first. Screen styles then migrate to the contract, after which browser checks produce the final contrast and screenshot evidence.

---

## Implementation Units

### U1. Establish the shared Gruvbox contract

- **Goal:** Make the canonical palette and semantic surface/action/focus roles explicit in one file and lock the contract with regression coverage.
- **Requirements:** R1, R2, R3, R5, R10.
- **Dependencies:** None.
- **Files:** `apps/web/src/tokens.css`, `apps/web/src/app/tokens.test.ts`, `apps/web/index.html`, `apps/web/title-town/index.html`.
- **Approach:** Define canonical Gruvbox tokens, map existing semantic aliases to them, make the document background and focus treatment use the new roles, and add static assertions for exact palette values, contrast-critical role mappings, and gradient drift.
- **Execution note:** Add the contract assertions first and observe them fail against the current theme; colour migration itself is styling work, so browser inspection is the replacement proof for pixels.
- **Patterns to follow:** Existing file-backed checks in `apps/web/src/app/tokens.test.ts` and the global import in `apps/web/src/main.tsx`.
- **Test scenarios:** The exact canonical values are present; keyboard focus resolves to a thin aqua outline; the primary text/background pair resolves to neutral green/bg0_h without a highlight border; title-town's standalone document uses bg0_h; app CSS contains no gradient functions; non-token app CSS and TSX contain no independent chrome hex or rgb/hsl literals except documented content fixtures.
- **Verification:** Focused Vitest passes and calculated contrast ratios meet 4.5:1 for normal text and 3:1 for large/control text where applicable.

### U2. Migrate every app surface without redesign

- **Goal:** Apply the shared flat semantic roles across global chrome and all named screens while preserving component structure.
- **Requirements:** R2-R9.
- **Dependencies:** U1.
- **Files:** `apps/web/src/app/StudioChrome.tsx`, `apps/web/src/app/chrome.css`, `apps/web/src/routes/auth.css`, `apps/web/src/routes/title/title.css`, `apps/web/title-town/index.html`, `apps/web/src/routes/games/games.css`, `apps/web/src/routes/games/games-responsive.css`, `apps/web/src/routes/new/NewGameScreen.tsx`, `apps/web/src/routes/new/new.css`, `apps/web/src/routes/new/new-prototype.css`, `apps/web/src/routes/game/game.css`, `apps/web/src/routes/game/game-prototype.css`, `apps/web/src/routes/game/merge/merge.css`, `apps/web/src/routes/game/releases/releases.css`, `apps/web/src/routes/game/versions/versioning.css`, `apps/web/src/routes/age/age.css`, `apps/web/src/routes/settings/settings.css`, `apps/web/src/routes/admin/admin.css`, `apps/web/src/routes/admin/admin-mobile.css`, `apps/web/src/routes/connect/connect.css`, `apps/web/src/features/editor/editor.css`, `apps/web/src/features/build-chat/dock.css`, `apps/web/src/features/build-chat/chat.css`, `apps/web/src/features/build-chat/checkpoint-card.css`, `apps/web/src/features/bug-report/bug.css`, `apps/web/src/lib/notify/toasts.css`.
- **Approach:** Remove CSS/canvas gradients, replace independent chrome colours with semantic tokens, normalize primary and secondary controls, and keep every selector's layout, spacing, typography, and transition rules unchanged.
- **Patterns to follow:** Existing screen selectors and prototype-fidelity rules; the change alters declarations rather than DOM structure.
- **Test scenarios:** Sign-in and games use borderless neutral-green primary actions; creation choices and Next/Finish controls use token roles; editor panels and mode controls use the dark palette; settings/admin/chat surfaces consume shared tokens; title Start uses the exact flat green treatment while the mute control and embed document use Gruvbox chrome and town/logo media remains untouched.
- **Verification:** The source contract test passes, focused component tests remain green, and diff review shows no layout, copy, or component-tree changes.

### U3. Verify phone appearance and accessibility

- **Goal:** Demonstrate the requested screens at phone size and catch visual regressions before handoff.
- **Requirements:** R9-R11.
- **Dependencies:** U1, U2.
- **Files:** `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/title.spec.ts`, `apps/web/e2e/games.spec.ts`, `apps/web/e2e/new.spec.ts`, `apps/web/e2e/game-editor.spec.ts`, `docs/visual-evidence/451/*.png`.
- **Approach:** Reuse the existing mocked browser fixtures to capture the same phone states before and after, run the affected responsive specs, and inspect every cited screenshot.
- **Test scenarios:** Sign-in, title screen, games spotlight, creation genre step, and editor chrome fit a phone viewport with legible text and unchanged controls; focus and action roles remain visually distinct; before/after pairs show only palette changes.
- **Verification:** Affected Playwright phone specs pass and ten screenshots are attached to the PR or linked from durable run artifacts.

---

## Verification Contract

| Gate | Scope | Done signal |
|---|---|---|
| Token regression | `pnpm --filter @ogm/web exec vitest run src/app/tokens.test.ts` | Canonical values, gradient policy, and contrast roles pass |
| Web unit suite | `pnpm --filter @ogm/web test` | Web unit/component coverage passes |
| Browser coverage | Affected phone specs for auth, title, games, creation, and editor using the repository GPU flags | Responsive behavior passes and screenshots are captured |
| Static quality | `pnpm lint` and `pnpm typecheck` | Repository lint and types pass |
| Production build | `pnpm build` | Production bundle completes |
| Visual review | Inspect each before/after phone screenshot | Only palette/fill changes are visible; no layout, copy, or artwork drift |

---

## Definition of Done

- All canonical and semantic colours live in `apps/web/src/tokens.css`, with only unavoidable document metadata or content fixtures exempted.
- No app-chrome CSS or canvas gradient remains.
- Every named screen uses flat Gruvbox roles, neutral-green primary actions, yellow highlights, bg1 secondary controls, and aqua focus rings.
- Normal text and controls meet the applicable WCAG AA contrast threshold.
- Title-town and preview artwork, layouts, dimensions, motion, flows, and copy are unchanged.
- Focused automated checks pass, before/after phone evidence is attached, abandoned styling experiments are absent, and full-diff review reports no blocking findings.
