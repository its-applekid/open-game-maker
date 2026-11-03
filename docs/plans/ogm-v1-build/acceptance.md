# OGM V1 acceptance record

- Tested head: `ea07d2d991be177b30900c9005d46b7e64ba3c1f`
- Date: 2026-11-02
- Operator: pending post-deploy run
- Services snapshot: blocked in the issue workspace; `ops/bin/ogm-status --json --check` produced no output and was interrupted after 90 seconds
- Evidence directory: `~/.local/share/ogm/acceptance/2026-11-02/` (to be created by the post-deploy run)

No pass result below is inferred from a unit test or from a merged owner ticket. The issue workspace cannot operate the
deployed service stack, external GitHub test account, family-member account, or physical phone. Those checks remain
`blocked:post-deploy` until the named evidence is captured against the single tested head above. Check 16 is `fail`
because its workspace-capable two-client scenario reached the live integration path and produced a failing report.

## Numbered checks

| # | Check | Covers | Evidence to record | Result | Evidence | Owner on fail | Head SHA | Date |
|---|---|---|---|---|---|---|---|---|
| 1 | Services: every `ogm-*` unit is active and every listener is loopback-only. | R69 | Complete output from `ops/bin/ogm-status --json --check`. | blocked:post-deploy | Workspace probe returned no output within 90 seconds; rerun from the operator session after deployment. | OGM-008 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 2 | Ingress: the API health endpoint is reachable from a phone on cellular and from the tailnet. | R69; OGM-006 | Phone screenshot plus `curl -fsS https://<tailnet-host>:8443/healthz` output. | blocked:post-deploy | Requires the deployed Funnel endpoint and a physical phone on cellular. | OGM-006 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 3 | Sign-in on a phone: age screen to passkey or magic link to games picker. | R1, R2 | Trimmed phone recording; note the 64 px targets and captions/read-aloud defaults. | blocked:post-deploy | Requires operator credentials and physical iPhone Safari. | OGM-011, OGM-072 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 4 | GitHub connect: a creator connects an account and a new game receives the complete repository scaffold. | R6, R62; AE7 | `gh repo view` plus listings for `.aiur`, `ci.yml`, skills links, `AGENTS.md`, and `skills.lock`. | blocked:post-deploy | Requires the configured GitHub test account and creates an external repository. | OGM-036 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 5 | Daemon: the first admitted job starts `ogm-aiur@<slug>` and appears as todo within one poll. | R61; AE7 | `systemctl --user status ogm-aiur@<slug>` and `aiur status` output. | blocked:post-deploy | Requires the provisioned game repository and deployed daemon fleet. | OGM-034 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 6 | Budget offers: an over-allowance request offers trim, split, queue, and ask; queue files at reset with the reserved cap. | R11, R12, R26; AE1 | Redacted API JSON and the filed issue's spend cap. | blocked:post-deploy | Requires a deployed test family with a controlled allowance and reset. | OGM-013, OGM-031 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 7 | Make a game by text: scope chat finishes in an admitted job. | R20, R21, R88 | Trimmed creation-flow clip and admitted job identifier. | blocked:post-deploy | Requires the deployed web app, API, and creator account. | OGM-074 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 8 | Stills arrive: the build chat receives at least one still and one clip, and the report names the Intel renderer. | R22, R102 | Build-chat screenshot and `report.json` renderer field. | blocked:post-deploy | Requires a live build on the target Intel GPU. | OGM-076, OGM-090 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 9 | Gates: the game PR has green `gm check`, `gm test`, and `ci / required`; `gm test --json` records 3,600 ticks and restore round-trip. | R103; AE6 | PR checks screenshot and `gm test --json` output. | blocked:post-deploy | Requires the game repository and its generated build PR. | OGM-093 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 10 | Assets and rights: a Synty asset in a public-repository publish attempt is named by both CLI and commit-service refusals. | R53; AE5 | `assets.lock.json`, failing `gm check assets --publish` output, and redacted commit-service response. | blocked:post-deploy | Requires the licensed local asset, scratch game repository, and deployed commit service. | OGM-039, OGM-062 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 11 | Play the draft on a phone: the iframe loads and sound starts after the first tap. | R40, R46, R111 | Trimmed phone clip, verify report, and explicit `unchecked` list. | blocked:post-deploy | Requires physical iPhone Safari and the deployed games origin. | OGM-075 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 12 | Edit while a second build runs: a bridge override is visible immediately while the job is building. | R30–R33 | Clip plus job-state JSON showing `building`. | blocked:post-deploy | Requires a live second build and deployed editor bridge. | OGM-040, OGM-041, OGM-075 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 13 | Re-apply report: the tested second build classifies carried, renamed, and dropped overrides and the editor shows the card. | R33; AE2 | Re-apply report JSON and editor screenshot. | blocked:post-deploy | Requires the completed second build and deployed editor. | OGM-042 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 14 | Branch: “New version from here” creates a branch and both versions play. | R37 | Clip plus branch identifiers and playable build URLs. | blocked:post-deploy | Requires the deployed version UI and two built versions. | OGM-043, OGM-077 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 15 | Merge: a `both_changed` conflict is listed and all other edits auto-merge. | R38; AE3 | Merge-plan JSON for the known door-lock conflict fixture. | blocked:post-deploy | Requires a live branch pair created from the acceptance game. | OGM-044, OGM-077 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 16 | Invite and room: a watcher joins; designs match each revision; chat canary never reaches watcher frames; Play moves both clients within one round trip. | R70–R76; AE4 | Two-client verify report, including frame counts, canary leak count, and timings. | fail | `$TMPDIR/ogm-100-two-client/report.json`, sha256 `c13539d5480d096f21b2e3d22b2ddc73b56034fa1932488f77ee724d9fd70971`: `welcomeMs=341`, design revs 1–3 matched, `canarySentFrames=2`, `watcherFrames=72`, canary leak frames `0` (assertion passed before step 4), `playSwitchMs=28`, `peerMovedPx=24`, and `hostLeftEndedMs=2817`; steps 1–6 passed, then step 7 failed with `MatchMakeError: room <id> not found`; filed #374. | OGM-055; #374 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 17 | Host leaves: the room ends and progress is saved. | R77 | Room log plus redacted saved-progress API row. | blocked:post-deploy | Requires the live room created in check 16. | OGM-051, OGM-078 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 18 | Publish: a tested main build folds design, tags a release, moves the pointer, shows the update, and rollback creates another release. | R90–R92 | `git tag` output, release rows, pointer values, and update screenshot. | blocked:post-deploy | Requires the configured GitHub App and deployed publish flow. | OGM-045, OGM-077 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 19 | Bug button: a planted crash creates a redacted repair ticket and the repair adds a promise test. | R68 | Redacted issue-body head and `gm test` promises line. | blocked:post-deploy | Requires the deployed report intake and a scratch crash in the acceptance game. | OGM-015, OGM-096 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |
| 20 | No money: usage shows subscription runs only and no provider key exists in OGM env files. | R14 | Redacted usage summary and a key-name-only scan result with no file contents. | blocked:post-deploy | Requires the deployed aiur usage account and operator-owned environment files. | OGM-013 | `ea07d2d991be177b30900c9005d46b7e64ba3c1f` | 2026-11-02 |

## Requirement dispositions

The following table is generated by `python3 -I docs/plans/ogm-v1-build/tools/dispositions.py`. “Merged” reads the
closed state of every owning OGM ticket issue; it does not infer implementation success from the ticket plan.

<!-- requirement-dispositions: generated output begins -->
| Requirement | Disposition | Tickets | Merged | Note |
|---|---|---|---|---|
| R1 | ticket | OGM-011, OGM-072 | yes | all ticket issues closed |
| R2 | ticket | OGM-011, OGM-072 | yes | all ticket issues closed |
| R3 | ticket | OGM-012, OGM-017, OGM-079 | yes | all ticket issues closed |
| R4 | ticket | OGM-012, OGM-052 | yes | all ticket issues closed |
| R5 | ticket | OGM-012 | yes | all ticket issues closed |
| R6 | ticket | OGM-012, OGM-072 | yes | all ticket issues closed |
| R10 | ticket | OGM-013 | yes | all ticket issues closed |
| R11 | ticket | OGM-013 | yes | all ticket issues closed |
| R12 | ticket | OGM-013, OGM-018, OGM-074, OGM-086 | yes | all ticket issues closed |
| R13 | ticket | OGM-013, OGM-033 | yes | all ticket issues closed |
| R14 | ticket | OGM-013 | yes | all ticket issues closed |
| R20 | ticket | OGM-066, OGM-074, OGM-088 | yes | all ticket issues closed |
| R21 | ticket | OGM-018, OGM-074, OGM-083, OGM-085, OGM-086, OGM-087, OGM-088 | yes | all ticket issues closed |
| R22 | ticket | OGM-076, OGM-080, OGM-081 | yes | all ticket issues closed |
| R23 | ticket | OGM-081, OGM-082 | yes | all ticket issues closed |
| R24 | ticket | OGM-076, OGM-080 | yes | all ticket issues closed |
| R25 | ticket | OGM-074 | yes | all ticket issues closed |
| R26 | ticket | OGM-031 | yes | all ticket issues closed |
| R27 | ticket | OGM-032, OGM-033 | yes | all ticket issues closed |
| R30 | ticket | OGM-075 | yes | all ticket issues closed |
| R31 | ticket | OGM-040, OGM-041 | yes | all ticket issues closed |
| R32 | ticket | OGM-041 | yes | all ticket issues closed |
| R33 | ticket | OGM-042 | yes | all ticket issues closed |
| R34 | ticket | OGM-075 | yes | all ticket issues closed |
| R35 | ticket | OGM-041 | yes | all ticket issues closed |
| R36 | ticket | OGM-041 | yes | all ticket issues closed |
| R37 | ticket | OGM-043, OGM-077 | no | open: OGM-077 (#94) |
| R38 | ticket | OGM-044, OGM-077 | no | open: OGM-077 (#94) |
| R39 | ticket | OGM-043 | yes | all ticket issues closed |
| R90 | ticket | OGM-045, OGM-077 | no | open: OGM-077 (#94) |
| R91 | ticket | OGM-043 | yes | all ticket issues closed |
| R92 | ticket | OGM-045, OGM-077 | no | open: OGM-077 (#94) |
| R93 | ticket | OGM-045 | yes | all ticket issues closed |
| R94 | ticket | OGM-046 | yes | all ticket issues closed |
| R95 | ticket | OGM-048 | no | open: OGM-048 (#84) |
| R96 | ticket | OGM-047 | yes | all ticket issues closed |
| R40 | ticket | OGM-007, OGM-020, OGM-021, OGM-028 | yes | all ticket issues closed |
| R41 | ticket | OGM-022, OGM-023, OGM-024 | yes | all ticket issues closed |
| R42 | ticket | OGM-020, OGM-022 | yes | all ticket issues closed |
| R43 | ticket | OGM-025 | yes | all ticket issues closed |
| R44 | ticket | OGM-025, OGM-028 | yes | all ticket issues closed |
| R45 | ticket | OGM-020, OGM-026 | yes | all ticket issues closed |
| R46 | ticket | OGM-027 | yes | all ticket issues closed |
| R47 | ticket | OGM-029 | yes | all ticket issues closed |
| R48 | ticket | OGM-019 | yes | all ticket issues closed |
| R50 | ticket | OGM-060 | yes | all ticket issues closed |
| R51 | ticket | OGM-004, OGM-060 | yes | all ticket issues closed |
| R52 | ticket | OGM-061, OGM-065 | no | open: OGM-065 (#77) |
| R53 | ticket | OGM-039, OGM-062, OGM-067 | yes | all ticket issues closed |
| R54 | ticket | OGM-063 | yes | all ticket issues closed |
| R55 | ticket | OGM-066 | yes | all ticket issues closed |
| R56 | ticket | OGM-005 | yes | all ticket issues closed |
| R57 | ticket | OGM-068 | yes | all ticket issues closed |
| R80 | ticket | OGM-009, OGM-064 | yes | all ticket issues closed |
| R81 | ticket | OGM-064 | yes | all ticket issues closed |
| R82 | ticket | OGM-064 | yes | all ticket issues closed |
| R83 | ticket | OGM-067 | yes | all ticket issues closed |
| R84 | ticket | OGM-017, OGM-079 | yes | all ticket issues closed |
| R85 | ticket | OGM-064 | yes | all ticket issues closed |
| R86 | ticket | OGM-065 | no | open: OGM-065 (#77) |
| R87 | ticket | OGM-064 | yes | all ticket issues closed |
| R88 | ticket | OGM-060 | yes | all ticket issues closed |
| R60 | ticket | OGM-030 | yes | all ticket issues closed |
| R61 | ticket | OGM-034 | yes | all ticket issues closed |
| R62 | ticket | OGM-036 | yes | all ticket issues closed |
| R63 | ticket | OGM-037, OGM-038 | yes | all ticket issues closed |
| R64 | ticket | OGM-035, OGM-039 | yes | all ticket issues closed |
| R65 | ticket | OGM-036 | yes | all ticket issues closed |
| R66 | ticket | OGM-014, OGM-079 | yes | all ticket issues closed |
| R67 | ticket | OGM-016 | yes | all ticket issues closed |
| R68 | ticket | OGM-015, OGM-096 | yes | all ticket issues closed |
| R69 | ticket | OGM-002, OGM-003, OGM-006, OGM-007, OGM-008 | yes | all ticket issues closed |
| R70 | ticket | OGM-051, OGM-078 | yes | all ticket issues closed |
| R71 | ticket | OGM-050, OGM-051 | yes | all ticket issues closed |
| R72 | ticket | OGM-050, OGM-052 | yes | all ticket issues closed |
| R73 | ticket | OGM-053, OGM-078 | yes | all ticket issues closed |
| R74 | ticket | OGM-051, OGM-053 | yes | all ticket issues closed |
| R75 | ticket | OGM-051, OGM-054 | yes | all ticket issues closed |
| R76 | ticket | OGM-051, OGM-055 | yes | all ticket issues closed |
| R77 | ticket | OGM-051, OGM-078 | yes | all ticket issues closed |
| R78 | ticket | OGM-054, OGM-055 | yes | all ticket issues closed |
| R100 | ticket | OGM-091, OGM-092, OGM-095 | no | open: OGM-095 (#95) |
| R101 | ticket | OGM-091 | yes | all ticket issues closed |
| R102 | ticket | OGM-090 | yes | all ticket issues closed |
| R103 | ticket | OGM-093 | yes | all ticket issues closed |
| R104 | ticket | OGM-091, OGM-094 | yes | all ticket issues closed |
| R105 | ticket | OGM-097 | yes | all ticket issues closed |
| R106 | ticket | OGM-036 | yes | all ticket issues closed |
| R110 | ticket | OGM-070 | yes | all ticket issues closed |
| R111 | ticket | OGM-071 | yes | all ticket issues closed |
| R112 | ticket | OGM-071, OGM-073, OGM-075 | yes | all ticket issues closed |
| R113 | ticket | OGM-070, OGM-071 | yes | all ticket issues closed |
| R114 | ticket | OGM-070 | yes | all ticket issues closed |
| R120 | ticket | OGM-001, OGM-009, OGM-010, OGM-100 | no | open: OGM-100 (#98) |
| R121 | ticket | OGM-004, OGM-010 | yes | all ticket issues closed |
| R122 | ticket | OGM-001 | yes | all ticket issues closed |
| R123 | ticket | OGM-001 | yes | all ticket issues closed |
| R124 | ticket | OGM-101 | yes | all ticket issues closed |
<!-- requirement-dispositions: generated output ends -->

## Deferred

The read-back found four owner tickets still open: OGM-048 for R95, OGM-065 for R52/R86, OGM-077 for
R37/R38/R90/R92, and OGM-095 for R100. The automated run also found #374 in the OGM-055 two-client scenario. All five
are recorded in `deferred-findings.md`. R120 is also unmerged because its owner is this OGM-100 ticket; merging this PR
closes that expected self-reference. Post-deploy checks are scheduled acceptance work rather than product deferrals. Any
failure found during that run must be filed against its named owner.

## Unchecked

- Nineteen end-to-end results remain unchecked until the post-deploy run produces the named evidence. Check 16 ran and
  failed at step 7; its partial successes are evidence for diagnosis, not a pass.
- Physical-phone checks must additionally record iPhone Safari continuity, first-tap audio, 64 px primary targets, and
  the observed captions/read-aloud defaults; frame rate and sound balance remain explicitly unchecked unless measured.
- Clips stay outside git under the evidence directory. Only reviewed contact sheets at or below 300 KB may be added to
  `docs/plans/ogm-v1-build/acceptance/`.
