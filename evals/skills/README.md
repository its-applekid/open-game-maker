# Skill sameness eval

Run this on demand before a game-making skill change merges. A full default run builds 24 games (12 briefs × 2 configs) with the signed-in Codex or Claude subscription, so confirm the quota cost first; CI never runs it.

```sh
pnpm --filter @ogm/tools-skills eval -- --config with_skill,baseline --confirm
```

Use `--briefs 01,02`, `--agent codex|claude`, and `--max-parallel 1` to bound a run. `--dry-run` creates and configures scratch repos without calling an agent or consuming quota. `full_reference` is skipped unless `OGM_EVAL_CORPUS` names an operator-provided local corpus.

Results land in `results/<date>/benchmark.md` with one `grading.json` per run. Scratch games and agent logs stay ignored under `.runs/`; do not commit game source or media.

The ship gate requires pass rate not to fall, M1 below `thresholds.json`, M4 at zero, fewer than half of tunables matching card examples, and M6 adapter-call/render-key signatures to differ between games in each config. M1 measures card/corpus leakage with a fresh scaffold subtracted; M4 finds unasked mechanics; M5 finds copied card values; M6 finds repeated adapter and text-state shapes.
