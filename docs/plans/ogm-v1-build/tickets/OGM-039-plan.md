# OGM-039 plan — Boundary check run and publication content gate

## 1. Problem frame

Agents open PRs in creators' repos on their own (E03-12). What stops a build from committing a workflow file, a 60 MB blob, an unlicensed Synty mesh into a public repo, a token, or the creator's email is a deterministic gate that runs as a required check on every PR and again, more strictly, at Publish and at any public visibility flip (D-COMMIT, E03-16). Nothing like it exists; today's "gate" is `rm -f art/packs/synty-*` in a deploy script (E05-14). This ticket writes the six rule families, the two evaluators, the `ogm/boundary` check-run poster, and the `BoundaryGate` implementation that OGM-035's service calls; every refusal carries a reason a creator can read (R53's "refusals the voice agent can explain").

**Requirements trace**
- R64 → the commit service runs the publication content gate and the hash blocklist on public repos; nothing is merged, folded, tagged or made public without a passing verdict.
- R53 → `gm check assets` (OGM-062) enforces rights at build; this gate enforces the same lockfile rules at merge and publish and feeds the blocklist check; AE5's refusal names the asset and the rule.

## 2. Patterns to follow

- OGM-035 `services/commit/src/gate.ts` and `src/ops/*.ts` — the `BoundaryGate` interface, `GateInput`, and where the gate is invoked (before the ref update).
- OGM-062 `packages/asset-cards/src/rights.ts` (the TS port of `docs/research/v0.5/schemas/tools/validate.mjs:30-57`) — `effective()` and `assertUsageRights`; consume, never re-implement.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.3/A7-infra-auth-git-multiplayer.md:264-275` — the leakage vectors; one rule or sub-rule per bullet.
- `/home/orangekid/github/aiur/scripts/check-pr-body.py:1-40` — a PR-level check with explicit "grandfather" and classify steps; the poller mirrors its "only check what changed since the last verdict" logic via `(repo, head_sha)`.
- T05 §4 "Hash blocklist" — `sha256  bytes  path` sorted lines.
- GitHub Checks API (`POST /repos/:o/:r/check-runs`) through OGM-035's `octokitFor(owner)`.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Rule framework and input model
- Goal: one input shape, six pure rules, one combinator.
- Files: Create `services/commit/src/boundary/index.ts`, `src/boundary/types.ts`, `src/boundary/evaluate.ts`. Test `services/commit/test/boundary/evaluate.test.ts`.
- Approach: `BoundaryInput = { mode: 'diff'|'tree'; visibility: 'public'|'private'; draft: boolean; files: BoundaryFile[]; lockfile: AssetsLock | null; blocklist: Set<string>; piiTerms: string[] }`, `BoundaryFile = { path: string; status: 'added'|'modified'|'removed'|'renamed'; bytes: number; sha256: string; mode: string; text?: string /* decoded when ≤ 2 MB and not binary */ }`. `Rule = (input) => Reason[]`. `evaluate(input, rules)` runs all rules in the fixed order, concatenates, truncates to 50 with a final `{code:'denylist', detail:'… and n more'}`, returns `{allowed: reasons.length === 0, reasons}`. `evaluateDiff` and `evaluateTree` are `evaluate` with `mode` set; `tree` additionally requires `lockfile !== null`.
- Interface sketch:
  ```ts
  export type Rule = (input: BoundaryInput) => BoundaryVerdict['reasons'];
  export function evaluate(input: BoundaryInput, rules?: Rule[]): BoundaryVerdict;
  export const evaluateDiff: (i: Omit<BoundaryInput,'mode'>) => BoundaryVerdict;
  export const evaluateTree: (i: Omit<BoundaryInput,'mode'>) => BoundaryVerdict;
  ```
- Test scenarios:
  - Given two failing rules then both reasons present (no short-circuit).
  - Given 60 reasons then 51 entries with the last a summary.
  - Given `tree` mode and `lockfile: null` then one `rights` reason `lockfile missing`.

### U2 — path and size rules
- Goal: the structural denials.
- Files: Create `src/boundary/rules/path.ts`, `src/boundary/rules/size.ts`. Test `test/boundary/rules/path.test.ts`, `size.test.ts`.
- Approach: `path`: normalize; deny patterns `.github/**` (unless `input.actor === 'platform'`, which only OGM-036's provisioning sets), `.gm/**`, `assets-local/**`, `**/.env`, `**/.env.*`, `**/*.pem`, `**/id_rsa*`, `node_modules/**`, `**/.DS_Store`; deny `..` segments and absolute paths; deny mode `120000` whose target resolves outside the tree; deny file names matching an email or any `piiTerms`. `size`: per file > 25 MB → `size`; sum of added bytes > 200 MB → `size`; binary extensions outside the allowed set (`glb gltf bin png webp ktx2 mp3 ogg wav json ico woff2`) → `size` with `detail: 'file type not allowed in a game repo'`; `*.map` or `sourceMappingURL` on `visibility: 'public'` → `size` `detail: 'source maps leak source on public repos'`.
- Interface sketch: `export const pathRule: Rule; export const sizeRule: Rule;`
- Test scenarios:
  - Given `.github/workflows/x.yml` added by an agent then `path`.
  - Given the same with `actor: 'platform'` then allowed.
  - Given `assets/../../etc/passwd` then `path`.
  - Given a 25 MB + 1 byte file then `size`.
  - Given `dist/game.js.map` on public then `size`; on private then allowed.

### U3 — secret and pii rules
- Goal: no credentials or identities in a creator's repo.
- Files: Create `src/boundary/rules/secret.ts`, `src/boundary/rules/pii.ts`. Test `test/boundary/rules/secret.test.ts`, `pii.test.ts`.
- Approach: `secret`: on `text` files run patterns `/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/`, `/\bgithub_pat_[A-Za-z0-9_]{40,}/`, `/\baiur_[A-Za-z0-9_-]{32,}/`, `/\bwhsec_[A-Za-z0-9+/=]{20,}/`, `/\bsk-[A-Za-z0-9]{20,}/`, `/\bAKIA[0-9A-Z]{16}/`, `/-----BEGIN [A-Z ]*PRIVATE KEY-----/`, `/^\s*(OGM|AIUR|GITHUB|NETLIFY)_[A-Z0-9_]+=\S+/m`; plus Shannon entropy > 4.5 bits/char on tokens ≥ 32 chars in `.json .ts .js .md .env .toml .yaml` (skip known hashes: `sha256` fields in the lockfile and manifest). Reason detail names the path, line number and pattern class only. `pii`: `piiTerms` (from the API: creator display names, real names if set, emails; matched case-insensitively as whole words) in text files and paths; email regex; phone regex `(\+?\d[\d\s().-]{8,}\d)`; street-address heuristic (number + street word) in `.md .json .txt .ts` strings. Detail: `'personal information: <class> at <path>:<line>'`, never the matched text.
- Interface sketch: `export const secretRule: Rule; export const piiRule: Rule;`
- Test scenarios:
  - Given a `ghp_` token in `README.md` then `secret` with path and line and no token in `detail`.
  - Given a lockfile `sha256` hex then no entropy hit.
  - Given the creator's email in `credits.json` then `pii`.
  - Given a pseudonymous handle not in `piiTerms` then allowed.

### U4 — rights and denylist rules
- Goal: the lockfile is the rights truth; blocked bytes never land.
- Files: Create `src/boundary/rules/rights.ts`, `src/boundary/rules/denylist.ts`, `src/boundary/blocklist.ts`. Test `test/boundary/rules/rights.test.ts`, `denylist.test.ts`, `test/boundary/blocklist.test.ts`.
- Approach: `rights`: for each file under `assets/` (added/modified): find the lockfile entry with that `path`; none → `rights` `'<path> is not in assets.lock.json; run gm assets use'`; `rights.uses` lacking `in-game` and (`placeholder` allowed only when `draft && mode === 'diff'`) → `rights`; in `tree` mode or `visibility: 'public'`: `assertUsageRights(lockfile, {publish: mode === 'tree', visibility})` from OGM-062 and map each finding `{assetId, rule}` to `{code:'rights', path, detail: \`${assetId} ${rule}\`}`; `audience: 'private'` on public → `rights`; `redistribution: 'none'` on public → `rights`. `denylist`: `blocklist.has(file.sha256)` → `denylist` `'<path> matches a non-redistributable file'`; on public: `**/*.workpad.md`, `transcript*.{md,txt,json}`, `/plan.md`, `.gm/**` (already by path) → `denylist` `'agent artifact'`. `blocklist.ts`: load `OGM_BLOCKLIST_FILE` into a `Set<string>` of sha256 (first column), reload on mtime change; `null` when the file is missing (the rule then fails closed on public, warns on private).
- Interface sketch: `export const rightsRule: Rule; export const denylistRule: Rule; export function loadBlocklist(path: string): Promise<Set<string> | null>`.
- Test scenarios:
  - Given `assets/x.glb` absent from the lockfile then `rights`.
  - Given a `placeholder` asset on a draft diff then allowed, on tree then `rights`.
  - Given the Synty fixture (`redistribution: 'none'`) on public then `rights` naming `t1:synty-…`; private then allowed.
  - Given a blob whose sha is in the fixture blocklist then `denylist`.
  - Given no blocklist file and public then `denylist 'blocklist unavailable'`.

### U5 — Check-run poster and trigger
- Goal: every PR head gets one `ogm/boundary` check run.
- Files: Create `src/boundary/check-run.ts`, `src/boundary/poller.ts`, `src/boundary/inputs.ts`. Modify `src/server.ts` (register; OGM-035's seam or one line). Test `test/boundary/check-run.test.ts`, `poller.test.ts`.
- Approach: `inputs.ts`: `buildDiffInput(octokit, repo, prNumber)` → `GET pulls/:n/files` (paginated), for each file `GET git/blobs/:sha` when ≤ 2 MB and text-like (by extension and a NUL check), compute sha256 of raw bytes, `GET contents/assets.lock.json?ref=head`, `piiTerms` from `GET ${OGM_API_INTERNAL_URL}/internal/games/:id/pii-terms` (service token), repo visibility from `GET repos/:o/:r`, `draft = pr.draft`. `buildTreeInput(octokit, repo, sha)` → `GET git/trees/:sha?recursive=1` with blob fetch under the same limits. `check-run.ts`: `postCheck(octokit, repo, headSha, verdict)` → `POST check-runs {name:'ogm/boundary', head_sha, status:'completed', conclusion: allowed ? 'success' : 'failure', output:{title: allowed ? 'Boundary ok' : \`${n} problems\`, summary: markdown list of reasons, text: grouped by code}}`; dedupe with an in-memory `(repo, headSha)` set and `GET check-runs?check_name=ogm/boundary` on restart. `poller.ts`: every 60 s for each repo in `GET ${OGM_API_INTERNAL_URL}/internal/games/active-repos`, `GET pulls?state=open` → for each PR whose head sha has no verdict: build input, evaluate, post. Webhook route `POST /internal/github/webhook` (HMAC over raw body with `OGM_GITHUB_WEBHOOK_SECRET`) handling `pull_request` `opened|synchronize|reopened` → same path; registered but only reachable once OGM-006 exposes it.
- Interface sketch: `export function startBoundaryPoller(deps): { stop(): void }; export async function postCheck(...): Promise<void>`.
- Test scenarios:
  - Given an open PR with a clean diff then one `check-runs` POST with `success`.
  - Given the same head sha twice then one POST.
  - Given a failing fixture then `failure` and a summary containing each path.
  - Given a webhook with a bad signature then 401 and nothing evaluated.

### U6 — Publish gate implementation
- Goal: OGM-035's service calls the real gate for folds, merges, releases and visibility flips.
- Files: Create `src/publish-gate/index.ts`, `src/publish-gate/gate.ts`; Modify `src/gate.ts` (export `realGate` as default). Test `test/publish-gate/gate.test.ts`.
- Approach: `realGate.evaluate(g: GateInput)`: `fold_design` → `evaluateDiff` over `g.files` (content given, no fetch) with the repo's lockfile at `base`; `merge` → `buildDiffInput(prNumber)` → `evaluateDiff`; `release` → `buildTreeInput(sha)` → `evaluateTree` with `visibility` = repo's current; `set_visibility` to `public` → `buildTreeInput(main head)` → `evaluateTree` with `visibility: 'public'`; to `private` → allowed. Any thrown error → `{allowed:false, reasons:[{code:'denylist', detail:'gate error: <error class>'}]}`.
- Interface sketch: `export const realGate: BoundaryGate;`
- Test scenarios:
  - Given `set_visibility: public` on a tree with a `redistribution: none` asset then refused with `rights`.
  - Given `release` on a private clean tree then allowed.
  - Given the GitHub fetch throwing then refused with `gate error`.

## 4. Verification

```
pnpm --filter @ogm/commit test
pnpm -r typecheck && pnpm -r lint
# after GATE-GITHUB-APP (OGM-035) and a scratch repo:
# open a PR adding .github/workflows/x.yml → expect check "ogm/boundary" = failure with a `path` reason
```
Paste into `## Local tests`: Vitest counts per rule file; the verdict JSON for the `synty-public` fixture; if run live, the check-run URL and its summary.

## 5. Deferred to implementation

- Entropy threshold and minimum token length: defaults 4.5 bits/char, 32 chars; config names `OGM_GATE_ENTROPY_BITS`, `OGM_GATE_ENTROPY_MIN_LEN`.
- Where `pii-terms` and `active-repos` internal routes live if OGM-012 did not add them: default add them under `services/api/src/internal/` in this ticket (two small files) and say so.
- Poll interval: 60 s; webhook when OGM-006 exists.
- Allowed binary extension list: default as above; OGM-063's build manifest formats are the source of truth once it lands.

## 6. Scope boundaries

- Rights engine and `gm check assets` (OGM-062); blocklist generation (OGM-067); Git writes and audit (OGM-035); release flow (OGM-045); creator-facing wording and buttons (OGM-077); TLS/webhook exposure (OGM-006); child publication rules (V3); visual or model checks (never in V1).

## 7. Risks

- False positives on entropy (hashes, base64 textures in JSON) — default: skip lockfile/manifest `sha256` fields and `data:` URIs; a creator-visible reason always names the file so it can be fixed.
- PII terms incomplete (names appear in dialogue the creator wrote on purpose) — default: `pii` is advisory on private repos (reason recorded, `allowed` unaffected) and blocking only on public; stated in the summary.
- Large trees at publish (thousands of blobs) — default: fetch text for ≤ 2 MB files only, hash from the tree's blob sizes and `GET git/blobs` streaming; publish is rare.
- The check run may post before aiur's own CI finishes; aiur waits for all required checks (`merge_policy.ci: wait`), so ordering does not matter.
