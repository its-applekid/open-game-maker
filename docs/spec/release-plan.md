# Open Game Maker 2000: release plan (V1 = MVP, V2, V3)

This is the single place that says what ships in each version. Every research report and spec draft is read through it.

- **Built from:** spec v0.4 §2.3–2.6, the v0.5 decision log (`game-maker-2000-v0.5-decisions.md`), and research B1–B14.
- **If they conflict,** the decision log wins over this file, and this file wins over the research reports and older specs. Research keeps V2 and V3 material on purpose, labelled with its version, so later planning doesn't have to repeat it.
- **Labels:**
  - **Decided:** Kevin decided it.
  - **Working:** a placement the research recommends, not yet confirmed by Kevin.
- **What this file is not:** a ticket list or a build order. Kevin hasn't asked for either yet.

## 1. Who each version is for

| Version | Users | Legal and vendor posture |
|---|---|---|
| **V1 (MVP)** | **Adults only (18+), creators and players** (Decided, 2026-10-25). Kevin's own instance, his household's adults, and adults he invites. | No minors' data, so no COPPA duties and no vendor rules for minors. A neutral age screen turns away anyone under 18. Each vendor's ordinary adult terms apply. A lawyer reviews before any outside family joins. |
| **V2** | Adults, plus **teens (13–17)** once vendor approvals arrive (Working). | Teens are ordinary creators, but count as minors when choosing vendors (B9 vendor table). |
| **V3** | Adds **child accounts (under 13)** with **parental controls** (Decided, 2026-10-25). | Mixed audience by design. COPPA duties apply to child accounts only. Needs the COPPA document set and guardian consent first. |

The product has to make sense on its own at every version. V1 is a complete game maker for adults, not a children's product with the children removed. Family features in V1 are about shared billing and invites among adults.

## 2. V1 (MVP)

**Product in one line:** an adult signs in, talks or types a game idea, agrees a scope, and aiur builds it in a sandbox from packs and code. The creator plays, edits, tests and publishes it, then shares it with invited adults.

| Area | V1 scope | Status |
|---|---|---|
| Sign-in | Email required as the recovery path, plus passkey and/or Google (passkey + Google both recommended, B10). The age screen turns away under-18s | Decided (email, 18+); method Working |
| Accounts and family | Owner and admins, peer admin management, member invites, invite-only play for adult player accounts. Admins set spending limits and build concurrency (default: 1 creation + 3 edit builds). Admins cannot take over another adult's game | Decided (roles, limits); takeover rule Working |
| Admin UI | Membership, invites, budgets, concurrency, game oversight (listing and abuse handling, not editing others' games) | Working |
| Build analytics | Admins see each build's aiur phase timeline (dispatch → implement → test → PR → merge), cost and retries, plus Game Maker's game-activity breakdown (animation, playtesting, level building and so on), per build and rolled up. No prompt or source text is stored (C2) | Decided |
| Creation | Guided creation by voice, text or images: clarify, agree scope, build and test through aiur. AI feature additions use one coding agent with skills | Decided |
| Budget-aware voice | The voice agent reads the creator's remaining allocation and an estimate of each request. When a change won't fit, it offers to trim it, split it, queue it for the reset, or ask an admin. Admission still reserves the money (C2) | Decided (behaviour); V1 placement assumed |
| Voice | Two-way creation voice via the aiur `voice_converse` package. ElevenLabs first, OpenAI second, with a no-transcript mode. One-way voice snippets where useful | Decided |
| Narration and captions | Read-aloud narration and captions, rendered once and reused. Word highlighting where the provider supports it | Decided; highlighting Working |
| Asset style and devices | The style picked at creation maps to a style family of packs; one family per game, enforced by `gm-core`. Every asset gets mobile and desktop variants at import, and the SDK loads only the device's tier (C2) | Decided |
| Point of view | Chosen at creation (isometric, top-down, side, third person, first person, orbit, fixed screen), filtered by style family and genre. One SDK camera rig per view. The editor keeps its own camera plus a "view as player" preview (C2) | Decided (option); V1 placement assumed |
| Assets | Three tiers: (1) installed packs from the instance bucket, (2) free online sources via API, git or npm, (3) agent-made. The `gm` CLI and its skills (B11, B14). No paid generators | Decided |
| Image upload | Any image, including a photo of a drawing. EXIF stripped. AI restyling through OpenAI only after zero-retention approval | Decided; restyling is post-MVP (§3) |
| Editor and play | Standard HUD and editor framework, direct manipulation, edit while builds run (database overrides), editor undo/redo | Decided |
| Input | Mouse and keyboard, touch, USB and Bluetooth controllers (Norigin allowed as an exception) | Decided |
| Releases | Draft testing, deliberate Publish, semver, changelog, update indicator, rollback | Working V1 |
| Saves | Cloud autosave, three manual slots, cross-device resume | Decided |
| Achievements and analytics | Basic achievements; creator analytics as aggregates | Working V1 |
| Forks | Creator-only, forkable by default, copies the design but not runtime data. Forks keep their copy of uploads | Decided |
| Repos | The user connects their own GitHub at setup. Game Maker creates the repo; the user picks public or private. Paid-pack assets need private repos | Decided |
| Bugs | One report button. Reproducible crashes auto-repair within the admin's allowance, sharing the edit slots. Platform bugs go to the Game Maker repo | Decided |
| Notifications | Browser notifications where supported | Decided |
| Sandbox | VM per job (E2B) with an egress allowlist, a model proxy and a commit service. Games run in a separate-site iframe on a separate custom domain, and may use the microphone | Decided |
| Funding | Kevin's API keys through hosted aiur profiles. No subscriptions in hosted builds | Decided |
| Hosting | Netlify frontend, Railway backend, hosted aiur on Railway, Railway bucket. No CDN | Decided |
| Multiplayer | Architecture and interfaces reserved only, with no implementation | Decided |
| Stack | TypeScript (React, Node); Three.js r186 + Rapier, Phaser 4.2, Tone.js, ZzFX | Decided |
| Engineering | Engine SDK with test hooks (`render_game_to_text`, `advanceTime`), shared contracts, automated tests, continuously production-testable delivery | Decided |

**Not in V1:** anything for teens or children, parental controls, the parent help overlay, guardian consent, the self-hosted voice cascade, COPPA documents, multiplayer gameplay, gameplay rewind, drawing tools, a CDN, paid art generators, and self-service credential onboarding.

## 3. V2

| Area | Scope | Status |
|---|---|---|
| Teens (13–17) | Ordinary creators. Any vendor that lacks approval for minors' data is off for them (ElevenLabs approval, OpenAI zero retention). Supervision is optional | Working |
| Multiplayer | Local and online play on the V1 architecture, with invited draft playtesting, owner-driven shared editing, spectators and session pause | Decided |
| Gameplay rewind | A short, local experimentation aid, including in drafts | Decided |
| Drawing | Built-in drawing tools and the paper crop/flatten capture UI | Decided (drawing); capture Working |
| Image restyling | AI restyling of uploads through OpenAI after zero-retention approval | Working |
| CDN | Advanced CDN, added when evidence calls for it (B6) | Working |
| Assets | Paid generators, if the packs and code fall short | Working |
| Accounts | Self-service provider-credential onboarding, a cost dashboard, cross-game analytics, friends' achievements | Working |

## 4. V3

| Area | Scope | Status |
|---|---|---|
| Child accounts (under 13) | Parent-created accounts, a neutral age question, guardian consent (signed form plus confirmation email), and the COPPA document set | Decided (V3); consent method picked |
| Parental controls | One module, on only for child accounts: guardian-granted data scopes, publication gate, admin powers limited to anything the guardian pre-approved, and admin takeover of a child's game | Decided (V3) |
| Child voice | Self-hosted speech only (#4113, #4114). The microphone question for games is reopened for child accounts | Decided (V3) |
| Child repos | A separate repo per child in the guardian's GitHub, private by default | Working |
| Parent help overlay | Parent-only help and an advanced-settings gate | Decided (V3) |
| Child data rules | Child uploads aren't redistributable, guardian deletion overrides forks, and no named child play data in analytics | Working |
| Other | Player-to-player voice chat; native packaging (revisit Godot as a second runtime here, Working); offline play (optional, or never) | Decided |

## 5. Constraints that hold in every version

- General game maker, not kid-focused. Child rules live only in the V3 parental-controls module (Decided).
- The engine repo is open source and ships no packs. Paid packs stay on Kevin's instance and out of public repos (Decided, B11, B12).
- Sandboxing from day one. Untrusted code never sees secrets (Decided, B4).
- No spending without Kevin's explicit approval. Every research spend is currently "not yet" (Decided).
- Use only tools with at least 1k GitHub stars, unless an exception is approved (project rule).
- Not legal advice. A lawyer reviews before any outside family joins (Decided).

## 6. Open questions this plan raises

1. **Teens: V2 or later?** "Later, when vendor approvals arrive" is placed in V2 as a working assumption.
2. **Kids playing (not making) games in V1.** V1 has no guest play and only adult accounts, so Kevin's children can't play on their own accounts until V3. Options:
   - (a) Accept it.
   - (b) Allow play on a parent's signed-in device with no child profile and no data about the child.
   - (c) Bring forward a play-only child account. That would pull COPPA into V1.
   Recommended: (a). Option (b) is less safe than it looks: a planned child use may count as actual knowledge, and play still collects device IDs, saves and any game microphone audio. It waits on lawyer question Q8 in B9 [I].
3. **Family use of personal-license packs** (B11 §6). This is now only a question about adult family members.
4. **V1 narration provider.** "ElevenLabs once approved, Kokoro until then": the approval was for minors, so V1 can use ElevenLabs from the start (B2).
5. **Edit takeover.** "Either side takes over instantly" conflicts with "admins cannot take over another adult's game". In V1 that leaves takeover only between the owner's own devices (B7, B10).
6. **Per-user GitHub repos.** Bring-your-own GitHub means:
   - the commit service is redesigned per user repo, since B4 assumed one games repo;
   - `gm-intake` is installed on each creator's repo;
   - CI minutes, issues and LFS fall on the creator's account (B4, B6, B8).
7. **Microphone in games** needs per-game subdomains, so V1 needs wildcard DNS and TLS on the games domain (B4).
8. **Child-only rules still applied to adults. Keep or drop each:**
   - the Gemini and fal.ai exclusions;
   - local-only image processing;
   - no third-party analytics;
   - analytics cells with fewer than 3 players suppressed;
   - 64 px touch targets;
   - reading-grade limits and read-along on by default;
   - gentle default presets (A3, A5, A8).
9. **ElevenLabs music and SFX.** Do they count as "paid generators" when ElevenLabs is already paid for voice? (B5)
10. **Public copy.** Should V1 copy avoid naming the V3 child-account plans? Published plans can count as evidence of the intended audience (B9, lawyer question Q7).

## 7. Where the research sits

| Report | V1 relevance | Mostly later |
|---|---|---|
| B1 credentials, B4 sandbox, B6 storage, B8 aiur integration, B11–B14, C1–C2 | Core V1 | B6 CDN (V2) |
| B2 voice | aiur package, ElevenLabs/OpenAI, narration | Self-hosted voice for child accounts (V3) |
| B5 art and audio | Code tools and packs | Paid generators (V2) |
| B7 editor, SDK, input | Core V1 | Multiplayer hooks (V2) |
| B9 legal | Adult vendor terms, the age screen | Teen vendor rules (V2), COPPA (V3) |
| B10 product reframe | Adult defaults, column (b) | Parental-controls module, column (c) (V3) |
| B3 child accounts | None | All of it (V3) |
| v0.3 A1–A9 | Superseded where B-reports differ; see each report's version note | — |
