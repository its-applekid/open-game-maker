# `gm scope done`

Write the agreed scope to `.gm/scope/<session-id>.json`, then submit it from the scope ticket workspace:

```sh
gm scope done --file .gm/scope/<session-id>.json
```

The command validates the scope, resolves the build job from `--job`, `GM_JOB`, or `.gm/context/job.json`, and appends a
`scope.agreed` line to `.gm/outbox/scope.jsonl`. It does not contact the API directly.
