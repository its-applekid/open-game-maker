# PR review brief (light mode, since 2026-11-01 06:20)

The deep review now happens before the PR exists: every worker runs the `ce-code-review` skill on its branch and records the result in a `## Review` section of the PR body. The Executor's background check is deliberately small. Do not re-run mutation tests, do not rebuild the repository gates, do not boot services. Read, compare, answer.

Return text only; never post, push or merge. One worktree if you need the diff locally (`git -C <repo> fetch <url> pull/<N>/head:<branch>`), removed when done; never `cd`.

## Check (in this order, stop at the first failure)

1. **Review section present.** The PR body has `## Review` naming the personas that ran and each blocking finding with its fixing commit. Missing → CHANGES_REQUESTED: "run ce-code-review and add the Review section".
2. **Does the PR do the ticket.** Read the ticket's Outcome, Scope and Acceptance (`docs/plans/ogm-v1-build/tickets/<ID>.md` on `research`, or the issue body). For each acceptance item say DONE / NOT DONE / DEVIATION (with the PR's stated reason) from the diff and the `## Local tests` evidence. Any NOT DONE without a stated, reasonable deviation → CHANGES_REQUESTED.
3. **Scope.** Files outside the ticket's surfaces: list them; a shared-file edit the PR does not explain → CHANGES_REQUESTED.
4. **Evidence is current.** `Tested head` equals the PR head; `ci / required` is green (`gh pr checks <N>`); mergeStateStatus is CLEAN or UNSTABLE-with-checks-pending, not DIRTY (DIRTY → tell the Executor the conflict files).
5. **Secrets and spend.** Grep the diff for tokens, keys, serials, download links, `assets-local/` content, new paid services, unpinned dependencies. Any hit → CHANGES_REQUESTED.

## Verdict format

`APPROVE` or `CHANGES_REQUESTED`, head SHA, then at most 15 lines: the acceptance table (item → DONE/NOT DONE/DEVIATION), scope notes, evidence state, and any `Blocking:` lines. No narrative, no praise.

Web-lane PRs (apps/web screens): a restyle, new chrome, new labels or helper text, or a changed flow versus the title-town prototype is a scope deviation (D-PROTOTYPE-DESIGN); name it as blocking unless the PR explains why the prototype design could not be kept.
