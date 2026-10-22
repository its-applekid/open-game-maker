# Uncle Kevin's Game Maker 2000

Consolidated product specification, release plan, and Claude handoff — v0.4

- Product owner: Kevin Weaver
- Planning session: October 21, 2026
- Prepared for: Claude and Kevin's aiur-driven research/planning workflow
- Working location: Existing Game Maker project and research branch, where available
- Status: Product decisions, research requirements, and implementation-planning direction. This document is not authorization to implement, deploy, purchase services, run paid benchmarks, or disclose children's data to vendors.

This is the standalone successor to game-maker-2000-full-spec-v0.3.md. It incorporates the supplied game-maker-2000-v0.4-research-and-questions.md and the subsequent voice discussion, including corrections made during milestone classification. The original numbered sections 1–15 are retained. Appendices provide decision traceability and a disposition of the research question bank.

Specification v0.4 is not product release V4. Product releases are V1 = MVP, V2, and V3. There is no "V1E" milestone.

> Renamed 2026-10-21: the product and repo are now **Open Game Maker 2000** (`its-everdred/open-game-maker-2000`). Older names below are kept as written.
>
> Repository note: transcribed from ChatGPT's v0.4 output as pasted by Kevin on 2026-10-21. Only Markdown heading/code-fence/bullet formatting was added; wording is unchanged.

---

## Instructions for ChatGPT: the next iteration (changed)

Read the complete specification and its decision/status notes before continuing discovery. Kevin wants continuity, not a restart.

During voice discussion, ask one question at a time, keep turns brief, and allow at most two follow-ups before moving on. Do not recite the full feature inventory aloud. When prioritizing, start from the established release plan and ask only about genuine uncertainties. Do not ask Kevin to reconfirm decisions such as V2 rewind, V2 drawing, V1 touch/controller support, or the meaning of V1.

Treat explicit Kevin decisions as authoritative product direction. Keep research recommendations, assistant suggestions, accepted spoken bundles, and unresolved implementation choices distinguishable. A "yes" to a short spoken bundle approves what was actually presented, not every unseen recommendation in a source table. Do not claim all questions have been answered, or give an exact remaining-question count, without an audited register.

Use aiur, pronounced "eye-ur," consistently. AER, AIR, and similar voice transcriptions refer to that same system here. Distinguish aiur building Game Maker itself from hosted aiur building games inside Game Maker.

Do not substitute the chosen technology stack or reinstate removed scope. In particular, there is no requirement for a separate agent that can operate every existing editor control on the user's behalf.

Vendor terms, pricing, laws, provider eligibility, library versions, and compatibility claims require attributable research. Preserve the supplied research as reported findings, not as a new verification performed by this consolidation. Do not confuse an approved product capability with proof that a particular vendor permits it.

At the next requested wrap-up, produce another complete downloadable Markdown specification using the same section structure. Mark new and changed material relative to this version, update the decision and research registers, and retain next-iteration instructions for both ChatGPT and Claude.

---

## Instructions for Claude: the next research and planning iteration (changed)

### Assignment and sequencing

Kevin has finished this discovery pass. Do not require another broad interview before proceeding with research and planning. Reuse the nine existing research reports, update areas affected by the decisions below, and identify only genuinely unresolved owner choices after synthesis. Do not rerun the entire broad research wave merely because the specification changed.

1. Establish the authoritative baseline. Read this document, inspect the existing project and aiur integration, and reconcile old plans against the latest decisions. Preserve TypeScript, the selected web-engine direction, Netlify frontend, Railway backend, a formal Engine SDK, invite-only authenticated access, and proper sandboxing from the beginning.
2. Extract scoped research and feature tickets. Use the established compound-engineering workflow, including ce-brainstorm where scope needs refinement and ce-plan for detailed plans. Product features, reusable aiur work, platform-development workflow improvements, and operational prerequisites must be identifiable as separate work.
3. Research tickets deeply in parallel. Give independent agents bounded assignments and separate output files. Inspect relevant source code, interfaces, and existing skills. Research ahead of implementation so coding agents receive actionable plans rather than having to rediscover architecture.
4. Synthesize the reports. Resolve incompatible assumptions, preserve evidence versus proposals, and return focused recommendations. Questions that can be answered from code or primary documentation belong to research agents, not another product questionnaire.
5. Prepare implementation plans and contracts. Specify affected code areas, interfaces, dependencies, tests, migration implications, safety boundaries, and a deployed verification path for each implementation ticket. Do not invent aiur APIs or claim integrations already exist.
6. Assemble an aiur build-order dependency graph. Understand the code surface each ticket will write, which prerequisites are real, where shared contracts permit parallel work, and where overlapping edits create integration risks. Maximize useful parallelism and speed to production without maximizing conflicts or delaying the first usable prototype.
7. Update the aiur build-order skill itself. The continuously testable delivery rule in §7.10 is an upstream workflow requirement, not merely a note in the Game Maker plan. Propose and plan the skill change explicitly.
8. Return a consolidated handoff. Deliver the updated specification, detailed ticket plans, dependency graph/build order, source and research index, decision log, and a compact register of unresolved owner decisions. Research/planning completion is not blanket authorization to begin execution.

### Mandatory delivery principle

> After the minimal initial setup, every merged implementation ticket must leave a usable, deployed Game Maker prototype that Kevin can test. Do not make Kevin wait for hundreds of tickets to merge before there is anything meaningful to try.

This applies primarily to development of Game Maker, not a requirement that every internal step of creating an individual game be exposed as a playable release. Existing generated games must also remain playable while their changes build, but that is a separate requirement.

Kevin must be able to try the current prototype at essentially any point, provide feedback, and have that feedback revise remaining scope, plans, dependencies, and priorities or create new tickets. "Planned up front" must not mean "the backlog is immutable."

### Research and ticket output contract

Each research report must state the source requirement, inspected code/versions, primary sources and access dates, findings, uncertainty, alternatives, costs or cost unknowns, security/privacy/license implications, recommended ownership of reusable components, and the decision it enables.

Each implementation plan should identify a narrow result, affected packages/files, prerequisites, consumed and produced contracts, acceptance tests, a concrete production verification path, rollout/recovery considerations, and a short description of what Kevin can test after merge. This is a planning contract, not a claim that aiur already supports these exact fields.

The proposed paid benchmark amounts in the research companion are not approved spending in the available record. Recover a concrete approval if one exists elsewhere; otherwise obtain it before incurring costs. Likewise, no legal engagement, vendor exception, or child-data processing permission is implied by approving a feature for V1.

---

## Reading guide, provenance, and decision precedence (changed)

Decided means an explicit Kevin choice, a clearly accepted spoken default, or an unchanged settled requirement from v0.3. Accepted default identifies an actual bundle/default approval. Proposed identifies a research or engineering recommendation. Research required means the behavior or implementation needs evidence. Working release assignment is an initial placement made under Kevin's request to use judgment; it is not a claim that he individually voted on every subfeature.

A heading marked (changed) or (new) applies to the block below it. Those markers are relative to v0.3. Unchanged requirements retain their original meaning; this document does not silently promote all earlier proposals into obligations.

Source shorthand:

|Reference     |Source and use                                                                                                                                                                                                                                |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|**[S3]**      |`game-maker-2000-full-spec-v0.3.md`, the complete prior specification, including its original-source audit.                                                                                                                                   |
|**[R4]**      |`game-maker-2000-v0.4-research-and-questions.md`, Claude's supplied research companion and question bank. References such as `[R4 B2]` refer to that question bank; `[R4 A6]` refers to the corresponding research report as summarized there.|
|**[C4]**      |Kevin's subsequent voice decisions in this conversation, through the final request to consolidate the document. Latest explicit corrections take precedence.                                                                                  |
|**[C4-early]**|Earlier portions of this planning session recovered from conversation context, notably funding, server-side credentials, and model-portable skills. These do not supply evidence of benchmark-budget approval.                                |
|**[P]**       |A proposed implementation, research task, or working milestone assignment; not a new owner approval.                                                                                                                                          |

Precedence: latest explicit Kevin decision → an actually accepted spoken default → unchanged settled v0.3 requirement → consistent research recommendation → proposed implementation.

Product authority and external feasibility are different. Kevin can decide that child voice, generative assets, or subscription-based funding is desirable; that does not establish provider permission. Conflicts between product preference and the supplied research must remain visible until resolved.

Research provenance: The A1–A9 reports are described as completed by the supplied companion, but their full contents and underlying citations were not independently re-audited for this consolidation. Their findings are carried forward as reported research, not freshly certified facts. The reports' own verified/inferred/proposed/unverified distinctions remain important.

Privacy: This planning document contains family context and account/security design. Intent to open-source software does not authorize publishing this handoff or personal data.

---

## 1. Summary

### 1.1 Product definition — Decided

Uncle Kevin's Game Maker 2000 is a general-purpose, all-ages, web-first game creation and play platform. Creators describe ideas through visual choices, text, voice, and uploaded images. Agents help clarify scope, apply relevant design expertise, implement games, and make later changes. Creators alternate between play and a consistent, game-specific editor rather than asking an agent to regenerate code for every adjustment. [S3 §§1–2; C4]

The central experience is inspired by Super Mario Maker's short play/edit loop: imagine something, try it, tune it, show it to invited friends, and improve it. The product should reward continued authorship, not produce disposable one-prompt games.

A formal Game Maker Engine SDK integrates with the selected web engines. The platform supplies common editor/HUD behavior, identity, permissions, saves, release workflows, achievements, and other shared capabilities. Generated games supply mechanics, content, game-specific state, and meaningful editor declarations.

Kid-friendly mode is an account/presentation layer, not the identity of the whole product. Adult creators use the same core product without automatically inheriting parental supervision or a child-only interface.

### 1.2 Origin, initial users, and devices

The motivating example is the EarthBound-style RPG Kevin built with his seven-year-old nephew. His nephew drew characters and villains and described the game; Kevin translated those ideas into coding-agent instructions. The platform should preserve that authorship while replacing Kevin's repeated role as interviewer, translator, and technical intermediary. Kevin's five-year-old niece is another initial user. Independent use and parent-assisted use both matter. [S3 §1.2]

Desktop browsers and iPads are the initial practical focus. Mobile-browser usability remains required. Touch and physical controllers are V1 input methods, not optional future alternatives to assumed mouse/keyboard literacy. [C4]

### 1.3 Build expectations and immediacy

A new game may take roughly up to an hour. Substantial feature work should aim for about ten minutes, with roughly thirty minutes as the desired upper bound. These are product expectations, not measured performance guarantees. [S3 §1.3]

Manual editor operations should be immediate and should not invoke coding agents. Existing games remain playable and existing controls remain usable while builds run. User-facing progress should communicate what is happening without exposing raw coding conversations.

### 1.4 Most important changes in this version (changed)

|Area               |Authoritative direction                                                                                                                                                      |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Release terminology|V1 and MVP are synonyms; then V2 and V3.                                                                                                                                     |
|Voice              |Two-way creation/feature-scoping conversation is V1; build it as a reusable component in aiur that Game Maker consumes.                                                      |
|Inputs             |USB/Bluetooth controller support and touch are V1 throughout Game Maker's own UI, including forms and selection highlighting.                                                |
|Editor agent       |Remove the previously proposed agent that duplicates everything the manual editor can do.                                                                                    |
|Visual scope       |V1 supports 2D and low-poly 3D, including generative asset tools/skills; no AAA/photorealistic target.                                                                       |
|Families           |Introduce owner/admin family authority; Kevin's owner role cannot be removed by another admin.                                                                               |
|Authentication     |Google sign-in for adults and children; no child PIN/profile-unlock requirement. Child-account third-party sign-in and device compatibility need validation.                 |
|Access             |All players authenticate and require invitations; player-only access never grants Make, editing, or forking.                                                                 |
|Child invitations  |Off unless enabled through parental settings.                                                                                                                                |
|Private            |Hidden from friends' discovery UI, **not** a promise of private GitHub source.                                                                                               |
|Parallel jobs      |Default per family: one active new-game creation and up to three active game-edit builds; owner/admin configurable.                                                          |
|Infrastructure     |Netlify frontend; Railway backend/hosted aiur; proper sandboxing from day one.                                                                                               |
|Bug reports        |Game bugs use the game's build workflow; Game Maker bugs become platform-repo tickets handled by Kevin's separate aiur listener from the beginning.                          |
|Product development|Parallel researched tickets plus a dependency graph; every merge after initial setup must preserve a production-testable prototype.                                          |
|Deferred features  |Multiplayer implementation, rewind, and drawing are V2; player voice chat and native packaging are V3. Full offline play is optional V3 or omitted.                          |
|Assets/CDN         |Storage and CDN timing were reopened because of generated assets and narration; obtain a recommendation rather than treating either V1 or V2 CDN delivery as finally settled.|

---

## 2. Goals and non-goals

### 2.1 Goals — Decided

Fun, authorship, and iteration. Creators recognize their own ideas, enjoy the games, and return to improve them. Guidance helps them make choices rather than dictating a uniform game.

Quality beyond compilation. Responsive controls, coherent stylized visuals, useful interfaces, engaging gameplay, appropriate sound, and good narrative where relevant all matter. Research and selectively apply expertise rather than calling every specialist for every request.

A meaningful editor. Generated games expose thoughtfully comprehensive controls and direct manipulation. Adding a feature includes adding its relevant editor controls. Ordinary tuning does not require a coding job.

Cross-device access. The creation interface, editor, forms, menus, and gameplay work with the supported inputs. Children must not be assumed to know mouse and keyboard. More complex games may use platform adaptation rather than fully fluid layouts, but the supported device experience must be deliberate.

Learning through making. Exposure to unfamiliar genres and contextual game-design/software-engineering concepts is valuable. Reading support is a side benefit. This is not a mandatory course.

Bounded cost. Use deterministic code for predictable actions, reuse aiur infrastructure, track relevant generation costs, and let family owners/admins set operational limits. Do not confuse build budgets with playtime restrictions.

Permission-aware safety. Separate player access, creator capabilities, game ownership, family administration, and platform-maintenance authority. Protect child accounts and sensitive data without collecting every interaction simply because logging is convenient.

Usable during development. Game Maker's own build sequence should deliver useful increments continuously, incorporating Kevin's feedback before the full planned scope is complete. [C4]

### 2.2 Non-goals and explicit exclusions (changed)

The live game stack remains web-first, with no Unity, Unreal, or Godot substitution. High-end realistic/AAA graphics are not a V3 promise; they are outside the intended visual scope. V1 should focus on 2D and low-poly 3D while still including generative tooling.

Do not build a public social network, public matchmaking, unrestricted stranger chat, or public self-service signup merely to enable invited play. Invite-only operation may remain indefinitely.

Do not build a full natural-language mirror of the editor UI. Do not introduce shared multi-user co-editing when the agreed model is one game owner plus authorized administrative intervention.

Do not make every operation an agent job, adopt a large "game studio" orchestration framework that duplicates aiur, or introduce a distributed architecture solely for hypothetical scale.

Do not implement private GitHub repository management as the meaning of the game's Private toggle. A person may independently host a private-source copy outside this product; native support for that workflow is not required.

No full offline gameplay, player-to-player voice chat, built-in freehand drawing, or gameplay rewind is required in V1. Native app packaging is not needed for the browser-first launch.

Do not impose an unapproved requirement that the creator beat every level before publication, or let an automated "fun score" veto a technically usable, safe game. Preserve technical/safety checks separately from advisory quality feedback. [S3 §7.3; C4; R4 E6 remains an unaccepted proposal]

### 2.3 Release plan: V1 = MVP (changed)

The following is the baseline for planning. "Explicit" indicates an actual V1/MVP decision or an unchanged explicit MVP requirement. "Working V1" denotes scope included in the intuitive baseline Kevin asked for, or a required product feature whose exact slice was not separately voted on. Research may split the implementation into small deliverable tickets without silently dropping the capability.

|Capability                                             |Release/status                        |Required scope or qualification                                                                                                             |
|-------------------------------------------------------|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
|Guided AI game creation                                |**V1 — explicit**                     |Structured visual/text/voice input, clarify intent and design, agree scope, build/test through aiur.                                        |
|Two-way voice for creation and feature requests        |**V1 — explicit**                     |Reusable aiur component; Game Maker-specific scoping skills/context. Vendor and child-data path remain research gates.                      |
|Context-appropriate one-way voice snippets             |**V1 — decided direction**            |Supported where useful; not a promise of an agent operating all existing editor controls.                                                   |
|Game library and browser play                          |**V1 — explicit**                     |Own games, permitted shared games, suitable previews, desktop/mobile presentation.                                                          |
|Standard HUD and editor framework                      |**V1 — explicit/core**                |Consistent platform UI with comprehensive game-defined controls and direct manipulation.                                                    |
|Mouse/keyboard, touch, USB/Bluetooth controllers       |**V1 — explicit**                     |Game Maker forms, navigation, focus/selection feedback, editor, and gameplay. Actual hardware/browser coverage needs testing.               |
|AI feature additions                                   |**V1 — explicit**                     |Scope conversation followed normally by one coding agent with relevant skills.                                                              |
|Editing and playing while builds run                   |**V1 — explicit**                     |Manual changes persist in database-backed design overrides and survive compatible new builds.                                               |
|Editor undo/redo                                       |**Working V1 — required direction**   |Command history for editing; distinct from V2 gameplay rewind.                                                                              |
|Draft testing and deliberate Publish                   |**Working V1 — required direction**   |Latest draft and latest published release accessible; no automatic publication of successful builds.                                        |
|Versions, changelogs, update indicator, rollback       |**Working V1 — required direction**   |Semver, opt-in update for active sessions, latest published on reopen, bounded forward save compatibility.                                  |
|Cloud autosave, three manual slots, cross-device resume|**V1 baseline; slot default accepted**|Per user/game; safeguards for stale devices and failed saves need design.                                                                   |
|Basic achievements                                     |**Working V1**                        |Definitions, catalog/toast, persistent earned awards; test-only behavior in drafts.                                                         |
|Basic creator analytics                                |**Working V1**                        |Aggregates rather than named non-guardian child play data; accepted raw-retention target subject to privacy research.                       |
|Game forks/copies                                      |**Working V1 — required direction**   |Creator-only, forkable by default, new owner/identity, copy game design but not personal runtime data.                                      |
|Google sign-in                                         |**V1 — explicit**                     |Adults and children; authenticated players; no guest-play or PIN-only alternative selected.                                                 |
|Family owner/admin roles and parental controls         |**V1 — explicit**                     |Protected owner, peer admin management, family-wide child control authority.                                                                |
|Invite-only play and child invite toggle               |**V1 — explicit**                     |A player-only friend may play/test without joining the creator's family or obtaining Make access.                                           |
|Family budgets and concurrency controls                |**V1 — explicit**                     |One active creation plus up to three active edit builds by default; configurable by owner/admin.                                            |
|Basic administrative UI                                |**Working V1/core controls**          |Family membership, parental settings, budgets, game oversight. Not a duplicate aiur log console.                                            |
|Server-configured provider credentials                 |**V1 — explicit**                     |Kevin funds initial operation; configuration is server-side, not dashboard credential onboarding. Allowed credential types must be resolved.|
|Generative 2D/low-poly 3D asset tools and skills       |**V1 — explicit**                     |Not limited to asset-pack assembly; compare viable generation and procedural methods, quality, costs, and permissions.                      |
|Music/audio toolchain                                  |**V1 — decided direction**            |Agent-assisted composition/generation and useful sound design; no particular external music API selected.                                   |
|Image upload                                           |**V1 — explicit**                     |Can include an existing image/photo of a drawing; specialized paper-scanning UI is separately scoped.                                       |
|Read-aloud narration and captions                      |**V1 — explicit**                     |Includes spoken RPG dialogue; store/reuse suitable generated audio rather than assuming regeneration each playback.                         |
|Synchronized word highlighting                         |**Desired; working V1 where feasible**|Exact provider/timing support and acceptable fallback need research; captions/narration themselves are not deferred.                        |
|Parent help overlay and advanced-settings gate         |**V1 — explicit**                     |Accepted parent-only help/advanced controls; distinguish from the generally accessible core UI.                                             |
|Browser notifications                                  |**V1 — explicit**                     |Web notifications/push where supported and permission granted; mobile installation constraints accepted. No native app required.            |
|Game bug report and repair routing                     |**V1 — explicit**                     |Reuse the game edit/ticket pipeline with diagnostic context.                                                                                |
|Platform bug report routing                            |**V1 — explicit**                     |Game Maker repo ticket; Kevin's separate aiur listener handles platform work.                                                               |
|Engine SDK, shared contracts, automated testing        |**V1 — explicit/core**                |Required architecture and quality foundation; do not pre-implement all future modules.                                                      |
|Proper untrusted-code sandboxing                       |**V1 — explicit**                     |Required from day one on the hosted backend; isolated process alone is not accepted as proof.                                               |
|Netlify frontend / Railway backend and hosted aiur     |**V1 — explicit**                     |Hosting split confirmed; asset origin/delivery recommendation still needed.                                                                 |
|Durable game-asset storage and retrieval               |**V1 necessity; implementation open** |Repo-first, hybrid, or object-storage-first to be recommended; generated audio is part of the analysis.                                     |
|First-class configurable CDN publishing                |**Timing reopened — research**        |Initially V2, then reconsidered for V1. Do not record the assistant's hybrid-V1 lean as final approval.                                     |
|Child safety, minimization, consent/privacy work       |**V1 preparation and controls**       |Research/draft requested; no blanket legal or vendor clearance implied.                                                                     |
|Continuously production-testable Game Maker delivery   |**V1 development requirement**        |Encode in aiur build-order skill and every implementation ticket after initial setup.                                                       |

### 2.4 V2 — explicit decisions (changed)

Multiplayer implementation: architecture and required interfaces planned in V1; actual local/online multiplayer capability delivered in V2. Preserve invited draft playtesting, owner-driven shared editing, spectators, and session pause semantics.

Gameplay rewind: V2, including testing drafts. No hidden V1 rewind implementation. It is a short, local experimentation aid, not an unlimited whole-game time machine.

Built-in drawing tools: V2. Image upload remains V1.

Advanced CDN optimization: a sensible V2 working placement if basic delivery is needed in V1. The final split must follow the asset-storage/CDN research, not an assumed settled decision.

### 2.5 V3 and optional scope (changed)

Player-to-player voice chat: V3. This does not delay V1 AI voice conversation or V1 narration.

Native desktop/mobile packaging: V3. The exact packaging target and distribution model remain to be designed.

Full offline gameplay: optional V3 or do not build it. No commitment to reopening or refreshing a full game without connectivity. Short connection-loss handling and protecting unsynced progress are separate resilience questions, not a back door to a full offline product.

### 2.6 Later features with only working assignments (new)

|Feature                                                                                                            |Working placement, not owner-approved release commitment                                               |
|-------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
|Self-service family/provider subscription or API credential onboarding                                             |Later; propose V2 after the supported account/terms path is resolved. Explicitly not V1 dashboard work.|
|Rich provider-account, quota/rate-limit, and cross-provider cost dashboard                                         |Later; propose V2. Basic budget enforcement and necessary family controls remain V1.                   |
|Friends' achievement browsing and richer progress achievements                                                     |Proposed V2 extension to V1 basic achievements.                                                        |
|Cross-game admin analytics and release comparisons                                                                 |Proposed V2 extension, subject to privacy decisions.                                                   |
|Specialized paper crop/flatten capture UI                                                                          |Proposed V2 alongside drawing; generic image upload stays V1.                                          |
|More advanced room upgrades, host migration, or multiplayer rewind                                                 |Research alongside V1 multiplayer architecture; no assumed release beyond basic V2 multiplayer.        |
|Bring-your-own GitHub integration                                                                                  |Later, provisionally V3; not a prerequisite for initial game creation/forking.                         |
|Optional home build worker                                                                                         |Outside MVP; no committed release. Hosted operation is the selected start.                             |
|Build-star currency, robot personalities, learning ladder, code-editing mode, design journal, component marketplace|Uncommitted proposals, not silently part of V1 or promised for V3.                                     |

---

## 3. Constraints and principles

### 3.1 Technology and reuse

Retain TypeScript end to end, Three.js for 3D, and the Phaser 4 direction for 2D, with KAPLAY/LittleJS retained only as inherited candidates for very simple games. The exact backend web framework is still open; Express was discussed, not selected. Do not switch to Rust or a different engine without a concrete owner decision. [S3 §3]

Use aiur for the coding-agent software factory. Reuse its actual Git/PR, agent dispatch, usage tracking, and other relevant facilities. Research the installed code rather than assume the companion's interface snapshot is still exhaustive.

Use Netlify for the frontend, Railway for the backend and hosted aiur, and a separately considered asset-storage/delivery path. Prefer simple operations, but do not collapse security boundaries to save deployment configuration. [C4]

Voice is being built into aiur through a separable, reusable component. Game Maker's dashboard should consume that component rather than develop an unrelated voice stack or wait until V2 for two-way conversation.

### 3.2 Deterministic operations before agent work (changed)

Conventional code should handle permission checks, manual editor actions, undo transactions, persistence, known branch/commit/PR actions, game copies, structured issue creation, progress updates, publishing, and rollback where their behavior is already defined.

Use agents for judgment, clarification, design, content generation, code changes, and diagnosis. No continuously reasoning agent is needed merely to await a build event or refresh a progress bar.

Removing the editor-control agent does not remove the editor's command API: that API still supports manual inputs, undo/redo, validation, testing, and future integration. It does remove the requirement to interpret every natural-language tuning request into existing controls.

"No model tokens" is not "no infrastructure cost." Voice transcription, synthesis, asset generation, storage, and delivery must remain visible in appropriate accounting.

### 3.3 Shared platform, flexible games

Standardize platform capabilities and contracts, not every game's mechanics or editable variables. The implementing agent defines a thoughtfully comprehensive game-specific editing surface. Feature completion includes the corresponding controls. Do not automatically expose every internal variable or force all games into an exhaustive universal schema.

The research recommendation for a host-owned design document plus feature modules and database overrides is the leading architecture proposal, not a decision to impose a narrow genre catalog. Internal templates and demo kits may standardize integration without standardizing every game idea. [R4 §4.3]

### 3.4 Established dependencies and model-portable skills (changed)

Retain the preference for established open-source projects, approximately 1,000 stars or more and active maintenance, with explicit exceptions where warranted, and established commercial providers. Popularity alone is not a quality/security claim.

Skills and tools in the project should be accessible to the supported model/agent types, not locked unnecessarily to one provider. Adapt delivery to Claude/Codex or other aiur-supported agents without creating divergent behavioral requirements. [C4-early]

The companion recommends selective skill loading, fixed revisions, and supply-chain/license review. Carry these as implementation recommendations. Do not load every research report or specialist skill into every small request.

### 3.5 Repository and configuration boundaries (changed)

Platform code and generated-game code remain separate authority/repository boundaries. The platform begins private with possible later open-sourcing; the precise trigger and license remain open.

Generated-game source is intended to be open/forkable. Private in the Game Maker UI does not imply private GitHub source. No product feature for managing per-game private repositories is required.

Server/provider/CDN/storage credentials belong in deployment configuration or an appropriate backend secret mechanism, not game bundles, user-readable generated source, or ordinary admin forms. For V1, Kevin configures provider access server-side. Exact environment-variable names and adapters are implementation work.

---

## 4. Users and roles

### 4.1 Family model and role separation — Decided (changed)

Use family as the working term for the organization-like group. It is an access/budget/administration grouping; it does not require every invited player to become a family member.

|Role or relationship              |Authority                                                                                                              |Boundary                                                                                   |
|----------------------------------|-----------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
|Platform maintainer               |Kevin or an explicitly authorized maintainer changes Game Maker source and operates the platform-development listener. |Not granted by family-admin or creator status.                                             |
|Family owner                      |Kevin is the initial owner; manages the family and its administration.                                                 |Cannot be removed by another admin. Ownership transfer/removal mechanics are not specified.|
|Family admin                      |May add/remove other admins; manages family configuration and any child account's parental controls within that family.|Cannot remove the owner; not automatically a maintainer or a legally verified guardian.    |
|Creator                           |Creates games, edits owned games, and requests authorized build work; may invite players.                              |Does not gain power to invite creators/admins merely from creator status.                  |
|Player-only account               |Plays/tests games for which access was invited; has authenticated identity for saves and progress.                     |No Make access, game editing, feature-build authority, or in-product fork action.          |
|Game owner                        |Creator of the particular game or independent fork.                                                                    |Ownership of one game does not grant editing of another original.                          |
|Child-account attribute           |Enables family supervision, parental policies, and appropriate presentation.                                           |Separate from creator/player permission.                                                   |
|Parent/legal guardian relationship|Used for the applicable child-consent and data-access process once researched.                                         |Must not be inferred solely from who sent an invitation or holds admin status.             |
|Adult peer                        |Uses the core product under ordinary account/game permissions.                                                         |An inviter does not automatically gain parental-style oversight of that adult.             |

Any family admin may adjust parental controls for any child in that family. Do not implement a narrower "only the inviter can manage this child" rule in place of that decision. Legal consent authority and access to sensitive transcripts still need separate analysis. [C4]

### 4.2 Editing and administrative assistance — Decided (changed)

Use one ordinary editor/game owner, not collaborative co-editing. Authorized family admins, especially parents, must be able to enter and change a supervised family member's game on their behalf.

A friend invited to play is not an editor, even if they have creator permissions elsewhere. A fork makes its creator the owner of that independent game. The concurrency/handoff mechanism when an owner and admin both try to edit is an implementation question; it must not silently become a collaborative-editor feature.

Publishing is an owner/authorized-admin action, not an invited player capability. Exact administrative scope must follow the family policy rather than becoming global cross-family access.

### 4.3 Invitations and player authentication — Decided (changed)

All play access is invite-only, whether the game is discoverable or marked Private. A creator or authorized admin can issue a share/invite URL so a friend can play or test the game in a browser. When V2 multiplayer exists, that can also invite the friend into a shared session.

The invited friend must authenticate. Identity supports user separation, save data, achievements, and other per-player state. No accountless room guest mode is selected.

A player invitation does not give access to Game Maker's creation tools and does not automatically enroll the friend into the creator's family. Track who invited whom as part of the invitation/account design; exact lifecycle and retention are research work.

Child creators may invite players only when their parent/admin enables the relevant parental setting. Default is disabled. This is a setting governing the child's ability to invite, not a mandatory per-invitation approval loop unless a later setting explicitly adds that behavior.

Admins can invite creators/players and add other admins under family authority. No ordinary player invitation privilege has been established.

### 4.4 Sign-in — Decided product choice; validation required (changed)

Use Sign in with Google for adults and children. "Gmail" in the discussion refers to this sign-in choice, not permission to access Gmail messages. Do not retain email/password as the selected default, a child PIN flow, or a requirement to sign in as the parent before unlocking the child profile. [C4]

The conversation accepted Google sign-in for children with appropriate parental approval and a compatibility check. The research task must verify third-party application sign-in using supervised child Google accounts, including iPad/mobile-browser behavior and actual consent requirements. The ability to possess a child Google/Gmail account alone does not establish that this app's chosen authentication flow works.

Do not confuse Google identity services with the separate restrictions reported for particular Google AI products. Research each product/data flow, not a blanket "Google is allowed" or "all Google is prohibited" assumption.

### 4.5 Parent visibility and sensitive records — partly decided (changed)

Parents/admins should be able to see what supervised children are building, play their games, and help change those games. Whether they should see full interaction/edit transcripts is deliberately deferred to research. Kevin is concerned about storing sensitive data, especially children's data, solely to support oversight.

Compare game access, change summaries, moderation signals, and detailed transcripts; recommend the least intrusive design that meets the need. Do not build a complete transcript archive or a parental surveillance UI by default.

Raw implementation-agent conversations/build logs may be available to an authorized server operator in aiur's existing dashboard. A bespoke Game Maker raw-log viewer is not required. This is not a decision to grant every parent unrestricted access to all aiur logs or to retain them forever.

## 5. The experience

### 5.1 Home and game library

Keep Play and Make as the principal entry points; Make is visible/usable only with creator permission. Distinguish My games from permitted Others' games. Kevin can provide demo games for inspiration and for something useful to try before a first build finishes. [S3 §5.1]

The game wall should be visual and low-reading. Automatically captured short muted gameplay previews remain a candidate presentation, not a completed pipeline or an independently confirmed V1 deliverable.

Discovery is not authorization: seeing a game tile does not bypass invite-only play. The precise relationship between discoverable games and invitations should be designed consistently with that rule.

### 5.2 Private games and sharing — Decided (changed)

The Private setting means not visible to friends in ordinary Game Maker discovery. It does not promise confidential source code, a private GitHub repository, or recall of already shared public source.

Show a clear tooltip/explanation when a creator selects Private. Suggested meaning, with final copy to be designed: "Hidden from friends' game lists. This does not make the game's source code private." [C4]

All hosted play still requires invitation/authentication. Authorized invitations can permit testing or playing a hidden game. Public-source availability and in-product play permission are distinct boundaries: do not claim that invite-only hosting prevents someone from independently running a public-source copy.

Private titles, previews, prompts, and editing activity should not be accidentally revealed through presence, notification, or activity UI. The exact disclosure policy remains part of privacy research; no private-repository feature is being introduced to solve it.

### 5.3 Structured game creation — Decided (changed)

Use one structured creation flow: large visual choices, icons/presets, a typed or spoken idea, and Other wherever presets do not fit. No separate blank-page creation path is required.

The user should be able to describe what they imagine, choose or explore references, and have a two-way conversation to clarify the player's actions, challenge, goals, visual direction, and relevant design choices. This conversational scoping is V1, replacing the older "dictation now, conversation later" split.

Provide useful voice input for text-entry contexts without making speech the only route. Touch, keyboard, and controller navigation must remain usable. An on-screen text-entry route is needed where a physical keyboard is not available; the exact implementation and external sign-in handoff need device testing.

#### Art direction and scope (changed)

V1 is limited in visual complexity, not to prebuilt assets: support 2D and low-poly 3D with suitable tools and skills for generating and customizing assets. The user is not asking to make AAA games.

The original art vocabulary remains relevant: 8-bit, 16-bit, the ambiguous 32-bit label, voxel-like, cartoon, paper, clay-like, and cel-shaded. These are candidate presentation/style choices, not a guarantee that every originally named style is equally ready for V1. [S3 §5.3]

The companion recommends clearer separation between GBA-like 2D and PS1-like 3D, treating voxel as a visual style rather than a Minecraft-style editable-world commitment, and deferring experimental clay-like output. Those remain recommendations, not accepted final menu copy or a confirmed exclusion of all low-poly 3D from V1. [R4 ★8]

Do not silently replace Kevin's low-poly 3D requirement with the companion's narrower initial 2D-oriented launch suggestion.

#### Styles, genres, and references

Retain the proposed style vocabulary: retro game, futuristic, cool, cute, old, creepy, cozy, epic, and surreal. The original two-style cap remains unconfirmed.

Retain RPG, platformer, adventure, craft, puzzle, battle, strategy, and roguelike as original genre vocabulary, with the original up-to-three selection proposal and optional main-genre emphasis. Survival was discussed but not formally added. Racing examples clarify the desired extensibility; they do not by themselves settle a new exhaustive genre menu.

Suggest strong genre references and allow creators to describe what they enjoy about them. Reference-based design should preserve the creator's idea, not import protected assets or identity. Rating defaults and allowed reference inputs belong to content-policy research.

The companion's proposed launch trio—platformer, RPG, and one simple UI/puzzle game—is not a confirmed exclusive genre limit. Those are also useful representative test cases. Internal templates/demo kits should be evaluated for quality and build cost without forcing all requests into identical games.

Once multiplayer ships in V2, it should be selectable during initial creation and addable later as a feature. Some games fundamentally depend on multiplayer. V1 must plan for that future behavior without pretending multiplayer implementation already exists.

### 5.4 Scope conversation and handoff — Decided direction (changed)

Creation and feature addition should use a purpose-built conversation, not a raw transcript dumped into an implementation agent. The conversational agent needs relevant game/SDK context and skills covering:

- Useful clarifying questions and design choices.
- How to judge whether enough scope is known to proceed.
- Which specialist roles and skills the request actually needs.
- How to summarize the agreed request and produce structured ticket/plan data for aiur.

The product's scoping policy is context-dependent. Do not hard-code a universal two- or three-question limit merely because that was a discovery-conversation rule or a research recommendation. The companion's short picture-question sequence and plan card remain proposals to test, not a replacement for the explicitly requested two-way conversation.

Use visual choices or short demos where useful. The companion recommends preset variations of prebuilt genre demo kits for ordinary comparisons, with expensive agent-built variants reserved for genuinely different mechanics. Carry that as a cost-aware proposal. [R4 E1–E2]

Confirm the agreed scope before build work. The exact plan-card UI and whether any unusually large request needs another checkpoint remain implementation/product details; do not introduce repeated specialist-approval gates by default.

### 5.5 A feature request, end to end — authoritative example (new)

A creator already has a racing game. They enter the editor, tap the microphone, and ask for a new forest racetrack. The voice agent asks relevant questions, settles the intended scope and design, and prepares a structured request for aiur.

The agent should understand that this request might need track/level-design, visual, gameplay, and implementation skills, but not necessarily a narrative specialist. It proposes the relevant ticket structure, roles, skills, and dependencies rather than invoking a fixed full studio.

A normal follow-up feature is then handled by one coding agent with the required skills. Initial game creation may use multiple relevant agents. This is not a global one-agent limit on the entire platform or the Game Maker development project.

The creator sees a progress entry such as "New forest track", a short summary, a progress bar, a status such as "Playtesting" or "Running final tests", and an ETA when it can be estimated. Clicking/tapping reveals a slightly longer explanation of the request, not raw agent messages.

While it builds, the creator can continue playing and changing the existing game through the manual editor. Compatible manual changes carry forward into the new draft. When ready, the new draft can be tried and compared with the latest published release. Publication remains a separate deliberate action. [C4]

### 5.6 Progress, waiting, and completion — Decided (changed)

The primary waiting activity is playing and editing. Existing available games and controls should remain usable during queued/running builds. No elaborate mandatory minigame or drawing activity is required as a distraction.

Show a simple progress entry for each active build, with a concise name, summary, progress, human-readable stage/status, and ETA. A details view contains a couple of useful sentences about what is being built. Actual work/status should drive the display; do not present a precise countdown unsupported by the available signals.

Queue work when the family's allowed slots are occupied. The interface should distinguish queued work, active work, capacity waits, failure, and readiness to try. Exact wording and progress estimation are implementation tasks.

For a first-ever build, demo games and existing available content are candidates for meaningful waiting. Built-in drawing cannot be a V1 dependency because drawing is V2. The companion's screenshot timeline and music-picking activities remain optional proposals.

Detailed coding logs remain in aiur for authorized operators. Do not build a bespoke Game Maker log/transcript console solely to surface those details.

### 5.7 Play ⇄ edit and the editor contract — Decided (changed)

A prominent control switches between play and edit. This interaction must be accessible through the supported V1 input methods, including controllers.

The platform owns the editor's consistent framework and reusable widgets; the game's implementation agents define its useful game-specific controls. Speeds, colors, jump parameters, enemy populations, object placement, rules, maps, interactions, and dialogue are examples, not a fixed global list.

At creation, expose a thoughtfully comprehensive surface, not just a few trivial knobs. Every later feature updates or extends that surface. Agents should understand the editor/SDK through the relevant skill and inspect existing controls before extending them.

Direct manipulation should include appropriate ways to place, move, add, remove, and configure game elements. Numeric, categorical, color, and rule-oriented panels complement direct manipulation. The interaction must be useful on touch and controller, not only drag-and-drop with a mouse.

Scene thumbnails were accepted as part of the editor bundle. The parent-only help overlay and parental gate for advanced settings are V1. The exact simple/advanced control split remains a design task; do not use it to remove essential creative actions from the ordinary editor.

#### Explicit removal: agent mirroring of editor controls (changed)

The earlier design included an agent that could do everything exposed in the manual editor, using requests like "Make all enemies blue" to operate existing controls. Kevin explicitly removed that feature. It is not an approved V1 capability and has not been automatically moved into V2.

Keep the manual command infrastructure, voice scoping for new code/features, and appropriate one-way snippets. Do not interpret those as permission to recreate a full natural-language editor-control agent. Any narrower future voice-command idea should be identified as new scope.

#### Proposed internal editor contract

The leading design uses stable control/object identifiers, typed values and ranges, labels/icons, contextual targets, validation, and commands. Shared widgets and explicit transactions can support undo/redo and testability. Agents must not bypass permissions because an editor declaration contains a convenient callback.

A host-owned game design document plus feature modules and a database override layer is the companion's preferred approach. Inspector-only/live-object approaches and an all-purpose entity-component rewrite were alternatives, not chosen requirements. [R4 §§1, 4.3]

### 5.8 Editing while builds run and preserving manual changes — Decided outcome (new)

Manual editor changes made while a coding build runs persist in the database and must be carried into the next compatible build. They are not written to the game's source on every interactive adjustment. The creator retains access to the newest draft and latest published release. Nothing changes for ordinary players until publication. [R4 §1.1; C4]

The companion proposes this effective-design model:

```
Effective draft design = build's base design document + creator's database overrides
Published release      = selected build + immutable tested design snapshot
```

That is the leading implementation proposal, not a fully approved database schema. Its detailed recommendations are:

|Situation                      |Research recommendation; detailed mechanics still proposed                                                                           |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
|Identifying overrides          |Stable control IDs and object IDs; never a transient sentence as the durable key.                                                    |
|Bulk changes                   |Apply to objects that existed when the action was taken; no automatic "sticky" effect on future objects unless deliberately designed.|
|Build input                    |Coding agents receive a read-only snapshot of current tuned values; no direct write access to the live override layer.               |
|New draft arrival              |Offer "New build ready / Try it"; do not swap running code under the player without a safe transition.                               |
|Compatible changes             |Reapply deterministically and report what carried forward.                                                                           |
|Renamed controls               |Use explicit compatibility aliases where appropriate.                                                                                |
|Out-of-range values            |Ask for a choice rather than silently clamping.                                                                                      |
|Removed controls/objects       |Archive affected overrides; 30 days was proposed, not expressly adopted.                                                             |
|Builder versus creator conflict|Creator edit wins and is flagged, except where the job explicitly requested changing that control.                                   |
|Publication                    |Pin the tested build/snapshot, then fold design values into source deterministically.                                                |
|Rollback                       |Change the published release without silently destroying the independent draft overrides.                                            |

These details need review against the removal of the editor-control agent and the public-source decision. In particular, the companion's recommendation to fold children's labels/dialogue into a private monorepo cannot be inherited unchanged when source is intended to be public. [R4 B1–B6]

### 5.9 Input and accessibility — V1 (changed)

Support USB and Bluetooth controllers, touch, and mouse/keyboard as appropriate. "Controller support" means the actual Game Maker experience, not merely movement inside generated games.

Game Maker's forms and menus need controller-selectable elements, visible focus/highlighting, confirmation/back behavior, and usable text entry without assuming a physical keyboard. Touch users must be able to select and manipulate controls directly. Research the appropriate on-screen keyboard and alternative selection/placement patterns.

Test actual desktop and iPad/mobile browsers and representative controllers. A browser API or permission string alone is not evidence that all required interactions work. External authentication screens may require a separate handoff or parent assistance; test that boundary rather than promising Game Maker can control a provider's UI.

Preserve captions and readable controls, and plan reduced-motion, non-color-only distinctions, suitable target sizes, and remappable controls as accessibility design candidates. The companion's approximately 64-pixel child primary targets, 44-pixel other targets, and age bands are proposed defaults to validate, not measured or owner-approved universal specifications. [R4 F1–F5]

Kid mode is configurable. Parent-only advanced settings should not be confused with parent-only access to all help, narration, basic controls, or the ability to navigate independently.

### 5.10 Bug reports and repairs — both paths V1 (changed)

Provide a conspicuous, friendly report action with text/voice input. Reuse existing deterministic ticket creation instead of inventing a separate expensive reporting subsystem.

A bug inside a generated game is substantially an edit request with additional context: something went wrong, what the player expected, and the relevant diagnostic evidence. It routes into that game's authorized aiur build/repair workflow.

A bug in Game Maker itself becomes a ticket in the Game Maker repository. Kevin will run his own separate aiur listener for that repository, outside the hosted game-building backend, and use it to implement platform fixes from the beginning. A game job must not obtain platform-write permission just because the report concerns the platform. [C4]

The shared UI can be simple even though routing differs. Research how to classify ambiguous bugs and deduplicate reports. Reporting a bug as a player must not implicitly grant unlimited budget or creator authority; exact build admission for player-originated reports must be specified.

The diagnostic bundle remains a proposal: version/build IDs, relevant errors, a state snapshot, seed, recent input history, and an optional screenshot. Include only what is needed, redact sensitive data, and define storage/retention. Do not place raw children's speech, private saves, or account data in public GitHub issues.

A repair should add a meaningful regression test where practical. The companion's two automatic attempts, approximately one-third of a feature budget, then escalation is a recommendation, not an explicitly accepted numeric policy. Research should resolve that policy without changing the decision that the normal ticket pipeline is reused.

### 5.11 Friendly failures and escalation — Decided direction (changed)

Show a useful nontechnical message when a game or build fails, with a report action and any safe next step. Preserve the last working published release rather than replacing it with a failed build.

Ordinary technical failures should not ping "on-call parents." That phrase was an assistant invention and was corrected. Escalate to the operator/maintainer for technical intervention; notify a parent/admin when their action is actually needed, such as a budget/permission decision.

Raw aiur errors and coding conversations remain in the appropriate operator tools. Do not claim that removing a child-facing raw-log view removes the need for an operational retention policy.

### 5.12 Multiplayer — architecture V1, implementation V2 (changed)

Research and plan multiplayer during V1 so the SDK, identity, save, input, version, and editor contracts do not preclude it. Do not implement the full multiplayer feature in V1.

Multiplayer can be intrinsic to the original game concept or added later through a feature request. In V2, invited authenticated players should be able to test the newest unpublished version without replacing the latest published game. Draft testing does not require publication and does not erase the previous playable release.

Ordinary editing authority stays with the game owner. When the owner enters edit mode in a shared session, pause gameplay for that session. Other participants can observe cursor/focus/control changes without editing or spending authority. Authorized family-admin intervention must fit the same permission model; simultaneous editing/handoff rules remain open.

Preserve the distinction between observing editor actions and exposing private prompts, account settings, or administrative panels. State synchronization may satisfy the screen-sharing-like experience; literal video streaming was not selected.

Kevin accepted no fixed product-wide hard player cap. This is not an unlimited-capacity guarantee: per-game design, device limits, tested service capacity, and family policies still need explicit treatment. The older up-to-four-gamepad couch-co-op example is not a universal player limit.

Private invited rooms, appropriate local co-op, friend invitations, and eventual presence are the direction. Shared-screen 2D, optional split-screen 3D, and phones as controllers remain inherited proposals, not automatic V2 requirements.

The companion recommends an owner-browser-authoritative game with a generic platform-owned room server, and ending/saving a session when the owner disconnects without initial host migration. These are architecture proposals, not decisions from the accepted multiplayer bundle. Reconcile authority with save/achievement correctness and mobile tab suspension before selection. [R4 H1–H2]

Player-to-player voice chat is V3, separate from both multiplayer gameplay and AI conversation.

### 5.13 Images, drawings, and creative inputs — split by release (changed)

Image upload is V1. A creator can provide an existing image, including a photo of a drawing, as useful input or an intended asset. Define how the creator indicates its purpose and how the build system receives authorized content.

Built-in freehand drawing is V2. Preserve the simple tool direction: big brushes, a useful limited palette, eraser, undo, and done. Do not include a V1 freehand canvas after Kevin explicitly deferred it.

Specialized paper detection/cropping/flattening, pixel-grid drawing, and an integrated scanning workflow are separate implementation choices. Existing image upload does not require all of those. The original minimization intention remains: avoid unnecessary source-photo retention and location metadata; investigate safe preprocessing.

Restyling an image or using it to help generate a low-poly model belongs in the generative-asset toolchain research. It must not be advertised as a universal lossless or reliable drawing-to-3D capability without testing.

Recording a child's own voice as a persistent in-game asset remains a separate privacy/scope question. Do not infer approval from V1 narration, microphone input, or V3 voice chat.

### 5.14 Voice, narration, captions, and hints — V1 core (changed)

Use the reusable aiur voice component for the appropriate application flows. The product needs both two-way conversations and context-appropriate one-way voice snippets; the exact interaction depends on the task.

Whenever generated speech conveys a suggestion, instruction, or dialogue, show corresponding text. Narration and captions are V1. Spoken RPG dialogue is explicitly in scope, not merely an optional post-launch embellishment.

Synchronized read-along highlighting is desired. The companion reports differences in provider word-timing support and suggests sentence-level highlighting as a fallback. Verify the selected provider and browser behavior, and identify any limitation explicitly rather than quietly redefining captions as a full transcript-retention system. [R4 §2.1 finding 18]

Generate and store suitable reusable dialogue audio so repeated playback of the same line need not trigger a fresh generation call. Research asset identity/versioning and regeneration when text, voice, or delivery changes. Storage, authorization, retention, and CDN delivery are separate concerns; the CDN choice is not a prerequisite for merely reusing a stored file.

Keep input audio, scoping transcripts, generated narration, deliberately recorded character voices, and multiplayer voice chat distinct in privacy and data models.

Contextual hints can be offered through a lightweight indicator, short spoken suggestion with text, or a conversation. Player hints operate within existing game mechanics; editor coaching discusses design changes. A racing-game hint about an existing engine upgrade is not automatically an instruction to make the car faster in the editor.

### 5.15 Standard HUD and common platform UI

The platform owns pause, save-slot UI, achievement presentation, settings, game information, and common editor/publishing affordances. Generated games should integrate these rather than implement unrelated account/save menus per game. [S3 §5.11]

Standard functionality is included by default, with allowed omissions for games where a capability is inappropriate. The companion proposes that pause, exit, bug report, mute/settings, and safety/account controls cannot be removed. Treat that mandatory-control list as a policy recommendation requiring final design, not a fully ratified list. [R4 B7]

Creators see appropriate editor and management controls; players do not gain admin powers from a visually similar panel. Desktop and mobile presentation may differ while preserving the same authority and capabilities.

### 5.16 Cloud saves and cross-device resume — V1 baseline (changed)

Keep per-user, per-game progress in backend persistence, separate from source history. Users should be able to stop and resume on another device. Autosaving is the normal behavior; meaningful checkpoints and pause/resume boundaries should be considered.

Accepted default: one rolling autosave plus three manual slots. A separate checkpoint autosave was suggested but not independently confirmed. [C4 saves/achievements bundle; R4 C2]

Games need an explicit logical-state serialization/restore contract; do not assume arbitrary engine objects can be serialized automatically. Metadata should identify the relevant game, user, slot, build/release, and save schema. Exact schema is proposed engineering work.

Research stale-tab conflicts, simultaneous devices, interrupted uploads, clear local-versus-cloud status, save sizes, and safe resume through content changes. The companion recommends revision checks, a device lease, local outbox, and lazy one-step migration; these are implementation proposals.

Full offline loading/reopening is not required. Robust handling of a temporary save/network failure should be considered without silently adding a full offline feature.

For multiplayer, distinguish world/room progress from personal player progress. The persistence and ownership model is not settled merely by selecting a room library.

### 5.17 Forks and deterministic copies — Decided (changed)

Forking requires creator access. A player-only friend cannot fork inside Game Maker because they do not have access to the making tools. Games are forkable by default, rather than requiring explicit per-game permission on every copy. [C4]

A fork is an independent game-level copy, not necessarily a separate GitHub repository fork. Give it a new game identity and owner and preserve source provenance. Use deterministic backend/Git operations and aiur automation where appropriate, not a reasoning agent simply to copy files.

Copy the game's definitions/content, relevant assets, achievement definitions, and editor configuration/tuned values. Do not copy another player's save data, earned awards, or other personal runtime state. Kevin's "anything other than the state in the database" distinction concerns personal gameplay/account state; it must not accidentally exclude editor design settings merely because those settings are also stored in the database.

The companion recommends copying the published release and its effective design snapshot, with no unpublished draft edits, awards, saves, or analytics. Use that as the leading source-selection proposal; the inclusion/exclusion distinction above is settled, but every draft-versus-published copy edge case was not separately decided. [R4 C5]

Do not confuse inheriting an achievement catalog/definition with inheriting someone else's earned achievements.

### 5.18 Achievements — working V1 slice (changed)

Use first-class SDK/platform achievement definitions, award plumbing, catalogs, and notifications. Games provide meaningful game-specific conditions; the platform owns identity and persistence.

Accepted defaults: earned achievements are permanent across reload, rollback, and eventual rewind; draft testing may show test notifications but does not award real progress. [C4; R4 C4, C6]

Research repeat-safe awards, stable identities, deleted/revised definitions, forks, migration, and single-player versus multiplayer trust. Friends' achievement browsing and richer progress achievements remain proposed later slices, not a mandatory full social-achievement system in V1.

### 5.19 Analytics — working V1 slice (changed)

Provide useful creator insight into attempts, time spent, completion and other appropriate game-improvement signals. Separate gameplay analytics from provider usage/billing and from social presence.

Accepted default: creators see aggregate analytics rather than named child play histories where they are not the child's guardian. Parent/admin visibility beyond that remains subject to the specific oversight/privacy research.

Accepted planning default: raw analytics retention of 90 days, then aggregates/rollups. This does not approve 90-day storage of all microphone audio, prompts, screenshots, or transcripts. Validate the necessity and applicable requirements before implementation. [C4 saves/analytics bundle]

The companion proposes a minimum of three players per aggregate cell and adult opt-out. Those exact details were not read out and approved in the spoken bundle; retain them as recommendations. First-party events/rollups are the proposed approach, not an automatically selected telemetry vendor. [R4 C7–C8]

### 5.20 Drafts, publishing, updates, versions, and rollback

Two primary accessible versions: the newest draft/build the creator can test and the latest published release. A new build must not replace the published game until the owner or authorized admin deliberately publishes. This is not a requirement to keep every historical runtime permanently live.

The creator can compare and tune the new version while ordinary players continue on the published one. Once multiplayer is implemented, invited testers can also participate in a draft without forcing publication.

A successful coding merge/test produces a draft or preview, not automatic publication. A/B comparison here means practical creator comparison, not a randomized production experiment framework.

Show a live update indicator to an active player when a new published release is available, with concise change information and a choice to switch. Reopening/refreshing loads the latest published release. Preserve safe transition behavior rather than hot-swapping arbitrary running code.

Use visible major.minor.patch release identifiers and player-facing changelogs. Assemble release notes from actual request/change summaries deterministically where possible; an extra model call is not compulsory.

Support forward saves from the immediately previous published release. Do not require permanent compatibility logic for hundreds of old releases or promise that an ancient dormant save can jump to the newest game. Exact migration metadata and fallback UI need design.

The creator can roll back to any previous published version, with a clear warning that this can make newer saves incompatible or lose progress. There is no reverse-migration obligation. Rollback is a deterministic workflow, not inherently a model job.

The companion proposes rollback as a new higher-numbered release and keeping current plus two previous releases plus builds newer than fourteen days for old tabs. The conversation accepted recent-version retention in principle, not those exact numbering/retention parameters. Keep them proposed. [R4 C1, C3]

### 5.21 Gameplay rewind — V2 (changed)

Rewind is a kid-friendly experimentation tool: try a situation a few ways before returning to the editor. It is not intended to replay the entire game's history like an unlimited time-travel system.

Use local, ephemeral rewind state. The earlier approximately ten-second buffer is an example, not a fixed final limit. Kevin is not imposing a tight product quota solely to save server storage, but phones/iPads have real memory/storage constraints; the research agent must recommend practical bounds.

The assistant's later phrase "unlimited rewind" does not supersede that research requirement. There is no rewind in V1, even for drafts.

Research snapshots, restoration, physics/randomness, audiovisual behavior, local persistence choices, and interactions with saves, permanent achievements, and analytics. Multiplayer rewind needs a separate authority model; the local-only direction must not become an unapproved promise to rewind everyone's shared world.

### 5.22 Browser notifications — V1 (new)

Support browser-native notification/push mechanisms for build completion where available and permission is granted. The mobile-home-screen installation/permission constraint discussed for iPhones/iPads is acceptable to Kevin; native packaging is not required to pursue browser notifications. [C4; R4 §2.1 finding 22]

Validate actual target-browser behavior, background delivery, user permission, and installation UX. Use in-app build readiness/status when notifications are unavailable or declined. Email/SMS fallback was proposed in the companion but is not automatically part of Kevin's browser-only V1 choice.

The notification privacy recommendation is minimal lock-screen content, especially for child accounts. Final payload fields and retention need the same review as other data flows.

### 5.23 Offline and native packages — V3 or omitted (new)

Full offline support means deliberately storing enough of the application/game/assets to reload and continue without connectivity, with a defined progress-sync policy. Kevin placed that at V3 or non-existent; do not treat it as mandatory later delivery.

Native desktop/mobile packaging is V3. Supporting a home-screen web installation for notifications does not automatically commit to App Store distribution, native app features, or a comprehensive offline mode.

---

## 6. Learning by making

### 6.1 Learning stance — Decided

Fun comes first. The clearest learning goal is exposure to varied genres and understanding what makes different games enjoyable. Game-design concepts and some software-engineering concepts can be explained in context. Reading, reasoning, and other general learning should mostly emerge naturally. [S3 §6]

Avoid turning the platform into mandatory homework or an approval-driven course. The child should remain the author, not merely choose among the assistant's preferred games.

### 6.2 Creator coaching versus player help

Player help works within the game's current mechanics: strategies, existing upgrades, navigation, or understanding a challenge. Creator coaching concerns design: difficulty, rules, clarity, and possible new features.

Use short, optional, actionable help with visible text accompanying speech. A lightweight indicator can invite a conversation. Earlier examples of repeated failure or a specific number of attempts are examples, not a universal trigger algorithm.

The removal of the all-controls editor agent does not remove contextual teaching, design conversation, or feature scoping. It removes that particular control-execution feature.

### 6.3 Proposed learning features retained, not scheduled by implication

Preserve the original ideas for later evaluation: designer questions, comparing variants, named robot playtesters, watching where others struggle, difficulty visualization, balance/exploit discussion, and choosing ingredients such as challenge, surprise, collecting, building, friendship, or story.

Rule cards, variables represented as knobs, plan steps, bug reports, regression tests as "promises," forks, versions, changelogs, publishing, and rollback can provide concrete engineering-learning moments.

The optional five-level ladder—from play/knobs/voice wishes through rule cards, promises, explanations of code, and editing code with an agent—remains unapproved as a progression system. Do not withhold essential editor or recovery functions behind it. A design journal/session reflection remains optional and unscheduled.

## 7. System architecture

### 7.1 The two uses of aiur — Decided (new)

aiur is an agent-orchestration meta-harness/software factory, not a game engine. It facilitates ticket execution and the flow of reviewed/tested work into merged code.

|Use                          |Where it belongs                                                                                 |What it builds                                                                                                            |
|-----------------------------|-------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
|**Platform-development aiur**|Kevin's development/maintenance environment, with its own listener for the Game Maker repository.|Game Maker itself, including platform bug fixes, research/planning work, and approved upstream/reusable component changes.|
|**Hosted game-building aiur**|The Railway-backed service used by the deployed product, with appropriate isolation.             |Individual users' generated games, features, and game repairs under authorized budgets and game-workspace permissions.    |

Do not conflate their credentials, writable repositories, budgets, release rules, or listeners. A platform bug reported through Game Maker should reach Kevin's platform-development workflow; it does not give the hosted game builder a platform-maintainer role.

Likewise, parallel platform implementation tickets are not constrained to the default of one agent for a normal game-feature edit. They are distinct orchestration contexts. [C4]

### 7.2 Game Maker/aiur boundary and structured requests (changed)

The accepted functional split is that aiur handles substantial coding/build work, while ordinary interaction—playing, navigating, changing existing manual controls, and persistence—does not wait for aiur to reason or rebuild.

The companion's A+C hybrid is consistent with that direction: aiur handles long PR-shaped work; the application and reusable voice component handle interactive/scoping work through appropriate low-latency interfaces. Its earlier natural-language-to-editor-command example is removed with the control-operating agent. [R4 §4.1; C4]

Game Maker responsibilities: identity, family/game authorization, invitation enforcement, durable product job records, budget/concurrency admission, creation/feature UX, preview/published pointers, progress presentation, saves, and application-level notifications.

aiur responsibilities to reuse: agent dispatch, workspaces/worktrees, role/skill delivery, model/account routing, coding turns, Git/PR workflows, test/rework loops where available, and raw usage reporting. Inspect the actual installed capabilities before assigning gaps.

Voice component responsibilities: capture, transcription/synthesis, turn-taking, conversational transport/context boundary, captions, and applicable usage reporting. Game Maker supplies task-specific skills and authorized game context. Do not tightly couple all voice behavior to a specific dashboard view.

The voice/scoping agent should propose structured data describing the request and the work it needs. Host-side code must validate it, enforce scope/budget/permissions, and map it to the actual aiur ticket mechanism. Model-generated roles, dependencies, or paths must not become arbitrary authority.

Illustrative internal plan shape—not an existing aiur API, fixed schema, or implementation authorization:

```json
{
  "requestType": "game_feature",
  "gameId": "<authorized-game-id>",
  "baseBuildId": "<selected-draft-or-release>",
  "title": "New forest track",
  "summary": "Add the agreed forest racetrack and its editor controls.",
  "scope": {
    "included": ["<agreed mechanics and design choices>"],
    "excluded": ["<explicit non-goals>"]
  },
  "tickets": [
    {
      "key": "track-feature",
      "role": "<approved implementation role>",
      "skills": ["<relevant level/gameplay/art/SDK skills>"],
      "dependsOn": [],
      "acceptanceCriteria": ["<gameplay, editor, save, and test criteria>"]
    }
  ]
}
```

The actual schema, tracker mapping, validation rules, redaction, state snapshots, and idempotency are research/planning deliverables. Do not assume aiur already accepts a "create job" endpoint: the companion reports a tracker-ticket-to-PR interface and no such endpoint in the inspected snapshot. [R4 §2.1 finding 6]

### 7.3 Specialists, skills, and implementation agents (changed)

For initial game creation, select relevant specialists dynamically. Mechanics, levels, art direction, narrative, UI, accessibility, audio, and architecture may contribute; do not invoke them all mechanically.

Design work may run in parallel when independent, followed by synthesis into a coherent implementation plan. The output must reconcile assumptions, such as art/performance, controls/device suitability, and quests/gameplay state.

Normal later game edits should generally be a solo coding-agent job, supplied with the necessary skills and existing context. Kevin's forest-track example illustrates avoiding irrelevant narrative work. Do not require several specialized agents just to attach several skills to one task.

The accepted "one active coding agent with skills per ticket" does not prohibit multiple independent tickets from running in parallel, multiple relevant design agents for a new game, or aiur's own bounded review/testing workflow.

The companion proposes 0–2 specialists for simple games and up to four for story-heavy games, one design ticket with subagents, short return contracts, and a synthesis step. Those are tuning/structure recommendations, not ratified hard caps or a demand to use exactly one design ticket in every case. [R4 §§4.5, G1–G3]

Keep concise, relevant context. The voice agent needs enough information to scope work and select skills; it does not necessarily need every implementation transcript, full source tree, or all research reports copied into each turn.

### 7.4 Game delivery contract (changed)

The detailed file/type contract is to be planned, but it must support the following product requirements:

|Game/build deliverable                          |Purpose                                                                                     |
|------------------------------------------------|--------------------------------------------------------------------------------------------|
|Game code and authorized assets                 |Implement the scoped game in the chosen web stack.                                          |
|Game/build metadata                             |Stable identity, ownership/provenance references, runtime compatibility, and release inputs.|
|Engine SDK integration                          |Use common capabilities instead of duplicating platform/account infrastructure.             |
|Base design data and feature modules            |Support extensibility and separation from user overrides, subject to final architecture.    |
|Thoughtful editor declarations                  |Expose meaningful controls and direct manipulation for existing and new features.           |
|Serializable logical state and restore hooks    |Support cloud saves, device changes, diagnostics, and future rewind.                        |
|Previous-release save migration where needed    |Meet the bounded forward-compatibility requirement.                                         |
|Achievement definitions and relevant events     |Integrate with basic achievements/analytics without copying player state.                   |
|Tests, fixtures, and controlled inspection hooks|Cover behavior, editor operations, regressions, and migration.                              |
|Draft artifact                                  |Permit creator testing without changing the published release.                              |
|Accurate changelog/version inputs               |Describe actual changes; avoid an unnecessary model call for routine publication.           |
|Asset provenance/manifest                       |Track source, rights, generated variants, and storage references.                           |
|Narration/caption resources                     |Retain useful generated audio and the associated displayed text/timing data when supported. |

The companion's gm-sdk check, window.__gm, specific package names, and design-document format are proposed conventions. They are not established code merely because they appear in the research document.

### 7.5 Formal Game Maker Engine SDK and host UI

The Engine SDK is a first-class component around the selected engines, not a replacement renderer or an informal prompt pack. Keep game-facing runtime contracts distinct from the host UI and the server's privileged operations.

|Capability            |Shared responsibility                                  |Game-specific responsibility                            |Delivery                |
|----------------------|-------------------------------------------------------|--------------------------------------------------------|------------------------|
|Play/edit lifecycle   |Standard mode UI, authorization, common lifecycle      |Pause/resume/edit hooks                                 |V1                      |
|Editor operations     |Presentation, dispatch, validation, undo model         |Controls, objects, constraints, manipulation semantics  |V1                      |
|Input                 |Touch/controller/keyboard abstraction and UI navigation|Meaning and suitability of gameplay actions             |V1                      |
|Voice                 |Reusable component and common affordances              |Authorized task context and relevant scoping information|V1                      |
|Saves                 |Slots/UI, transport, authorization, sync status        |Logical-state serialization/restore                     |V1 baseline             |
|Versions and migration|Release metadata and transition orchestration          |Previous-published-release conversion/fallbacks         |V1 baseline             |
|Draft/publish         |Preview/release pointers and standard workflow         |Validated artifact and change information               |V1 baseline             |
|Achievements          |Catalog, repeat-safe storage/plumbing, display         |Definitions and award conditions                        |Basic V1; richer later  |
|Analytics             |Scoped event transport/aggregation/dashboard           |Meaningful gameplay events                              |Basic V1; richer later  |
|Narration/audio       |Settings, playback/caption integration and reuse       |Music, effects, dialogue, timing/content                |V1                      |
|Diagnostics           |Safe report and inspection integration                 |Meaningful state/context                                |V1                      |
|Multiplayer           |Identity/room/version/authority interfaces             |Shared simulation and game events                       |Plan in V1; implement V2|
|Rewind                |Future local history interface/UI                      |Capturable/restorable state                             |V2                      |
|Human voice chat      |Future private-room communication                      |Normally no per-game reimplementation                   |V3                      |

Define required hooks, optional capabilities, disabled/unavailable behavior, and SDK compatibility. Do not promise automatic state serialization, universal gamepad usability, or arbitrary live code replacement without explicit game integration.

The companion's proposed packages—@gm/sdk, @gm/host, iframe-bridge, command-manifest, a reusable voice package, and aiur-contracts—are useful boundaries to evaluate. Names and package count are not independently selected architecture. [R4 §5]

### 7.6 Hosting and proper sandboxing — Decided from day one (changed)

Netlify serves the frontend. Railway hosts the backend and hosted game-building aiur. Proper sandboxing is a V1 requirement, not a later upgrade after a trusted-family prototype.

Kevin rejected the idea that a loosely isolated hosted worker is sufficient until more families join. The research companion's option (i), which keeps useful credentials beside untrusted generated execution, must not be silently adopted as the accepted security compromise.

Investigate a real execution boundary for generated code, dependency installs, shell commands, and browser testing. Separate privileged orchestration/credentials from untrusted execution where the selected design requires it. Define workspace, filesystem, resource, network, cancellation, and tenant/game boundaries. Ordinary process separation is not the entire answer.

The companion favors a remote-execution backend for aiur with tool work performed in VM sandboxes. It also discusses per-job workers and alternative sandbox providers. The security outcome is decided; the exact mechanism/provider configuration is not. Current product capabilities and egress controls need primary-source/code verification before selection. [R4 §4.2; C4]

Generated game runtime must also be isolated from Game Maker's account/session/admin context. A separate-origin sandboxed iframe with validated message-channel capabilities is the leading browser design proposal. Test controller, audio, focus, and microphone behavior against that boundary rather than weakening it implicitly.

A home build worker is not the V1 architecture. No user device should need to join Kevin's Tailscale network or obtain broad home-network access.

### 7.7 Logical deployment map (changed)

This is a responsibility map, not a selected networking or vendor deployment recipe:

```
User browser / installed web experience
  ├── Game Maker frontend and standard host UI — Netlify
  ├── Generated game runtime — isolated from host account/admin context
  └── Authenticated Game Maker backend — Railway
       ├── Accounts, families, invitations, permissions
       ├── Saves, overrides, releases, achievements, analytics
       ├── Durable build records, budgets, admission, status/notifications
       ├── Reusable aiur voice component integration
       ├── Hosted aiur game-build workflow
       │    └── Properly sandboxed game execution/build/test environment
       └── Asset storage/delivery adapter — origin/CDN choice under research

Platform bug report
  └── Game Maker repository ticket
       └── Kevin's separate platform-development aiur listener
            └── Platform tests, merge, and controlled deployment
```

Assets should not inherit access merely because a browser knows a storage URL. The precise authorization model for invites, drafts, private uploads, public licensed assets, and published games is part of the storage/delivery research.

### 7.8 Persistence and ownership (changed)

Git stores source/history and approved development artifacts. Backend data stores user identities, family relationships, permissions, saves, jobs, releases, and other runtime records. Manual editor overrides are persistent design data in the database, not personal gameplay progress and not an automatic source commit per adjustment.

|Area               |Records/contracts to plan                                                                                |
|-------------------|---------------------------------------------------------------------------------------------------------|
|Identity and family|Accounts, role assignments, owner protection, child/supervisor relationships, invitations and revocation.|
|Game identity      |Owner, family/authorization scope, visibility, source location, fork provenance.                         |
|Draft design       |Base build plus overrides, revisions, conflicts, deleted-control handling.                               |
|Releases           |Immutable build/snapshot reference, published pointer, versions, notes, supported save boundary.         |
|Progress           |Per-user/game slots, revisions, synchronization status, compatibility metadata.                          |
|Jobs               |Scoped request, tickets, stage/progress, relevant costs, permission/budget decisions, outcome.           |
|Achievements       |Game definitions and separate per-user earned awards.                                                    |
|Analytics          |Minimum useful events/rollups with scope, retention, and access rules.                                   |
|Asset records      |Content/provenance/version references and intended publication/access status.                            |
|Diagnostics        |Minimal private evidence, report routing, retention, access, and redaction.                              |
|Future rooms       |Membership, identity, version, authority, temporary shared state, durable progress rules.                |

The companion proposes Postgres and first-party event rollups. This is a research recommendation, not an externally imposed database choice. Object storage, durability/backup policy, and asset source of truth remain open in the specific ways described in §9.6.

### 7.9 Testing, quality, and evidence (changed)

Automated testing is V1, but "tests passed" is not proof that a game is fun or that it performs well on every device. Cover controls, camera, editor operations, save/resume, migration, permissions, publication, media, and failure behavior as well as basic gameplay.

The companion proposes a layered test plan:

|Layer|Proposed responsibility                                              |
|-----|---------------------------------------------------------------------|
|L0   |Static/code/schema/contract checks.                                  |
|L1   |Deterministic smoke tests on every draft.                            |
|L2   |Exploration and device-profile tests before readiness/publication.   |
|L3   |More expensive publish-time review, including advisory visual checks.|

Preserve safe playable drafts even when advisory review still has findings; do not convert qualitative review into an unapproved "must be fun" hard gate. Clearly distinguish known issues from security/permission failures and truly nonfunctional builds.

The companion reports weak reliability of single-screenshot AI judging. Carry its conclusion as a research finding: visual review is advisory except for narrowly validated binary failures. Real users/specialists still judge fun, narrative quality, and child usability.

Cloud/headless tests are not a substitute for performance calibration on Kevin's actual iPads/desktops. Recommend measured targets after calibration; no numeric FPS, latency, or load-time threshold has been approved.

Use stable inputs, seeded randomness, and fixed-step conventions where useful, but do not assume generated games are fully deterministic. Bug reproduction needs relevant starting state and events. Rewind should be planned around reliable restoration rather than an unproven seed-only replay claim. [R4 findings 11–13]

### 7.10 Continuously testable Game Maker development — Decided (new)

This is a requirement for the software factory building the Game Maker platform.

After the minimal bootstrap/setup exception, each merged implementation ticket must preserve a usable deployed prototype and provide a concrete way to test its change in the deployed environment. Kevin should be able to open the current app, try a small improvement, and respond before the next large portion of the backlog is built.

Avoid sequencing that completes every database table, every backend endpoint, and every SDK module before connecting any meaningful user flow. Prefer narrow end-to-end increments and stable shared contracts that let independent work proceed in parallel.

A feature flag or restricted owner-only test path can support safe incremental delivery, but "merged behind a flag nobody can exercise" is not a substitute for Kevin's testable prototype. Security/child-use prerequisites still control who may use it; production testability does not mean automatic public or child-facing rollout.

For a foundational change with no new consumer-facing screen, the plan must still identify a deployed verification route, observable existing flow, or appropriate restricted test harness. Do not label every technical ticket an exception to the rule.

Every ticket plan should answer, in practical terms: What can Kevin try after this merge? How does he reach it? What should he see? What evidence distinguishes success from failure?

The plan must retain an early usable product throughout the project, not only when the V1 checklist is complete. "Speed to production" includes time to a useful feedback loop, not just the number of merged tickets per hour.

### 7.11 Build-order graph and feedback loop — Decided direction (new)

Research/planning agents should map each ticket's code surface and interface dependencies before assigning parallel work. Distinguish true prerequisites from sequencing preferences and from conflicts caused by several agents editing the same shared file.

Proposed graph metadata: ticket ID, feature/milestone, target repository, affected packages/files, contracts consumed/produced, prerequisites, integration/conflict notes, validation path, rollout condition, and status. Exact format should fit aiur's existing build-order representation.

The graph should maximize safe parallelism. Establish shared contracts early enough to unlock independent work without freezing every implementation detail prematurely. Identify aiur upstream changes as dependencies rather than burying them inside Game Maker tickets.

Kevin's feedback is expected during execution. Reassess not-started tickets, update scope and dependency edges, introduce new tickets when needed, and identify any active downstream work invalidated by a change. The process must not treat a pre-researched backlog as unchangeable.

Upstream skill deliverable: modify/extend aiur's build-order skill to make continuous deployability and deployed testability explicit planning criteria. This is reusable software-factory behavior beyond this one application.

### 7.12 Two publication loops, two meanings of "production" (new)

Game Maker platform development should continuously produce a testable deployed prototype. Separately, a generated game's new build becomes a draft until its owner/admin publishes it. Automated platform delivery does not remove the game creator's Publish control.

Do not apply the family default of one game creation and three edit builds as a global cap on Kevin's platform-development research/implementation agents. The respective budget and concurrency policies are separate.

---

## 8. Cost, models and rate limits

### 8.1 Funding and credentials — owner preference plus unresolved feasibility (changed)

Decided: V1 runs on Kevin's budget. He configures the hosted aiur instance and relevant Claude/Codex/provider authentication on the server. A dashboard for connecting/managing provider accounts is not an MVP requirement. [C4-early]

Desired later direction: families/admins can bring relevant provider access; Kevin prefers support for subscription-based access where allowed because he considers API usage expensive. He wants first-class multi-account/subscription sign-in and backend credential propagation eventually, with API-key support as applicable. That is a product preference, not proof that any subscription permits shared service use.

Material conflict to preserve: The companion reports that Claude Free/Pro/Max credentials cannot be routed on behalf of third-party application users and recommends a Kevin-funded Anthropic API key for the service. Kevin's later preference does not itself resolve that restriction. Keep the distinction between his own development sessions and the multi-user game-building backend. [R4 finding 1; C4-early]

Research must establish the supported/allowed credential model for each intended provider, including Codex, before execution. Do not assume that one provider's rule applies identically to another, that paying for a subscription authorizes the use case, or that server-side secret placement changes the terms.

If the desired credential route is unavailable, return the specific constraint and alternatives as an unresolved owner decision. Do not silently mark API-only operation as accepted, and do not implement a prohibited route simply to preserve a preference.

### 8.2 Model selection and shared skills

Use stronger design/planning/build capability for initial games and appropriately lighter capability for bounded follow-up edits where quality permits. Select by task and measured outcomes, not by marketing labels.

The original Opus-class new-game, Sonnet-class feature, and Haiku-class short-interaction mapping remains a benchmark hypothesis. Skills/tools should work across the supported model types where practical. No exact production model mapping is selected by this handoff.

Measure the cost of a completed successful job, including initial context, specialists, synthesis, retries, testing/rework, speech, generated media, and infrastructure. Short scoping interactions should not inherit a full expensive coding transcript unnecessarily.

### 8.3 Family concurrency — explicit defaults (changed)

Default per family:

|Work category              |Default active build limit|
|---------------------------|-------------------------:|
|New-game creation          |**1**                     |
|Game editing/feature builds|**3**                     |

The owner and admins can configure these limits to manage the family's budget. These are separate category limits, replacing the earlier unqualified "three builds" or companion "two jobs per household" suggestions.

Define any shared total-resource/spending constraint explicitly in the implementation plan. Do not invent an additional hidden aggregate cap or reinterpret the two defaults as a single three-job pool. Game repair admission and initial-game subagent accounting need to be specified so the controls remain meaningful.

The number of internal agents a new-game request uses is distinct from the number of active game-creation requests. A solo feature agent can receive multiple skills.

### 8.4 Budget enforcement and exhaustion

Family owners/admins set operational budgets and related controls. The exact dollar ceilings and default windows are not supplied. Basic admission and runaway protection belong in V1; commercial pricing and expanded account onboarding remain later.

The companion proposes budget reservations, usage reconciliation, turn/time/retry bounds, and pausing for admin approval when an estimate is exceeded. Its 1.5× reservation threshold is a proposed policy, not an accepted number. Provider exhaustion should be distinguishable from a broken game.

Keep playing and ordinary manual editor use independent of a code-generation budget where possible; independent playtime/account restrictions can still apply. Do not equate "build budget exhausted" with "delete the game."

The earlier desired control categories include new-game frequency, concurrent agents/builds, rolling usage windows, playtime, warnings, and temporary extensions. Their exact V1 depth and interaction remain to be planned; not every detailed window/extension UI was ratified in this pass.

"Build stars," refill schedules, and example exchange rates remain unapproved product metaphors.

### 8.5 Usage presentation and aiur reuse (changed)

The desired spending view distinguishes games, features, repairs, hints/tooltips, dialogue, and other generated capabilities. Include speech and asset services where used, not merely coding tokens.

Reuse aiur's usage and rate-limit information through suitable wrappers rather than building another independent accounting system. Rich account/rate-limit/provider-connection dashboards are later work; V1 still needs enough internal accounting to enforce the chosen controls and present meaningful build state.

Distinguish actual charges, estimates, delayed vendor billing, token volume, subscription quota, and remaining capacity. A token-equivalent estimate is not necessarily an incremental invoice amount.

### 8.6 Supplied cost hypotheses — not approved budgets or verified prices (changed)

The companion records these illustrative, unmeasured sizing estimates:

|Item                                                  |Source estimate                                                         |
|------------------------------------------------------|------------------------------------------------------------------------|
|New game                                              |Approximately $20 API-equivalent.                                       |
|Feature job                                           |Approximately $3.                                                       |
|Short clarification exchange                          |Approximately $0.002.                                                   |
|Fifteen-minute sandbox build                          |Approximately $0.04–$0.10.                                              |
|L0–L2 deterministic tests                             |No model-token cost, but still compute/infrastructure cost.             |
|Publish-time visual model check                       |Approximately $0.05.                                                    |
|Cold voice session with extensive copied agent context|Up to approximately $2.94 per question in the reported aiur measurement.|

These are [R4 §2.2] source estimates, not current pricing, validated product performance, or Kevin's authorized spend. Replace them with appropriately bounded measurements before relying on them for user-facing prices or guarantees.

The proposed measurement plan mentioned approximately $150 API-equivalent with a $125 stop, an 18-run skills pilot inside the same cap, roughly $5 for sandbox tests, and under $5 for screenshot-judge calibration. The inconsistent-looking estimate/stop values should be clarified. No approval of those amounts is established in the available discussion.

---

## 9. Separating the platform from the games

### 9.1 Hard authority boundaries

Only Kevin and authorized maintainers can modify Game Maker platform source. Ordinary game-creation agents operate in authorized game workspaces and consume the platform SDK/interfaces. A missing platform capability becomes a platform ticket; it does not authorize a game agent to expand its own permissions.

Family administration is not platform-maintenance permission. Playing a game is not editing permission. Owning a fork is not owning the original. Public source is not access to live account data.

The companion reports that GitHub cannot enforce folder-scoped write permission with a normal repository writer token. Its proposed commit service/path validation is therefore an important architecture input. Inspect and validate the actual write boundary, including branches, commits, and merge paths; do not rely only on an agent instruction saying "stay in your folder." [R4 finding 7]

### 9.2 Games repository topology (changed)

The folder-based shared games repository remains the preferred direction from earlier discussion. The companion reports that aiur uses one daemon per repository and recommends a monorepo with opaque game IDs. The exact directory layout and concurrency strategy remain proposals.

Do not retain "one private games monorepo" as a confirmed product decision. Kevin explicitly clarified that in-product Private does not manage private source repositories. Generated-game source should remain open/forkable in the intended workflow; exact publication safeguards and repository mechanics still need planning.

The platform repository remains a separate trust boundary and starts private. Public game source does not authorize public prompts, diagnostic evidence, author metadata containing child identity, credentials, saves, or supervision records.

### 9.3 Build, preview, and release workflow

Use conventional branches, commits, pull requests, tests, and merge automation, reusing aiur. A successful merge can update the newest testable draft. Only a deliberate authorized Publish updates the release ordinary players load.

Choose a coherent mapping among source commit, build artifact, draft design overrides, immutable tested snapshot, and published pointer. "Latest on refresh" means the latest published game, not whatever commit most recently reached a branch.

The companion proposes running tests in controlled sandboxes and reporting results to GitHub as check runs rather than putting sensitive logs in public Actions output. That is a research implementation recommendation to integrate with aiur's actual checks/rework behavior. [R4 conflict C6]

### 9.4 Forking and portability

A fork is a deterministic authorized copy with a new owner/game identity and suitable provenance. Include the game's effective design and reusable assets/achievement definitions; exclude private runtime/account data.

Source publication and asset publication need to be understandable together. An open-source repository whose assets are held elsewhere must have a coherent way to reference or obtain the assets that may actually be redistributed. Conversely, moving an asset to object storage does not automatically make it private or establish reuse rights.

Optional user GitHub connections, exports, or component libraries remain later/proposed work. No per-user repository requirement should be inferred from the word "fork."

### 9.5 First-class CDN publishing and environment configuration — direction decided, timing open (new)

Kevin wants CDN publishing to be a first-class Game Maker capability, not a manual step each creator performs. The provider and deployment details should be configured on the backend through environment/configuration/secrets, not a mandatory admin dashboard feature.

Candidate configuration includes storage endpoint, bucket/container, delivery base URL, provider choice, and credentials. Exact variable names and the supported adapter set are implementation decisions, not already specified APIs.

The intended publish workflow should manage the selected game bundle/assets and preserve version identity, with appropriate caching and access behavior. Content-addressed assets, deduplication, immutable URLs, compression, and controlled invalidation are proposed optimization techniques, not independently confirmed requirements with selected implementations.

Milestone history matters: Kevin first accepted first-class CDN publishing, then moved CDN caching to V2 during scope reduction, then reopened the question when discussing retained RPG narration and growing asset storage. He requested a research recommendation. The assistant's "hybrid V1/basic CDN V1" preference was not subsequently accepted as a final architecture.

Therefore: basic asset storage/loading is needed for V1; whether configurable CDN delivery itself must ship in V1 or can wait until V2 remains research-led and unresolved. Do not keep repeating the old V2 decision as if it were never reopened, or mark V1 as definitively chosen.

### 9.6 Asset source of truth: required research ticket (new)

Kevin raised the following issue explicitly: code belongs in the repository, but game assets—especially generated narration, music, images, and 3D models—may make a repo-only approach unsuitable. Putting everything in Git may be acceptable for a minimal initial implementation, but that is not a final mandate.

Compare:

|Option                             |Question the research must answer                                                                                                                       |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
|Repo-first                         |Is committing the initial permitted assets genuinely simple and sustainable for the expected volume/history? What are the relevant hosting constraints? |
|Hybrid                             |Which small/versioned design assets stay in Git, and which large/generated files live in object storage? How are manifests and releases reproducible?   |
|Object-storage-first               |Can an S3-compatible/object-storage origin be the canonical asset store while Git contains code and manifests? What operational complexity is justified?|
|CDN delivery over the chosen origin|What should be cached/delivered, under what authorization, and when is the integration worth shipping?                                                  |

The report must distinguish durable origin/source-of-truth storage, CDN delivery/cache, and backup/recovery rather than treating "many cached copies" as a backup strategy. Explain the roles of relevant Cloudflare products and S3-compatible storage against current documentation; do not assume Cloudflare CDN itself is the canonical writable file store.

Address retained dialogue audio, not only textures. Estimate plausible asset counts/sizes, versions and repeated-generation costs; measure or label assumptions. Evaluate access to drafts, invite-only games, public licensed assets, child uploads, and source-code forks. Include retention/deletion, rebuild/reproducibility, rollback, migration from an initially simple approach, bandwidth/egress, and operational cost.

Recommend a concrete V1 minimum, a V2 optimization path, and required V1 interfaces. The result should not force Kevin into a premature storage-vendor choice or silently add an expensive multi-provider abstraction.

### 9.7 Narration reuse as an asset requirement (new)

Store usable generated RPG dialogue audio for later playback. Associate the media with its intended text, voice/delivery configuration, and relevant game/release context so a future implementation can know when regeneration is necessary. An exact content-hash or naming scheme is a proposal for the research agent to specify.

Do not regenerate an unchanged line on every playback by default. Do not infer that raw child microphone recordings should also be retained. Generated game narration and conversational input have different purposes and retention rules.

Asset reuse should survive appropriate publish/fork/version workflows without leaking private context or retaining prohibited data. Resolve that explicitly with the source-of-truth and privacy research.

---

## 10. Safety, privacy and parental controls

### 10.1 Family controls and child safety — Decided (changed)

Child status activates appropriate supervision and assistance. Any family admin can adjust parental controls for any child in that family. The owner is protected from removal by another admin. Adult peers do not become supervised children because someone invited them.

The explicit child-invitation setting is disabled by default. Other proposed categories include content/genre permissions, creepy/stylized combat limits, camera/reference restrictions, spending, playtime, voice access, and publication/visibility controls. Exact presets and ranges remain research/design work.

A requested feature's scope approval and a parent's legal/data-processing consent are different acts. Do not substitute one for the other.

### 10.2 When content cannot run — Decided (new)

When a game is disallowed under applicable controls or identified as unsafe to run, block execution while leaving its source intact. Preserve existing work/progress rather than using destructive source deletion as the ordinary enforcement mechanism. The exact policy-change and re-enablement workflow needs design.

This does not settle every legal deletion/retention obligation. Resolve any such conflict explicitly instead of silently treating the product's nondestructive moderation preference as a universal retention exemption.

### 10.3 Refusal and redirection — Decided (new)

For a child's disallowed request, acknowledge clearly that the system will not do that, then gently redirect toward an acceptable alternative. Do not merely repeat an unexplained refusal that encourages the child to ask the same thing again.

Distinguish safety/content limits from ordinary design advice. Unusual combinations and difficulty choices should receive constructive guidance rather than arbitrary design vetoes.

### 10.4 Oversight versus retention — research explicitly requested (changed)

Kevin expects parents to see and moderate what children build, but does not want to retain sensitive data casually. Research whether game access, editor access, change summaries, or selected moderation records satisfy this expectation without storing every voice/text/edit transcript.

No full parental transcript viewer or blanket conversation archive has been approved. The server operator's ability to find aiur logs does not resolve who else should see them, how long they should exist, or what should be redacted before ticket creation.

Separate retention/access rules for: microphone input, scoping conversations, generated narration, deliberate user voice assets, photos/drawings, game design data, saves, analytics, bug evidence, aiur logs, and future multiplayer voice traffic. The accepted ninety-day analytics default is not a general-purpose retention policy.

### 10.5 Consent and legal research — research/draft ticket, not a presumed completed review (changed)

Kevin requested that a research agent investigate the relevant consent/privacy questions and write up a recommendation. He did not approve an outside-counsel budget in this conversation.

The simple "I approve" interaction was acceptable to him as a product concept after explanation. That does not establish that a checkbox or Google sign-in satisfies every applicable parental-consent requirement. Distinguish parent/guardian, family admin, inviter, and operator in the analysis.

The companion reports concerns about child-directed/mixed-age use, actual knowledge, parental consent, retention, security documentation, and review/deletion rights. Preserve those as source-reported legal issues for the research task, not a compliance certification or a claim that the app is exempt because the first users are family.

The report should identify where a product decision suffices, where documentary/provider approval is needed, where applicability remains uncertain, and where qualified legal input may be necessary. An agent-written memo is not itself regulatory approval.

### 10.6 Vendor and account feasibility — supplied research, not silently overridden (changed)

The following are reported findings/claims from [R4 A8], not newly verified statements in this handoff. The next targeted pass must inspect their underlying primary sources and the exact product/data flow before selection.

|Provider/topic                         |What the companion reports                                                                                                             |Consequence for this plan                                                                              |
|---------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
|Claude subscription credentials        |Third-party apps may not route users' requests through Free/Pro/Max credentials; API-key service path recommended.                     |Preserve Kevin's preference, but resolve the conflict before hosted multi-user execution.              |
|ElevenLabs                             |Under-18-facing services need written approval; zero retention reported as Enterprise-only.                                            |V1 voice remains a requirement, but this vendor is not automatically cleared.                          |
|Google AI products listed in the report|Restrictions for services likely accessed by under-18s were reported for the reviewed Gemini/Vertex/Lyria/video-understanding products.|Do not generalize this into a ban on Google sign-in; evaluate products separately.                     |
|fal.ai                                 |Adult end-user requirement reported.                                                                                                   |Not an automatically approved child-facing asset backend.                                              |
|Meshy                                  |Training on non-Enterprise uploads reported.                                                                                           |Review privacy/data-use implications before adopting an image/model workflow.                          |
|OpenAI                                 |Safeguarded teen use and approved zero-data-retention requirements for under-13 personal data were reported.                           |Do not treat this as blanket permission or proof that an account already has required approval.        |
|Self-hosted models                     |Proposed as a possible alternative, not a completed benchmark.                                                                         |Evaluate exact licenses, resources, quality, data flow, and operating cost.                            |
|Supervised Google sign-in              |The voice discussion assumed it was viable subject to parental approval/device checks.                                                 |Verify third-party app eligibility and actual child-account flows, not only Gmail account availability.|

The original instruction not to rerun already-settled factual questions does not prevent targeted rechecking when Kevin's changed V1 requirements depend on those findings. Do not broaden it into a fresh unbounded vendor survey when a narrow applicability check will suffice.

### 10.7 Public source, uploads, and private data (changed)

Public/forkable game source and hidden in-app discovery are intentional product choices. They do not permit accidental publication of children's names, raw prompts, voice recordings, faces in source photos, account identifiers, credentials, or diagnostic state.

Research the boundary between intentionally published game content and private creation context. A user uploading an image does not settle whether the original photo, metadata, transformed asset, or prompt should enter public source history.

Likewise, the companion's recommendation to place children's dialogue/labels in a private monorepo must be revisited, not copied unchanged. Commit histories, issue text, test logs, preview URLs, asset manifests, and authorship metadata all need consideration.

### 10.8 Content and intellectual-property boundaries

The inherited always-off baseline included sexual content, gore, real-person content, open stranger chat, and collecting personal information for its own sake. The all-ages decision did not approve removing those protections. Definitions need reconciliation with actual image upload, authenticated accounts, and later invited voice communication. [S3 §10]

Use reference games to understand mechanics, feel, and design intent without importing ripped assets or protected identity. Licensing, references, provenance, and publication guidance belong in the agent skills and asset pipeline.

The source's older simplified "copy rules and numbers" reasoning and references to a particular court case are not a universal safe-harbor rule. Carry that as a legal/policy research question, not automatic authorization to imitate any game presentation.

### 10.9 Enforce boundaries in code

The architecture must enforce account/game authority, family settings, build admission, sandbox isolation, controlled service credentials, validated game-to-host messages, and output/publication permissions. Prompt instructions alone are not the intended security boundary.

Research must produce concrete misuse/edge-case tests and evidence for the chosen design. A proposal labeled "sandbox," a separate process, or a provider's general marketing claim is not itself the required proof.

## 11. Proposed tech stack and research work

### 11.1 Selected direction versus research candidates (changed)

Use this table to avoid confusing a reported library finding with an owner's selection of a production dependency.

|Area                                 |Direction/candidate                                                                                            |Status and required treatment                                                                                                  |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
|Language                             |TypeScript                                                                                                     |Decided for the application/SDK and applicable shared contracts. Existing aiur internals need not be rewritten merely to match.|
|Game orchestration                   |aiur                                                                                                           |Decided; inspect current code and reuse actual capabilities.                                                                   |
|Frontend hosting                     |Netlify                                                                                                        |Explicitly confirmed, superseding the companion's Railway-only frontend suggestion.                                            |
|Backend and hosted game-builder      |Railway                                                                                                        |Decided; secure execution topology remains to validate.                                                                        |
|Backend framework                    |Express was discussed                                                                                          |Not selected; recommend within the chosen ecosystem.                                                                           |
|3D                                   |Three.js; supporting physics/postprocessing as appropriate                                                     |Retained direction, now explicitly low-poly 3D within V1 visual scope.                                                         |
|2D                                   |Phaser 4; KAPLAY/LittleJS as simple-game candidates                                                            |Retained direction; pin a validated version, not an unchecked remembered release.                                              |
|SDK/host UI                          |Modular Game Maker SDK and common host/editor                                                                  |Decided architecture; contracts/package names to plan.                                                                         |
|Editor internals                     |Design document, feature modules, typed manifests, Zod/Immer; Tweakpane and Tiled/LDtk formats as earlier leads|Leading research proposal, not an instruction to expose an engineering inspector to young children.                            |
|Manual control command infrastructure|Shared validated commands and undo                                                                             |Still useful; no separate all-controls natural-language agent requirement.                                                     |
|Authentication                       |Google sign-in; Better Auth as proposed integration                                                            |Google product choice decided. Library and child-account flow require validation.                                              |
|Family permissions                   |Explicit policy module/model                                                                                   |Owner/admin/creator/player requirements decided; assess what the chosen auth framework actually covers.                        |
|Database/analytics                   |Postgres events and rollups                                                                                    |Companion recommendation; first-party approach favored there. No third-party analytics SDK is automatically selected.          |
|Asset libraries                      |Kenney, KayKit, other reviewed packs; Lospec palettes as a lead                                                |Companion reports suitable license findings for named assets; verify exact distributions and provenance.                       |
|Quaternius                           |Per-pack consideration                                                                                         |Companion reports conflicting licensing pages; do not assume all packs share one clearance.                                    |
|Generative 2D/3D                     |Suitable generation tools/services or self-hosted/procedural methods                                           |V1 capability required; no vendor automatically selected or authorized.                                                        |
|Music                                |Tone.js, Tonal.js, VCSL, BeepBox; appropriate generative tooling                                               |Candidate baseline; V1 audio capability retained. Re-evaluate generation options rather than silently deferring all of them.   |
|smplr                                |Earlier exception to maturity preference                                                                       |Companion recommends excluding it due to sample-license findings; no new decision reinstates it.                               |
|TRELLIS                              |Earlier 3D lead                                                                                                |Companion reports a noncommercial dependency concern; not cleared as the V1 solution.                                          |
|Narration and conversation           |Reusable aiur voice component                                                                                  |V1; provider/retention/timing/embedding decisions require targeted research.                                                   |
|Narrative runtime                    |Typed fact/quest/storylet or JSON-graph model; optional inkjs later                                            |Companion proposal; no new standalone narrative engine has been selected.                                                      |
|Multiplayer                          |Colyseus and original PartyKit lead                                                                            |V1 architecture research, V2 implementation; authority and game-specific netcode responsibilities remain to select.            |
|Controller/touch input               |Browser input APIs and suitable helpers                                                                        |V1 requirement; actual UI/game/device behavior must be tested.                                                                 |
|Tests                                |Playwright and relevant development integrations                                                               |Research-backed candidate; not proof of real-device performance or fun.                                                        |
|Browser isolation                    |Separate-origin sandboxed runtime plus validated bridge                                                        |Leading proposal; verify gamepad/microphone/audio/focus behavior and privileges.                                               |
|Build isolation                      |Proper sandbox, potentially aiur remote execution                                                              |Security required from V1; no ordinary shared worker assumed safe by default.                                                  |
|Image upload                         |Secure input/asset handling                                                                                    |V1; specialized drawing/scanning tools are not prerequisites.                                                                  |
|Drawing                              |perfect-freehand/reduced Excalidraw and related leads                                                          |V2 research candidates.                                                                                                        |
|Asset origin and CDN                 |Repo, hybrid, or S3-compatible/object-storage origin with suitable delivery                                    |Research recommendation required; backend configuration is the intended control surface.                                       |
|Git/check integration                |aiur Git/PR flow; controlled test execution and check reporting                                                |Deterministic where possible; keep source publication separate from game Publish and sensitive logs.                           |

Inherited research leads retained: Earlier sources also listed threejs-skills, a later webgpu-claude-skill, browser input helpers such as nipplejs/detect-gpu, jscanify and server-side background cleanup for images, and reference-game research through Wikipedia/Wikidata, IGDB, RAWG, Fandom, OSGameClones, and selected video-analysis tools. These remain leads to evaluate, not approved dependencies or permission to send children's data to the listed services. The low-poly/2D constraint, V1 controller requirement, V2 drawing boundary, provider restrictions, and actual maturity/license checks govern their use. [S3 §11.1; R4]

The companion's Better Auth invitation concern was based on no-email child accounts. That premise changed when Kevin chose Google sign-in. Re-evaluate the exact integration rather than treating the earlier mismatch as a permanent property of this product.

### 11.2 Approved expertise research: all thirteen areas retained

These are domains of expertise to research, evaluate, and turn into useful selectively loaded skills. They are not thirteen permanent agents or a required thirteen-way fan-out for every game. Existing A1–A9 findings should be reused.

|ID |Area                              |Required contribution                                                                                                                       |
|---|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
|S01|Software engineering              |Maintainable TypeScript, tested safe changes, SDK/editor integration, bounded migrations, and clear implementation/review contracts.        |
|S02|Visual/UI design                  |Coherent all-ages UI, child-friendly modes, readable hierarchy, responsive platform/editor screens, touch/controller focus and affordances. |
|S03|Storytelling                      |Premise, characters, motivation, tone, pacing, and payoff without excessive reading or loss of creator authorship.                          |
|S04|Gameplay design                   |Enjoyable core loops, meaningful choices, challenge/progression, and genre-specific design beyond compilation.                              |
|S05|Music/audio                       |Composition, instrumentation, effects, mixing, adaptive transitions, narration, intelligibility, and quality evaluation.                    |
|S06|Game feel/interaction             |Controls, movement, cameras, collision/animation feedback, responsiveness, and input-specific tuning.                                       |
|S07|Level design/balance              |Spatial and encounter design, pacing, challenge curves, readable obstacles, and avoidance of accidental dead ends.                          |
|S08|Art direction                     |Cohesive 2D/low-poly 3D output, palettes, silhouettes, animation consistency, generated/pack/uploaded asset integration.                    |
|S09|Accessibility, especially children|Low-reading navigation, voice/text alternatives, captions, controller/touch UI, cognitive load, and real-device/family testing.             |
|S10|Automated gameplay QA             |Functional checks, controlled state/inputs, regression and migration tests, device profiles, advisory visual/audio inspection.              |
|S11|Extensible game architecture      |Initial foundations that lighter follow-up agents can safely extend, feature modules, stable IDs, state, editor and compatibility contracts.|
|S12|Narrative design                  |Quests, branching and stateful progression, player agency, continuity, and consequences of game updates.                                    |
|S13|Dialogue                          |Concise distinctive voices, choices, branching conversations, spoken delivery, captions, and retained narration resources.                  |

Particular initial depth remains desirable in game feel, levels/balance, art direction, and extensible architecture. All thirteen remain in scope.

The companion proposes putting some repeatable quality into SDK capabilities: understandable movement controls in tiles/seconds, tuned gentle/expert presets, reachability checks, standard feedback events, and reduced-motion handling. Treat these as candidate reusable techniques to evaluate, not universal algorithms every genre must use. [R4 finding 17]

### 11.3 Repository mining and transferable skills

The explicit research target remains:

https://github.com/Donchitos/Claude-Code-Game-Studios

The companion reports this mining work as completed in A1. Reuse its actual file-level map and inspect only what changed or needs verification. Borrow useful role/skill/workflow patterns while not adopting the project's overlapping orchestration framework.

Reported useful patterns include signal-to-specialist routing, dependency-ordered parallel work, concise return contracts, explicit artifact checks, a short game brief, a clear implementer contract, a quick-change path, playtest triage, and keeping tuning values in data. The reported large fixed agent hierarchy and phase/sprint structure were rejected as the product's runtime architecture. [R4 finding 16]

Retain actual path/commit/provenance and applicable attribution obligations when adapting material. The companion's preference to rewrite/adapt templates is not permission to ignore the licensing/provenance review.

The companion identifies awesome-gamedev-agent-skills as useful but notes Godot/Unity-oriented examples and a lack of child-specific guidance. Adapt expertise to the chosen web stack. Anthropic's frontend-design skill and an audited UI-review tool were separate UI leads; story, narrative, music, and child UX need custom work. These are reported research outcomes, not a mandate to install every named repository.

### 11.4 Existing A1–A9 reports and targeted updates (changed)

Source location reported by the companion: docs/research/v0.3/ on the existing research branch. The following completion status is reported by [R4], not a claim that this drafting session ran the studies.

|ID / source report                                     |Existing status                        |What this version changes                                                                                                                                                   |
|-------------------------------------------------------|---------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|A1 `A1-game-studios-mining.md`                         |Reported complete                      |Adapt specialist routing to voice-generated ticket plans, solo normal edits, and the two separate aiur software-factory uses.                                               |
|A2 `A2-expertise-feel-levels-art-gameplay.md`          |Reported complete                      |Revisit generative assets and V1 low-poly 3D; do not enforce an unaccepted three-genre or 2D-only launch limit.                                                             |
|A3 `A3-expertise-ui-story-audio-access.md`             |Reported complete                      |Two-way voice, touch/controller UI, narration, captions, and image upload are now V1; drawing V2; retained dialogue audio needs planning.                                   |
|A4 `A4-engine-sdk-editor.md`                           |Reported complete                      |Remove the full editor-control agent; retain manual commands, comprehensive controls, override persistence, and V1 controller interaction.                                  |
|A5 `A5-releases-saves-achievements-analytics-rewind.md`|Reported complete                      |Preserve accepted save/achievement/analytics defaults; rewind V2; draft multiplayer testing V2; clarify fork design data versus user awards/saves.                          |
|A6 `A6-aiur-integration-costs-voice.md`                |Reported complete                      |Hosted sandboxing day one, reusable voice V1, server-configured credentials, family limits, platform listener separation, and build-order skill requirement.                |
|A7 `A7-infra-auth-git-multiplayer.md`                  |Reported complete                      |Netlify frontend, explicit Private semantics/public-source direction, authenticated invited players, Google child sign-in, family policy, and reopened storage/CDN decision.|
|A8 `A8-vendor-legal-assets.md`                         |Reported complete                      |Targeted eligibility/retention/license checks for V1 voice/generative assets; privacy/consent drafting; subscription preference conflict; public-source content controls.   |
|A9 `A9-qa-playtest-creation-guidance.md`               |Reported complete                      |Scope conversation requirements, simple progress/ETA UX, two bug routes, controller/device tests, and continuously testable platform delivery.                              |
|`2026-10-21-bestgithubrepos-scan.md`                   |Companion says complete, awaiting Kevin|Retain as a report; do not silently adopt OpenPencil/OpenSpec/Caveman or other unapproved suggestions.                                                                      |

Unverified details carried from the report index: Actual iPad gamepad/fullscreen/audio/orientation behavior; Railway support for the relevant worker processes and execution tools, event streaming, GPU assumptions, and sandbox egress; snapshot sizes and physics-handle restoration; browser-clock behavior in automated tests; caption timing and voice-component licensing; and current vendor/asset policy applicability. The companion also makes a maintenance-status claim about Daytona. Preserve these as specific source findings or verification debt, not reasons to choose a vendor without checking it. [R4 §9]

No measured model/skills benchmark, sandbox isolation test, screenshot-judge calibration, real-device calibration, or completed MVP requirements plan is established by this handoff. Their status must be updated only when actual evidence exists.

### 11.5 Research manifest: update rather than restart (changed)

These retain the original R01–R19 identities for traceability. They are a gap/revision map, not nineteen automatically required fresh reports. Combine overlapping work and use the existing evidence.

|ID |Work area                                     |Current scope / change                                                                                                                                               |
|---|----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|R01|SDK boundaries and game contract              |Finalize host/game/backend boundaries, explicit state, editor declarations, releases, capability versions; plan multiplayer interfaces in V1.                        |
|R02|Agent-defined manual editor and override model|Comprehensive controls, placement, transactions/undo, stable IDs, revision/conflict behavior; **remove full natural-language control-agent execution scope**.        |
|R03|Reusable voice component                      |V1 two-way scoping, one-way contexts, captions/narration, provider seam, context size, usage, retention, actual aiur embedding.                                      |
|R04|Accounts/families/invitations                 |Protected owner, mutual admin management, family-wide child controls, Google accounts, player-only invited friends, child invite toggle, guardian distinction.       |
|R05|Hosted execution and isolation                |Proper day-one sandbox; orchestrator/tool separation, credentials, network/resources, tests, browser isolation, failure containment.                                 |
|R06|aiur lifecycle and credentials                |Real ticket interfaces, skill delivery across agent types, model/account policy, server configuration, distinct platform and hosted listeners.                       |
|R07|Git source, copies, privacy                   |Public-source/Private distinction, folder-write enforcement, versioned design copies, provenance, and private evidence channels.                                     |
|R08|Draft/publish/releases                        |Creator approval, newest draft/current release, updates, semantic numbering, tested snapshots, V2 invited draft rooms.                                               |
|R09|Saves and rollback                            |Autosave + three slots, revisions/conflicts, previous-release migration, arbitrary historical rollback without reverse migration, stale/unsupported saves.           |
|R10|Achievements                                  |Definitions versus awards, permanent awards, test-only drafts, fork semantics, basic V1 versus later richer views.                                                   |
|R11|Analytics and oversight                       |Aggregate creator view, accepted ninety-day raw target, minimization, parental visibility without automatic full transcripts, adult-peer scope.                      |
|R12|Multiplayer                                   |V1 architecture/V2 implementation, role-aware pause/spectators, invitations, room versions, host disconnect, local and online patterns.                              |
|R13|Cross-device UI/input                         |V1 touch/controller across forms/editor/play; USB/Bluetooth, on-screen text, real browser/hardware coverage, external auth handoff.                                  |
|R14|Local rewind                                  |V2 short local experimentation buffer, practical mobile bounds, snapshots, save/award/analytics behavior; separate multiplayer uncertainty.                          |
|R15|Budgets and usage                             |One creation/three edit builds per family, adjustable policies, real usage source, reservations/runaway limits, later dashboard depth and credential onboarding.     |
|R16|Generative assets and uploads                 |V1 generation for 2D/low-poly 3D and audio; image upload; V2 drawing; licenses, quality, private context versus published content.                                   |
|R17|Quality/performance evidence                  |Appropriate static/smoke/exploration checks, regressions/migrations, real-device calibration, limits of AI image judging; no unapproved fun/beat-the-game gate.      |
|R18|Creation guidance and waiting                 |Skill-driven scope conversation, sufficient-scope criteria, relevant specialists/tickets, low-reading plan confirmation, useful first-build experience, progress/ETA.|
|R19|Vendor/legal feasibility                      |Focused updates for changed requirements; research and draft consent/privacy/security recommendations, identify unresolved provider/legal dependencies.              |

Additional explicit work introduced in this pass:

|ID     |New work package                                         |Required result                                                                                                                                                               |
|-------|---------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|**R20**|Continuously testable platform build order and aiur skill|Inspect build-order skill; propose reusable update; produce dependency graph/code-surface analysis and a deployed verification requirement per ticket.                        |
|**R21**|Asset origin, CDN, and retained narration                |Compare repo-first/hybrid/object-store-first; separate canonical storage/cache/backup; recommend V1 minimum and V2 optimization, with backend configuration and access policy.|
|**R22**|Game-bug versus platform-bug routing                     |Shared reporting UX, deterministic repo routing, minimal private diagnostics, separate listeners/permissions, budgets and appropriate escalation.                             |

### 11.6 Skills and reusable-component backlog (changed)

The companion proposed this selective skill set. Update purpose and placement rather than treating names as installed code:

|Priority from companion|Skills                                                                                                                     |Current interpretation                                                                                                                         |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
|P0                     |`gm-brief`, `gm-specialist-router`, `gm-design-synthesis`, `gm-implementer-contract`, `gm-editor-sdk`, `gm-run-and-observe`|Scope and design relevant work; deliver coherent game contracts and a usable manual editor; test outputs.                                      |
|P1                     |`gm-quick-change`, `gm-playtest-triage`, `gm-feel`, `gm-level`, `gm-art-style`, `gm-gameplay`, `gm-child-ux`               |Support single-agent follow-up work and appropriate expertise without unnecessary full-studio fan-out.                                         |
|P2                     |`gm-story-brief`, `gm-narrative-dialogue`, `gm-audio`, `gm-hud-ui`, `gm-skill-evals`                                       |Companion research priority labels, **not a decision to defer V1 narration/audio**. Reprioritize any skill needed by an approved V1 capability.|

Add explicit scoping guidance for when to ask questions, when scope is sufficient, how to select skills/roles, and how to produce validated ticket-plan data. That may refine existing skills rather than require another named package.

Upstream/reusable work to inspect includes aiur remote execution, per-ticket spend bounds, usage/rate-limit endpoints, actual job admission interface, artifact validation, subagent accounting, voice infrastructure, and the build-order skill change. File gaps as planned upstream work, not duplicates hidden inside Game Maker.

Game Maker-specific work includes the Engine SDK, standard host/editor, family policy, game/version/override services, product job records, publication, asset handling, and game-specific skills. Keep reusable transport/voice/command contracts separable where genuinely useful; do not create a package for every small helper prematurely.

### 11.7 Expected next artifacts and authorization boundary (changed)

Return a source-linked decision baseline, targeted research updates, V1 feature slices and acceptance criteria, Engine SDK/voice/job contracts, repository/asset/security architecture recommendations, detailed implementation tickets, aiur upstream tickets, and the dependency/build-order graph.

Each feature/ticket should be traceable to a source requirement and release status. Identify research blockers and real owner decisions without relabeling earlier assistant suggestions as approvals. Include the exact production verification path for platform implementation tickets.

Do not mark a vendor approved, a benchmark measured, a legal review completed, a branch created, a ticket filed, a skill changed, or a deployment made unless the corresponding action actually occurs with appropriate authorization.

---

## 12. Music and audio

### 12.1 V1 capability — not "asset packs only" (changed)

V1 must have useful tools/skills for audio alongside generated visual assets. Kevin's expectation is a toolkit that allows agents to create the intended game, not a requirement to wait until V3 for all generative capability.

The original approach remains valuable: agent-composed music represented as notes/patterns/data, rendered through appropriate instruments, samples, or synthesis. Tone.js, Tonal.js, self-hosted VCSL samples, and BeepBox song representations were inherited candidates. This is not limited to primitive beeps. [S3 §12]

A separate text-to-complete-audio model is another implementation category, not the only meaning of generated music. The companion recommends a composition/sample baseline and deferring ACE-Step; the latest V1 generative-tool direction requires research to recommend a viable scope, not automatically to approve a particular music API or every synthesis method.

### 12.2 Quality and integration

Evaluate mood, musical structure, instrumentation, loop quality, repetition/fatigue, transitions, sound effects, dialogue intelligibility, and the relationship between audio and chosen art/game style. Adaptive layers, musically aligned transitions, and short stingers remain candidate techniques.

Avoid applying simplistic rules identically to every genre. Kid-mode content and startle limits must be explicit policy choices, not side effects of an audio library.

Keep separate: music composition, sound-effect creation, generated narration, two-way AI conversation, user-recorded persistent audio, and human voice chat. Only the last is explicitly V3; persistent user voice assets remain separately unresolved.

### 12.3 Narration and caption assets — V1 (changed)

Spoken RPG dialogue and accompanying text/captions belong in V1. Generate reusable media at an appropriate stage and retain it for repeated playback. Changed dialogue/voice configuration must have a defined regeneration/version policy.

The companion reports that word-timing support differs across providers and that browser speech may only support a coarser highlighting fallback. The audio research must verify the chosen path and document the limitation. Do not promise universal word-level synchronization merely by selecting a text-to-speech endpoint.

Narration needs a durable storage/access/reuse strategy, whether the first implementation uses repo assets, object storage, or a hybrid. CDN delivery may be beneficial, but its timing remains open pending R21.

### 12.4 Cost, privacy, and licensing

Prefer reusing appropriate generated outputs over repeated equivalent generation. Measure actual build/runtime costs under the selected allowed provider arrangement. Do not turn Kevin's earlier hypothetical "two cents" into a budget or cost guarantee.

Check exact sample packs, generation models, output-use terms, redistribution, and child/mixed-age data handling. The companion's VCSL/asset-license findings, smplr exclusion recommendation, and external vendor restrictions remain inputs to that work, not a clearance for unrelated packages with similar names.

---

## 13. What success looks like

### 13.1 Product outcomes

Users recognize their own ideas, enjoy playing, and return to improve the same projects. The editor provides real creative control; voice conversation helps define new work instead of becoming a compulsory expensive route for ordinary tuning.

The nephew can communicate ideas without Kevin translating every step; the niece can navigate with little reading and appropriate parent assistance. Adult creators find the same platform capable without being forced into a childish presentation.

Generated games have useful coherent mechanics, art, and sound; V1 can support both 2D and low-poly 3D within a constrained quality/performance envelope. Those targets need evidence, not claims that simpler geometry alone makes all generation easy.

### 13.2 Proposed evidence framework (changed)

|Area                |Useful evidence                                                                                          |Qualification                                                                  |
|--------------------|---------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
|Idea fidelity       |Creator recognizes intended mechanics, style, and story and can refine the plan.                         |Silence is not approval.                                                       |
|Continued authorship|Returns to an existing game, uses manual controls, requests purposeful features, publishes improvements. |No imposed edit/new-game ratio.                                                |
|Accessible creation |Real target users complete key forms/editor flows with touch/controller/voice as appropriate.            |Browser API support alone does not prove usability.                            |
|Scoping quality     |Relevant questions lead to clear bounded tickets and appropriate skills.                                 |No universal question-count rule has been selected.                            |
|Build experience    |Honest progress/status/ETA, useful waiting, preserved manual edits, safe draft switching.                |Hour/10–30-minute expectations remain targets.                                 |
|Saves               |Autosave/manual slots and cross-device resume without unexplained overwrites.                            |Exact quantitative reliability target remains open.                            |
|Releases            |Draft isolation, deliberate publication, useful notes, safe updates, previous-release migration.         |No indefinite historical runtime/save compatibility promise.                   |
|Quality             |Fewer preventable failures, coherent output, usable controls and media, actionable test feedback.        |Automated reviewers cannot prove fun.                                          |
|Budget control      |Family limits actually constrain work; costs/quota states are understandable.                            |Dollar amounts and commercial pricing remain undecided.                        |
|Safety and privacy  |Enforced roles/sandboxes, minimal necessary data, appropriate invitations/consent flow.                  |A checklist or agent memo does not certify compliance.                         |
|Platform delivery   |Early deployed prototype; each later merged ticket can be exercised; feedback changes the remaining plan.|This measures Game Maker's development process, not only generated-game builds.|

### 13.3 First real testing session — proposed, not already authorized

The companion recommends initial sessions with the nephew and niece, parents present, on iPads, using an observation form. The supplied record does not establish acceptance of that exact session protocol, participation in a blind A/B exercise, or a paid test budget.

The planning team should prepare a useful test plan and identify necessary consent/provider/safety prerequisites. Do not claim the test occurred or invent per-child success metrics. No additional broad interview is needed before preparing the plan.

### 13.4 Research/planning success

The next pass succeeds when it turns the new decisions into a coherent executable plan: actual aiur interfaces and upstream gaps, safe day-one execution, viable voice/generation paths, sound asset storage/reuse, a complete SDK/editor contract, and a dependency graph that enables useful deployed increments.

The result should reduce owner questions, not produce another set of disconnected reports with conflicting assumptions.

---

## 14. Question bank and unresolved work (changed)

This section is a handoff register, not a request for Kevin to answer another questionnaire now. Technical/policy research comes first. Bring back an owner question only where evidence cannot decide the desired product behavior. Confirmed decisions are audited in Appendices A–C.

### 14.1 Blocking research and choices

|ID       |Question / unresolved point                                                          |Current answer, ownership, and next action                                                                                                                                                                                   |
|---------|-------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|**U01 ★**|Which provider credential arrangements may power the multi-user backend?             |Kevin funds V1 and configures credentials server-side; subscription support is desired, but the companion reports an Anthropic restriction. Research provider-specific allowed paths, then return only the unresolved choice.|
|**U02 ★**|Which voice stack satisfies V1 two-way voice, narration, and child-data requirements?|Capability is not deferred. Inspect the reusable aiur component and viable providers/self-hosted paths; separate permissions, retention, performance, and word timings.                                                      |
|**U03 ★**|What exact child onboarding/consent flow is supported?                               |Google sign-in and parent approval direction are decided. Verify supervised-account third-party sign-in, guardian authority, applicable consent, and iPad behavior. "I approve" is not a compliance conclusion.              |
|**U04 ★**|What demonstrates proper sandboxing from day one?                                    |Hosted Railway direction is decided; the ordinary isolated-worker compromise was not accepted. Research execution/secret/network/resource boundaries and aiur changes.                                                       |
|**U05 ★**|Which tools deliver V1 generative 2D, low-poly 3D, and audio?                        |Tools/skills must be included; asset packs alone are insufficient as the whole plan. Recommend viable generation/procedural/library combinations with evidence and constraints.                                              |
|**U06 ★**|What is the asset source of truth, and does basic CDN delivery ship in V1?           |Timing was reopened. R21 must compare repo-first, hybrid, and object storage; include retained narration, source portability, access controls, and bandwidth.                                                                |
|**U07 ★**|What private data is retained and what can parents/admins see?                       |Game oversight/editing is desired; full transcripts are not approved. Research minimization, retention, diagnostic/ticket/log access, and public-source leakage.                                                             |
|**U08 ★**|Which dollar budgets and paid-spike authorizations apply?                            |Family controls and concurrency defaults are decided; no specific monthly ceiling or benchmark approval is established. Research can proceed without spending; obtain explicit amounts before paid execution.                |

### 14.2 Remaining product details: prepare recommendations, do not restart discovery

|ID |Area                                |Open detail and source context                                                                                                                                                                                         |
|---|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|U09|Initial genres/styles/templates     |Choose a practical kit/style rollout within 2D/low-poly 3D. Three genres, exact bit-label names, and every-game kit initialization were recommendations, not confirmed limits.                                         |
|U10|Editor override reconciliation      |Stable IDs, conflict resolution, archives, clamping, fold timing, and public-source handling of design text need a consistent contract. Required preservation outcome is already decided.                              |
|U11|Owner/admin editing handoff         |How does authorized parent/admin assistance work without conflicting concurrent edits or turning into multiplayer co-editing?                                                                                          |
|U12|Releases and dormant saves          |Exact old-asset retention, rollback numbering, unsupported-old-save UX, and migration boundary after rollback. No indefinite compatibility obligation.                                                                 |
|U13|Report admission/escalation         |How do player-originated game reports trigger authorized repairs? Numeric retry/spend limits, deduplication, and report classification remain recommendations.                                                         |
|U14|Analytics detail                    |Minimum aggregation size, opt-out behavior, retention justification, adult-peer visibility, and precise parent/admin scope. Ninety-day raw analytics is an accepted planning default, not a universal retention policy.|
|U15|Family/role lifecycle               |Owner transfer, family removal, account upgrade/claim, revocation, and cross-family relationships beyond the settled permission matrix.                                                                                |
|U16|Remaining account controls          |Exact content/playtime/spending presets, extension behavior, and approval options. Do not redo the settled child-invitation default.                                                                                   |
|U17|Public-source publication boundaries|How are intentional game content, private uploads, sensitive labels/dialogue, issue reports, and attribution separated? Private remains discovery-only.                                                                |
|U18|Multiplayer architecture            |Host authority, owner disconnection, room progress ownership, version transitions, spectator privacy, local co-op mechanics, and practical capacity. Plan in V1; deliver in V2.                                        |
|U19|Rewind implementation               |Practical local buffer bounds and supported state restore; no unlimited-history promise. V2 timing is settled.                                                                                                         |
|U20|Later dashboard/onboarding depth    |Exact rollout of provider credentials, usage/rate-limit wrappers, richer analytics, and external GitHub. V1 basic family controls remain required.                                                                     |
|U21|Test/calibration protocol           |Real devices/controllers, initial family-session plan, human-quality review, and measurable performance/latency targets. No numeric thresholds or test participation invented.                                         |
|U22|Optional product details            |Final name, platform open-source trigger/license, learning ladder, code visibility/editing, robot personalities, design journal, deletion/export details, and commercial pricing remain uncommitted.                   |

### 14.3 Decisions not to ask again (changed)

V1 means MVP. The product is all-ages with a kid-friendly layer. The creation flow is structured and flexible, not a separate blank canvas. Fun precedes formal teaching. TypeScript, web engines, aiur, Netlify frontend, and Railway backend are the direction.

Two-way creation/feature voice, narration/captions, image upload, touch/controller UI, browser notifications, and both bug-report routes are V1. Built-in drawing and gameplay rewind are V2; multiplayer is planned architecturally in V1 and implemented in V2. Player voice chat and native packaging are V3. Full offline play is optional V3 or omitted.

There is no requirement for an agent that mirrors every manual editor control. There is no guest-play mode. All players authenticate and require invitations. Player-only accounts cannot fork. Child invitations require a parent/admin-enabled setting and are off by default.

The family owner cannot be removed by another admin; admins can manage each other and adjust any child's parental controls within the family. Private means hidden from discovery, not private GitHub source. Forks inherit game design/settings/achievement definitions, not other people's saves or awards.

Default family build limits are one new-game creation and three edit builds. Proper sandboxing begins in V1. The continuously testable build-order requirement applies to Game Maker itself and must be baked into aiur's skill.

Do not ask for yet another confirmation of these points without a concrete new conflict or Kevin reopening one.

### 14.4 What is not an unresolved product question

Do not ask whether a specific library has a method, whether a provider exposes a quota endpoint, whether a device supports a permission combination, or whether a public repository enforces path-level writes when research/code inspection can establish the answer.

Where the companion already supplies a sourced result, inspect that source and update only where the changed requirement or current implementation makes it necessary. Where the result is only inferred or unverified, report the uncertainty rather than presenting it as a fresh owner decision.

---

## 15. Reference

### 15.1 Source record

|Source                                          |Contribution and limitations                                                                                                                                         |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`game-maker-2000-full-spec-v0.3.md`             |Base 15-section product specification; carries original v0.1 and available v0.2 context and a 44-question audit. Read in full for this consolidation.                |
|`game-maker-2000-v0.4-research-and-questions.md`|Supplied research synthesis, A1–A9 report index, recommendations/conflicts, and new question bank. Not an owner-approved implementation plan.                        |
|Current voice discussion                        |Explicit corrections, detailed user scenarios, role model, architecture/hosting choices, release classifications, and requests for targeted research.                |
|Recovered earlier session context               |Funding, server-side credential configuration, later subscription onboarding, and cross-model skill/tool accessibility; no evidence of paid-spike approval.          |
|A1–A9 underlying reports                        |Reported completed by the companion; should be inspected by Claude in the project. This drafting pass does not claim to have rerun their source checks or benchmarks.|
|Private original research catalog               |An inherited project reference, not independently inspected in this pass.                                                                                            |

### 15.2 Source-provided project locations

Game Maker project, with the existing research branch where available:

https://github.com/its-everdred/uncle-kevins-game-maker-2000

Original private Claude research catalog:

https://claude.ai/artifact/SchanfZLWf27tjj2i7fZxk

Named repository-mining target:

https://github.com/Donchitos/Claude-Code-Game-Studios

Reported research directory: docs/research/v0.3/.

These are locations supplied by the sources. This document does not claim to have accessed private repository contents, filed issues, created branches, or changed any remote project.

### 15.3 Reported implementation snapshot — attribution, not version selection

The companion attributes its findings to a research pass on October 21, 2026. It lists aiur commit ad084b1f, Game Studios mining commit 05ad7c8, and versions including Colyseus 0.18, Better Auth 1.7.12, Phaser 4.2.1, Three.js r186, Zod 4, and Playwright 1.64.1. [R4 §§2, 9]

Preserve those as the reported source snapshot. Do not mistake them for validated dependencies already installed in the Game Maker repository, selected production versions, or freshly checked latest releases. Verify against actual code and primary sources when implementing the corresponding plan.

The companion also reports maintenance/license findings for Rapier, Yarn Spinner's JavaScript options, inkjs, Quaternius, smplr, and TRELLIS. Inspect the exact artifacts implicated by those findings rather than generalizing a name-level claim to every distribution or replacing a blocked tool without documenting the change.

### 15.4 Terms used consistently (changed)

aiur is the software factory/meta-harness. Platform-development aiur builds Game Maker; hosted game-building aiur builds users' games. Research agents, design specialists, and coding agents are roles in different contexts, not a single fixed always-running studio.

Family owner manages the family with protected ownership. Family admin has family authority but is not automatically a platform maintainer or legally verified guardian. Creator is an account permission. Game owner controls a particular original or fork. Player-only permits invited play but not making or forking. Child is a supervision attribute, not a creator/player role.

Draft is unpublished work. Preview runs a draft. Published release is what ordinary authorized players newly load. Source history may support rollback without every historical version remaining continuously hosted.

Editor overrides are design data. Gameplay saves are player progress. Achievement definitions are part of the game; earned awards belong to players. Copying the former does not copy the latter.

Editor undo, gameplay rewind, save-slot load, forward migration, and source/release rollback are distinct operations with different authority and persistence requirements.

Asset origin/source of truth, delivery/cache, and backup/recovery must be distinguished in the storage recommendation. A "CDN" is not a shorthand for every one of those responsibilities.

V1/MVP, V2, V3 identify product delivery buckets. Spec v0.4 identifies this document revision.

---

## Appendix A — Decision changes and superseded assumptions (new)

This is an audit of meaningful corrections, not another release proposal.

|Topic                  |Latest decision / treatment                                                                          |Supersedes or prevents                                                                  |
|-----------------------|-----------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
|Product identity       |All ages, with kid-friendly mode and child supervision layered on.                                   |Treating the whole platform as children-only.                                           |
|aiur spelling/meaning  |aiur, "eye-ur," the software factory/meta-harness.                                                   |Treating AER/AIR/Ayer transcription variants as different services.                     |
|Two aiur uses          |Separate platform-development and hosted game-building contexts.                                     |Giving game agents platform-write authority or mixing the two build orders.             |
|Funding                |Kevin funds V1; provider configuration is server-side.                                               |Mandatory dashboard credential onboarding in MVP.                                       |
|Subscription preference|Preserve desire; record reported provider conflict and research supported routes.                    |Silently declaring API-only operation accepted or subscription service use authorized.  |
|Family owner           |Kevin cannot be removed by another admin.                                                            |Peer admins being able to remove the owner.                                             |
|Family admins          |Can add/remove admins and adjust any child's parental controls in the family.                        |Restricting controls exclusively to the original inviter.                               |
|Legal work             |Agent research and write-up requested.                                                               |An approved outside-counsel budget or completed compliance review.                      |
|Voice                  |V1 two-way scoping, reusable component in aiur.                                                      |v0.3/companion deferral of advanced conversation.                                       |
|Existing-control agent |Removed.                                                                                             |A requirement to reproduce all editor actions through agent tools.                      |
|Disallowed requests    |Clear boundary followed by gentle redirection.                                                       |An unexplained repeated refusal loop.                                                   |
|Unsafe/disallowed games|Block execution, retain source and existing work/progress in the normal moderation workflow.         |Routine destructive source deletion as enforcement.                                     |
|Authentication         |Google sign-in for everyone, subject to validated child/provider flow.                               |Parent email/password default, child PIN unlock, guest play.                            |
|Player-only friends    |Authenticated invited play/testing only; not automatically family members.                           |Make access, edits, spending authority, or forks from a player invitation.              |
|Child invitations      |Only when enabled by a parent/admin; default disabled.                                               |Unrestricted child invitations or mandatory approval of every invite as the only mode.  |
|Private                |Hide from discovery, not GitHub secrecy; explanatory tooltip.                                        |Native private-repo management as a required product feature.                           |
|Forking                |Creator-only, allowed by default; copies design/settings/achievement definitions, not user progress. |Player-only empty forks or copying earned awards/saves.                                 |
|Parent oversight       |Game visibility and assistance desired; detailed transcripts to be researched.                       |Assuming every interaction must be recorded/viewable.                                   |
|Progress UI            |Short title/summary, bar, stage/status, ETA; expanded summary on selection.                          |Raw logs and full coding conversations in ordinary creator/player views.                |
|Logs                   |Authorized operator may use aiur directly.                                                           |Bespoke Game Maker transcript/log console or unrestricted parent access.                |
|Concurrency            |One active creation and three active edit builds per family by default.                              |Unqualified default of three total jobs or companion default of two.                    |
|Controllers/touch      |V1 across own UI/forms/editor/play.                                                                  |Mouse/keyboard prerequisite or deferral of all controllers.                             |
|Multiplayer            |Plan architecture in V1, implement in V2.                                                            |Accidental full V1 networking implementation.                                           |
|Draft multiplayer      |Invited playtesting without replacing the published version once multiplayer ships.                  |Forced Publish just to test with friends.                                               |
|Player limits          |No fixed product-wide cap accepted; test real capacity.                                              |A promise of technically unlimited players.                                             |
|Rewind                 |V2, including drafts; local bounded design to research.                                              |V1 rewind or unlimited whole-game history.                                              |
|Drawing versus upload  |Image upload V1; built-in drawing V2.                                                                |Treating both as one deferred feature.                                                  |
|Generative assets      |V1 tools/skills for 2D and low-poly 3D, plus useful audio tooling.                                   |Asset packs only until V3, or an AAA graphics target.                                   |
|Human voice chat       |V3.                                                                                                  |Confusing it with V1 agent voice/narration.                                             |
|Bug reports            |V1 game-edit route and separate Game Maker-repo route/listener.                                      |One privileged agent handling every repository.                                         |
|Failure notifications  |Parent/admin only when their action is needed; technical issues to maintainer/operator.              |"On-call parents" for every error.                                                      |
|Notifications          |Browser-native/web push V1 with actual device/permission constraints.                                |Mandatory native app or automatically added email/SMS system.                           |
|Narration/captions     |V1; retained/reused RPG audio needs storage planning.                                                |Post-launch narration or repeated synthesis assumed for every playback.                 |
|Hosting                |Netlify frontend, Railway backend/hosted aiur.                                                       |Companion's Railway-only frontend default.                                              |
|CDN                    |First-class capability, backend configured; release timing reopened for research.                    |Treating V2 deferral or assistant's V1 suggestion as the unquestioned final answer.     |
|Offline                |Optional V3 or never.                                                                                |A committed full offline mode simply because a web install is supported.                |
|Native packaging       |V3.                                                                                                  |Native launch requirement.                                                              |
|Platform delivery      |Testable deployed prototype after each merge following initial setup; feedback revises tickets/graph.|Waiting for the whole backlog before testing; confusing this with game Publish behavior.|

## Appendix B — Disposition of the v0.4 research question bank (new)

A status of "proposed" or "research" below means that the source recommendation was not established as an owner decision. Accepted bundles apply only to what was actually presented aloud. This register does not turn every open item into a question Kevin must answer before planning.

### B.1 Blocking questions from the companion

|Source ID|Topic                   |Current disposition                                                                                                                                                                           |
|---------|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|★1       |Funding/credentials     |Kevin-funded and server-configured V1 decided. Subscription preference conflicts with reported Anthropic restriction; resolve allowed provider routes. Adult self-service credentials later.  |
|★2       |Parent-consenter        |Family role model decided; no specific legal parent-consenter or validated consent process supplied. Research; inviter/admin is not automatically guardian.                                   |
|★3       |Children's voice in MVP |**V1 required.** Research viable compliant provider/component path rather than accepting text-only children as the default launch.                                                            |
|★4       |Legal review/budget     |Agent research and draft requested; no external counsel budget authorized.                                                                                                                    |
|★5       |Game Maker/aiur split   |Long coding work through aiur, ordinary UI/manual changes outside its runtime dependency. Reusable voice; full control-agent subfeature removed. Exact hybrid interfaces remain planning work.|
|★6       |Generated-code execution|**Proper sandboxing day one**, hosted Railway direction; do not adopt the temporary weak-worker compromise as accepted.                                                                       |
|★7       |Private                 |**Discovery-only privacy**, not private GitHub source. No required private-repo management feature.                                                                                           |
|★8       |Genres/art              |**2D and low-poly 3D V1**, generative tooling included. Exact genre trio/style names and kit rollout not confirmed.                                                                           |
|★9       |Bounded paid spikes     |Proposed numbers not proven approved; no inferred permission for paid benchmarks or child blind testing.                                                                                      |
|★10      |Platform templates      |Shared SDK/editor foundation required; the exact every-game template/genre-kit prescription remains a research proposal.                                                                      |
|★11      |Spending/child code jobs|Family controls decided; **1 creation / 3 edit builds** defaults. Dollar caps, over-reservation threshold, and approval-policy details unresolved.                                            |
|★12      |First family test       |Initial users/device direction known; exact test protocol and success/failure thresholds not approved. Prepare a plan.                                                                        |

### B.2 Editor overrides and editing

|Source ID|Topic                          |Current disposition                                                                                                                                        |
|---------|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
|B1       |Sticky bulk edits              |No-sticky recommendation retained as proposed; applies to manual bulk operations if supported, not justification to restore the removed editor agent.      |
|B2       |Creator versus builder conflict|Creator-wins except explicit targeted job remains the leading proposal. Preservation outcome is decided; exact resolution policy not individually approved.|
|B3       |Pin then fold versus rebuild   |Pin tested snapshot then deterministic fold is proposed. Deliberate Publish is decided.                                                                    |
|B4       |Children's text in Git         |**Reopened by public-source decision.** Private-monorepo assumption no longer resolves publication/privacy.                                                |
|B5       |Dropped-edit archive           |Thirty-day archive is a proposal, not a retention decision.                                                                                                |
|B6       |Draft edits during rollback    |Keep draft independent is the research recommendation; preserve it in implementation planning without claiming detailed owner approval.                    |
|B7       |Non-removable HUD controls     |Proposed list requires policy/design finalization; standard platform HUD is decided.                                                                       |
|B8       |Kid/advanced controls          |Child-friendly/advanced split and parent advanced gate accepted; exact "Forgiving ↔ Tricky" slider was not separately accepted.                            |

### B.3 Releases, saves, achievements, analytics

|Source ID|Topic                      |Current disposition                                                                                                                                     |
|---------|---------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
|C1       |Rollback numbering         |Higher new release number is proposed; potentially destructive rollback and semver are decided.                                                         |
|C2       |Save slots                 |**Autosave plus three manual slots accepted.** Extra checkpoint slot not independently selected.                                                        |
|C3       |Old-build retention        |Recent versions retained in principle; current + two previous + fourteen-day rule remains proposed.                                                     |
|C4       |Permanent achievements     |**Accepted.** Do not remove earned awards through reload/rollback/eventual rewind.                                                                      |
|C5       |Fork contents              |**Copy game design/settings and achievement definitions, not saves/awards/runtime personal data.** Published-only source is the leading proposal.       |
|C6       |Draft achievements         |**Test-only; no real awards accepted.**                                                                                                                 |
|C7       |Named child analytics      |**Aggregate creator view accepted** for non-guardian access. Three-player cell minimum is still proposed.                                               |
|C8       |Analytics retention        |**Ninety-day raw-events planning default accepted**, then rollups; privacy applicability still to assess. Adult opt-out details not separately approved.|
|C9       |Rewind analytics/off switch|Rewind V2; treating it as a stuck signal and allowing game-level opt-out remain proposals.                                                              |

### B.4 Accounts, sharing, forks

|Source ID|Topic                               |Current disposition                                                                                    |
|---------|------------------------------------|-------------------------------------------------------------------------------------------------------|
|D1       |Player-only forks                   |**Rejected.** Player-only users cannot fork in Game Maker.                                             |
|D2       |Private-game fork permission        |**Forkable by default** for eligible creators. No separately approved per-private-game permission gate.|
|D3       |Child invitations                   |**Parental setting, off by default.** Not mandatory per-invite approval once enabled.                  |
|D4       |Admin visibility into adult invitees|No parental-style adult supervision; precise activity-summary scope remains to be finalized.           |
|D5       |Accountless room guests             |**Rejected.** All players authenticate.                                                                |
|D6       |Adult external GitHub               |Later proposal; not V1 and no explicit later milestone confirmed.                                      |

### B.5 Creation flow, waiting, QA

|Source ID|Topic                         |Current disposition                                                                                                                                  |
|---------|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
|E1       |Maximum narrowing             |Skill/context-driven conversation decided; exact 2–3 picture-question ceiling not accepted.                                                          |
|E2       |Variant generation            |Demo-kit presets versus expensive divergent builds remains a proposal.                                                                               |
|E3       |Waiting activities            |**Play/edit while building decided.** Simple progress/ETA chosen. Drawing activity cannot be V1 dependency; first-build extras remain proposed.      |
|E4       |Mobile notifications          |**Browser notification/push V1 accepted**, with device installation/permission constraints; no automatic email/SMS fallback scope.                   |
|E5       |Drafts with advisory findings |Safe technically playable drafts supported; advisory quality results need not block all testing. Exact robot-warning copy not approved.              |
|E6       |Creator must beat game        |**Not accepted.** Do not introduce a mandatory beat-before-share gate.                                                                               |
|E7       |Repair limits                 |Both repair routes V1. Two attempts / one-third feature budget remain proposed numbers.                                                              |
|E8       |Repair screenshots/transcripts|Diagnostic data handling needs privacy/provider research; do not treat a fixed thirty-day provider retention or public-ticket disclosure as approved.|

### B.6 Design quality, accessibility, content

|Source ID|Topic                     |Current disposition                                                                                                                                       |
|---------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
|F1       |Touch targets             |Touch V1 decided; 64/44-pixel targets proposed for real-device validation.                                                                                |
|F2       |Age profiles              |Kid mode/supervision decided; exact 5–7 / 8–12 / all-ages profile bands not individually selected.                                                        |
|F3       |Read-aloud default        |Narration/captions **V1**; exact automatic-youngest versus tap-older default still proposed.                                                              |
|F4       |Dialogue format           |SDK JSON graph/typed narrative state remains a proposal.                                                                                                  |
|F5       |Speech fallback           |Sentence-level/browser fallback proposed; full offline gameplay is not a requirement.                                                                     |
|F6       |ACE-Step music            |Companion deferral was a recommendation. V1 useful generation/composition tooling required; specific model/service remains to select.                     |
|F7       |AI art deferral           |**Superseded. Generative 2D and low-poly 3D tools/skills belong in V1.**                                                                                  |
|F8       |Children's recorded voices|Separate persistent asset/consent decision remains open; no inferred approval or voice-cloning requirement.                                               |
|F9       |Google exclusion          |**Do not apply AI-product restrictions wholesale to Google authentication.** Google sign-in chosen; specific AI services need separate eligibility checks.|
|F10      |Paid asset packs          |Free-pack-first recommendation retained; paid packs not approved.                                                                                         |
|F11      |Quaternius                |Reported license conflict remains unresolved; use pack-specific evidence rather than assumed universal clearance.                                         |

### B.7 Orchestration and aiur

|Source ID|Topic                  |Current disposition                                                                                                                              |
|---------|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
|G1       |Specialist counts      |Dynamic selection and normally solo follow-up coding decided; fixed 0–2/4 caps and "who's helping" cards remain proposed.                        |
|G2       |Design synthesis ticket|Voice agent proposes relevant structured work; exact one-design-ticket/subticket layout remains a planning decision.                             |
|G3       |Human checkpoints      |Lock/confirm scope before building. Exact single plan-card mechanism is a proposal, not approval of repeated gates.                              |
|G4       |Game Studios material  |Mine/adapt, do not adopt orchestration framework; preserve actual provenance/licensing review.                                                   |
|G5       |Repository topology    |Shared games-repo direction retained; **private-monorepo requirement not accepted**. Public-source/Private semantics settled separately.         |
|G6       |Two-way voice host     |**V1 reusable aiur component.** Inspect actual package/wire protocol and embedding approach; do not defer the feature because the old report did.|

### B.8 Multiplayer and operations

|Source ID|Topic            |Current disposition                                                                                |
|---------|-----------------|---------------------------------------------------------------------------------------------------|
|H1       |Game authority   |Owner-browser authority with generic room is proposed; architecture research V1, implementation V2.|
|H2       |Owner disconnects|End/save/no-host-migration is a proposal, not a confirmed user-facing rule.                        |
|H3       |Sandbox fallback |Provider choice contingent on isolation/egress findings; proper sandboxing is required in V1.      |
|I1       |Home worker      |Hosted-first selected; optional home worker outside MVP.                                           |
|I2       |Frontend hosting |**Netlify selected**, Railway backend/hosted aiur. Storage/CDN release timing reopened separately. |

## Appendix C — Updated audit of the original 44 questions (changed)

This compact audit preserves the original question identities without repeating the old questionnaire or treating every technical detail as a new product interview.

|Original #|Topic                         |Current status / pointer                                                                                                                            |
|----------|------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
|1 ★       |Evidence/origin               |Answered: nephew's EarthBound-style RPG, drawings/ideas translated by Kevin. §1.2.                                                                  |
|2 ★       |Real session/users/devices    |Initial family and desktop/iPad known; independent and parent-assisted use. Exact session duration/test protocol open. §§1.2, 13.3.                 |
|3         |Existing alternatives         |Motivation known; complete personal play/tool habits not collected. Do not invent them.                                                             |
|4 ★       |Smallest delightful version   |Release matrix now established with explicit V1/V2/V3 distinctions and marked working assignments. §2.                                              |
|5 ★       |Family project versus product |All-ages general product, invite-only acceptable indefinitely; pricing deferred. §§1–2.                                                             |
|6         |What lasts                    |Continued authorship, useful editing, guidance, invited play and later multiplayer. §§1, 6, 13.                                                     |
|7         |Wrong product                 |Fun-first, no compulsory school, no throwaway outputs, no restrictive universal editor. Ranked worst outcome not chosen. §2.                        |
|8         |Failure risks                 |Quality, cost, independence, repair, isolation, and early testability matter; numeric failure thresholds open. §§7, 13.                             |
|9 ★       |Templates versus scratch      |Structured UX settled; exact internal template/demo-kit mandate still proposed. §§3.3, 5.3–5.4.                                                     |
|10 ★      |Waiting                       |Existing play/edit plus simple progress/ETA; first-build extras proposed; browser notifications V1. §§5.5–5.6, 5.22.                                |
|11        |Game ownership                |Single owner editor, authorized family-admin assistance, independent forks; no shared co-editing. §4.2.                                             |
|12        |Main device                   |Desktop/iPad/mobile-browser direction; touch and controller now V1. §§1.2, 5.9.                                                                     |
|13        |Reusable parts                |SDK/voice reuse and whole-game copies required; component marketplace/library remains uncommitted. §§3, 7.5.                                        |
|14        |Kevin's role                  |Platform owner/maintainer and initial family owner; separate platform listener; no mandatory personal approval of every normal game. §§4, 7.1.      |
|15        |Editor scope                  |Comprehensive agent-defined manual controls/direct manipulation; full agent mirror explicitly removed. §§5.7–5.9.                                   |
|16        |Build failure                 |Friendly report/recovery, preserve last release, two separate bug routes; retry numbers still proposed. §§5.10–5.11.                                |
|17        |Keeping/exporting/offline     |Source history, forks, saves, slots and rollback required. Full offline optional V3/never; deletion/export detail open. §§5.16–5.23.                |
|18        |32-bit art meaning            |Labels unresolved; V1 supports both 2D and low-poly 3D. §5.3.                                                                                       |
|19        |Style cap/survival            |Exact cap and adding survival remain open; flexible Other input already settled. §5.3.                                                              |
|20        |Clashing choices              |Guide constructively; enforce actual safety/content limits, not arbitrary design vetoes. §§5.3, 10.3.                                               |
|21        |Narrowing                     |V1 two-way, skill-driven scope; no universal fixed question limit. §5.4.                                                                            |
|22        |Reference age/custom choices  |References desired; exact ratings and eligibility controls require research. §§5.3, 10.8.                                                           |
|23 ★      |Learning success              |Genre exposure and contextual design/engineering learning; no invented six-month metrics. §6.                                                       |
|24        |Teaching intensity/control    |Fun-first and separate player/editor help settled; exact teaching-level settings open. §6.                                                          |
|25        |Robot personalities           |Technical testing required; named personalities remain proposed. §§6.3, 7.9.                                                                        |
|26        |Code visibility/editing       |Optional original progression/code mode uncommitted. §6.3.                                                                                          |
|27        |Online participants           |Invited authenticated family/friends; child invitation toggle; multiplayer V2, human voice V3. §§4.3, 5.12.                                         |
|28        |Sharing beyond household      |Yes, by invite; friends need not join family; Private discovery-only; forks default for creators. §§4.3, 5.2, 5.17.                                 |
|29        |Controllers/how many          |USB/Bluetooth and UI/game support V1. Hardware list/practical limits need testing; no universal online player cap. §§5.9, 5.12.                     |
|30 ★      |Voice vendor                  |V1 reusable voice required; vendor/child-data eligibility remains a research dependency. §§5.14, 10.6.                                              |
|31        |Young child voice independence|Product goal, not validated capability. Prepare actual target-user/device evidence. §13.                                                            |
|32        |Drawing                       |Upload V1; built-in drawing V2; pixel grid/scanning specifics remain proposed. §5.13.                                                               |
|33 ★      |Spending ceiling              |Owner/admin configurable; 1 creation/3 edit concurrency defaults; no approved dollar ceiling. §8.                                                   |
|34        |Who pays                      |Kevin funds V1; later family credentials desired; supported subscription/API path unresolved. §8.1.                                                 |
|35        |Build stars                   |Unapproved metaphor; no refill/cost schedule. §8.4.                                                                                                 |
|36        |Models/measurement            |Stronger initial work, lighter bounded changes, portable skills; exact tiers/paid benchmarks open. §8.                                              |
|37        |Guardrails                    |Family child controls, gentle refusal/redirection, nondestructive execution block; detailed content presets open. §10.                              |
|38        |Retention                     |Detailed transcripts/audio/storage delegated to research; ninety-day analytics default is narrow, not blanket. §§4.5, 5.19, 10.4.                   |
|39        |Legal review                  |Agent research/draft requested; no approved counsel budget or compliance certification. §10.5.                                                      |
|40        |Subscription versus keys      |Preserve user preference and reported restrictions; resolve allowed per-provider route. §8.1.                                                       |
|41        |aiur/build order              |Two uses clarified; deep parallel planning, dependency graph and reusable build-order skill must maintain a testable prototype. §§7.1, 7.10–7.12.   |
|42        |Hosting/operations            |Netlify frontend, Railway backend/hosted aiur, proper sandboxing V1; asset origin/CDN reopened; uptime guarantees not specified. §§7.6–7.7, 9.5–9.6.|
|43        |Open-source trigger           |Platform later-opening trigger/license open; generated-game Private is not private-source protection. §§3.5, 9.2.                                   |
|44        |Final name                    |Uncle Kevin's Game Maker 2000 remains the working title; no replacement selected.                                                                   |

---

## Change log

### v0.4 — Consolidated research and voice decisions (changed)

This revision replaces the prior tentative scope with a V1/V2/V3 plan, while preserving unapproved details as proposals. It adds protected family ownership, broad in-family admin powers, Google sign-in, authenticated invite-only player access, a disabled-by-default child invitation setting, creator-only default forking, and explicit discovery-only Private semantics.

It moves two-way voice, controller/touch UI, generative 2D/low-poly 3D tools, image upload, narration/captions, browser notifications, and the two bug-report workflows into V1. It removes the all-controls editor agent. It places actual multiplayer, rewind, and drawing in V2; player voice chat and native packaging in V3; and full offline play in optional V3 or out of scope.

It records the one-creation/three-edit family concurrency defaults, server-configured V1 credentials, later credential/dashboard ambitions, and the unresolved conflict between subscription preference and supplied vendor research. It preserves the privacy concern around children's transcripts rather than approving a log archive.

It confirms Netlify frontend and Railway backend/hosted aiur with proper sandboxing from day one. It adds the explicit asset-source-of-truth/CDN/narration research task and records that CDN release timing was reopened, not conclusively settled by the assistant's suggestion.

Most importantly, it distinguishes aiur building Game Maker from aiur building users' games, and requires a deeply researched dependency graph/build order that keeps Game Maker usable and production-testable after each merge following initial setup. Kevin's ongoing feedback must be able to reshape the remaining tickets. That principle must also be incorporated into aiur's reusable build-order skill.

The question-bank audits prevent unspoken research recommendations, invented conversational bundles, uncertain numeric defaults, and proposed paid spikes from being misrepresented as owner approvals.

### Earlier source history

v0.3: Consolidated the original product concept and earlier conversation into the 15-section specification, formal SDK/editor direction, thirteen expertise domains, nineteen research spikes, and original 44-question audit.

v0.4 research companion: Reported nine parallel research-agent outputs, proposed architecture and feasibility findings, introduced editor-override persistence detail, and supplied the new research recommendation/question bank. Its proposals are reconciled here against Kevin's subsequent answers rather than adopted wholesale.

---

End of specification. Next action: targeted research updates, deep ticket planning, and an aiur build order with continuously testable delivery. No further broad product interview is required before that work starts. Implementation, spending, deployment, and new vendor data disclosure still require appropriate authorization.
