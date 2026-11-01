# Questions and commands

Kevin asked for this to run without stopping, so every open question gets an assumption, recorded here with its date. Kevin's answers replace the assumption and are copied to the decision log.

## Answered by Kevin (this run)

| Date | Question | Answer |
|---|---|---|
| 2026-10-31 | Hosting | Not Railway. The backend, the coding agents and everything else server-side run on Kevin's second machine, set up safely. Netlify frontend stays. |
| 2026-10-31 | Who implements | aiur coding agents, for real: Codex agents until the usage limit, then whichever Claude login has the most tokens. |
| 2026-10-31 | Who reviews and merges | The Executor (this agent) fans out background review agents per PR and has the final say on every merge. |
| 2026-10-31 | aiur setup | Use the latest aiur `main` through `scripts/aiurdev`; run `aiur init` for this repo; the aiur agent in Khala channel `GM` helps, and its suggestions may be implemented. |
| 2026-10-31 | Tickets | A few dozen; each names the code it touches; ordered by the dependency tree of that code; optimize for parallel agents; merge conflicts acceptable. |
| 2026-10-31 | Per-ticket research | Before implementation, fan out background agents to research each ticket (a `ce-plan` per ticket) so coding agents mostly implement. Research is committed to `research` and linked from the GitHub tickets. |
| 2026-10-31 | Checkpoint | A new version deployed for Kevin to test at 5:30am (2026-11-01, local). |

## Assumptions taken (open for Kevin)

| # | Question | Assumption taken | Why |
|---|---|---|---|
| A1 | Branching in V1 (release plan: "Working, Kevin considering") | In: branch-aware data model and the basic screens (new version, switch, play either, merge). | C2 §8 recommends it; retrofitting is the expensive part. Kevin said "all of the discussed features". |
| A2 | Friends outside the family in V1 | Family only until the lawyer review; the invite flow is built, the allowlist is an admin setting. | Architecture doc recommendation. |
| A3 | Publish from any version or only main | Only from `main` after a merge. | Architecture doc recommendation. |
| A4 | Build allowance | Daily allocation per member set by an admin, reset at local midnight, shown as a friendly unit. | Architecture doc recommendation. |
| A5 | Host leaves a multiplayer game | End the session with progress saved. Room size 4. Friends don't hear the build agent. | Architecture doc recommendation. |
| A6 | Drive watch folder after import | Files stay where they are; intake tracks what is done. | Architecture doc recommendation. |
| A7 | Sandbox on this machine instead of E2B | Per-job isolation with what the host supports without spending (evaluated in evidence/T03 and T11); egress allowlist, no secrets inside, a model proxy. | Self-hosting decision. |
| A8 | Bucket on this machine instead of Railway | An S3-compatible store on this machine (choice in T05/T11), content-addressed, never in GitHub. | Self-hosting decision. |
| A9 | Coding agent for hosted builds (decision log: "aiur's own tool loop (Kimi, DeepSeek, OpenRouter), confirm") | V1 uses the agents aiur already runs here: Codex then Claude, on the subscriptions signed in on this machine. No new provider keys. | No spending is approved; the decision was marked "confirm". |
| A10 | Sign-in method | Email plus passkey and Google (both), through Better Auth. | Release plan recommendation. |
| A11 | Per-user GitHub repos | V1 creates each game's repo in the creator's connected GitHub; the commit service is per repo. | Decision log "Repos". |
| A12 | "Kids playing in V1" and the child-only rules kept for adults (release plan §6 Q2, Q8) | Accept that children can't play on their own accounts in V1. Keep 64 px touch targets and read-along defaults (cheap); drop the vendor exclusions, cell suppression and reading-grade limits from V1 tickets. | Release plan recommendation; the rest is V3 work. |
| A13 | Ticket count | Aim for 40–60 executable tickets plus one capstone per lane; the count follows boundaries. | "A few dozen". |
| A14 | The 5:30am deploy | Deploy what has merged, built by `prototypes/studio-v0/tools/build.sh` or the new app's build if it exists by then. | Kevin asked for a version to test at 5:30am. |

## Commands and gates

None open.
