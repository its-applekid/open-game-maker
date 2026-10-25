# Open Game Maker 2000: v0.5 decision log

This file is the input for spec v0.5. It records the owner's decisions since v0.4 (2026-10-21 → 2026-10-22), the research recommendations still waiting on him, and the open questions. It is not a full spec; the full spec is v0.4 plus these changes.

Sources:
- Kevin's chat messages and comments on the decision page (claude.ai artifact "Game Maker v0.4 Decisions").
- Research reports B1–B10 in `docs/research/v0.4/`.

## Positioning (owner direction)

- **A general game maker for everyone, with parental controls.** The product is not kid-focused. Child rules live in one parental-controls module that applies only to child accounts. (Kevin, 2026-10-22; restates spec §1.1.)
- **Name:** Open Game Maker 2000. The repo is `its-everdred/open-game-maker-2000`. (Kevin, 2026-10-21.)
- *Recommended, not yet confirmed:* legally, build as **mixed audience by design**, per B9. A neutral age screen comes first. Under-13 users go to a parent-created child account. COPPA duties apply to child accounts only.
- *Recommended:* three age bands.
  - **Adult (18+).**
  - **Teen (13–17):** an ordinary creator, but counted as a minor when choosing vendors.
  - **Child (under 13):** parental controls are always on.

## Decided by Kevin

| Area | Decision | Changes |
|---|---|---|
| Sign-in | Email is **mandatory** on every account and is the recovery path. Options under consideration: passkey only, Google only, or both. | §4.4 |
| Repos | No multi-repo setup and no games monorepo owned by the platform. At setup, the user connects GitHub, Game Maker creates the repo, and the user picks public or private in GitHub. | §3.5, §9.2; bring-your-own GitHub moves from V3 to V1 |
| Voice | Voice is an **aiur package** regardless. Providers: ElevenLabs first, OpenAI second. | §5.14, §7.2 |
| Art and audio | ~~V1 starts with skills and code tools only.~~ **Superseded 2026-10-25:** V1 is **pack-first**. Agents get standardized access to an installed pack library, and creators are offered only what the installed packs contain. Code tools adapt pack assets. Paid generators are still a later optimization. See B11. | §5.3, §11.1, §12 |
| Asset packs | One pack library per instance, in the instance's S3-compatible bucket (Railway bucket by default). It is never in GitHub. A game repo holds only the assets it uses, plus a lockfile with license data. The engine repo is open source and ships no packs; Kevin's game repos are closed. The first packs are Kenney (CC0) and Synty (personal license, Kevin's instance only). The license policy is enforced when an asset is added to a game. (2026-10-25, B11) | §5.3, §9.6, §10.7 |
| AI funding | Hosted builds use **aiur with API-key profiles**. Build nothing new for this. | §8.1 |
| Spending | **Admins configure all spending limits.** The plan sets only the starting defaults. | §8.3–8.4 |
| Stack | **TypeScript only**, frontend (React) and backend (Node on Railway). Rust was considered and set aside (2026-10-23). The only Elixir is aiur and the thin voice_converse host. | §3 |
| aiur dependencies | aiur consumed as modular packages: voice_converse (git dep pinned to tags), the voice wire contract (JSON Schema), a TS voice client (npm), and hosted aiur over HTTP with versioned schemas. All tracked in Aiur-NUC's lane, including #5936 releases, #5937 per-job scoping (post-v1) and #5938 multi-repo hosting (v1). | §7 |
| Process | No tickets or aiur build order yet. aiur's in-flight build order will be split across two machines, with Game Maker components first (`docs/handoff/aiur-executor-split-prompt.md`). | — |

## Picked by Kevin on the decision page (2026-10-22, 17:45–18:00)

| Card | Pick | Note |
|---|---|---|
| Consent method | Signed form plus confirmation email | As recommended |
| What admins can turn on for a child | Anything the guardian has pre-approved | Not the recommendation ("stricter only"), but COPPA-compatible |
| Child voice input | Always the self-hosted provider; ElevenLabs and OpenAI for adults only | Stricter than the recommendation |
| Narration | ElevenLabs once approved; Kokoro until then | As recommended |
| aiur voice component | aiur package, plus a self-hosted provider and a no-transcript mode | As recommended |
| Paid art generators | None in V1 | Matches his comment |
| Drawing photos | Allow AI restyling through OpenAI after zero-retention approval and parent consent | Later feature |
| Audio | Code-composed audio and free packs | — |
| GPU server | None | — |
| CDN | None in V1 | — |
| Bucket | Railway | — |
| Deleted uploads that forks reuse | Forks keep their copy | **Conflict:** COPPA gives parents a right to delete a child's data. Apply to adult content only? |
| Claude path | "Build Agent SDK worker now" | **Superseded** by his later comment: use aiur with API keys and build nothing new |
| Coding agent in the sandbox | aiur's own tool loop (Kimi, DeepSeek or OpenRouter models) | **Confirm.** This drops Claude Code and Codex from hosted builds, and these vendors' terms haven't been checked |
| Sandbox network | E2B with an allowlist | — |
| Games and the microphone | Games may use the mic directly | **Confirm for child accounts.** A child's audio would reach generated code, and the sandbox gets weaker |
| Games domain | Separate custom domain | — |
| Who starts repairs | Reproducible crashes auto-repair | — |
| Repair slots | Share the edit slots | — |
| Repair attempts | Decide after measurement | — |
| Edit takeover | Either side takes over instantly | — |
| Lawyer | Before any outside family joins | — |
| Controller library | Allow Norigin as an exception | — |
| Platform listener | Dedicated accounts | — |
| aiur gaps | Work around for V1, then file upstream | — |
| All research spends | **Not yet** (models, voice, sandbox, art, domain) | No spending approved |
| Sign-in | "passkey" (the original option) | **Stale.** It was picked before the card was reworked into passkey only / Google only / both |

## Recommended, awaiting Kevin

- **Positioning:** mixed audience by design. Ask a neutral age question at signup; children get a parent-created child account (B9).
- **Teens (13–17):** ordinary creators who count as minors when picking vendors; supervision is optional.
- **Sign-in:** passkey and Google on every account, never Google alone. Child accounts use a passkey the guardian sets up, with Google off until a test on a real Family Link device passes.
- **Child games' repo:** a separate repo per child in the guardian's GitHub, private by default.
- **Launch order:** adults and teens first; child accounts once the COPPA document set is drafted.
- **Admin takeover of an adult member's game:** not allowed. Takeover applies only to supervised accounts.
- **Gemini/Vertex generative AI and fal.ai:** stay excluded until each confirms in writing.

## Open questions for Kevin

1. ~~Do the free CC0 art kits count as "tools" for V1?~~ Answered: yes, packs are the default (B11). New questions: may family accounts use personal-license packs; what happens when no installed pack fits; and is code-composed music allowed (B11 §6).
2. Does "admin" for spending limits mean any family admin, or only Kevin as operator? If any family admin, should a platform-wide ceiling sit above them?
3. Email Anthropic to confirm whether aiur's Claude Code can run on Kevin's API key for family jobs, given the hosting clause in Claude Code's terms.
4. All research spends are "not yet". Should any run before planning, given that budgets and voice accuracy for child accounts depend on them?
5. Resolve the conflicts flagged in the picks table: deleted uploads vs forks, the coding agent in the sandbox, games and the microphone, and the stale sign-in pick.

## Action items only Kevin can do (free)

- Email Anthropic sales about the Claude Code hosting clause.
- Apply for ElevenLabs written approval and for OpenAI zero data retention.
- Optionally, ask Google and fal.ai in writing whether a mixed-audience product may use them for adult features.
