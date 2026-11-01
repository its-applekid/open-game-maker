# Vendored engine skills

Reference skills for Phaser 4.2 and three.js r186, copied at pinned commits (`skills.lock`):

- `phaser/`: the 28 official Phaser skills (`phaserjs/phaser`, MIT).
- `threejs/`: 11 CloudAI-X three.js skills (MIT); `threejs-react-three-fiber` and `threejs-asset-pipeline` are left out.
- `gamedev/`: 17 awesome-gamedev skills (Apache-2.0) with every code block rewritten to TypeScript.

Each file's front matter names its `license`, `source` (repo, commit, path) and whether it was `modified`; each set's
`CHANGES.md` lists the modified files. `@ogm/tools-skills` checks that every class and method the code blocks name
exists in the pinned `phaser` and `three` packages. It proves names, not signatures.

To refresh a set, open a PR that re-copies it at the new commit, updates `skills.lock` and every `source:` line, and
passes `pnpm --filter @ogm/tools-skills test` and `pnpm --filter @ogm/tools-skills check-api-names`.
