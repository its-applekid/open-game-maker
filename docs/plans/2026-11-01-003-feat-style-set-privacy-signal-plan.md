---
title: Style Set Privacy Signal - Plan
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Style Set Privacy Signal - Plan

## Goal Capsule

- **Objective:** Let the creation flow force private repository visibility when a selected style set contains a vendor-licensed pack.
- **Authority:** Issue 215 defines the behavior; resolved collection-card licenses are the classification source; repository conventions govern implementation and validation.
- **Execution profile:** Extend the existing style-family API contract and serializer, prove the response through focused API tests, and document the consumer-facing field.
- **Stop condition:** Every style set reports the derived boolean, public-only and `LicenseRef-*` cases are covered, and no license details are exposed.
- **Tail ownership:** The implementation includes focused package validation, full-diff review, PR evidence, and CI handoff.

---

## Product Contract

### Summary

Expose a privacy requirement on every style-set choice so the creation flow can select repository visibility without maintaining a client-side pack allowlist.

### Problem Frame

The style-family catalog returns set membership but omits the pack-license fact that determines repository visibility.
The client cannot safely infer that fact from pack ids, labels, family notes, or rights audience without duplicating server-owned policy.

### Requirements

#### Catalog behavior

- R1. Every style set in `GET /api/catalog/style-families` exposes a stable boolean indicating whether selecting it requires a private repository.
- R2. The boolean is true when any resolved pack license in the set is a `LicenseRef-*` value and false only when every referenced pack resolves through the license catalog to a public SPDX value.
- R3. The response does not expose license ids, notes, or other license detail.

#### Verification and documentation

- R4. Catalog tests cover both a public-only set and a `LicenseRef-*` set.
- R5. API documentation names the field, its derivation rule, and its creation-flow use.

### Scope Boundaries

- This ticket adds the provider contract only; creation-screen enforcement remains with issue 93.
- Family curation, license rows, repository provisioning, and the visual design are unchanged.
- Missing collection cards fail closed to private repository visibility rather than allowing an unsafe public choice.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Put `requiresPrivateRepository` on each set object because repository visibility depends on the selected compatibility set, not the broader style family.
- KTD2. Canonicalize each matched collection card's `resolved.license` through the license catalog. Treat `LicenseRef-*`, `NOASSERTION`, an unknown license, or an unresolved referenced pack as private-required; return false only for recognized public SPDX rows.
- KTD3. Keep license data server-side and return only the derived boolean required by the creation flow.

### Assumptions

- `OGM_ASSETS_ROOT` normally supplies every resolved collection card used for production creation choices; absent or incomplete metadata must fail closed.
- The license catalog is the canonical source for aliases and audience; the `LicenseRef-` namespace remains private-required even for a row whose audience is public.

### Sequencing

Update the exported API type and serializer together, then lock the behavior with request-level tests before documenting the field.

---

## Implementation Units

### U1. Expose the derived set privacy requirement

- **Goal:** Add and populate the style-set privacy boolean without exposing license metadata.
- **Requirements:** R1, R2, R3, R4; KTD1, KTD2, KTD3.
- **Dependencies:** None.
- **Files:** Modify `packages/asset-cards/src/families.ts`, `services/api/src/catalog/routes.ts`, and `services/api/test/catalog.test.ts`.
- **Approach:** Extend `StyleFamilyApi` at the set level. During catalog serialization, resolve each set pack through the existing pack-to-collection map and canonicalize its license with `licenseFor`; report true unless every referenced pack has a recognized non-`LicenseRef-*` row with public audience.
- **Patterns to follow:** Reuse the existing `byPack` lookup and async set serializer in `services/api/src/catalog/routes.ts`; keep the exact response-shape assertion in `services/api/test/catalog.test.ts` current.
- **Execution note:** Start with request-level assertions for the false and true cases so the test fails before the response field exists.
- **Test scenarios:**
  - A public Kenney set whose referenced packs all resolve to `CC0-1.0` collections returns `requiresPrivateRepository: false`.
  - A Synty set backed by a resolved `LicenseRef-synty-personal` collection returns `requiresPrivateRepository: true`.
  - A collection retaining public audience but carrying a `LicenseRef-*` license still makes its set return true, proving the derivation does not substitute rights audience.
  - A set with any unresolved referenced pack returns true, including when the catalog has no asset library.
- **Verification:** The API response type and request-level assertions agree, and the response contains no license detail.

### U2. Document the creation-flow contract

- **Goal:** Give the creation-flow consumer a concise source-of-truth description of the new field.
- **Requirements:** R5.
- **Dependencies:** U1.
- **Files:** Modify `services/api/README.md`.
- **Approach:** Extend the existing style-family endpoint note with the field name, exact `LicenseRef-*` derivation rule, and instruction that a true value forces private repository visibility.
- **Patterns to follow:** Keep the endpoint documentation near the existing `OGM_ASSETS_ROOT` explanation.
- **Test expectation:** None -- this is documentation of the request contract proven in U1.
- **Verification:** The field and consumer behavior are discoverable without reading implementation code.

---

## Verification Contract

| Gate | Applicability | Done signal |
|---|---|---|
| `pnpm --filter @ogm/api test` | U1 request contract and derivation | Catalog tests pass with public and `LicenseRef-*` expectations. |
| `pnpm --filter @ogm/asset-cards typecheck` | U1 exported API type | The extended contract type checks. |
| `pnpm --filter @ogm/api typecheck` | U1 provider and tests | Provider and consumer-facing test types agree. |
| `pnpm --filter @ogm/asset-cards lint` | U1 shared contract | No lint findings in the contract package. |
| `pnpm --filter @ogm/api lint` | U1 provider and tests | No lint findings in the API package. |
| Full diff review against `main` | Whole change | No blocking correctness, maintainability, testing, or project-standard findings remain. |

---

## Definition of Done

- U1 is complete when every returned set carries the boolean, exact license-reference behavior is covered, and the API emits no license details.
- U2 is complete when the creation-flow consumer can implement the privacy invariant from the endpoint documentation.
- The final diff contains no unrelated refactor or abandoned experimental code.
- Focused validation, code review, PR evidence, and CI handoff satisfy the repository workflow.
