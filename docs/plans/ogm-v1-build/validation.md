# Validation report

Run 2026-10-31 (local) with `tools/validate_pack.py` against the pack at the commit this file is in. Researched commit `9508c1c46735e442a2e07a1bffad2bb9f190da8d`.

```
91 tickets, 9 phases, 0 errors, 0 warnings
```

## Semantic checks (Stage 7)

1. Every ticket is pickable by one agent and names its files, reuse targets and verification; the thirteen lane writers verified every named reuse target at the researched commit and marked the rest "new".
2. Every `depends_on` edge passes the CI-green or contract-authority test (see `tools/make_pack.py` comments and `architecture.md` §3); data-flow couplings are integration, owned by OGM-100 and the named integration tickets.
3. One defining owner per cross-ticket contract (`architecture.md` §3); the writers resolved the shared-file cases in the tickets themselves (`packages/contracts/assets.ts` split between OGM-020 and OGM-062; `net.*` over `mp.*` in OGM-020; `ogm-aiur@.service` split between OGM-002 and OGM-034).
4. Integration and feature acceptance have an owner (OGM-100) and evidence (the 20-item checklist).
5. Provider-seam failure semantics are specified where the research gave them (aiur unavailable, blob store, lease, saves OCC).
6. The count (91) follows boundaries; Kevin's "a few dozen" was calibration. The delta: every lane's first ticket is a contract or skeleton so later tickets fan out; splitting the web app and engine into screen- and area-sized tickets is what makes phases 4–7 wide.
7. The GitHub snapshot was refreshed before promotion (no prior issues; PRs #1–#7 only).
8. Generated counts in `graph.md` and `build-order.json` come from one generator.
9. Every phase is an antichain (checked by the validator); 9 phases, within the 5–10 budget.
10. Dropped data-flow couplings map to OGM-100 and the per-lane integration tickets (OGM-053, OGM-075, OGM-096).
11. Per-lane earliest start is in `graph.md`; no lane starts after phase 4 without a cited reason (design, rooms, assets start at phase 4 because they need the contracts package; chat-voice at 4 because it needs the API skeleton).
12. No ticket id encodes a phase.

## Accepted exceptions

- Plan documents are dense single-line bullets; several are under 120 raw lines but 1,100–2,000 words.
- Six requirements were mapped after the writers ran (R14, R39, R87, R88, R106, R122) by adding references to the owning tickets; the ticket documents already cover the behavior.
- Gaps the writers found outside any write surface were folded into OGM-081 (`gm progress`), OGM-022 (bug-bundle recorder), OGM-010 (health package, blobs route), OGM-035 (`file_issue`, `create_branch`, fork visibility, its own unit), OGM-037 (supervisor token and checkpoint kind), OGM-006 (voice and rooms paths), OGM-013 (scope job kind), OGM-031 (two machine users, new gate GATE-MACHINE-USERS).
