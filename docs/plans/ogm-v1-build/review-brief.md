# PR review brief (given to every background review agent)

You review one pull request of the OGM V1 build for the Executor, who posts the review and decides the merge. Return text; never post to GitHub, never push, never merge. Work in your own git worktree (`git -C <repo> worktree add <scratchpad>/wt-<pr> <head-sha>`; assert `git rev-parse HEAD` equals the PR head before any check; remove the worktree when done). Never `cd`; use absolute paths; no network beyond `gh` reads; no installs outside the worktree.

Inputs you get in the prompt: the PR number, head SHA, base SHA, the ticket id and its issue body, the ticket's plan (`docs/plans/ogm-v1-build/tickets/<ID>-plan.md` on branch `research`), and any established facts you must not re-derive.

Check, in this order, and report each as PASS / FAIL / NOT CHECKED with one line of evidence:

1. **Claims vs diff.** Every claim in the PR body is supported by the diff. An unsupported claim is a P1 blocker, never a nitpick.
2. **Scope.** The diff stays inside the ticket's write surfaces (from the issue body's Surfaces section); touching a hot shared file (root package.json beyond a script, ci.yml, contracts barrel, .aiur/config, CODEOWNERS) is called out with whether it was necessary.
3. **Contract fidelity.** If the ticket consumes a contract (copy from <producer>), the shapes match the producer's file byte-for-byte in meaning; if it produces one, the exported names match the ticket's Contract section.
4. **Tests execute and bite.** Run the repository's commands from `AGENTS.md` in the worktree (`pnpm install --frozen-lockfile` is allowed; it reads the lockfile only). Name each new test file the runner actually collected. For every new test, revert the production change in the worktree (`git checkout <base-sha> -- <files>`) and confirm the test fails; name any test that still passes. Restore before continuing.
5. **Local tests evidence.** The PR body's `## Local tests` names the tested head (must equal the current head), base, selection and commands with results; stale or missing evidence blocks.
6. **Secrets and spend.** No tokens, keys, download links, licence serials, `assets-local/` files, family details; no new paid dependency; new dependencies under 1k GitHub stars are named as exceptions.
7. **Security seams.** Services bind 127.0.0.1; secrets only through `packages/config`; agents' reach (sandbox, env) not widened; iframe/bridge origin checks intact.
8. **Conventions.** TypeScript strict passes; the barrel is append-only; routes/commands registered by directory scan, not by editing a registry; migrations are timestamped files; 64 px primary targets in UI.
9. **Docs.** Any new CLI command, config key, env name or operator step is documented where the ticket says (docs/ops, AGENTS.md, the skill).

Finish with: a verdict (APPROVE / CHANGES_REQUESTED) with the blocking findings listed as `Blocking:` lines with file:line, non-blocking notes separately, and a merge-order note if this PR couples with another open PR (name it).
