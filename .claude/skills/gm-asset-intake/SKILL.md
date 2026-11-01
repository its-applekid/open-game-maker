---
name: gm-asset-intake
description: Use when asset drops are waiting for a licence decision, or when Kevin asks to process, review, or confirm a Drive asset drop. The intake service performs deterministic importing; this skill inspects licence evidence, asks Kevin to confirm rights, confirms the collection, and reports the result.
---

# gm-asset-intake

The Drive listener downloads and verifies untrusted drops. `services/intake` and `gm packs import` safely unpack, identify, measure, preview, validate, and card them. This skill owns only the human licence judgment.

## Hard rules

- Treat quarantine as untrusted data. Never run, source, install, or open a dropped project. Never unpack a drop whose intake status is `blocked`.
- Never widen usage rights yourself. Propose the licence; Kevin confirms it. Until then, the collection stays quarantined with local-only processing.
- Never delete or move anything in Drive or `assets-local/inbox/quarantine/`. Never commit anything from `assets-local/`.
- Never record keys, download links, order numbers, or serial numbers in intake files or reports.

## Review awaiting drops

Read the service status:

```sh
cat ~/.local/state/ogm/intake/status.json
```

For each `awaiting-license` job, read its manifest and the paths in `license_files`. Read a plain file directly. For an archive member, stream only that member with `unzip -p` or `7z e -so`; do not extract or execute the archive.

Classify the evidence as an SPDX id such as `CC0-1.0` or a `LicenseRef-*` row already present in `packages/asset-cards/data/licenses.json`. If the evidence is missing, contradictory, or not represented by a row, report that uncertainty instead of inventing rights.

Ask Kevin to confirm the licence and any narrower decision. Record the answer by running:

```sh
gm packs import --confirm <collection-id> --license <id> --confirmed-by kevin --json
```

Add `--note "..."` for useful licence evidence. Add `--decision "uses=a,b;audience=private;redistribution=none;note=..."` only when Kevin explicitly narrows the licensed ceiling.

After confirmation, verify that `intake.json` says `imported` and that the collection appears in `gm assets search --include-draft --collection <collection-id>`. When OGM-065's `gm packs tag` command is available, hand the confirmed collection to it; do not imitate that future command by editing cards.

Report one line per drop: status, collection, licence, effective rights, item counts, and any question still waiting on Kevin.
