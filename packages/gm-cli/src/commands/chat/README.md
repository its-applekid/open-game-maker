# `gm chat`

Post one visible build milestone from inside the no-network workspace:

```text
gm chat post --job <id> --text "first pass"
gm chat post --job <id> --text "phone pass" --image shots/phone/t0.png
gm chat post --job <id> --text "jump pass" --clip shots/phone/run.mp4 --poster shots/phone/t0.png
```

The command prints the chat message id. `--json` prints the complete outbox line. Job lookup is `--job`, then
`GM_JOB`, then `.gm/context/job.json`. Media is copied into `.gm/outbox/media/`; clips are capped at 25 MiB.

Exit 2 means the request was refused and includes a suggested command. Exit 1 means the outbox write failed.
