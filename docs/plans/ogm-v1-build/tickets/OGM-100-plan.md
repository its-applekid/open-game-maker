# OGM-100 plan — End-to-end proof on this machine

## 1. Problem frame

Ninety tickets each prove their own slice; nothing proves Kevin's flow end to end against services on this machine with no money spent. This capstone turns the Success Criteria and the seven Acceptance Examples into a numbered checklist with the evidence to record, runs it once on a single head SHA, reads back every requirement's disposition, and files what is unmet. It writes no product code.

Requirements trace: R120 → the platform repo's CI (`ci / required`) is green at the tested head and the proof is recorded in the repo; the Success Criteria (flow on this machine, no spend; every requirement dispositioned; `main` green) and AE1–AE7 map to checklist items 6, 13, 15, 16, 10, 9, 4–5.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/.agents/skills/aiur-build/references/example-tickets/BO-002-prove-acceptance.md`: the capstone's stance (may return rework, cannot widen the boundary).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/requirements.md` lines 197–213: the examples and criteria, copied into the checklist verbatim in the "Given/when/then" column.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tools/make_pack.py`: how the pack JSON is read (for `dispositions.py`).
- `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-verify/SKILL.md` lines 8–9 and 54: "never report a visual result you haven't looked at" and "say what was checked and what wasn't"; the checklist's Result column follows both.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/loadrec.mjs`: review a phone load every other frame (`ffmpeg … tile=10x4`), reused as `gm perf --record` for item 11.

## 3. Implementation units

### U1 Checklist document

Goal: `acceptance.md` with 20 items and empty evidence columns, committed first so the run fills a fixed list.
Files: Create `docs/plans/ogm-v1-build/acceptance.md`.
Approach: header (head SHA, date, operator, services snapshot); a table with columns `#`, `Check` (the ticket's wording), `Covers` (R-IDs, AE), `Evidence to record`, `Result`, `Evidence` (path or command + hash), `Owner on fail` (the ticket id); then `## Requirement dispositions` (generated), `## Deferred` and `## Unchecked` (always: iPhone Safari frame rate, sound balance, anything blocked). Items 1–20 exactly as in the ticket.
Test scenarios: Given the file then 20 rows, every `Covers` R-ID exists in `requirements.md` (a grep loop in the PR's local tests).

### U2 Disposition read-back script

Goal: a deterministic table of every requirement's state.
Files: Create `docs/plans/ogm-v1-build/tools/dispositions.py`.
Approach: `python3 -I dispositions.py --pack build-order.json --repo its-everdred/open-game-maker-2000` reads `requirements[]` (`id`, `disposition`, `ticket_ids`), calls `gh issue list --repo … --label feature:ogm-v1 --state all --json number,title,state,labels --limit 500` once, maps `OGM-NNN` → issue by title prefix, prints `| R-ID | disposition | tickets | merged | note |` with `merged` = all tickets closed; `--offline` reads a cached JSON for tests. Exit 1 if any R-ID in `requirements.md` is missing from the pack (set equality check parses `- R\d+\.` lines).
Test scenarios: Given the cached issue JSON fixture then the table has one row per R-ID and `merged` is correct for a closed/open pair; Given a requirement absent from the pack then exit 1 naming it.

### U3 Environment bring-up

Goal: everything the checklist needs is running at one head SHA.
Files: none (operations).
Approach: `git -C <repo> checkout main && git rev-parse HEAD` → the head SHA; `pnpm install && pnpm -r build`; `ops/bin/ogm-status` (OGM-008) must show all units active; `ops/bin/ogm-ingress.sh` applied (OGM-006, needs GATE-TS-OPERATOR); the commit service env has the GitHub App values (GATE-GITHUB-APP); create the test creator and family member through the admin API (OGM-017) with a test GitHub account for the creator; set a small daily allowance to trigger item 6; seed the offline store (OGM-038). Record the snapshot in `acceptance.md`'s header.

### U4 The game-side run (items 4–10, 12–15, 18–19)

Goal: evidence from commands.
Files: evidence under `~/.local/share/ogm/acceptance/<date>/` and sheets under `docs/plans/ogm-v1-build/acceptance/`.
Approach: drive the API with `curl` (or the web app on desktop Playwright, OGM-070's e2e) for job creation, the budget offer, branch, merge, publish, rollback; for each step capture the JSON response into `evidence/<n>-<name>.json`; `gm run --viewport both --record 10s` on the draft and on the published build for sheets; `gm test --json` from the worker's PR; item 10 with a Synty asset in a scratch public-repo publish attempt (expect exit 1 and the commit service's refusal in its log); item 19 by planting a crash in the draft and pressing the bug button on desktop, then following the repair issue and PR. Every evidence file gets a line in `SHA256SUMS`.

### U5 The room run (items 16–17)

Goal: two-client evidence.
Approach: run OGM-055's `packages/gm-verify/scenarios/two-client.ts` against the live services with the invite link from item 16's API call; keep its report JSON; for item 17 kill the host context and read the room's end state from the API (`ended: host-left`) and the saved progress row.

### U6 The phone run (items 2, 3, 11) with Kevin

Goal: real-iPhone evidence for what emulation cannot show.
Approach: send Kevin the three steps and the Funnel URL; he records his screen (Settings → Control Centre → Screen Recording) for sign-in, the games picker, playing the draft with sound on after the first tap; the clip goes to `evidence/` with its hash; the Executor watches it every other frame for item 11 (poster → live with no cut, no black frame) and notes `unchecked: iPhone frame rate` (a number needs a real profile, A9 §3.5).

### U7 Fill, read back, file

Goal: the document is complete and honest.
Approach: fill `Result`, `Evidence`, head SHA and date per item; `python3 -I docs/plans/ogm-v1-build/tools/dispositions.py` output pasted under `## Requirement dispositions`; every `fail` → a rework comment on the owning ticket's issue (aiur `agent:todo` rework per `aiur-run`), and the item stays `fail` until the rerun; every `blocked:<gate>` and every unmet requirement → `deferred-findings.md` (append, dated); copy ≤12 sheets (≤300 KB, `pngquant`-free: use `gm shot --sheet` output scaled to 1200 px) into `acceptance/`; open the PR with `Closes #<issue>`.

## 4. Verification

```
git rev-parse HEAD                                           # head SHA for the header
ops/bin/ogm-status                                            # item 1
curl -s https://<funnel-host>:8443/healthz                     # item 2 (plus Kevin's phone)
python3 -I docs/plans/ogm-v1-build/tools/dispositions.py --pack docs/plans/ogm-v1-build/build-order.json
grep -c '^| [0-9]' docs/plans/ogm-v1-build/acceptance.md       # 20
for r in $(grep -o '^- R[0-9]*' docs/plans/ogm-v1-build/requirements.md | tr -d '- '); do grep -q "| $r " docs/plans/ogm-v1-build/acceptance.md || echo "missing $r"; done
sha256sum -c ~/.local/share/ogm/acceptance/<date>/SHA256SUMS
du -ch docs/plans/ogm-v1-build/acceptance/*.png | tail -1     # under 4 MB
```
Evidence to paste into `## Local tests`: the head SHA, the status output, the dispositions table summary line (counts by disposition and merged), the `20`, the `sha256sum -c` OK count, and a list of items with their Result.

## 5. Deferred to implementation

- Driving the flow by `curl` vs the web app's Playwright e2e: default `curl` for API-level items (6, 10, 15, 18) and the web app on desktop for visible ones (7, 8, 12, 13, 14), phone for 3 and 11.
- Where clips live: default `~/.local/share/ogm/acceptance/<date>/` with `SHA256SUMS`; only sheets are committed.
- Number of sheets: default one per visible item (≤12).
- Whether to run the sameness eval (OGM-097) as part of the proof: default no (quota); mention its last result if one exists.

## 6. Scope boundaries

- Fixes: owning tickets. Archive: OGM-101. Checkpoint deploy: Executor (A14). The two-client scenario code: OGM-055. Eval: OGM-097.

## 7. Risks

- Gates unresolved at run time (Funnel, GitHub App): items blocked, ticket stays open; the ledger records it; nothing is faked.
- Flow spans many tickets that may still be in rework: run items in dependency order (1–5 first) and stop at the first hard `fail`, file rework, rerun from a new head; the header records every rerun's SHA.
- Evidence size: sheets only in git; clips by hash.
- Kevin's time: three phone steps, under ten minutes, scripted in one message.
