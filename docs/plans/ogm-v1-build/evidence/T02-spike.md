# T02 zero-cost aiur spike

This spike was inspected against aiur `0f692a45b04bb4ce3e7d8256e134028894bd128b`
(`Add opt-in idle burst capture (#7341)`) and Codex CLI `0.162.1`.

## Result

The product client can be verified against recorded HTTP fixtures, but the
prescribed standalone `memory` tracker spike cannot produce a ticket on this
aiur revision. `Aiur.Memory.Tracker` reads fixtures exclusively from the BEAM
application value `:aiur, :memory_tracker_issues`; the daemon config and CLI
have no command or persisted intake surface for adding one. Its mutation
functions are observable test no-ops and do not add or advance fixtures.

No timing value below was fabricated. The live checks remain post-deploy
checks for an operator with an Executor-root aiur run or a disposable GitHub
tracker repository.

| Measurement | Value in this workspace | Command or evidence |
| --- | --- | --- |
| `todo` nudge to first allocated/running event | Not measurable with the prescribed standalone memory tracker | `git -C ~/github/aiur show 0f692a45b:src/lib/aiur/memory/tracker.ex` shows that `issue_entries/0` reads only `Application.get_env(:aiur, :memory_tracker_issues, [])` |
| Cancel confirmation | Not measurable without a running memory-tracker ticket | `POST /api/v1/<id>/cancel`; record elapsed time through the response whose `process.status` is `exited` |
| Spend-cap trip | Not measurable without a ticket; additionally, `fake` exposes no paid-model spend | `PUT /api/v1/<id>/spend-cap` with `{"amount":"0.000001","currency":"USD"}`; observe `ticket.<id>.usage.spend_cap_reached` |
| Committed `.codex/skills` link | Manual CLI smoke not run in this issue workspace | `codex sandbox -- ls -l .codex/skills` from a disposable committed repository containing `.codex/skills/x -> ../../.claude/skills/x` |

## Intended zero-cost configuration

```yaml
tracker:
  kind: memory
  base_branch: main
  active_states: [todo, in-progress, rework]
  terminal_states: [done, cancelled, canceled]
instance:
  mode: local
  deployment_kind: operator
server:
  host: 127.0.0.1
  port: 0
events:
  export:
    enabled: true
agent:
  priority: [fake]
  max_concurrent_agents: 1
```

The configuration starts a daemon, but it starts with an empty tracker and has
no supported way to seed the ticket required by the three HTTP measurements.

## Post-deploy procedure

Use a disposable tracker repository or an Executor-root harness that can seed
`:aiur, :memory_tracker_issues`; do not use a paid provider.

1. Start aiur from a scratch checkout with the configuration above and the
   `fake` provider: `~/github/aiur/scripts/aiurdev run --bg
   .aiur/config`.
2. Create a write token in the same scratch directory:
   `~/github/aiur/scripts/aiurdev token create ogm-spike --scope
   write`; store its printed value only in `AIUR_TOKEN` for the current shell.
3. Seed ticket `1` as `todo`, start an event subscription at its current head,
   and record a monotonic timestamp. Send the versioned control request
   `todo(["1"], only: true)` to `POST /api/v1/control`; stop the timer on the
   first `ticket.1.lifecycle.changed` record whose lifecycle is `allocated` or
   `running`.
4. While ticket `1` is running, record a monotonic timestamp and send
   `POST /api/v1/1/cancel` with the write headers. Stop the timer only when the
   response body has `process.status: "exited"`; preserve a `409` response as a
   failed confirmation, not a success.
5. Seed ticket `2`, set its cap with `PUT /api/v1/2/spend-cap` and
   `{"amount":"0.000001","currency":"USD"}`, then nudge it. Record whether a
   `ticket.2.usage.spend_cap_reached` event arrives. If the fake provider still
   emits no usage, record the trip as unobservable at zero cost; the product
   fallback is to compare the versioned `/usage` total with the configured cap
   and cancel.
6. In a separate disposable git repository, commit
   `.claude/skills/x/SKILL.md` and the symlink
   `.codex/skills/x -> ../../.claude/skills/x`. Run
   `codex sandbox -- ls -l .codex/skills` and record whether the link is visible.
7. Revoke the token, stop the scratch daemon, and delete only the disposable
   scratch repository.

Every write in steps 3–5 sends `Authorization: Bearer $AIUR_TOKEN`,
`Origin: <daemon-base-url>`, and `X-Aiur-Request: 1`. Token values and scratch
repository URLs must not be committed.
