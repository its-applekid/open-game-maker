# Uncle Kevin’s Game Maker 2000
## Consolidated product specification and research handoff — v0.3

**Date:** October 21, 2026  
**Product owner:** Kevin Weaver  
**Prepared for:** Claude, to continue research and product discovery  
**Working branch:** `research` in the existing Game Maker project, where available  
**Status:** Consolidated discussion record; research and planning, **not authorization to implement or deploy the product**.

This document consolidates the original v0.1 specification, the available v0.2 discussion checkpoint, and Kevin’s subsequent conversation with ChatGPT. Kevin’s latest explicit decisions take precedence. The original numbered sections are retained, with additional subsections for the newly discussed scope. The original ChatGPT instructions below are reproduced unchanged.

---

## Instructions for ChatGPT (read this first)

You are helping Kevin refine this spec in a **voice conversation**. Kevin is the product owner. He has already made many decisions, and he wants a thinking partner who sharpens them, fills gaps and adds context, not one who starts over.

**How to run the conversation**

1. Read the whole document before you speak. Then give Kevin a short spoken summary: two or three sentences on what the product is, and the three areas you think most need work.
2. Start with the ★ questions in **Section 14, Question bank**, in order. Then cover the remaining questions and sections in whatever order Kevin prefers. Skip anything Kevin has already answered.
3. **Ask one question at a time** and keep each spoken turn short, about 20–40 seconds. This is voice, so don't read long lists aloud. Offer two or three options when that helps Kevin decide faster.
4. Treat items marked **Decided** as settled unless Kevin reopens them. Challenge items marked **Proposed** freely. Help resolve items marked **Open**.
5. Push back when something conflicts with the goals in Section 2 (kid-safe, all devices, cheap on tokens, teaches design and engineering, not a slop generator). Point out risks and missing pieces Kevin may not have thought of.
6. Respect the constraints in Section 3. In particular, don't swap the tech stack and don't suggest tools from small or unestablished projects unless Kevin asks.
7. Don't state vendor policies, prices or laws as fact from memory. If something matters, say "worth verifying" and add it to the open questions.
8. When Kevin says "wrap up" or the conversation ends, produce a **revised version of this document**:
   - Same section structure.
   - Mark each changed item **(changed)** and each new one **(new)**.
   - Move anything Kevin decided from Proposed or Open to Decided.
   - Add a short **Change log** at the end, listing what changed and why, in Kevin's words where possible.
   - Keep this instructions section unchanged at the top so the document can go through another round.


---

## Instructions for Claude: the next research iteration **(new)**

### Your assignment

Read this entire document, **mine it for new research goals**, and extend the existing research rather than restarting product discovery. Kevin specifically authorizes using **parallel background research agents** to investigate the added scope. Once their findings have returned and been synthesized, run another **compound-engineering brainstorm**, generate a genuinely new set of unresolved questions, and produce the next downloadable specification for Kevin to bring back to ChatGPT.

This is a research handoff. Do not treat the existence of a proposed API, library, architecture sketch, or acceptance criterion here as an implementation instruction or as an already validated technical solution.

### Required sequence

1. **Establish the decision baseline.** Read the product sections, scope matrix, original-question audit, and source notes. Preserve the chosen TypeScript stack, aiur integration, Railway backend, standardized platform UI, agent-defined game editors, and invite-only access. Do not ask Kevin to choose the creation flow again; it has been answered. Separate approved product requirements from unresolved implementation choices.
2. **Build a research manifest.** Extract explicit research spikes and implicit dependencies from every section. For each, record its source requirement, research question, expected deliverable, dependencies, priority, and what decision the answer will enable. Sections 11 and 14 are starting points, not a limit on discovery.
3. **Launch bounded parallel research.** Give specialists independent, clearly scoped assignments. Research the approved expertise areas, mine the named Game Studios repository, investigate platform/engine boundaries, and examine infrastructure, safety, compatibility, and cost questions. Reuse existing findings and avoid multiple agents duplicating the same vendor-policy or library review. Write separate reports to avoid concurrent edits to the same document.
4. **Synthesize before asking more questions.** Reconcile conflicts between research reports. Distinguish evidence, inference, proposals, and product decisions. Identify which capabilities already exist in aiur, which belong in reusable packages, and which are Game Maker-specific. Present architectural alternatives with costs and tradeoffs, not just lists of tools.
5. **Run compound-engineering brainstorm after research.** Use the established compound-engineering workflow available in Kevin’s environment. Generate questions only where a product-owner decision is genuinely needed; answer factual technical questions through research first. Prioritize questions that affect scope, safety, ownership, publishing, or feasibility.
6. **Produce the next handoff.** Deliver a complete, standalone revised spec, a prioritized new question bank, a research index with sources, a decision/change log, and a clear MVP-versus-later map. Keep the original section structure and the ChatGPT instructions. Provide a downloadable Markdown document Kevin can return to ChatGPT; do not require access to this conversation to understand it.

### Research report contract

Each report should include: the requirement being investigated; primary sources and access dates; relevant versions or commit references; findings and limitations; reuse/adapt/build options; licensing and data-handling questions; integration with the selected stack; likely runtime and token costs; an output-quality evaluation method; recommended next steps; and any decision that still belongs to Kevin. Explicitly say when a result is not verified or a source is inaccessible.

For the Game Studios repository, include a **file-level reuse map**, not merely a README summary. For skills, evaluate whether they improve outputs in representative tasks, rather than treating their existence or popularity as proof of quality. For infrastructure, distinguish independent processes, resource isolation, and security isolation.

Keep research on the existing research branch where practical. Do not publish private project material, deploy services, buy subscriptions, or send children’s data to new vendors as part of research without separate authorization. Benchmarks or prototypes that incur cost should have an explicit bounded budget.

### Conversation protocol for the next round

Ask one question at a time, with **at most two follow-ups per original question** before moving on. Skip answered questions. Kevin wants progress through the whole question set, not a prolonged detour into one small design detail. Do not claim all questions are answered unless the status register supports that statement. Pricing and commercial packaging are deliberately deferred.

---

## Reading guide, status, and provenance **(new)**

**Decided** means an explicit decision in Kevin’s conversation, or a settled original requirement that has not been reopened. **Proposed** means a candidate design or assistant suggestion, not permission to implement it. **Open / Research** means more evidence or a product decision is required. **Deferred** means wanted, but explicitly outside the initial MVP. A feature can be Decided as a product direction while its implementation or release placement remains Open.

**(changed)** marks material that replaces or materially refines the original v0.1 specification. **(new)** marks additions. A marker on a heading or introductory block applies to the following block, including its tables. The v0.2 checkpoint is preserved as a source, but checkpoint-only details are identified rather than silently presented as newly confirmed decisions.

Source shorthand used throughout:

- **[C]** Kevin’s statements and explicit approvals in this conversation. These are the primary source for new decisions.
- **[S1]** `game-maker-2000-spec.md`, original v0.1, October 21, 2026.
- **[S2]** `game-maker-2000-revised-v0.2.md`, discussion checkpoint, October 21, 2026.
- **[P]** A proposal or engineering implication introduced during consolidation. It is not a Kevin decision.

**Research status:** This is a synthesis of supplied material and discussion, not a completed new external research pass. The original catalog contains candidate tools and vendor-policy assertions, but its underlying sources are not included here. Earlier conversational claims such as “I checked Colyseus docs” are not accompanied by retrievable citations in the supplied conversation and are **not treated as verified research**. Section 15 records what must be checked. No GitHub star count, service price, vendor permission, or legal conclusion is certified by this handoff.

**Privacy of this document:** This handoff includes family context and planning details. The intent to open-source software does not authorize publishing this document or personal/account data.

---

## 1. Summary

### 1.1 Product definition — Decided **(changed)**

Uncle Kevin’s Game Maker 2000 is a **general-purpose, all-ages, web-first game creation and play platform**. People describe games through structured visual choices, text, voice, and optionally drawings. AI agents help clarify intent, design the game, and implement it. Creators alternate between playing and editing, using intuitive direct manipulation and game-specific controls instead of requesting code changes for everything. [C]

The platform should make game creation itself enjoyable: trying an idea, playing it, tuning it, seeing friends play, and improving it. Multiplayer and the structured, gamified editor are central to the long-term appeal. It should produce games people keep developing, not a stream of disposable one-prompt outputs.

The experience is inspired by Super Mario Maker’s short play/edit loop. It is not a replacement for Three.js or Phaser: those remain the underlying game technologies. A formal **Game Maker Engine SDK** and consistent platform UI provide shared functionality around generated games.

**Kid-friendly mode is a configurable account layer, not the identity of the entire product.** Voice input, clear icons, readable interfaces, and conversational help should benefit adults as well as children. Child accounts add parental controls, guardrails, and developmentally appropriate guidance without forcing everyone into a childish interface. [C]

### 1.2 Origin and first users — Decided **(new)**

Kevin has already built an EarthBound-style RPG with his seven-year-old nephew. His nephew drew characters and villains and described what he wanted. Kevin translated those ideas into instructions for a coding agent. This is the concrete interaction to automate: preserve the child’s imagination and authorship while replacing Kevin’s role as the translator, clarifying interviewer, and technical intermediary.

Kevin’s five-year-old niece is also an initial user. The interface must work for someone still learning to read and for an older child who skips text. The product should support both independent use and use with a parent. Kevin lives in a different state and wants remote administrative visibility, the ability to improve games or the platform, and eventually the ability to play together remotely. [C]

Initial practical devices are **desktop computers and iPads**. Phones, different aspect ratios, and eventually controller/TV use remain part of the broader cross-device requirement.

### 1.3 Build-time expectations — Decided **(changed)**

A new game may take **up to roughly an hour**. Substantial additions, such as a dungeon or new gameplay feature, should aim for **about 10 minutes, with roughly 30 minutes as the desired upper bound**. These are Kevin’s product expectations, not measured guarantees. The original promise of every first game being playable “in minutes” is therefore superseded. [C]

Existing manual editor changes should remain immediate and should not require a coding agent. Existing playable games should remain usable while new work is queued or building. The exact first-build waiting experience still needs design.

### 1.4 Principal changes from earlier drafts **(changed)**

| Earlier framing | Current direction |
|---|---|
| Children-only product | All-ages product with configurable child accounts and parental controls. |
| Every game and household permanently private | Shared game discovery plus a per-game private toggle; source-repository visibility remains a separate unresolved design. |
| Creator/player concepts blurred together | Admin, creator, and player permissions are distinct; child status is separate from role. |
| Multiplayer and controllers assumed in the first release | Both are explicitly post-MVP, along with human voice chat and advanced two-way agent conversation. |
| Open-ended blank prompt as a separate path | One structured creation flow, with a prompt and “Other” input where presets do not fit. |
| Generic editor controls could define the universe of games | A standardized editor framework with comprehensive, agent-defined controls for each game. |
| Automatic successful-build publication in the checkpoint | Automated build/test/preview is compatible with the plan, but **creator-controlled Publish** is required. |
| Broad or indefinite save compatibility | Smooth migration from the immediately previous published version; no guarantee for substantially older saves. |
| Rollback assumed to preserve progress | Rollback to any previous published version is explicitly potentially destructive; no reverse-migration obligation. |
| Platform runtime treated as a small helper package | Formal Engine SDK covering controls, editing integration, saves, achievements, analytics, versions, and later multiplayer/rewind. |

---

## 2. Goals and non-goals

### 2.1 Goals — Decided **(changed)**

**Fun and authorship first.** Creators should recognize their own ideas in the result, enjoy playing it, and want to improve it. The assistant supplies missing context and asks useful questions without dictating a single kind of game.

**High quality across disciplines.** Games should feel responsive and deliberately designed, with coherent stylized art, useful interfaces, engaging mechanics, suitable sound, and good stories where a story is relevant. Correctly compiling code is not enough.

**An effective play/edit loop.** Creators can make substantial changes with visible controls and direct manipulation. Voice or text offers another route to the same actions. Existing controls do not require source-code regeneration.

**Broad access.** Every supported game should remain reasonably playable across devices and screen shapes. Simple/UI-oriented games should be genuinely responsive where practical. More complex games may use platform-level adaptation rather than forcing every layout to be fully fluid.

**Learning through making.** People gain exposure to game genres and discover what makes them fun. Game design, and to a lesser extent software engineering, can be taught explicitly in context. Reading support is a welcome side effect, not a requirement that every generated game become educational.

**Controlled costs and understandable spending.** Use agents only where judgment or generation is needed. Expose spending across models and external APIs, not only coding tokens. Separate build budgets from playtime restrictions.

**Safe, permission-aware creation.** Maintain clear account, game, and platform authority boundaries. Protect child accounts and personal data. Sharing a playable game must not grant editing access, spending power, or platform access.

### 2.2 Non-goals and boundaries **(changed)**

The settled web-first constraint remains: no Unity, Unreal, Godot, or other desktop engine in the live generation pipeline. Photorealism remains out of scope; preserve the original preference for pixel, low-poly, cartoon, paper, clay, and cel-shaded styles. The original rationale about token cost is a product motivation, not a validated universal rendering-cost claim. [S1 §§2–3]

Do not build a public social network, public matchmaking system, or unrestricted stranger chat as a side effect of adding multiplayer. The invite-only product can still support friends, shared games, presence, and private-room voice communication.

Do not build a mandatory coding course, require reading-heavy instructions, require an adult to translate every request, or force every game into a preselected genre template. Do not build a large distributed-services architecture merely to anticipate hypothetical scale.

**Adult content policy remains unresolved, not automatically relaxed.** The original spec’s platform-wide exclusions remain the inherited baseline pending explicit review. Moving to all ages is not an instruction to enable adult themes, gore, or unrestricted real-person content. Section 10 separates this policy question from the account model.

### 2.3 MVP and later scope **(new)**

The following distinction is essential: researching a future capability or defining its SDK boundary now does not require shipping its entire implementation in the MVP.

| Capability | Scope status | Meaning |
|---|---|---|
| Create and modify games | **MVP, Decided** | The central creation/editing experience. |
| Play mode and editor mode | **MVP, Decided** | Prominent switching and a useful per-game editing surface. |
| Game index | **MVP, Decided** | Own games and discoverable games from other users. |
| Authentication, admin role, invitations | **MVP, Decided** | Invite-only access with creator/player distinctions. |
| Basic voice dictation | **MVP, Decided** | Voice input for contexts that accept text; not a dependency on full live conversation. |
| aiur integration | **MVP, Decided** | aiur orchestrates coding work; reuse its capabilities. |
| Safe backend deployment | **MVP, Decided** | Railway backend with appropriate agent/game separation. |
| TypeScript end to end | **MVP architecture, Decided** | Client, platform backend, SDK, and applicable shared contracts. |
| All approved expertise/skills research | **MVP preparation, Decided** | Research and make suitable skills available; do not run every specialist on every request. |
| Cloud autosave, multiple slots, cross-device continuation | **Initial product baseline, Decided** | Discussed and accepted as part of backend persistence; not optional extra slots only. |
| Standardized HUD and Engine SDK foundation | **Core architecture, Decided** | Implement the initial capabilities behind stable interfaces; future modules can follow later. |
| Direct manipulation and agent-operated existing controls | **Core editor requirement, Decided** | Both workflows matter; exact first-release manipulation primitives need planning. |
| Multiplayer, local and online | **Deferred, Decided** | Still a central long-term feature. |
| Physical controller support | **Deferred, Decided** | Eventually full create/play interaction via controller and microphone. |
| Human-to-human voice chat | **Deferred, Decided** | Private multiplayer communication, distinct from agent voice. |
| Advanced two-way agent voice conversation | **Deferred, Decided** | Reusable component being developed in parallel. |
| Gameplay rewind | **Deferred, Decided** | Local, ephemeral, approximately ten-second buffer. |
| Achievements and analytics | **Required product features; release placement Open** | First-class SDK/platform capabilities, not per-game reinventions. |
| Forking, draft/publish, update notifications, semantic versions, changelogs, rollback | **Required product features; release placement to finalize** | Explicitly approved after the MVP discussion; do not silently omit them or claim their full schedule is settled. |
| Drawing, camera import, spoken RPG dialogue, synchronized word highlighting | **Approved direction; exact initial scope Open** | Preserve these goals while resolving vendor, accessibility, and sequencing questions. |
| Pricing, monetization, public self-service signup | **Not part of this decision round** | Pricing deferred; invite-only operation is acceptable indefinitely. |

**Checkpoint-only scope note:** v0.2 included spoken read-along captions in MVP and additional administrative features. Basic dictation is explicitly confirmed in this conversation; the full read-along rollout and checkpoint-only extras should be reconciled rather than treated as automatically approved launch requirements. [S2 §5.10]

---

## 3. Constraints and principles

### 3.1 Technology and reuse — Decided **(changed)**

Use **TypeScript end to end**. Retain **Three.js for 3D** and the original **Phaser 4 direction for 2D**, with KAPLAY or LittleJS as originally identified options for very simple games. Verify exact versions, maintenance, browser support, and fit during research; do not silently substitute engines. The backend framework is not settled: Express was discussed as a possibility, not selected. Rust is not part of the planned stack unless a later, measured problem warrants a separate decision. [C; S1 §3]

Use aiur as the coding-agent orchestration environment. Kevin pronounced its name in several ways during voice transcription, including “Ayer”; he explicitly spelled it **AIUR**. This document uses **aiur** for that dependency, not a newly invented separate system.

Use **Railway for the backend**. Prefer a single operational project with clear runtime boundaries over several unrelated deployments. The accepted direction is separate agent and game-serving processes; exact Railway service/container/resource configuration is research work, not already validated isolation.

Voice and other useful infrastructure should be modular and reusable across Kevin’s projects. Voice may be an aiur package or another reusable package; it should not become inseparable from Game Maker’s UI or kid mode.

### 3.2 Deterministic work before agent work — Decided **(new)**

Use conventional code for predictable operations: copying a game, creating branches and commits, processing known editor commands, opening structured issues, tracking job status, enforcing permissions, and saving progress. Reuse aiur’s existing Git automation where appropriate.

A voice request may still require speech recognition and an agent to interpret intent. That does not mean the resulting edit needs a coding agent. “No AI tokens for this button” is distinct from “no infrastructure cost” and from “no cost when the same action is requested through speech.”

### 3.3 Shared platform, flexible games — Decided **(new)**

Standardize platform responsibilities and APIs, not the content of every game. A generated game supplies game-specific mechanics, data, editor declarations, state serialization, and achievement definitions. The platform supplies common UI, account permissions, persistence infrastructure, and other shared services.

Do not constrain the range of games by hard-coding a universal list of editable properties. Do not ask each implementation agent to rebuild pause menus, save-slot interfaces, achievements catalogs, or an authentication system.

### 3.4 Established dependencies — carried forward

The original preference remains: established open-source dependencies, roughly 1,000 GitHub stars or more and active maintenance, with case-by-case exceptions; established commercial providers. Popularity is a selection constraint, not proof of safety or quality. The original `smplr` exception remains a research question. Its reported star count and “best” characterization are not verified here. [S1 §3]

### 3.5 Repository and information boundaries **(changed)**

The platform starts private, with an intention to open-source it later. Platform and generated-game code remain separate trust boundaries and separate repositories. A TypeScript monorepo for platform packages does not erase that boundary.

Kevin also expressed a preference for generated games living in open-source GitHub storage, potentially in user-specific folders of a shared games repository. Later, he restored a private-game toggle. These two preferences must be reconciled explicitly; hiding a game from the app’s index is not the same product behavior as keeping its source inaccessible. Section 9 preserves this as an open decision rather than silently changing either requirement.

---

## 4. Users and roles

### 4.1 Roles and account attributes — Decided **(changed)**

Do not collapse **platform authority**, **creation permission**, **game ownership**, and **child supervision** into one role.

| Role or attribute | Approved responsibility | Boundary |
|---|---|---|
| Platform owner / maintainer | Kevin and explicitly authorized maintainers can change Game Maker itself. | Ordinary users and their game agents cannot modify the platform. |
| Admin | Can invite creators or players; configure permitted accounts and see activity for people they invited. | Admin access is not automatically platform-maintainer access. Exact scope beyond invited accounts needs formal definition. |
| Creator | Can create games, edit their own games, and request work that consumes authorized tokens/budget. Can invite players. | Cannot invite another creator or admin through the creator role. Cannot edit another creator’s original merely because it is visible. |
| Player | Can play permitted games and participate in invited multiplayer sessions. | No game-edit authority or authority to initiate paid build work from this role. |
| Child-account attribute | Inviter can designate an invited account as a child account and receive the associated parental controls. | Child status is not a separate creator/player role. Guardian authorization and child-inviter edge cases require research. |
| Adult/peer account | Uses the same core product without parental supervision by its inviter. | Being invited does not grant the inviter parental-style control of an adult peer. |
| Game owner | Creator of the particular original or independent fork. Controls editing in that game’s shared session. | Creation permission elsewhere does not grant editing rights to this original. |

The creator of a game, when present in a multiplayer session, is the **only participant who drives its editor**. Other participants can watch but cannot alter controls or spend the creator’s budget. Kevin’s separate administrative ability to inspect and help with games remains a privileged capability, not permission for ordinary guests. [C]

### 4.2 Invitation behavior — Decided direction **(changed)**

Admins may invite **creators or players**. Creators may invite **players only**. No player invitation power has been granted in the current decisions. The invite flow includes an option to designate the recipient as a child account and configure that account’s controls.

Access remains invite-only. Kevin is building a general product, not only a family project, but does not require eventual public self-service signup. Product pricing will be discussed separately.

**Open:** Who may act as the supervisor when the inviter is also a child? How is legitimate adult/guardian authority established? What happens when the actual parent claims an account initially invited by a creator? The accepted product concept must not be interpreted as proof that any inviter is automatically an authorized guardian.

### 4.3 Authentication — inherited proposals, not final implementation

Normal signed-in accounts and gated creation remain required. The original household-profile model—parent sign-in, child avatar selection, picture PIN, no child email/password—is still a candidate child-account experience. Passkeys, email login, and Better Auth remain proposed implementation choices. General adult accounts may need a different relationship to households. [S1 §4]

The original guest-join model used expiring codes without accounts. Later requirements add signed-in presence, achievements, multiple save slots, and invite-based accounts. **Research whether accountless room guests remain supported**, and how their persistence differs from player accounts. A shared URL alone must never confer creator rights.

### 4.4 Oversight and analytics **(new)**

Kevin wants remote visibility into created games and the ability to help improve them. Creators should see useful analytics about their games. Admins should also see activity for the people they invited. [C]

The exact granularity of this visibility is not settled. The conversation’s suggestion that unrelated creators see only aggregate child data is a **privacy proposal**, not an approved permission matrix. Define analytics scopes separately from parental controls, especially for adult peers.

**Checkpoint additions to investigate:** invitation audit/revocation, parent claim and player-to-creator upgrade without losing saves, optional household GitHub connection, and an on-demand parent/admin assistant that can file platform tickets without editing platform code. Preserve these as checkpoint-origin proposals unless supported by additional owner decisions. [S2 §§7.1, 9–10]

---

## 5. The experience

### 5.1 Home — Decided **(changed)**

The original two primary choices remain **Play** and **Make**. Access to Make depends on creator permissions. The library should distinguish **My games** from **Others’ games**, so users can return to their projects and discover games made by the invited community. [C; S1 §5.1]

Kevin will create a small number of demo games that people can try. Demos are examples and inspiration; their presence does not settle whether the implementation pipeline must start from a template.

### 5.2 Play: the game wall and visibility **(changed)**

Retain the visual game wall, with gameplay previews rather than a reading-heavy list. Automatically recorded short, muted looping gameplay videos remain a proposed implementation, originally tied to robot playtesting. They are not yet a proven output of the pipeline. [S1 §5.2]

**Decided:** A game can be marked **Private** through a simple setting. It then does not appear for friends in ordinary game discovery. This supersedes the earlier conversational suggestion to omit a privacy toggle. Shared visibility by default was Kevin’s earlier preference; the precise defaults for child accounts, and the boundary between friends and all invited users, remain to be finalized. [C]

**Proposed privacy behavior:** Do not leak private-game names, previews, or editing activity through presence and activity feeds. An individually authorized invitation may permit access to a private game, but that exception has not been fully specified. Source visibility and direct-URL access must be decided separately; a private toggle should have a clear, truthful meaning.

### 5.3 Make: the creation flow — Decided **(changed)**

Use **one structured onboarding flow**, effectively a form presented through large, visual, full-page choices in a web application. Include icons, preset options, a written or spoken description, and an **Other** option wherever fixed categories do not fit. Other should accept typing or dictation. There is no need for a separate blank-page creation mode. [C]

Any context requiring user-entered text should offer a voice-input path. Whether that path is simple speech-to-text or a two-way conversation depends on the context and available capability. The richer conversational mode is not a prerequisite for the first version.

Guide users toward varied genres, potentially changing ordering or suggestions based on what they have already made. This should encourage exploration, not lock genres behind progress or prevent repeating a favorite genre. The exact recommendation behavior remains a design task.

#### Art selection — original options retained

Choose one art direction. The original proposed difficulty labels below are preserved as planning estimates, **not measured guarantees**. The research agent should calibrate them against actual output quality and build cost. [S1 §5.3]

| Option | Original intended meaning | Original difficulty estimate / unresolved point |
|---|---|---|
| 8-bit | NES-like small-palette pixel art | Easy |
| 16-bit | Richer pixel art and layered backgrounds | Easy |
| 32-bit | Either GBA-style sprites or PS1-like low-poly 3D | **Open**; original question bank suggested PS1-style 3D as a default, not a decision. |
| 64-voxel | Minecraft-like block-based visuals | Medium |
| Cartoon | Bright toon look, potentially using compatible asset packs | Easy |
| Paper | Paper cutouts in a 3D world | Medium |
| Clay | Claymation-like appearance | Hard |
| Cel-shaded | Toon shading with outlines | Easy–medium |

#### Style and genre

Retain the style vocabulary: **retro game, futuristic, cool, cute, old, creepy, cozy, epic, surreal**. The cap of two style choices is still a proposal. Unusual combinations should receive helpful guidance rather than an automatic design veto, subject to separate safety rules.

Retain the genre list: **RPG, platformer, adventure, craft, puzzle, battle, strategy, roguelike**, with up to three choices as in the original. Starring one main genre remains proposed. Adding **survival** remains open; it appeared in examples but was never explicitly added to the list. Additional genres or first-person combat can be governed by child-account controls.

#### Reference games — Decided, reinforced **(changed)**

Suggest strong, popular examples within each genre. Let creators select references or describe their own. Kevin sees exposure to unfamiliar genres and inspiration from strong examples as major levers for both learning and gameplay quality. [C]

Ask what the user likes about a reference where useful: building, exploration, combat, pacing, storytelling, or another specific aspect. This is a proposed clarification technique, not an obligation to ask the same follow-up every time.

References should inform mechanics and design reasoning rather than authorize copying protected assets or identity. Reference-rating defaults, allowed custom references, and policy treatment for child accounts need research. The original specific rating claim about Project Zomboid is unverified here and should not be used as a certified rating lookup.

### 5.4 Narrowing before building — Decided direction **(changed)**

The product replaces Kevin’s translation/interview role, not merely his dictation. It should ask questions the creator may not know to answer: what the player does, how they know they are succeeding, what makes the challenge interesting, and what the creator actually likes about a reference.

The original narrowing sequence remains useful: clarify intent, offer approximately three quick variants for meaningful uncertainty, then build from a selected direction. Visual questions can use screenshots or sketches; questions about feel can use very short playable demonstrations. A volcano request was the original example. [S1 §5.4]

**Scope qualification:** Full real-time voice narrowing is deferred with the advanced conversation component. The MVP can still collect structured answers and accept dictated input. Do not quietly bypass clarification by passing a raw transcript directly to a coding agent.

**Open:** The maximum question count, how often variants are worth their cost, and when to proceed with a reasonable default. The original “at most three questions” was a proposal. Do not require an expensive three-variant build for a simple change that an existing editor control can perform.

### 5.5 Building in the background: the progress board **(changed)**

Show understandable progress cards for requests: planning, building, testing, and other stages as warranted. Queue requests when allowed concurrency is exhausted. Let users continue playing existing releases or working with available editor controls while a new component or game is being prepared. [C; S1 §5.5]

New games may take up to about an hour; substantial feature requests should target the 10–30-minute range. The intended architecture uses a stronger initial design/build effort to establish a game that subsequent, lighter agents can extend reliably. This is an optimization hypothesis to benchmark, not a demonstrated speed guarantee.

The v0.2 checkpoint proposed durable jobs, deterministic progress handling, and agents that start for a task and exit afterward. Retain that as the preferred low-overhead direction while inspecting what aiur already implements. Never use a continuously reasoning agent merely to wait for a webhook or update a progress bar. [S2 §5.5; C, deterministic-work principle]

**Open:** What an entirely new user does during the first long build, what happens when they close the browser, and which completion notifications are appropriate. Existing demos, drawing, or other games are candidate waiting activities, not selected mandatory distractions.

### 5.6 Play ⇄ edit mode — Decided **(changed)**

A prominent button switches between play and edit. In a later controller-capable release, an accessible controller action should do the same. Kevin ultimately wants the whole creation/play loop accessible with a controller and microphone, potentially with hold-to-talk. [C]

The editor is a **consistent platform framework with game-specific content**, not a bespoke application each agent creates from scratch. Its layout conventions and common controls stay familiar; the controls relevant to a particular game are designed by the implementing agent.

#### Comprehensive controls, defined by the agent — Decided **(new)**

At initial game creation, the agent should define a **thoughtfully comprehensive editing surface**. It decides which elements and properties deserve useful controls: speeds, colors, jump height, enemy counts, maps, interactions, dialogue, game rules, or other genre-appropriate features.

Every later feature agent must understand this editor contract and add or update relevant editing capabilities along with the feature. Editor support is part of finishing the feature, not an optional follow-up. Creators can ask the agent to expose additional controls later.

Do not automatically expose every internal variable. Do not force all games to fit a fixed, exhaustive global property schema. A small shared vocabulary of widgets is useful, but the platform must not impose a game-design ceiling because its initial control list was narrow.

#### Manual interaction and natural language — both Decided **(new)**

Creators should be able to drag and drop enemies, add or remove objects, and manipulate suitable game elements directly. Configuration panels remain useful for numeric, categorical, and rule-based changes. The interaction should be obvious and intuitive on the relevant device.

A standardized microphone affordance should appear where natural language is useful. Example: **“Make all of the enemies blue.”** An editing agent receives the current authorized control surface and invokes an existing color control. It should not modify source code when the requested capability already exists.

Anything the control-operating agent can do through that surface must also be available for the user to do manually. Natural language is a convenience and an accessibility path, not an exclusive route to basic editing capabilities.

**Proposed request routing:** manual UI invokes an existing command directly; text/dictation is interpreted into that same command where possible; ambiguity opens clarification; a genuinely missing capability becomes a coding task. Each escalation must respect permissions and cost limits. Speech recognition and intent interpretation may cost money even when no coding is required.

#### Editor contract — Proposed implementation **(changed)**

A tunables/control manifest remains the leading proposal: stable control identifier, label, icon, type, values/ranges/defaults, contextual target, and the operation it performs. Shared widgets might include sliders, switches, choices, colors, counts, placement tools, and rule cards. [S1 §5.6]

Research how richer manipulation and unusual game types extend that model. Agents should be trained on an editor-API skill. Shared command handling should support undo/redo and restoration of appropriate defaults. **Undo is a requirement/design goal, not something that appears “for free” simply because both input paths call the same API.** Its transaction and state model needs explicit design.

The original hot-reload idea remains desirable for draft iteration, but safe insertion of arbitrary new code into an active game is not established. Define safe reload or resume boundaries, preserve the last working draft, and do not confuse draft hot reload with forced updates to other players’ published sessions.

### 5.7 Bug button, repair, and tolerable chaos **(changed)**

Keep a conspicuous bug-report action. Users can say or type what went wrong. Make repair quick enough that experimentation remains inviting. Kevin is comfortable with games breaking in amusing or exploratory ways, provided they are easy to fix; automated QA should still catch ordinary failures. [C]

Use standard GitHub issue and development workflows where they fit. A report may create an issue through deterministic automation. Agent work begins when diagnosis, interpretation, or a code change is actually needed.

The original proposed diagnostic bundle includes the random seed, recent inputs, a state snapshot, recent errors, and a small screenshot, with roughly 30 seconds of input history. Preserve that as a research direction. **Exact replay is conditional on the game/runtime design; a seed and inputs alone are not a validated guarantee.** Multiplayer, timing, and external events need particular attention. [S1 §5.7]

A fixed bug may become a regression “promise” checked on future builds. Keep reports and evidence scoped appropriately; do not publish private saves, names, speech, or screenshots to a public issue simply because the code repository is public.

**Open:** Retry limits, the fallback message, escalation to Kevin, and whether repair jobs have different budgets from feature jobs. The willingness to tolerate chaos is not a decision to publish failed builds or abandon QA.

### 5.8 Multiplayer — Decided direction, post-MVP **(changed)**

#### The same product experience, shared

Multiplayer should not remove access to the creator’s normal play/edit loop. When the game’s creator enters edit mode in a shared session, **gameplay pauses for everyone in that session**. Only that creator can drive the editor. Other participants observe the available controls and changes without edit or spending access. [C]

The observation experience should feel like lightweight screen sharing: seeing the creator’s cursor, focus, or the knobs being manipulated. The conceptual requirement is shared visual understanding. Synchronizing editor state rather than streaming literal video was an assistant proposal, not a finalized transport choice.

The rule concerns the affected session, not a global pause of every independent instance of the same game. Resume behavior, creator disconnection, and what spectators see when the creator opens private prompts or administrative panels require design.

#### Friends, presence, and invitations

Make it easy for a signed-in user to see an available friend and invite them into a game. Kevin reconsidered showing exactly what friends are building; do not make private editing activity broadly visible by default. The private toggle must be accounted for in any presence design. [C]

Human voice chat is a desired platform-level feature for invited multiplayer sessions, especially remote family play. It is not the same component or permission as speaking to an AI agent. Voice chat, multiplayer, and controller support remain deferred from MVP.

#### Local and online play

Retain the original target of couch co-op with up to four gamepads, plus appropriate keyboard and touch support. Shared input helpers should avoid asking agents to reimplement controllers. Shared-screen 2D with camera adjustment and optional split-screen 3D remain proposed patterns, not universal requirements for every genre. Phones joining as additional controllers through a QR code remain an inherited proposal. [S1 §5.8]

Online play uses private/invited rooms. Exact lobby, join-code, relationship, and accountless-guest behavior is open. The original PartyKit relay suggestion and the later Colyseus discussion are candidates; neither is yet the selected implementation.

#### Multiplayer questions that research must resolve **(new)**

How does creator-only draft editing coexist with friends watching a paused session that began on a published release? How are all room participants kept on a compatible version when an update is available? What happens to shared progress when the owner disconnects? Which edits can be previewed in the room without publishing to the entire community? What are the authority rules for achievements, pause, save, and later rewind?

These are product/architecture dependencies, not reasons to drop the shared editor experience.

### 5.9 Drawing, photos, and other creative inputs

Retain the built-in simple drawing tool: big brushes, a small useful palette, eraser, undo, and done. Drawings can describe characters, enemies, and maps. A camera path should support drawings on paper. The original intention is to find the paper, crop/flatten it, strip location data, send only the intended crop, and avoid retaining the original photo. [S1 §5.9]

perfect-freehand and a reduced Excalidraw experience remain research candidates; paper-image processing was associated with jscanify. No implementation is selected by this handoff. Restyling drawings into the chosen art direction or generating a simple 3D interpretation remains desired, subject to quality, consent, and vendor review.

**Checkpoint-origin proposal:** personally recorded sound effects or dialogue, and genre-specific creative editors such as an RPG dialogue editor. The latter fits the approved flexible-editor direction; recording and retaining user voices needs separate scope and privacy confirmation. [S2 §5.6]

**Open:** First-release drawing scope, pixel-grid mode, keeping originals versus derived game assets, and whether drawings are private context or deliberately published content.

### 5.10 Voice, captions, and contextual assistance **(changed)**

#### Voice capability and modularity — Decided

Basic speech-to-text input belongs in MVP. Advanced two-way conversation is deferred and is being developed in parallel. Build one-way and two-way voice as reusable infrastructure, potentially within aiur, because Kevin expects to use it in other projects. [C]

The original architecture proposes forking relevant executor or implementation-agent context onto a faster/cheaper conversational model. The conversational assistant and implementation agent may be separate. Research the actual aiur interfaces and privacy boundaries before assuming complete agent context should be copied into every voice session.

#### Always accompany generated speech with text — Decided **(new)**

Whenever the agent speaks a suggestion or other generated text, show the corresponding text on screen. This supports reading, provides a record when the user is distracted, and allows them to return to the message. Kevin also likes synchronized highlighting as text is read aloud. Its exact timing and implementation remain research work.

Favor voiced dialogue in RPGs where quality, cost, and vendor permissions make it practical. Do not claim it costs a particular amount: Kevin’s “two cents” example was hypothetical, expressing willingness to pay a small amount for occasional useful spoken assistance.

#### Nudges, not forced lessons — Decided

Use contextual, actionable assistance. A Navi-like exclamation indicator can invite the user to open a hint or conversation. Some tips may also speak briefly with accompanying text. Kevin’s initial acceptance of interruptions was refined into this more nuanced model, not a blanket instruction to interrupt frequently.

Keep **editor coaching** separate from **in-game help**. Editor coaching may explain design decisions or suggest a new mechanic. In-game help should operate within the game’s existing mechanics rather than casually suggesting that the player change the source rules to win.

The original push-to-talk, short replies, warm character voice, and clear “computer helper” identity remain proposals. A single child-oriented voice should not be imposed on the all-ages product without review.

**Research:** speech recognition for the initial users, clarification when recognition is uncertain, microphone permissions across devices, captions/read-along alignment, input privacy, voice selection, accessible text-only fallbacks, caching, and cost attribution. The original observation about younger children’s speech recognition needs testing rather than being treated as a quantified fact.

### 5.11 Standard Game Maker HUD — Decided **(new)**

Standard controls belong to the platform, not the generated game’s visual theme. Pause, saves, achievements, settings, and game information should use consistent Game Maker UI, just as the editor is consistent across games. Creators can request that particular standard functionality be omitted where appropriate, but common capabilities are included by default. [C]

In play mode, expose a responsive navigation/HUD appropriate for desktop, iPad, and phone. Eligible creators see a prominent edit toggle. In edit mode, expose editing and relevant creator-level management such as analytics, versions, and publishing. Calling this an “admin-level view” does not grant a creator actual platform-admin permissions.

Whether a specific control opens an overlay, drawer, or separate panel depends on its task. Sidebar-on-desktop and expandable-phone-menu ideas were examples, not approved layout specifications. The implementing agents should use engine/platform APIs rather than recreate these screens.

**Open:** Which capabilities can be disabled, which are mandatory for safety or account control, and how opt-outs are represented without making the overall platform inconsistent.

### 5.12 Cloud saves and cross-device resume — Decided **(new)**

Gameplay progress lives in backend persistence, separate from Git source history. A user should be able to stop an RPG and continue on another device. Be liberal about autosaving. Pausing should normally create a useful resume point; meaningful checkpoints and other safe save opportunities should also be considered. [C]

**Autosave is the default, with multiple save slots per user per game.** Do not reduce the decision to one slot or characterize additional slots as merely optional functionality. The slot count and selection UI are still unspecified.

This does not require moving all single-player simulation to the server. The settled distinction is cloud-backed persistence and server-side handling of multiplayer shared state, while gameplay rendering and much of the simulation remain client-side.

**Proposed technical contract:** Each game exposes an explicit serializable logical state and a restore operation through the SDK. Saves carry game identity, slot identity, save-schema information, and the relevant published/build version. The backend validates authorization and stores progress; the game supplies game-specific state semantics.

**Research, not settled implementation:** autosave frequency and size; pausing during a battle or animation; simultaneous devices; interrupted uploads; offline behavior; local buffering; preventing an old tab from overwriting a newer save; distinguishing “saved locally” from “saved to cloud”; and safe resume after code changes. Do not promise that every arbitrary engine object can be automatically serialized.

Multiplayer needs an explicit model for room/world progress versus individual player progress. Merely storing room state on a server does not settle how long it survives or who owns its save slots.

### 5.13 Forks and other deterministic game actions — Decided **(new)**

Creators should be able to make independent copies of other users’ permitted games and of their own games. This is a first-class product action, implemented through ordinary backend/Git automation rather than a coding agent. [C]

Kevin’s suggested flow: create a branch, copy the game folder into a new authorized location, commit, and merge. This is a **game-level fork/copy**, not necessarily a GitHub repository fork. Reuse aiur’s scripted branch, pull-request, and merge operations where appropriate.

Other predictable actions—renaming, restoring a chosen source version, opening a structured issue, or moving a completed draft through a known publish workflow—should follow the same no-agent principle where possible.

**Proposed safeguards and metadata:** assign a new game identity, establish the new owner, record the source game/version, avoid copying another user’s private account or progress data, and preserve relevant provenance. These are implementation proposals to research, not a finalized data schema.

**Open:** Can a player-only account make a token-free fork but not edit it, or must forking require creator rights? Does private-game access imply permission to fork? Are saves, achievements, or analytics ever copied? These permissions must not be inferred solely from the action’s lack of token cost.

### 5.14 Achievements — Decided direction **(new)**

Achievements are a first-class platform/SDK capability. When an agent creates a game, it should use a standard approach to define in-game achievements and award them. The platform tracks and displays achievement catalogs **per user and per game**, supporting both single-player and multiplayer. People can browse relevant achievements for themselves and friends. [C]

Generated games should not independently invent account-wide storage, catalog UI, or notification behavior. They still need game-specific definitions and conditions, such as finishing a dungeon or discovering a secret.

**Research:** stable achievement identities, repeat-safe awards, visibility, server validation where appropriate, deleted or revised achievements, forks, resets, migrated saves, and rewind. Especially clarify whether achievements represent permanent account accomplishments or reversible state within a save. No anti-cheat or trust model has been selected.

### 5.15 Analytics — Decided direction **(new)**

Provide useful creator analytics inspired by the aspects Kevin liked in Super Mario Maker: attempts, time spent, and related evidence of how people play. Admins should also have visibility into activity for people they invited. [C]

Play counts, completions, drop-off points, and places where users get stuck were suggested as useful additions. A standard analytics API and consistent dashboards are the proposed way to avoid per-game tracking implementations.

**Research:** event definitions across genres; attempt versus session versus completion; opt-outs and minimization; aggregate versus individual visibility; child-account rules; retention; and whether detailed replay is necessary at all. Separate gameplay analytics from billing telemetry and from public social activity.

The purpose is to help creators improve games and administrators understand use, not to assume that longer playtime alone is success.

### 5.16 Drafts, publishing, updates, versions, and rollback — Decided **(new)**

#### Draft versus published

A creator can play and edit a new draft while everyone else continues to play the current published release. The creator compares the new version with the previous one, tweaks it, and explicitly chooses **Publish** when ready. Coding-agent completion does not automatically make a new draft the version all players see. [C]

The conversation’s “A/B testing” means practical comparison and testing of alternatives. It does **not** authorize randomized production experiments, player assignment to cohorts, or a separate experimentation platform.

A preview is an access/build state for testing a draft; it need not be a third independently managed permanent version lane. The Git branch layout, main-branch relationship, and published-version pointer need design.

#### Live update notifications and reload behavior

A player in an active session should receive an update indicator **without refreshing the browser** when a new published version is available. The player can inspect what changed and opt into the new release. Do not forcibly replace a running game merely because an agent has finished building.

Refreshing/reopening should load the latest published version. Kevin does not want to host or support every historical version indefinitely. A browser session already running an old release is different from a commitment to keep that release available forever.

**Open:** How long old assets remain available to active sessions, how long-running/offline sessions are treated, and how a multiplayer room upgrades together. Automatic refresh-to-latest should not expose an unpublished draft merely because it happens to be the newest Git commit.

#### Semantic versions and changelogs

Use visible **major.minor.patch** release identifiers and make version information available in the standardized game-information UI. Kevin sees versioning as another natural software-engineering learning opportunity. Changelogs are a first-class build/publish capability and should appear in game information and update details. [C]

**Proposed convention to validate:** patches describe fixes, minor releases add compatible functionality, and major releases flag larger/disruptive changes. Define what “compatible” means for this product; the number itself does not implement or prove save compatibility.

Generate concise, player-facing release notes from the actual changes and available task summaries. Deterministically assemble existing descriptions where sufficient; an agent-written summary is optional and should be costed. Do not create an unconditional extra model call for every routine publish action.

#### Bounded forward save compatibility

Every new published release should account for saves from the **immediately previous published release**, so someone in the middle of an RPG can move forward without starting over. The coding agent must consider removed objects, altered quests, changed inventory structures, moved locations, and other affected state. [C]

Kevin explicitly does **not** want accumulated compatibility logic for one hundred historical releases. No guarantee is required that a substantially outdated save can jump smoothly to the latest game. Do not reinterpret this as automatic support for all older saves through an indefinitely retained migration chain.

**Proposed design:** separate release version from save-schema version; provide and test the relevant forward migration where needed; define safe fallbacks for removed content; retain clear warnings for unsupported old saves. Migration lifecycle, backups, and the handling of dormant slots remain open. Do not silently auto-migrate every historical save in the background unless that is researched and approved.

#### Rollback

The creator may roll back to **any previous published version**. This is a potentially destructive action: no reverse save migration and no guarantee that newer saves work with older code. The user must be clearly warned about possible incompatibility or lost progress. Rollback should be deterministic, not consume agent tokens. [C]

Keeping recovery copies of saves or offering an export was an assistant proposal; it is sensible to research, but not an approved obligation to build historical compatibility. Do not silently promise one-click recovery of all progress.

**Open:** Whether rolling back republishes old code under a new monotonically increasing release number or points to the old number; how dependencies are reconstructed; what “previous release” means after rollback; and what happens to all players when a creator chooses this potentially destructive operation.

### 5.17 Gameplay rewind — Decided direction, post-MVP **(new)**

Provide a standardized rewind capability across games where supported. The working example is an approximately **ten-second rolling buffer**. Holding the rewind button moves backward through available gameplay history; releasing it resumes from the selected point. The exact window is configurable/subject to design. [C]

The rewind buffer is **client-side and ephemeral**. It does not need server synchronization and does not need to survive a refresh. Kevin is comfortable with an in-memory buffer or local storage; the requirement is about behavior and persistence, not a mandated storage mechanism. Do not misrecord it as “local storage prohibited.”

This is different from editor undo, cloud save-slot loading, source-code rollback, or a migration between releases. Those operations have different authority and persistence requirements.

**Research:** state capture, deterministic stepping where useful, physics/randomness, audiovisual restoration, memory bounds, safe truncation when a draft changes, and integration with autosave/achievements/analytics. A local rewind must not silently imply that an authoritative shared multiplayer world can be rewound without coordinating other players. Multiplayer rewind remains unresolved; do not add server synchronization against the stated local-buffer requirement without a new decision.

---

## 6. Learning by making

### 6.1 Learning stance — Decided **(changed)**

Fun is the priority. Reading, reasoning, and most general learning should emerge naturally rather than being imposed as lessons. Game design, and some software engineering, may be more explicitly explained when relevant. Do not present every generated game as an educational game. [C]

Kevin’s clearest learning target is **exposure to different genres and types of games**, including ones the initial users have not experienced. Reference examples, demo games, varied genre suggestions, and making games for others can support that target. Exact six-month metrics for each child were not specified.

The original inspirations—Scratch’s creative-learning spiral and Nintendo’s Game Builder Garage—remain references for research, not a requirement to copy their progression or curriculum. [S1 §6]

### 6.2 Two distinct kinds of help — Decided **(new)**

**Player help** stays within the game’s rules. In a racing game, “Try upgrading your engine” refers to an existing upgrade mechanic. A struggling player should not automatically be told to make the car faster through the editor. In the skeleton example, repeated defeats may be a useful hint trigger, but a particular three-attempt threshold was an example, not a universal algorithm.

**Creator coaching** concerns the design of the game. In edit mode, the helper may discuss why the encounter is difficult, how controls affect challenge, or whether a mechanic is understandable. It can suggest a feature or explain a tradeoff. Whether to name a term explicitly should depend on context, not on a blanket “never use terminology” or “always teach vocabulary” rule.

Show useful hints through a lightweight indicator and short, optional interaction. Spoken tips must have visible text. Guidance should be encouraging and actionable, not an approval gate that blocks creative choices. Parental/content rules are a separate source of hard restrictions.

### 6.3 Original learning ideas — Proposed unless separately decided

Preserve these ideas for evaluation rather than silently dropping them: a designer’s question during creation; comparing variants; robot playtesters with different personalities; observing where other players struggle; an easy-versus-hard “fun river”; discussing exploits and balance; and choosing among ingredients such as challenge, surprise, collecting, building, friendship, and story. [S1 §6]

Software-engineering ideas include rule cards, knobs as variables, picture-based plan steps, bug reports, promises as tests, safe experimentation through copies, and a comparison of the creator’s wish with the agent’s plan. Version numbers, release notes, drafts, publishing, and potentially destructive rollback now offer additional concrete teaching moments. [C]

| Original optional learning level | Proposed access |
|---|---|
| 1 | Play, knobs, voice wishes |
| 2 | Rule cards, playtest bots, comparison of alternatives |
| 3 | Promises, time machine, plan steps |
| 4 | Plain-language explanation of changed code |
| 5 | Code editing alongside the agent |

**Open:** Whether this ladder exists at all, who controls it, and how it fits the all-ages product. A ladder must not silently contradict the requirement for a thoughtfully comprehensive editor or withhold essential recovery controls from beginners.

The original 30-second session reflection/design journal is also still a proposal. It should not become mandatory homework or a dependency for closing the game.

---

## 7. System architecture

### 7.1 Orchestration with aiur — Decided direction **(changed)**

aiur is the underlying agent orchestration environment. Reuse its existing configuration, Git workflows, cost tracking, and relevant sub-packages rather than building an overlapping orchestrator inside Game Maker. Kevin reports that aiur already tracks agent/API usage and automates significant Git/PR work; research must inspect its actual interfaces and limitations. [C]

The original concept used a long-running aiur service and an Executor coordinating implementation agents. The checkpoint refined this toward deterministic orchestration and ephemeral task agents. These are not necessarily incompatible: an always-available service does not require a continuously reasoning LLM. Preserve the distinction. [S1 §7.1; S2 §7.1]

**Preferred implementation direction:** ordinary services manage authenticated requests, durable job state, queues, notifications, and predictable Git transitions. Agents are invoked for clarification, design, code generation, critique, or diagnosis, and stop when their task is done. The exact aiur lifecycle remains an integration research topic.

Keep game-making authority separate from platform-maintenance authority. A game agent must not gain permission to modify Game Maker simply because a requested feature would be easier to implement there. Such requests become platform tickets for Kevin.

#### Dynamic specialist design before coding — Decided **(new)**

For a new game, use relevant specialists to work in parallel on different areas of design before implementation. Possible specializations include mechanics, levels, narrative, art direction, UI, audio, accessibility, and software architecture. A coordinating step combines their work into a coherent plan before passing it to coding agents. Playtesting can feed back into subsequent changes. [C]

Select specialists **dynamically** based on the request and game complexity; do not invoke a fixed full studio for every small change. A simple puzzle game may need little or no narrative work. That does not mean simple games should have careless art or no quality review.

**Proposed handoff contract:** specialists provide relevant decisions, constraints, assets/references, testable quality criteria, risks, and dependencies. The coordinator resolves contradictions such as controls that do not fit a phone, art that exceeds performance budgets, or quests that conflict with mechanics. Small features should reuse existing design context instead of re-planning the entire game.

Research how many parallel agents actually improve results under the project’s cost and latency targets. Parallelism is not automatically cheaper or more coherent. Make the synthesis step and its token cost visible.

### 7.2 What an implementation agent produces **(changed)**

The original output was a small web game using a pinned platform runtime and exposing testing hooks. Expand that into the following **proposed delivery contract**, reflecting the accepted product requirements. Exact files, types, and package APIs are not yet selected.

| Deliverable | Purpose |
|---|---|
| Game code and permitted assets | Implements the intended game in the chosen web stack, separate from platform code. |
| Game metadata | Identifies the game, owner, build/release, chosen direction, and runtime compatibility. |
| Engine SDK integration | Uses standard platform facilities instead of reinventing them. |
| Comprehensive editor declarations | Exposes useful game-specific controls and direct-manipulation hooks. |
| Updated controls for added features | Ensures later implementation agents maintain the editor alongside new mechanics. |
| Explicit state serialization/restoration | Supports cloud saves and device changes. |
| Relevant previous-release save migration | Supports the bounded forward-compatibility contract. |
| Achievement definitions and game events | Integrates with platform catalogs and analytics when those capabilities ship. |
| Tests, debug hooks, and test fixtures | Supports correctness, replay experiments, performance checks, and compatibility testing. |
| Draft/preview build | Lets the creator inspect and tune before publication. |
| Version and changelog inputs | Supplies accurate release metadata without inventing claims about what changed. |
| Relevant asset provenance | Supports licensing and source-visibility decisions. |

The original `window.__game` idea—state, seed, step, and input—is a candidate test/debug adapter. Research a controlled debug interface rather than assuming that every production game should expose unrestricted internals to arbitrary callers. [S1 §7.2]

### 7.3 Playtest loop and quality assurance **(changed)**

Retain the proposed automated browser playtest loop using desktop and phone profiles, screenshots for review, and gameplay capture for library previews. Playwright and related development tools are candidates from the original research. [S1 §7.3]

Expand the research beyond “the page opens” or “the score changes.” A useful quality plan should consider functional correctness, input and camera behavior, difficulty and readability, visual consistency, audio balance, device performance, editor operations, save/resume, and compatibility with the previous published save format.

**Proposed gates:** a failed new build should not overwrite the last playable published release; draft tests should include existing editor controls, new feature controls, representative saves, and permissions. Representative games should include a simple UI-oriented game, a platformer, and a stateful RPG. These are suggested test cases, not a newly imposed genre limit.

Automated testing can check some properties of a game, but this handoff does not assert that a bot can prove fun, narrative quality, or child accessibility. Define when specialist critique or actual playtesting is needed. Robot personalities remain an optional product idea distinct from technical test agents.

The earlier suggestion that automated tests could guarantee exact replay or universal frame-rate quality is unvalidated. Research reproducibility and device coverage, then propose measurable budgets. Kevin requested high-quality games, but has not approved exact FPS, latency, or load targets.

### 7.4 Hosting, process boundaries, and runtime safety **(changed)**

**Decided:** Railway backend; TypeScript; single operational project preferred; separate agent-work and game-serving processes. A simplified topology to investigate is:

```text
Browser / Game Maker UI
  ├─ Generated game + client Engine SDK
  ├─ Standard HUD/editor
  └─ Authenticated platform API
       ├─ Accounts, permissions, game index, saves, release metadata
       ├─ Durable jobs / aiur integration → isolated build/test execution
       └─ Later: multiplayer session runtime, kept apart from build work
```

This is a **logical diagram**, not a confirmed Railway deployment recipe. The database, job transport, asset host, and runtime boundaries still require selection. The UI and game can be delivered statically where appropriate; backend services are still needed for AI work, persistence, permissions, and later multiplayer.

**Important research distinction:** A separate process is not by itself proof of CPU/memory limits, credential separation, or safe execution of generated code. Investigate independent service/container boundaries, scoped secrets, resource limits, cancellation, workspace isolation, and network access. Keep builds, dependency installation, browser tests, and other potentially heavy work from disrupting active gameplay. [P]

The original sandboxed iframe on a separate domain, with a narrow messaging channel, remains a proposed browser isolation strategy. Verify microphone/gamepad behavior and permission policy against the selected browsers; do not treat the old `allow="gamepad"` note as a complete compatibility or security solution. [S1 §7.4]

**Alternative hosting to research:** Kevin may run agents on his home machine, but does not want his nephew’s computer added to his Tailscale network and does not want dangerous home-network exposure. The hosted option is currently preferred. A narrowly authenticated outbound worker connection is a possible research direction, not a selected architecture or guarantee of safety.

**Checkpoint-only preference:** Netlify was recorded as the frontend preference in v0.2. Carry it forward as a candidate to reconcile, not as a decision newly confirmed in the visible conversation. [S2 §11]

### 7.5 Formal Game Maker Engine SDK — Decided direction **(new)**

The Engine SDK is a real component to spec, not an informal collection of agent instructions. It sits above/integrates with the selected game libraries and below the standard Game Maker UI. “Engine” here means shared platform/game runtime capabilities, not replacement of Three.js or Phaser. [C]

| Capability | Platform/SDK responsibility | Game-specific responsibility | Timing |
|---|---|---|---|
| Play/edit lifecycle | Standard mode switch, common UI, permission checks | Appropriate pause/resume and editing hooks | Core |
| Editor commands | Shared command dispatch, standard presentation, planned undo model | Controls, targets, constraints, manipulation semantics | Core |
| Voice/text entry | Common microphone/input experience and routing | Relevant game/control context | Dictation first; conversation later |
| Input adaptation | Shared input abstraction and device-aware presentation | Meaning of game actions | Core touch/keyboard; controllers later |
| Saves and slots | Cloud access, slot UI, authorization, transfer status | Serialize/restore logical state | Initial baseline |
| Version compatibility | Metadata and upgrade orchestration | Previous-release state conversion/fallbacks | Required; detailed release sequencing open |
| Draft/publish/update UI | Standard workflow and update indicators | A validated game build and release notes input | Required; sequencing open |
| Achievements | Catalogs, storage, award plumbing, common UI | Definitions and valid award conditions | Required; sequencing open |
| Analytics | Standard event transport and dashboards | Meaningful genre-specific events | Required; sequencing open |
| Settings and game info | Consistent platform controls | Allowed configurable options | Core foundation |
| Multiplayer | Rooms, identity/authority integration, shared mode behavior | Game-specific shared simulation/events | Later |
| Audio helpers | Common playback/settings/caption integration where appropriate | Music, dialogue, effects and timing | Incremental |
| Rewind | Shared local-buffer integration contract and UI | Capturable/restorable gameplay state | Later |
| Diagnostics | Standard reporting and inspection interfaces | Meaningful state/test adapters | Core quality foundation |

**Proposed research output:** an SDK capability map, versioning policy, trust-boundary diagram, lifecycle contracts, and examples showing one simple game and one RPG. Separate required hooks from optional modules. Specify graceful behavior when a capability is disabled or unavailable. Do not promise fully automatic integration where the game must supply semantics.

### 7.6 Persistence and data ownership **(new)**

**Decided:** Git stores game source/history and supports development workflows; backend persistence stores gameplay progress and other runtime/account data. Multiplayer shared state is handled server-side. [C]

The following entity map is a **proposal for research**, not a database-schema decision:

| Data area | Likely records to design |
|---|---|
| Identity and access | Accounts, roles, child/supervisor relationships, invitations, access revocations |
| Games | Stable game identity, owner, visibility, source location, provenance/fork relation |
| Versions | Draft/build identifiers, release metadata, published pointer, changelogs, SDK/save-schema versions |
| Progress | Per-user/game save slots, cloud synchronization state, compatibility metadata |
| Jobs | Requests, stage/status, workspace, costs, failures, bounded retries, approvals |
| Achievements | Definitions, per-user awards, scope/version behavior |
| Analytics | Events or aggregates with audience and retention policies |
| Social sessions | Friend/relationship model, invitations, room membership, presence, shared progress |
| Assets and reports | Drawings, generated assets, recordings when allowed, previews, diagnostic bundles |

Database selection, blob/object storage, retention, encryption, and backup strategy remain open. Server-side ownership does not require writing every multiplayer simulation tick to a database. Research what state needs durability versus temporary room memory.

### 7.7 Performance approach **(new)**

The accepted stack decision is TypeScript, not an unbounded performance promise. Research frontend frame pacing, input response, asset size, loading, network latency, synchronization, and interference from build work. Do not choose Rust or a new backend framework merely to imply “professional quality.”

The conversation discussed prediction, reconciliation, and interpolation in connection with Colyseus. Verify precisely what the selected library provides and what remains game-specific implementation; no such built-in behavior is certified in this document.

Benchmark representative games under realistic mobile/desktop conditions and concurrent build activity. Recommend targets and instrumentation after that evidence. Multiplayer performance remains important even though multiplayer delivery is deferred.

---

## 8. Cost, models and rate limits

### 8.1 Model selection — Decided principle, exact mapping Proposed **(changed)**

Use stronger planning/implementation capability for initial games and appropriately lighter agents for bounded follow-up work where quality permits. Model tiers should be defined by job, so aiur-supported providers can fill them. Existing manual editor changes require no model.

The original suggested mapping was Opus-class/high effort for new games, Sonnet-class/medium effort for features, and Haiku-class for voice/sorting/summaries. These are inherited candidates, not verified current product names, prices, or optimal selections. [S1 §8]

Measure total cost per successful task, including retries, context loading, specialist design, tests, and repair. Investigate caching and model-switch behavior rather than repeating the original prompt-cache assertion as a universal rule. The initial stronger-model approach should be evaluated against a fixed-scope benchmark, not justified only by model labels.

### 8.2 Unified usage and spending view — Decided **(new)**

Admins need a clear view of **what money/tokens are used for**, including new games, feature work, contextual suggestions, in-game dialogue, and external APIs. Include speech and other providers as well as coding-agent tokens. Kevin reports aiur already tracks much of this; Game Maker may need to surface it differently. [C]

**Proposed dimensions:** account/supervision group, game, job, provider, model, capability, time window, estimated versus actual usage, and refresh/freshness. Suggested categories include planning, code, testing/repair, intent interpretation, speech recognition, speech generation, music, sound effects, images, 3D assets, hosting, and build infrastructure.

The checkpoint proposed an expanded dashboard including Railway, Netlify, GitHub infrastructure, subscriptions, alerts, and controls. Preserve that broader view as an integration research target. Do not assume every provider exposes real-time billing, per-job allocation, or remote purchase/upgrade controls. [S2 §8]

Keep separate concepts separate: token volume, usage quota, estimated job cost, and actual incremental billing. Subscription usage is not automatically equivalent to a metered API charge.

### 8.3 Deterministic action cost policy — Decided **(new)**

Manual knob changes, existing direct-manipulation operations, known Git actions, fork/copy operations, and ordinary persistence should not trigger an agent solely to perform predictable steps. Natural-language interpretation and generated content may legitimately use agents/APIs; the UI should not mislabel such paths as universally free.

A small useful spoken hint can be acceptable if its measured cost is low. The administration experience should allow cost-aware choices for speech and other generated assistance. Do not turn the hypothetical two-cent example into a budget or price estimate.

### 8.4 Limits and runaway protection **(changed)**

First-class budget and request limiting remains a requirement. The original creation cooldown, limited concurrent jobs, and queued progress board remain proposed mechanisms. Roughly two to three concurrent jobs per household was a starting suggestion, not a settled universal cap.

**Proposed controls:** reserve an estimated job allowance, reconcile actual usage, impose job time/token limits, stop runaway work, and apply both scoped and platform-wide caps. Separate permission to play from permission to incur new AI charges. Keep manual edits usable when only the build budget is exhausted, subject to any independent account restrictions.

**Checkpoint proposals to research:** rolling hourly/five-hour/daily/monthly windows, separate playtime limits, advance time warnings, autosave at expiry, one-time extensions, invitation monitoring, and recoverable vendor-quota errors. These details were recorded in v0.2 but should not all be treated as newly agreed initial-release features. [S2 §8]

“Build stars” remain an optional kid-facing metaphor. Neither the daily refill nor a five-star game/one-to-two-star feature schedule has been accepted. Cost gamification should be evaluated for clarity and frustration, not added automatically.

### 8.5 Payment and provider access — Open / Deferred **(changed)**

Kevin initially expects to cover usage and is considering a hosted aiur instance signed into his Claude subscription. Bring-your-own provider credentials remains a product direction from the original spec. **Whether a consumer subscription may legally/contractually power this multi-user service is a research blocker**, not an approved operational assumption. API-key use must also be checked for the intended audience and data handling.

The product’s commercial pricing, payment model for other families/adults, and broader monetization are deliberately deferred. Internal cost ceilings still need setting; do not invent them or conflate them with commercial pricing.

---

## 9. Separating the platform from the games

### 9.1 Hard authority boundary — Decided **(changed)**

Only Kevin and authorized maintainers can prompt agents that modify the Game Maker platform. Ordinary game-creation jobs operate on allowed game workspaces and use published/pinned platform interfaces. Authentication, editor infrastructure, voice plumbing, shared runtime capabilities, and platform skills must not become writable merely because a creator asks for a feature. [C; S1 §9]

A request requiring new platform functionality should create a ticket for Kevin or enter an authorized maintenance workflow. An agent cannot elevate its own credentials or reinterpret a game request as platform authorization.

| Boundary | Required direction | Implementation still to research |
|---|---|---|
| Platform versus game source | Separate repositories and authority | GitHub App permissions, workspace provisioning, branch rules |
| One game versus another | Creator-specific write permission | Shared-repository folder enforcement versus per-repository isolation |
| Build execution versus active gameplay | Independent runtime work | Resources, secrets, network limits, failure containment |
| Game runtime versus platform UI/account data | Narrow controlled integration | Iframe/domain strategy, message validation, capability checks |
| Adult peer versus supervised child | Different control relationships | Invitation and guardian verification, role precedence |

The original short-lived GitHub App token, sandboxed build container, platform branch protection, and limited runtime channel remain proposed enforcement techniques. Research their actual guarantees. Do not assume a repository-scoped token automatically enforces a folder-level permission model.

### 9.2 Generated-game repository layout — preference with unresolved details **(changed)**

Kevin described a GitHub games repository accessible to his agents, with user-specific folders and scripted game copies. The original alternative was one private repository per household. The newer preference is folder-based shared storage, but exact ownership, repository count, and visibility are not completely settled. [C; S1 §9]

Source code, version history, and appropriate development artifacts belong in Git. Account records, cloud saves, parental settings, sensitive diagnostics, raw audio, and personal data do not become public source content just because the backend can commit files.

### 9.3 Public source versus private games — Open **(new)**

Preserve both stated desires: open-source game storage and a private-game toggle. Research whether “private” means hidden only from discovery, restricted playable access, protected source/assets, or some combination. A public repository and a truly confidential game require an explicit publication/storage strategy; do not silently promise secrecy from a UI toggle alone.

This question affects forks, previews, screenshots, issue attachments, CI logs, commit authorship, asset hosting, and child privacy. Recommend alternatives before asking Kevin to choose the exact meaning.

### 9.4 Git and publish workflow **(changed)**

Use branches, commits, and pull requests where appropriate, reusing aiur automation. A successful test/build can automatically create a preview or update a draft. **It must not automatically publish an unapproved draft to all players.** The later explicit Publish decision overrides v0.2’s automatic successful-build deployment wording where that wording implies public release. [C; S2 §9]

Choose a coherent mapping between branches, main, drafts, immutable builds, and the published pointer. Kevin described refresh loading the version on main; the final implementation must preserve the intended behavior—refresh reaches the latest published game—without making incomplete work live accidentally.

Fork, publish, and rollback can use deterministic services. A validated workflow may still require checks and human confirmation; no-agent does not mean no safeguards.

### 9.5 Reusable code and external GitHub connections — Proposed

The checkpoint recommends starting with self-contained game code and copy-based reuse, then extracting stable components only when repeated use justifies it. That is compatible with the formal Engine SDK but is not a decision to turn every enemy or quest into a shared package. A user-facing component library remains open. [S2 §9]

Optional bring-your-own GitHub integration is also a checkpoint proposal. Research narrowly scoped installation, revocation, creator permissions, identity, and child-account implications before adding it to the initial product scope.

---

## 10. Safety, privacy and parental controls

### 10.1 General-purpose product with child supervision — Decided **(changed)**

The platform is for all ages. Child accounts receive parental controls and appropriate assistance; adult peers do not become subordinate child accounts merely because someone invited them. The inviting user may designate a child account as described in Section 4, but authorization and verified supervision are unresolved implementation/policy questions. [C]

Preserve the distinction between optional coaching and enforceable rules. The design helper encourages and explains; account content/spending permissions can impose hard limits.

### 10.2 Control categories — original proposals retained **(changed)**

Retain the original suggested controls for research: child presets such as Little kids/Big kids/Custom; genre allowlists; first-person camera; stylized fighting options; creepy-content limits; reference-game rating caps; online play and permitted participants; game visibility; budget/build limits; playtime limits; parent approval; voice access; and learning assistance level. [S1 §10]

The exact defaults, ranges, and interaction between an admin’s authority and a child’s supervisor have not been specified. The original idea that parents can loosen guardrails within platform limits remains the direction, not permission to bypass non-negotiable safety rules.

### 10.3 Content-policy reconciliation — Open **(changed)**

The original always-off list included sexual content, gore, real people, open chat, and collecting personal information. The all-ages shift did not explicitly remove those restrictions. Carry them as inherited constraints pending explicit policy review rather than assume adult accounts may create anything.

Two later decisions require narrower definitions: invited multiplayer voice chat is desired, so “no open chat” must distinguish private-room communication from public stranger chat; and accounts, analytics, audio, and cloud persistence require a precise data-handling policy rather than an unqualified statement that no personal information ever exists.

Research and propose the policy boundaries; do not quietly rewrite them. User-provided voices, photos containing faces, personalized avatars, and game text that mentions real people need consistent treatment.

### 10.4 Privacy and retention — Open / Research **(changed)**

The original intended minimization policy was to delete input audio after transcription, retain transcripts only briefly, avoid training on children’s data, send only cropped drawings, and obtain appropriate parental consent. These are design intentions requiring provider and legal verification, not verified implementation guarantees. [S1 §10]

Define separate rules for transient microphone audio, voice-chat media, transcripts, drawings, photos, generated game assets, intentionally recorded character dialogue, gameplay previews, diagnostic reports, analytics, saves, and account records. “Delete input audio” cannot silently settle the policy for a user who deliberately creates an audio asset to include in a game.

Do not mix public game-source storage with private cloud saves, raw prompts, supervision records, provider credentials, or sensitive diagnostics. Review metadata and indirect leakage, not only obvious content files.

### 10.5 Vendor and legal verification register **(changed)**

The following are **assertions or concerns inherited from earlier material**, not externally verified conclusions in this handoff. Claude must obtain current primary sources and, where needed, written clarification or qualified legal review.

| Topic | What the earlier draft asserted or questioned | Required next research |
|---|---|---|
| ElevenLabs child-facing use | Claimed written approval was needed for apps aimed at under-18s, with consent-record obligations and Enterprise-only zero retention. | Verify current terms, applicable products, audience definitions, data flows, approval route, and retention options. |
| OpenAI Realtime alternative | Claimed under-13 use was possible with zero retention. | Verify actual eligibility, approval, product/account requirements, retention and consent obligations; do not treat this as blanket permission. |
| Pipecat alternative | Presented as an open-source voice pipeline fallback. | Evaluate orchestration fit separately from the policies of every speech/model provider it would connect to. |
| ElevenLabs Music and Google Lyria | Claimed under-18 application prohibitions and excluded them for music. | Recheck current product-specific terms and mixed-age applicability; keep exclusion pending clearance. |
| Child voice and COPPA | Asserted a 2025 amendment and treatment of child voice as personal information. | Verify current authoritative requirements and their applicability to this product, including retention, consent, and analytics. |
| Consumer subscriptions as backend credentials | Left permissibility of a subscription-backed multi-user service open. | Check current provider terms and supported authentication/deployment arrangements. |
| All-ages positioning | New product direction, not a legal exemption. | Determine how mixed-age service design affects the above obligations and defaults. |

No specific policy approval, legal review, price, or compliance outcome has been obtained by this synthesis. Vendor selection is conditional on the result of this work.

### 10.6 Inspiration, content, and intellectual property **(changed)**

Retain the goal of learning from reference games without importing sprite rips, copied art, names, or other protected identity. The original draft proposed rewriting raw child requests into controlled art/style prompts, keeping screenshots/videos as analysis inputs, and avoiding trademarked names in generated games. [S1 §10]

The original “copy rules and numbers” formulation and reference to *Tetris v. Xio* should be treated as a policy/legal research item, not a universal safe-harbor rule. Establish practical guidance for agents on references, assets, attribution, licenses, and publication. Do not silently convert reference-based inspiration into a claim that any similar look or presentation is lawful.

### 10.7 Safety engineering research **(new)**

Investigate enforcement at the API/runtime boundary, not just instruction text: creator-only operations, budget authorization, job workspace limits, restricted outbound access, provider-secret isolation, validated messages from generated games, and approval for publishing artifacts. Policy checks before a build are useful but do not replace permission enforcement or output review.

The user’s desire to avoid dangerous home-network exposure and preserve the platform/game boundary should be explicit acceptance criteria for infrastructure research. Resource separation and security separation both matter; neither is proven by simply calling a component a worker.

---

## 11. Proposed tech stack (from research)

### 11.1 Selected direction versus inherited candidates **(changed)**

This table preserves the original research catalog without pretending the tools have all been re-evaluated. Names in the candidate column are research leads, not permission to install everything or proof that current releases meet the requirements.

| Area | Direction / candidates | Status and research note |
|---|---|---|
| Implementation language | TypeScript end to end | **Decided in conversation.** |
| Agent orchestration | aiur and reusable sub-packages | **Decided.** Inspect Kevin’s actual project rather than assume its APIs. |
| Backend hosting | Railway | **Decided.** Service topology, isolation, resources, and deployment details remain open. |
| Backend web framework | Express discussed | **Open.** No framework chosen; research within the TypeScript direction. |
| Frontend hosting | Netlify | **Checkpoint preference only.** Reconcile with current deployment plan. |
| 3D | Three.js; Rapier and postprocessing as supporting candidates | Three.js direction carried forward; verify dependencies and integration. |
| 2D | Phaser 4; KAPLAY or LittleJS for very simple games | Original engine direction retained; verify versions and browser support. |
| Engine SDK | Custom modular Game Maker integration/runtime layer | **Decided component.** Specify contracts before implementation. |
| Agent skills | threejs-skills, awesome-gamedev-agent-skills, Anthropic official skills, webgpu-claude-skill later; custom editor/music skills | Inherited leads. Establish exact repositories, licenses, versions, quality and token footprint. |
| Engineering workflow | Compound engineering; alternatives welcomed | Kevin uses it and requests another brainstorm. Do not assume it is the only useful skill source. |
| Studio/workflow inspiration | Donchitos/Claude-Code-Game-Studios | **Research target only; do not adopt its orchestration framework.** |
| Art assets | Kenney, Quaternius, KayKit; Lospec palettes | Original preferred asset-first direction; verify actual asset licenses and quality/style fit. |
| 2D generation | fal.ai / FLUX Kontext or gpt-image | Candidate services/models from original research; verify current eligibility, retention, quality and cost. |
| 3D generation | Meshy or TRELLIS | Candidates, not a confirmed universal drawing-to-3D pipeline. |
| Editor internals | Zod, Tweakpane, Immer, Vite, Tiled/LDtk formats | Candidate components. Must support the child/all-ages UX and flexible per-game contract. |
| Multiplayer | Colyseus or original PartyKit direction | **Open.** Account for Railway preference and shared-editor semantics; verify actual netcode responsibilities. |
| Input | Browser Gamepad API, nipplejs, detect-gpu | Candidates from original research; controllers deferred, device support still matters. |
| Testing | Playwright, Playwright MCP, Chrome DevTools MCP | Candidate quality/testing integrations, not proof of fun or deterministic replay. |
| Authentication | Better Auth | Proposed, subject to role/supervisor/household design. |
| Voice | Reusable Kevin/aiur component; ElevenLabs intended subject to review; Pipecat and OpenAI Realtime as research alternatives | Basic dictation first, conversation later. Provider permissions not verified. |
| Drawing/camera | perfect-freehand, reduced Excalidraw, jscanify | Inherited proposals; first-release scope and processing/privacy behavior remain open. |
| Reference-game research | Wikipedia/Wikidata, IGDB, RAWG, Fandom, Gemini video understanding, OSGameClones, Celeste physics references | Original discovery leads. Verify reliability, rights, API availability and applicability; not a license to copy assets. |
| Music/audio | Tone.js, Tonal.js, VCSL, BeepBox, ACE-Step; optional smplr exception | Preserve candidates; verify licenses, maturity and child-facing/vendor eligibility. |
| Persistence, job transport, object storage | Not selected | Research requirements before naming a default stack. |
| Git and build automation | aiur scripts, GitHub branches/PRs, candidate GitHub Actions pipeline | Deterministic automation preferred; creator-controlled publication must remain separate. |

### 11.2 Approved expertise research — all thirteen areas **(new)**

Kevin approved research into all of the following areas and wants the useful skills made available as part of MVP preparation. These are **research domains**, not a demand for thirteen permanent runtime agents or thirteen framework dependencies.

Storytelling, narrative design, and dialogue overlap intentionally: one concerns the quality of the story, another its interactive structure, and another its moment-to-moment delivery. The research lead may share source material across them while preserving distinct outputs.

| ID | Expertise area | Research focus | Concrete output expected |
|---|---|---|---|
| S01 | **Software engineering** | Modular TypeScript design, testing, maintainability, safe agent workflows, bounded migrations, and feature implementation that preserves existing game/editor contracts. Evaluate compound engineering and other established skills. | Candidate skill comparison; coding/review checklist; examples of an initial game foundation and safe later addition. |
| S02 | **Visual/UI design** | A coherent all-ages platform, readable game UI, hierarchy, affordances, responsive layouts, and distinct creator/player views. Do not assume game-development skills already cover this. | UI quality rubric and reusable guidance for the standard HUD, editor, onboarding, and game-specific interfaces. |
| S03 | **Storytelling** | Engaging premise, character motivation, tone, pacing, surprise, and satisfying payoff without excessive text. | Story quality rubric, example brief, and methods for preserving the creator’s own ideas. |
| S04 | **Gameplay design** | Enjoyable core loops, meaningful choices, challenge, progression, rewards, and genre-specific mechanics inspired by strong references. | Genre design checklists, representative briefs, and an evaluation method that goes beyond code correctness. |
| S05 | **Music and audio** | Composition, instrumentation, mood, adaptive playback, sound effects, mixing, intelligibility, speech integration, and output evaluation. | Music/SFX/voice workflow map, quality criteria, cost and licensing review, and reusable skill recommendations. |
| S06 | **Game feel and interaction** | Responsive controls, movement, camera behavior, animation timing, collision feedback, visual/audio feedback, and clarity across input devices. | Tunable feel parameters, playtest scenarios, and criteria for judging responsiveness rather than only visual polish. |
| S07 | **Level design and balancing** | Spatial layout, pacing, encounter design, difficulty curves, readable challenges, progression, and preventing unwinnable or boring states. | Level/encounter templates as guidance, balance-review methods, and useful automated/human checks. |
| S08 | **Art direction** | Cohesive palettes, silhouettes, environment/character consistency, animation style, asset reuse, and maintaining a selected non-realistic look. | Style-brief format, consistency rubric, asset selection/generation workflow, and review examples. |
| S09 | **Player accessibility, especially children** | Low-reading interaction, captions/read-along, voice and visual alternatives, touch/controller navigation, cognitive load, and independent use by the initial children. | Accessibility checklist, test scenarios, and guidelines useful to adults without infantilizing the core UI. |
| S10 | **Automated gameplay testing and QA** | Functional tests, simulation/replay limits, browser/device coverage, regression tests, save migration tests, and image/audio inspection. | Test-layer architecture, reusable harness proposals, representative fixtures, and clear boundaries on what automation cannot establish. |
| S11 | **Extensible game architecture** | Games that lighter follow-up agents can modify safely; modular features, SDK integration, explicit state, editor declarations, and bounded compatibility. | Architecture patterns, feature handoff contracts, and comparison of initial build cost versus later change cost. |
| S12 | **Narrative design** | Quests, branching structure, environmental storytelling, stateful progression, player agency, and consistency after game updates. | Quest/narrative state-model proposals, continuity checks, and integration with saves/editor controls. |
| S13 | **Dialogue** | Distinct voices, concise lines, choices, characterization, branching conversations, spoken delivery, and captions. | Dialogue-authoring/review guidance and examples that work with narration and limited reading. |

**Initial prioritization proposal, accepted for research:** game feel, level design/balancing, art direction, and extensible architecture deserve particular attention. All thirteen remain in scope; prioritization is not exclusion.

For every area, identify established skills/tools, extract transferable expertise, determine what must become a custom skill, and specify how to evaluate output. Do not simply load all research documents into every agent prompt. Recommend selective skill/context loading to respect cost and specialization.

### 11.3 Targeted repository-mining spike — Decided **(new)**

**Repository named by Kevin:**

`https://github.com/Donchitos/Claude-Code-Game-Studios`

Kevin previously agreed not to adopt this project directly because the described combination of orchestration and game development overlaps aiur. He now explicitly wants a **full research spike to mine it for useful takeaways**: agent roles, skills, workflows, separation of concerns, planning, playtesting, and anything else adaptable to this platform. [C]

The repository’s current contents, license, maintenance, and popularity have not been inspected in this handoff. Do not repeat the recalled star count as a fact or use it as a quality justification.

**Required inspection scope:** Examine the actual relevant repository tree and files, not just the landing page. Identify role definitions, skills, planning prompts, context-management conventions, coordination mechanisms, quality gates, testing procedures, and concrete artifacts passed between design and coding.

**Required reuse map:** For each valuable item, record the path and commit, its purpose, reuse/adapt/reject recommendation, license implications, dependency assumptions, how it maps into aiur, the custom work needed, and how to validate it. Preserve attribution where required. Do not execute unfamiliar repository automation merely to read its design.

**Specific questions:** How are design specialists selected? What keeps their work coherent? What is handed to the implementation agent? How do playtesting results become revisions? What avoids unnecessary coordination overhead? Which assumptions are tied to engines or tools excluded from this project? Which patterns remain valuable after removing its orchestration layer?

**Expected result:** an adaptation plan for aiur’s specialist design-to-code workflow, a curated skill backlog, and rejected patterns with reasons. **Do not replace aiur with this repository’s framework.**

### 11.4 Technical and product research spikes **(new)**

These spikes cover additional requirements introduced during the discussion. They are suggested work packages for Claude’s research agents. The lead should merge overlapping investigations where doing so reduces duplication, while keeping traceability to the requirement.

#### R01 — Engine SDK boundaries and game contract

Specify what belongs in the platform UI, Engine SDK, game-specific code, and backend. Define required versus optional hooks for editor controls, saves, achievements, analytics, pause/resume, versions, and future multiplayer/rewind. Show how the same contract supports a simple UI game, a platformer, and an RPG. Deliver a capability/dependency map and illustrative interfaces, with unresolved choices clearly marked.

#### R02 — Agent-defined editor and natural-language control execution

Research a manifest/command model that supports comprehensive per-game controls without constraining genres. Cover direct manipulation, batch operations, validation, permissions, undo transactions, and context passed to a control-operating agent. Demonstrate “make all enemies blue” using existing operations, plus a contrasting request that genuinely requires new code. Include how later feature agents discover and extend the editor.

#### R03 — Reusable one-way and two-way voice package

Inspect aiur’s existing voice work and identify a reusable boundary for capture, speech recognition, synthesis, turn-taking, context, captions, and usage reporting. Distinguish dictation, live agent conversation, narrated in-game dialogue, user-created voice assets, and human voice chat. Evaluate current provider options only after the relevant permissions/retention checks. Avoid making Game Maker depend on the completion of advanced conversation for MVP dictation.

#### R04 — Accounts, invitations, child supervision, and permissions

Formalize admin → creator/player and creator → player invitations, game ownership, adult-peer boundaries, child designation, guardian authority, account upgrades, and revocation. Resolve household concepts versus all-ages accounts, and signed-in players versus accountless room guests. Deliver an authorization matrix and abuse/edge-case scenarios rather than just a choice of auth library.

#### R05 — Railway deployment and safe agent execution

Investigate one Railway project with separate API/game-serving and build-worker responsibilities. Establish which service/container/process boundaries provide what resource and security guarantees. Include generated-code execution, dependency installs, test browsers, secrets, persistence, cancellation, and later multiplayer interference. Compare with an optional home worker that does not require adding players to Kevin’s tailnet. Produce a threat model and operationally simple deployment recommendation.

#### R06 — aiur lifecycle, job orchestration, and provider credentials

Inspect actual reusable aiur packages and deterministic Git/job/cost components. Map request → plan → task → build → tests → draft → publish. Clarify ephemeral agents versus persistent services and budget-aware specialist selection. Independently verify supported/allowed provider authentication for hosted multi-user use; do not assume Kevin’s consumer subscription is sufficient.

#### R07 — Git storage, source publication, forking, and privacy

Compare shared user/game folders with separate repositories. Resolve permission enforcement and concurrent writes. Design deterministic copies with provenance, issue/PR workflows, and scoped credentials. Investigate the conflict between public source and private games, including assets, CI logs, reports, commit metadata, and account information. Keep private runtime data separate.

#### R08 — Draft, publish, live updates, and release metadata

Define a source/build/release model that lets creators test drafts while players use published versions. Cover live update indicators, release-note UI, refresh-to-latest, semantic numbering, active-session assets, and deterministic publishing. Investigate multiplayer version coordination and shared draft previews. Do not accidentally rebuild automatic publication after every successful agent job.

#### R09 — Cloud saves, slots, bounded migrations, and destructive rollback

Design per-user/game autosave slots, cross-device conflicts, cloud acknowledgement, offline/interrupted behavior, and explicit game state serialization. Define only the required previous-published-version forward migration. Test removed entities, altered quests, and inventory/location changes. Clarify unsupported old saves, rollout timing, optional recovery copies, and arbitrary historical rollback with no reverse-migration promise.

#### R10 — Achievements as a platform capability

Define the game-facing API, catalog structure, stable identities, award semantics, visibility, and persistence. Address single-player trust, multiplayer authority, forks, versions, saves, retries, and rewind. Determine which concerns can remain simple for an invite-only product and which need early safeguards. Provide examples without choosing an unnecessary separate achievements service.

#### R11 — Analytics and administrative visibility

Define plays, sessions, attempts, completions, time spent, and useful stuck/drop-off indicators across genres. Specify creator/admin/supervisor access, especially child versus adult data. Research aggregation, retention, minimum useful instrumentation, and SDK overhead. Separate activity analytics from costs and public presence. Deliver a dashboard information model, not just telemetry tooling options.

#### R12 — Multiplayer gameplay plus editor spectators

Evaluate room/state architectures and candidate libraries against the actual requirements: owner-only edit authority, pause for everyone in the room, visible cursor/control actions, private invitations, shared progress, reconnection, and coordinated versions. Verify prediction/interpolation/reconciliation responsibilities rather than assume library selection solves them. Determine how live shared editing interacts with unpublished drafts and personal administrative context.

#### R13 — Cross-device presentation and input

Define the platform’s responsibility for aspect-ratio adaptation, orientation, touch controls, reading size, camera framing, and safe playability of non-responsive games. Evaluate controller and microphone operation for the later full interaction loop, with iPad and desktop initially prioritized. Distinguish an input adapter from actually designing a game to work well on a small screen.

#### R14 — Local ephemeral gameplay rewind

Research a bounded client-side state history, held-button interaction, and resume semantics without server synchronization or refresh persistence. Compare memory and local-storage approaches without treating either as a decided requirement. Identify necessary game hooks and interactions with saves, awards, analytics, randomness, and code changes. Explicitly isolate the unresolved multiplayer semantics.

#### R15 — Unified costs, quotas, caching, and limits

Map aiur and vendor usage data into per-capability/account/game/job reporting. Determine which costs are actual, estimated, delayed, or unavailable. Research quotas, cancellation, concurrency, provider exhaustion, optional speech, and cache reuse. Benchmark initial heavyweight design against lighter follow-up changes. Keep operational budgeting separate from the deferred pricing discussion.

#### R16 — Assets, creative inputs, retention, and provenance

Research drawing import, camera cropping, style consistency, optional recorded dialogue/SFX, generated art/music, safe asset storage, and publication permissions. Build a data-flow/retention map. Review what can be reused in forks and what must remain private context. Coordinate rights/policy findings with R19 rather than duplicating them.

#### R17 — Quality gates, reproducibility, and performance evidence

Develop representative game tests covering controls, editing, saves, previous-release migrations, visual/audio coherence, and mobile behavior. Test whether the proposed debug/replay hooks are sufficient. Recommend measurable quality/performance budgets based on evidence; do not invent them as owner-approved targets. Define where actual human playtesting or specialist review is necessary.

#### R18 — Creation guidance, first-build waiting, and learning validation

Refine the already-settled structured flow rather than reopening blank-canvas versus wizard. Research how to ask useful questions with little reading, present variants, preserve imagination, suggest unfamiliar genres, and keep users engaged through long builds without turning creation into school. Distinguish editor coaching from in-game hints. Identify lightweight evidence from the initial family sessions and later adult use.

#### R19 — Current vendor, legal, licensing, and policy feasibility

Verify the inherited assertions in Section 10 against primary sources, including child and mixed-age use, recording/retention, AI subscriptions as service backends, music restrictions, reference assets, and open-source licenses. Record product-specific applicability and unresolved requests for written approval. This report informs the other spikes; it must not become a generic legal opinion or claim that the product is compliant merely because a checklist exists.

### 11.5 Research ordering and synthesis **(new)**

**Proposed early wave:** repository mining, SDK/editor contracts, aiur integration, account/security boundaries, and vendor feasibility. These can expose constraints that change other work.

**Parallel expertise wave:** distribute S01–S13 among qualified research agents, combining overlapping areas where useful. Focus depth on feel, levels, art direction, and extensibility without omitting the other approved domains.

**Feature/architecture wave:** saves/releases, achievements/analytics, costs, assets, cross-device behavior, multiplayer, and rewind. Research later features now to identify required interfaces, but do not move their full implementation into MVP.

The lead should return a coherent result: decisions supported by evidence, alternatives needing Kevin’s choice, reusable aiur packages, Game Maker-specific packages, quality criteria, and an implementation dependency order. Do not return disconnected reports with incompatible assumptions.

### 11.6 Expected next-round artifacts **(new)**

Produce a standalone next spec, a research-spike index with completed/open status, a repository reuse map, a skill evaluation matrix, an SDK/architecture brief, an MVP boundary/dependency map, and a fresh prioritized question bank from the post-research compound-engineering brainstorm. Where practical, embed the essential findings in the next spec so Kevin can hand back one document without losing the reasoning.

Suggested report filenames and folder organization are up to the research lead and should fit the existing project. No reports, branches, approvals, or benchmarks described here should be marked completed until actually produced.

---

## 12. Music

### 12.1 Original proposal retained, subject to research

The original concept is agent-composed music represented as data and rendered using suitable instruments, rather than relying only on primitive beeps. Its candidate stack was Tone.js for playback/layers, Tonal.js for theory assistance, self-hosted VCSL samples, BeepBox song files for chiptune, and optional build-time ACE-Step generation. [S1 §12]

The earlier document called particular samples CC0 and ACE-Step 1.5 MIT-licensed. Preserve those as claims to check against the exact distributions/models/assets; do not treat this handoff as license verification. `smplr` remains an explicit maturity-threshold exception to investigate, not an automatic dependency.

Adaptive music ideas include layers responding to intensity, section transitions aligned musically, and short win/lose/pickup stingers. The proposed music skill covers mood, tempo, instrumentation, short repeatable motifs, loop structure, and output checks for clean transitions and suitable mixing.

### 12.2 Quality and product integration **(changed)**

Music and audio research is part of MVP quality preparation, but the final implementation pipeline is not selected. Evaluate stylistic fit, repetition, listening fatigue, sound-effect balance, and speech intelligibility. Original rules such as “music quieter than sound effects” and “no jump scares” should be interpreted in context and reconciled with the all-ages content policy, not copied blindly into every genre.

Keep sound design, music, narrated dialogue, creator-recorded audio, and real-time human voice chat conceptually separate. They have different latency, cost, privacy, and permission needs. Spoken RPG dialogue is a desired enhancement, with visible text and cost tracking. [C]

**Proposed cost approach:** reuse approved generated assets and cached speech where appropriate, and prefer build-time generation over unnecessary repeated runtime generation. Verify the actual provider terms and deletion expectations before caching user-specific material. Do not rely on excluded/unapproved music vendors simply because a technical integration is available.

### 12.3 Research outcomes expected **(new)**

The audio report should recommend a coherent, modular pipeline, show how agents receive the relevant skills, describe listening and automated quality checks, identify licensing/child-use blockers, and explain how usage appears in the admin dashboard. It should preserve the chosen web/TypeScript direction and avoid adding a desktop-only tool to the live build path.

---

## 13. What success looks like

### 13.1 Product outcomes — direction Decided, measurements Proposed **(changed)**

People recognize their ideas in the games, enjoy playing them, and return to improve the same projects. The editor is a meaningful creative tool, not a thin form around repeated code generation. Manual actions remain useful alongside voice and AI.

For the initial family, success includes the nephew describing and drawing ideas without Kevin acting as the permanent intermediary, and the niece navigating with minimal reading. For broader users, the same product should feel capable and approachable without requiring child-specific presentation.

Multiplayer, once shipped, should reinforce creation and feedback: friends can play, watch the owner edit, and continue together. General users should experience the gamification of making games as part of the appeal, not merely as a way to obtain a downloadable artifact. [C]

### 13.2 Candidate measurement framework **(new)**

| Area | Candidate evidence | Important qualification |
|---|---|---|
| Idea fidelity | Creator accepts the direction and recognizes intended mechanics/art/story. | Do not equate silence with satisfaction. |
| Continued authorship | Returns to an existing game, uses controls, publishes improvements. | Original “more editing than new-game requests” is a candidate signal, not a quota. |
| Genre exposure | Tries or creates unfamiliar genres and can describe what differs. | Formal six-month learning targets remain unspecified. |
| Accessibility | Initial users complete key flows with minimal adult translation/reading. | Test real users; voice availability alone is not proof of accessibility. |
| Quality | Useful playtest feedback, fewer preventable failures, coherent art/audio, responsive interaction. | Automated tests cannot stand in for every qualitative judgment. |
| Build latency | New games and substantial additions fit Kevin’s approximate hour / 10–30-minute expectations. | These are targets, not measured current performance. |
| Editing efficiency | Existing controls work immediately without coding jobs; natural language uses them when applicable. | Speech/intent costs should still be visible. |
| Persistence | Cross-device resume and multiple slots work without avoidable overwrites or unexplained resets. | Exact reliability thresholds need definition. |
| Releases | Draft isolation, live notifications, opt-in update, previous-release save migration. | No promise of indefinite old-version support. |
| Spending | Completed-work cost is understandable and controlled; runaway jobs are contained. | Budget amounts and commercial pricing are not decided. |
| Isolation | Building/testing does not compromise account boundaries or interfere unacceptably with active sessions. | Requires concrete resource/security validation. |

### 13.3 Research acceptance, not premature product acceptance **(new)**

The next research iteration succeeds when it reduces uncertainty and yields actionable choices: a tested or clearly reasoned SDK boundary, an aiur integration map, a practical build/publish/save design, credible skill recommendations, and a prioritized question set. It should not claim production readiness without implementation and evaluation.

---

## 14. Question bank

### 14.1 Status of the original 44 questions **(changed)**

Not every original question was resolved. This audit replaces the conversational impression that only a handful remained or that the final original question had been answered. It is intended to stop repetition while preserving real gaps. “Answered” refers to the stated product choice, not to every implementation detail around it.

#### A. Product thesis

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 1 ★ | **Evidence:** What have the kids already done? | **Answered.** Kevin and his nephew built an EarthBound-style RPG; the nephew drew characters/villains and described ideas, while Kevin translated for the agent. This is the motivating real interaction. |
| 2 ★ | **A real session:** Who is there, on what device, and for how long? | **Mostly answered.** Support independent use and use with a parent; Kevin participates remotely as admin and later multiplayer partner. Desktop or iPad first. Typical session length and differences in actual observed independence are not specified. |
| 3 ★ | **What they would do otherwise:** Existing games/tools and the unique benefit? | **Partially answered.** The desired benefit is imaginative creation without Kevin as intermediary, plus editing, genre exposure, and eventual multiplayer. Their complete current play/tool habits were not collected. Do not invent Minecraft/Roblox/Mario Maker usage. |
| 4 ★ | **Smallest delightful version:** What is essential and what can wait? | **Answered at capability level.** Create/modify, play/edit, game index, auth/admin/invites, basic dictation, aiur integration, safe backend, and quality/skills preparation. Multiplayer, controllers, human voice chat, advanced conversation, and later rewind are deferred. Later-added capabilities still need release sequencing. |
| 5 ★ | **Family project or product?** | **Answered.** General all-ages product, initially tested with family, with invite-only access acceptable indefinitely. Pricing is deferred. |
| 6 | **What lasts:** Why return when one-prompt generation is common? | **Answered.** Multiplayer/social play, structured editor interaction, creative guidance, and the gamification of game creation. |
| 7 | **The wrong product:** Which failure of identity would be worst? | **Partially answered.** Fun-first, no mandatory school-like experience, no throwaway slop, and no fixed editor that constrains games. A ranked “worst outcome” was not chosen. |
| 8 | **How it fails:** Which risks matter most? | **Partially answered.** Quality, responsiveness, cost, independence, and easy repair matter; some chaos is acceptable. A ranked risk list and explicit failure thresholds remain open. |

#### B. Decisions that shape the product

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 9 ★ | **Templates or from scratch?** | **Creation UX answered; implementation reuse open.** One structured flow with visual options, a prompt, and Other with voice/text. Demo games and independent forks are supported directions. No separate blank-page flow. Whether the agent uses curated code starters internally is a different research question; do not ask the already-settled UX question again. |
| 10 ★ | **Waiting:** Live creation or request now/play later? | **Partially answered.** New game may take up to about an hour; substantial additions target 10–30 minutes. Existing games/editing should remain available while work runs. Exact first-build waiting and completion notification UX are open. |
| 11 | **Whose game is it?** | **Answered for editing authority.** The game creator controls the original; other participants observe editing without edit/spend power. Forks provide independent copies. Shared ownership/co-editing has not been approved. |
| 12 | **Main device?** | **Answered.** Desktop and iPad initially; reasonable phone/other-screen playability remains a platform principle. Controller/TV creation/play is later. |
| 13 | **Reusable components across games?** | **Partially answered.** Reusable platform SDK and voice packages are explicit; whole-game forks are explicit. A reusable game-part/asset library remains a proposal. Do not equate SDK reuse with an approved package marketplace. |
| 14 | **Kevin’s role: curator or maintainer?** | **Partially answered.** Remote administrator and platform maintainer, able to inspect and improve games/platform. Mandatory approval of every game or component was not selected. |
| 15 | **Editor in the first release: knobs, rules, placement?** | **Substantially answered.** Both direct manipulation and natural-language/config editing; comprehensive agent-defined per-game controls, extended by feature agents. Exact reusable primitives, rule-card scope, and 2D/3D rollout need planning. |
| 16 | **When a build fails?** | **Partially answered.** QA plus easy bug reporting/repair, conventional Git workflows, tolerable experimentation, and destructive rollback as a separate explicit action. Retry count, simplified fallback, and escalation messaging remain open. |
| 17 | **Keeping games:** history, deletion, downloads, offline use? | **Partially answered.** Git source/history, game forks, cloud progress, autosave, multiple slots, cross-device resume, and access to earlier source releases for rollback. Forever-retention, deletion semantics, export, and offline play are not settled. |

#### C. Create flow

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 18 | **32-bit art:** GBA-style sprites or PS1-style 3D? | **Open.** The original PS1-style default was never explicitly selected. |
| 19 | **Style cap and survival genre?** | **Open.** Two style picks and adding survival remain unconfirmed. Other input is already allowed in the creation flow. |
| 20 | **Clashing picks:** block or guide? | **Answered in principle.** Encouraging guidance, not design vetoes; separate parental/safety rules can block prohibited content. Infeasible combinations still need honest communication. |
| 21 | **Narrowing:** number of questions and screenshots versus demos? | **Partially answered.** Contextual clarification and visual interaction are important; original variants approach remains. The product’s question count and exact demo-generation triggers are open. Kevin’s two-follow-up limit governs this discovery conversation, not automatically the product’s child interview. |
| 22 | **Reference-game age cap and custom references?** | **Open.** Strong genre references are desired. Rating defaults, override powers, and custom-reference eligibility need policy/product decisions. |

#### D. Learning

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 23 ★ | **Learning success at six months?** | **High-level answer recorded.** Exposure to many genres and understanding what makes games enjoyable; explicit contextual game-design/software-engineering learning is welcome. No per-child quantitative six-month target was set. |
| 24 | **How explicit before it feels like school, and who controls it?** | **Partially answered.** Fun first; reading is a side benefit; design/software concepts can be named when useful. Editor coaching and player hints are separate. Ownership of teaching-level settings is not fully decided. |
| 25 | **Robot playtesters with personalities?** | **Open.** Technical playtesting agents are wanted; their presentation as named personalities is not decided. |
| 26 | **Code visibility/editing and age?** | **Open.** The optional original ladder remains a proposal. General adult access does not settle the child progression or code-editing scope. |

#### E. Multiplayer and social

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 27 | **Online play with whom first?** | **Direction answered; rollout details open.** Family and invited friends, eventually an invited all-ages community. Human voice chat desired. Exact relationship, parent approval, and guest rules remain to be defined. |
| 28 | **Sharing beyond the household?** | **Answered.** Yes: others’ games, friends/invitations, and independent forks. Per-game privacy exists. Public internet/source access versus community sharing is still unresolved. |
| 29 | **Which controllers and how many?** | **Deferred.** Original up-to-four-gamepad target retained as a later direction. Actual household hardware/models were not supplied. |

#### F. Voice and input

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 30 ★ | **Voice vendor and approval?** | **Research required.** Reusable voice infrastructure, basic dictation first, advanced conversation later. ElevenLabs remains intended subject to verification; alternatives are candidates, not approved fallbacks. |
| 31 | **Can the five-year-old use voice alone?** | **Target, not validated finding.** Aim for independent low-reading use with pictures and spoken help. Actual recognition and comprehension must be tested. |
| 32 | **Drawing core or optional; pixel-grid mode?** | **Partially answered.** Drawing is part of the motivating workflow and desired product. Exact MVP implementation and pixel-grid option remain open. |

#### G. Cost and budget

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 33 ★ | **Monthly ceiling and behavior at the cap?** | **Open.** Limits and an informative spend view are required; no dollar ceiling or universal exhaustion behavior was chosen. Commercial pricing is separately deferred. |
| 34 | **Who pays when others join?** | **Partially answered / pricing deferred.** Kevin initially covers usage; bring-your-own agent/provider access remains a direction. Wider funding and payment arrangements are not decided. |
| 35 | **Build stars and numbers?** | **Open.** The metaphor and original sample numbers were not approved. |
| 36 | **Models by job and measurement?** | **Principle answered; configuration open.** Stronger initial design/build, appropriately lighter follow-ups, no agent for deterministic operations. Exact models, effort levels, caches, and benchmarks need research. |

#### H. Safety, privacy and legal

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 37 | **Default guardrails and always-off content?** | **Partially answered.** Child designation and parental controls are explicit; all-ages scope is explicit. Defaults and reconciliation of original platform-wide restrictions remain open. |
| 38 | **Stored data and retention?** | **Open in detail.** Cloud gameplay progress is required; transient rewind need not persist. Policies for audio, transcripts, drawings, photos, clips, analytics, and diagnostics need research. |
| 39 | **When legal review happens?** | **Open.** The original proposed default was before an external household. It was not expressly confirmed; research should identify blockers before any relevant child-facing/external deployment. |
| 40 | **Consumer subscriptions or API keys?** | **Research blocker.** Kevin prefers to consider a hosted aiur service signed into his subscription; permission and supported deployment cannot be assumed. |

#### I. Platform and operations

| Original # | Question | Current status and recorded answer |
|---|---|---|
| 41 | **aiur dependencies and development order?** | **Partially answered.** aiur orchestrates, reusable voice is being built in parallel, Git/cost components should be reused, and specialist design precedes coding when relevant. Exact packages and dependency milestones need inspection. |
| 42 | **Hosting and uptime?** | **Hosting direction answered; operations open.** Railway backend, TypeScript, shared project with separate agent/game processes; safe home-worker alternative can be researched. Uptime promises, recovery, and capacity limits are unspecified. |
| 43 | **Open-sourcing trigger?** | **Open.** Platform begins private and may open later; game-source openness is desired but conflicts with unresolved private-game semantics. No release milestone or license chosen. |
| 44 | **Final user-facing name?** | **Open.** Uncle Kevin’s Game Maker 2000 is the working title. All-ages positioning does not by itself rename it. |

### 14.2 Newly introduced decision points for the post-research brainstorm **(new)**

These are candidate questions for Claude to refine **after** its research, not another questionnaire Kevin must answer before work can start. Research should eliminate questions that can be answered factually or resolved through a clear recommendation.

| Priority area | Decision that research should prepare | Related spikes |
|---|---|---|
| Private games and source | Does Private mean undiscoverable, access-controlled, source-confidential, or all three? How does open-source storage work alongside it? | R04, R07, R16, R19 |
| Supervision authority | Who may designate/control a child account, and how does a parent claim or transfer that supervision? What admin visibility remains appropriate for adult peers? | R04, R11, R19 |
| Drafts inside multiplayer | When the creator pauses a public-release session to edit, are friends observing a private preview, and how do they return to play without publishing to everyone? | R02, R08, R12 |
| Release transitions | How do a multiplayer room and active browser sessions adopt a published update together? What happens when older sessions request retired assets? | R08, R09, R12 |
| Bounded save support | What does an unsupported older slot show, and what recovery options are offered without creating an indefinite migration commitment? | R09 |
| Rollback and version identity | How is an old source release republished, how are players warned, and how is the new previous-release compatibility boundary established? | R08, R09 |
| Engine opt-outs and extensions | Which platform facilities can a creator disable, and how can unusual games extend editing without gaining platform privileges? | R01, R02, R05 |
| Fork permissions and data | Who may fork, what private-game access allows, and whether saves/awards are ever copied. | R04, R07, R09, R10 |
| Achievements and rewind | Which rewards/events are permanent, and which follow reversible gameplay state? Is rewind disabled or otherwise constrained in shared multiplayer? | R10, R11, R14 |
| Initial scope for new capabilities | Which parts of achievements, analytics, publishing/versioning, drawing, narration, and forks are necessary before the first invited test? | R01, R08–R11, R16, R18 |
| Budget exhaustion and resource priorities | What remains playable/editable, who can authorize exceptions, and how do build jobs yield to live gameplay? | R05, R06, R15 |
| First-session experience | What useful experience fills a long first build while preserving the creator’s interest and intent? | R18 |

Do not silently decide these issues in implementation. Where a proposed default is sensible, present it with its tradeoff rather than treating Kevin’s silence as acceptance.

### 14.3 Questions not to repeat **(new)**

Do not ask again whether the product needs a separate blank canvas; the creation flow is structured with flexible inputs. Do not ask whether learning or fun comes first; fun does. Do not ask whether manual editing or voice editing is preferred; both are required. Do not ask whether every game gets the same fixed controls; agents define a comprehensive game-specific surface. Do not ask whether later feature agents must update that surface; they must.

Do not reopen TypeScript end to end, Railway backend, aiur orchestration, creator-only multiplayer editing with pause for everyone in the room, captions accompanying generated speech, cloud autosave with multiple slots, or deterministic token-free Git operations without a concrete new reason.

Do not treat the all-ages decision as a request to remove child safeguards, and do not treat deferred multiplayer/controller/conversation/rewind delivery as a request to omit their architectural research.

---

## 15. Reference

### 15.1 Source record and precedence **(new)**

| Source | What it contributes | How to use it |
|---|---|---|
| **[C] Current Kevin/ChatGPT conversation**, October 21, 2026 | Explicit changes, approvals, examples, priorities, and handoff instructions through the comprehensive-editor discussion. | Latest explicit user decisions control. Assistant suggestions are not decisions merely because the conversation moved on. |
| **[S1] `game-maker-2000-spec.md`**, v0.1, October 21, 2026 | Original 15-section product spec, constraints, candidate stack, music proposal, and 44-question bank. | Carry settled requirements forward unless changed; retain proposed/open status. Source of the unchanged ChatGPT instructions. |
| **[S2] `game-maker-2000-revised-v0.2.md`**, discussion checkpoint, October 21, 2026 | Additional checkpoint notes about deterministic jobs, hosting preferences, administration, cost controls, Git workflows, and privacy. | Preserve checkpoint-only material with its provenance. Explicit later decisions supersede it, especially around publishing and general-purpose positioning. |
| Private Claude research catalog | Earlier tool/skill/engine/service research, reportedly including screenshots. | Reopen in Claude if accessible. This consolidation did not inspect the catalog or its underlying citations. |
| Named Game Studios repository | Explicit new mining target chosen by Kevin. | Inspect fully during the next research pass; no current content, license, or star count is certified here. |

**Precedence:** latest explicit Kevin decision → unchanged settled source requirement → checkpoint detail consistent with those decisions → proposed implementation. Conflicts or ambiguous permissions should be surfaced, not silently reconciled into new product choices.

### 15.2 Project and research locations

Original research catalog, private to Kevin:

`https://claude.ai/artifact/SchanfZLWf27tjj2i7fZxk`

Game Maker project, private in the original specification, branch `research`:

`https://github.com/its-everdred/uncle-kevins-game-maker-2000`

Explicit repository-mining target:

`https://github.com/Donchitos/Claude-Code-Game-Studios`

These are source-provided locations. This handoff does not assert that their current contents were fetched, that access is available to every receiving agent, or that repository metadata matches earlier recollections.

### 15.3 Verification debt from the discussion **(new)**

| Earlier assertion or simplification | What the next research should establish |
|---|---|
| Colyseus “supports prediction, reconciliation, and interpolation” | Exact library/version APIs, examples, and responsibilities left to game code. Do not repeat an unsupported blanket capability claim. |
| Separate processes protect games from agent work | Actual resource, credential, filesystem, and network boundaries; shared-host contention and failure behavior. |
| Same editor API provides undo “for free” | Explicit command/state history, transactions, inverse operations or snapshots, and tests. |
| Seed plus recent inputs replays a bug exactly | Determinism assumptions, initial state, timing, external inputs, and multiplayer events. |
| An iframe permission string guarantees controllers work | Browser/device support, permission policy, focus/input behavior, and the broader isolation design. |
| Git merge/deployment equals publish | A deliberate draft/build/published model consistent with creator approval and refresh-to-latest. |
| Semantic versions guarantee save compatibility | Explicit save schema, migration contract, compatibility tests, and truthful release messaging. |
| A private toggle can coexist trivially with a public games repo | Precise access semantics for source, assets, previews, direct links, and forks. |
| Voice narration would cost a couple of cents | Measured provider-specific usage/cost under the selected account terms; the conversation gave an illustrative willingness-to-pay example only. |
| Repo popularity demonstrates quality | Actual repository inspection, licensing, maturity, transferable patterns, and output evaluation. |
| All original questions were answered | Use the 44-item audit above; many details remain open or intentionally deferred. |

This table records unresolved claims rather than replacing them with unsupported new conclusions. The next research pass should supply evidence and amend the spec accordingly.

### 15.4 Terms used consistently **(new)**

**Creator** is an account permission; **game owner** is authority over a specific original or fork. **Child account** is a supervised account attribute, not a synonym for player. **Admin** is not automatically platform maintainer.

**Draft** is editable unpublished work. **Preview** is a way to run/test a draft. **Published release** is what ordinary players newly load. **Historical source** can remain available for rollback without every historical build remaining a supported live service.

**Editor undo** reverses editing commands. **Gameplay rewind** traverses a short local runtime buffer. **Save-slot loading** resumes persistent gameplay. **Forward migration** transforms a supported previous-release save for a new release. **Rollback** republishes older game code and may make saves incompatible. These must not be presented as one interchangeable “time machine” implementation.

**Engine SDK** is the shared Game Maker integration/runtime layer around the selected game technologies. **aiur** is Kevin’s orchestration dependency, sometimes transcribed as Ayer in the conversation. **Specialist research agents** in the next research pass are different from **specialist game-design agents** proposed for the eventual product pipeline.

---

## Change log

### v0.3 — October 21, 2026: consolidated conversation and research handoff **(changed)**

| Change | Why / Kevin’s stated intent |
|---|---|
| Reframed as all-ages with child-account controls | “Accessible to anyone of any age,” with kid-friendly assistance and guardrails layered onto a generally useful interface. |
| Recorded the EarthBound RPG origin | Automate Kevin’s translation of his nephew’s drawings and spoken ideas rather than invent a different creation behavior. |
| Defined the structured creation flow | Presets, icons, a prompt, and Other with voice/text; no repeated blank-canvas question. |
| Established fun-first contextual learning | Learning should largely be a side effect; game design and some engineering can be more explicit. |
| Separated editor coaching from player hints | Creator advice can change the design; player help should use mechanics such as an engine upgrade. |
| Required speech with visible text | Encourage reading and let a distracted user return to what was said. |
| Separated explicit MVP from deferred delivery | Create/edit/play/index/auth/invites/dictation/aiur first; multiplayer, controllers, voice chat, advanced conversation, and rewind later. |
| Recorded TypeScript, Railway, and reusable voice direction | Keep the chosen ecosystem and operational simplicity; reuse components across projects. |
| Clarified agent/game runtime separation without claiming complete isolation | Agent builds should not degrade playing with friends; actual hosting/security boundaries still need research. |
| Added all thirteen expertise spikes and named repository mining | Kevin wants skills and specialized design knowledge to improve every relevant aspect of output quality. |
| Added dynamic parallel design before coding | Specialists work where needed, then hand a coherent design to implementation; not a fixed expensive pipeline for every request. |
| Formalized a Game Maker Engine SDK and standard HUD | Shared capabilities should be engine/platform responsibilities, not repeatedly reimplemented by coding agents. |
| Established comprehensive agent-defined editors | Avoid constraining genres with a rigid universal editor; later feature agents must add relevant controls. |
| Unified direct manipulation and agent-operated controls | “Make all of the enemies blue” should use existing controls when possible, with the same actions available manually. |
| Defined creator-only shared editing and universal room pause | Friends may watch controls/cursor activity but cannot edit or incur token spending. |
| Restored private games and flagged source-visibility conflict | Kevin reconsidered private mode; open-source storage and meaningful privacy need an explicit design. |
| Added deterministic forks and Git actions | “Only using agents when we need them.” Copying, branching, and known workflows should not burn agent tokens. |
| Added cloud autosaves, multiple slots, and device continuation | Users should put down an RPG and continue on another device without losing progress. |
| Added first-class achievements and analytics | Common APIs/catalogs; useful play metrics for creators and authorized administrators. |
| Added draft testing and explicit Publish | Creators can compare/tune the new version while players remain on the old published version. |
| Added live update notification and latest-on-refresh behavior | Players opt into upgrades while active; every historical version need not be supported indefinitely. |
| Bounded forward save compatibility | Smooth transition from the immediately previous published version without accumulating compatibility for hundreds of patches. |
| Added semantic release numbers and changelogs | Make releases understandable and provide another natural engineering-learning opportunity. |
| Classified rollback as potentially destructive | “All bets are off” for compatibility when intentionally returning to old code; no backward migration obligation. |
| Added local ephemeral rewind | Approximately ten seconds, held-button interaction, no server synchronization or refresh-persistence requirement. |
| Audited all 44 original questions | Avoid repeating settled questions and avoid falsely declaring unresolved choices complete. |
| Added Claude’s next research/brainstorm workflow | Mine the entire document, research in parallel, synthesize, then run compound-engineering brainstorm and return a new downloadable document. |

### v0.2 — October 21, 2026: earlier discussion checkpoint

The available checkpoint added fun-first framing, richer editing and creative-input ideas, creator/player permissions, administrative/cost-control proposals, aiur job/Git automation, hosting preferences, and privacy notes. Its automatic-publication wording is superseded by explicit creator Publish; checkpoint-only details are preserved as such where they were not confirmed in the visible conversation.

### v0.1 — October 21, 2026: original draft

Initial product spec written by Claude from Kevin’s voice notes and research catalog, including the original tools/music proposals and compound-engineering-informed question bank.

---

**End of handoff. Next action belongs to Claude: research and synthesis first, then compound-engineering brainstorm and a new question document. No additional product interview is required before that research starts.**
