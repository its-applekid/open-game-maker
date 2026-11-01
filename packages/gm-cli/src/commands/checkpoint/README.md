# `gm checkpoint`

Prepare a creator direction checkpoint, then copy the printed `emit_event` call into the agent tool:

```text
gm checkpoint open --job <id> --question "Which look?" --option a=Chunky --option b=Flat --recommend a
gm checkpoint open --job <id> --question "Which look?" --option a=Chunky --option b=Flat --media a=<chat-message-id>
gm checkpoint wait <checkpoint-id> --timeout 600
```

`open` writes `.gm/outbox/checkpoint.jsonl`. `wait` reads `.gm/inbox/checkpoints/<id>.json`; it exits 3 on timeout
and 4 when the checkpoint is moot. A checkpoint is non-blocking unless `open` receives `--blocking`.
