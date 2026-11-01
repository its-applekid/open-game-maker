# Deferred findings ledger

Findings outside the active V1 boundary. Each entry: description, severity, evidence, affected component, why acceptance isn't blocked, suggested disposition. Nothing here is a ticket until Kevin or the Executor promotes it under the convergence policy.

| # | Date | Finding | Severity | Evidence | Component | Why not blocking | Disposition |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-31 | aiur has no per-ticket base branch; agent code jobs run on `main` only (D-BRANCH-BASE) | P2 | T08 E08-9 | branches | V1 branches diverge in design state; fold/merge through the commit service | file upstream (Khala list) |
| 2 | 2026-10-31 | `transcript: :none` skips provider cleanup in voice_converse | P2 | T06 E06-4 | voice host | no provider key in V1 | file upstream |
| 3 | 2026-10-31 | No host-defined tool port in voice_converse; budget tools ride the briefing | P2 | T06 E06-8 | voice | prose estimates suffice for V1 | file upstream |
| 4 | 2026-10-31 | Map layout search returns nothing until Kevin grants `derive-layout` on the ProFantasy collection and a vision pass extracts layouts | P2 | T05 E05-3, OGM-067 | assets | inspiration is a creation aid, not a gate | ask Kevin; vision pass needs spend |
| 5 | 2026-10-31 | Codex `deny_read`/permission-profile semantics unverified (spike S1 in OGM-037); fallback moves credential files out of reach | P1 if S1 fails | T03 E03-4 | sandbox | OGM-037 carries the fallback | resolve in OGM-037 |
| 6 | 2026-10-31 | Per-game subdomains (mic isolation per game) need a domain Kevin buys | P3 | T11 E11-7 | games host | shared origin accepted for a family | Kevin decides |
| 7 | 2026-10-31 | A second uid for workers (real credential boundary) needs Kevin's `adduser` | P2 | T03 E03-18 | sandbox | V1 accepts process sandbox + deny_read | Kevin's hand step, optional |
| 8 | 2026-10-31 | Host-pushed briefing refresh into live voice sessions is absent upstream | P3 | OGM-086 | voice | `waiting_on` line + get_status rule | file upstream |
