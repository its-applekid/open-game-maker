# Ticket writer brief (shared by every lane writer)

You write the ticket documents for one lane of the OGM V1 build. Each ticket becomes a GitHub issue body verbatim and is implemented by a Codex or Claude coding agent that must start within minutes without re-deriving the research. Your two files per ticket are the whole handoff.

## Read first, in this order

1. `docs/plans/ogm-v1-build/README.md` (objective, constraints, authority), `questions-or-commands.md` (assumptions A1–A14).
2. `requirements.md` (R-IDs), `decisions.md` (D-IDs), `architecture.md` (layout, interfaces, owners, lanes).
3. `build-order.json`: your lane's ticket records (id, title, outcome, depends_on, write_surfaces, contract_surfaces, requirement_refs, decision_refs, external_gates). These fields are fixed; do not change ids, dependencies or outcomes. `graph.md` for the phase and what each ticket unblocks.
4. Your lane's evidence packet(s) in `evidence/` (named in your prompt) and any packet another ticket's contract comes from.
5. The repository at the researched commit `9508c1c` (branch `research`): verify every file, script, schema or tool you name as a reuse target exists. A named target that does not exist is a defect; say "new" instead.
6. aiur's planning contract template: `/home/orangekid/github/aiur/.agents/skills/aiur-build/references/planning-contract.md` (the ticket document shape) and one example `/home/orangekid/github/aiur/.agents/skills/aiur-build/references/example-tickets/BO-001-project-graph.md`.

Rules: never `cd`; use absolute paths; read-only on the repository except the files you own; no git commands that change state; no network; no installs. Do not edit `build-order.json`, other lanes' tickets, or any pack file except your own ticket files.

## File 1: `tickets/<ID>.md` (the issue body)

Use this exact skeleton (headings verbatim; keep it under ~140 lines):

```markdown
# <ID> — <title>

**Kind:** executable | capstone
**Complexity:** <points> — <one-line rationale>
**Risk:** low | medium | high
**Phase hint:** <from graph.md>
**Depends on:** <ids or none>   **Suggested after:** <ids or none>   **External gates:** <ids or none>
**Requirements:** <R-IDs>   **Decisions:** <D-IDs>
**Researched at:** 9508c1c46735e442a2e07a1bffad2bb9f190da8d

## Plan context

- Pack index: https://github.com/its-everdred/open-game-maker-2000/blob/research/docs/plans/ogm-v1-build/README.md
- Architecture: https://github.com/its-everdred/open-game-maker-2000/blob/research/docs/plans/ogm-v1-build/architecture.md
- Decisions: https://github.com/its-everdred/open-game-maker-2000/blob/research/docs/plans/ogm-v1-build/decisions.md
- Graph: https://github.com/its-everdred/open-game-maker-2000/blob/research/docs/plans/ogm-v1-build/graph.md
- Deep research for this ticket: https://github.com/its-everdred/open-game-maker-2000/blob/research/docs/plans/ogm-v1-build/tickets/<ID>-plan.md
- Evidence: <links to the evidence packets this ticket rests on>

## Outcome

One observable result, phrased for an operator.

## Context and evidence

Why this exists; the two to five evidence packets (E<track>-<n>) that decide it; the contradictions already resolved so the agent does not reopen them.

## Scope

- Exact behavior and contract this ticket owns (bullets).

## Non-goals

- Sibling behavior this ticket must not absorb (name the sibling ticket).

## Existing owner and reuse target

What exists today (exact paths, verified) and what is new.

## Contract and invariants

The stable interface this ticket defines or consumes. For a producer: the exact TypeScript (or YAML/JSON) shape, quoted. For a consumer: "copy from <producer ticket> `<file>`; do not redefine".

## Refreshable implementation notes

Files to create and modify (full repo-relative paths), module and function names, the pattern to copy (a file path), one worked data shape or fixture, commands to run. Marked refreshable against the researched commit.

## Acceptance and verification

### Agent gate
- Tests the agent runs (exact commands) and what they prove; every new test must fail without the production change.
### At-merge gate
- `ci / required` green on current main; anything else named.
### Human or e2e evidence
- None, or the named manual check (e.g. "real iPhone: …").

## Failure, security, migration and accessibility cases

What can go wrong at the seams; secrets never in reach of agents; migrations are timestamped files; 64 px primary targets where UI is involved.

## Surfaces

- Reads: …  - Writes: … (from build-order.json)  - Contracts: …

## Sibling boundaries and open gates

Which tickets share a surface and how the split holds; external gates by id.
```

## File 2: `tickets/<ID>-plan.md` (the deep implementation plan)

A compound-engineering style plan a lower-tier model can execute. Sections, in order:

1. **Problem frame** (3–5 lines) and **requirements trace** (R-IDs → what this ticket does for each).
2. **Patterns to follow**: exact files in this repo or in `/home/orangekid/github/aiur` whose shape to copy (verified paths), with one sentence each on what to copy.
3. **Implementation units** U1…Un, each with: Goal; Files (Create / Modify / Test, full paths); Approach (5–12 lines, concrete: function names, data flow, libraries with versions pinned at install, commands); Interface sketch (the exact TypeScript, SQL, YAML or CLI signature the unit produces or consumes); Test scenarios (happy path, edge, failure, integration; each one line "Given … when … then …"); Execution note when test-first or characterization-first matters.
4. **Verification**: the exact commands (`pnpm --filter … test`, `pnpm -r typecheck`, a curl, a Playwright run) and the evidence to paste into the PR's `## Local tests`.
5. **Deferred to implementation**: questions the agent may decide itself, with a default for each.
6. **Scope boundaries**: explicit non-goals with the owning sibling ticket.
7. **Risks**: with the default taken.

Length: 120–300 lines per plan. Specific beats long: prefer one exact path and one exact command over paragraphs. Where the architecture or decisions fix a choice (D-DB SQLite + Drizzle, D-API Hono + Zod, D-ROOMS Colyseus 0.18, D-HOOKS names), use it; do not reopen it. Where a producer contract exists in another ticket's evidence packet (e.g. T04 §4 TypeScript, T07 §4.1, T08 §4, T02 §4, T03 §4, T06 §4, T11 §4), quote it verbatim in the producer's ticket and reference it from consumers.

Repository conventions every plan must state: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

When done, reply with one line per ticket: id, both files written, line counts, and any reuse target you found missing.
