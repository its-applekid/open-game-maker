# Open Game Maker: Architecture and Agent Workflow Handoff

**Discussion date:** November 2, 2026  
**Audience:** The agent working on Open Game Maker and the agents building its first implementation  
**Purpose:** Capture the architectural direction, decisions, examples, and unresolved questions from the planning conversation.

This is a record of product intent and architectural decisions, not an audit of the current repositories. References to existing behavior reflect what was described in the conversation. Inspect the implementation before deciding what requires new code. Recommendations and unresolved choices are identified separately from agreed direction.

## 1. Executive summary

Open Game Maker should support many different kinds of games through **composable, versioned dependencies**, rather than one tightly coupled engine or a collection of copied templates. Shared capabilities should be reusable across games without making unrelated games vulnerable to one another’s changes. The engine itself should be a dependency, and substantial optional capabilities, such as multiplayer, should be separately consumable dependencies.

The asset pipeline is one route into that ecosystem. Ingesting an asset pack can produce metadata, thumbnails, a diorama, and—where useful—reusable presentation capabilities or an asset-pack-specific integration layer. It must not turn every pack into a bespoke engine or steer every game using that pack toward the same gameplay.

There are two repository scopes: the core Game Maker repository, and a separate implementation repository containing that implementation’s generated games and components. Useful components can become shared within an implementation, and selected components can later be contributed upstream to the core repository for other implementations to use.

AIUR owns agent orchestration and merge-authority policy. Its executor maintains the broader goal, curates reusable components, and handles escalated decisions through existing command requests. The Game Maker CLI should expand beyond asset discovery to make approved packages and components discoverable. Agents should search before building.

## 2. Keep the asset-pipeline discussion distinct from general game generation

The initial discussion concerned asset ingestion, thumbnails, dioramas, and the engine capabilities that work might produce. A separate, broader question is how much code agents write when creating a game or adding a feature to an existing game.

These are related, but they are not the same architectural decision. The conversation explicitly pushed back on jumping from “what should asset ingestion produce?” to “should agents mostly write games from scratch or assemble a Unity-like engine?”

**Agreed direction:** Build reusable capabilities where they make sense, without assuming that every asset pack defines a game or that every future game fits an existing template.

**Not decided:** A fixed balance between new code generation and assembly of existing systems. No “minimal coding sandbox versus comprehensive Unity replacement” choice was made.

The opening summary also mentioned proving a create-game → edit-through-chat → play flow. That flow was not evaluated during this discussion. Earlier remarks about completed features, ticket counts, or cleared blockers should not be treated as verified repository status.

## 3. Asset ingestion spans a spectrum, not one mandatory output shape

The workflow described is that adding asset packs to Google Drive prompts ingestion work, including an attempt to create a diorama and a useful starting point for working with the pack. Google Drive was described as the intake source; the conversation did not settle the long-term asset-serving infrastructure.

At the minimal end, a pack may contain only a few sprites. Understanding those files, enriching their metadata, producing thumbnails, and making a small preview may be enough. There is no reason to build an entire engine around such a pack.

At the richer end, a pack can support a thin, reusable engine layer that understands its presentation conventions while remaining independent of any particular game. It is reasonable to infer things about sprite dimensions, animation frames, direction sets, layering, or other asset structure.

The goal is to avoid both extremes: throwing away reusable work as one-off showcase code, and overfitting the engine so that agents repeatedly build essentially the same game from a given pack.

### Three responsibilities to keep separate

| Responsibility | What belongs here | Boundary |
| --- | --- | --- |
| Asset understanding | What files and sprites exist, dimensions, animation structure, and descriptive metadata | Describes the pack; does not dictate the game |
| Reusable presentation | Animation playback, directional presentation, layering, tile rendering, and similar capabilities where applicable | Makes assets usable without embedding a particular gameplay loop |
| Gameplay interpretation | What an asset means in a particular game and the rules attached to it | Belongs to game construction or explicitly chosen gameplay systems |

This separation was explicitly agreed to. An asset may look like a wizard or an enemy, but the package should not force a particular combat system, faction, genre, or behavior. Likewise, an asset-pack-specific integration layer should use existing general capabilities when they fit instead of duplicating them.

The eight-direction walking example illustrates the boundary. If a pack needs eight-direction animation and existing support is insufficient, the work may justify improving a reusable animation capability. That does not justify building a separate, incompatible animation engine for each pack. The exact placement and promotion of that improvement should follow the shared-component and executor workflows below.

## 4. Preserve source metadata and enrich it authoritatively

**Agreed direction:** Always preserve the original metadata supplied with the assets. The ingestion agent’s job is to glean as much additional information as it reasonably can and add useful metadata.

The agent’s enriched metadata may be authoritative for downstream use; it is not limited to low-confidence suggestions that require routine human approval. Preserving the original information and trusting useful inferred information are compatible goals.

For example, the pipeline can retain an author’s original sprite-sheet description while adding a normalized account of animation frames, directions, or dimensions that other agents can consume.

**Implementation recommendation:** Keep source metadata distinguishable from enrichment and normalization, with enough provenance to understand where a value came from. This supports later correction without destroying the original record.

**Not decided:** The metadata schema, conflict-resolution rules, confidence representation, or precise storage layout. The discussion did not establish that inferred metadata must always override a conflicting source value.

## 5. Dioramas should have an automatic visual feedback loop

**Agreed direction:** The ingestion agent should inspect the rendered diorama and fix problems automatically. Merely generating code or producing a render without checking it is not the desired endpoint.

The intended loop is ingestion and enrichment, construction or updating of the diorama, rendering, visual inspection, correction of issues, and another render. The feedback should catch problems such as incorrect animation mapping, broken presentation, or poor layout.

This work should improve the underlying asset integration or reusable presentation capability where appropriate, rather than hiding every problem behind diorama-specific patches.

**Recommendations raised in the conversation:** Bound the repair loop so it cannot run indefinitely, and preserve successful dioramas as useful regression fixtures for later changes. Exact stopping conditions, success criteria, and the test mechanism were not settled. Visual validation is useful evidence, not proof that all future games will remain compatible.

**Explicitly deferred:** Whether each pack gets one diorama or multiple demonstrations. The user is already working closely with the implementation agent on diorama details and asked to skip that question. Do not reopen or redesign that work unnecessarily.

## 6. Organize the engine around composable capabilities

The engine must accommodate substantially different games. Chess, a Diablo II-style game, and a Halo-style game were used as examples of this range—not as claims about existing support or a commitment to deliver all three immediately.

The central requirement is that changing chess-specific behavior should not break an unrelated shooter. At the same time, two RPGs should be able to share appropriate gameplay systems even when one is 2D and the other is 3D.

The following conceptual layering was discussed and accepted:

| Layer | Illustrative responsibilities | Intended reuse |
| --- | --- | --- |
| Broad platform capabilities | Controller/input integration, networking, rendering infrastructure, and other general foundations | Useful to many games, but not necessarily mandatory for every game |
| Spatial and presentation capabilities | 2D or 3D presentation/simulation and related adapters | Shared by games needing those capabilities |
| Composable gameplay systems | Turn management, combat, or other reusable game systems | Shared across compatible games, potentially across 2D and 3D |
| Individual game implementation | Specific rules, content, behavior, and integration | Isolated to that game unless deliberately generalized |

These are architectural boundaries, not a finalized package tree or rigid inheritance hierarchy. A game should compose the capabilities it needs, and shared systems should not depend on the specific games consuming them.

**Agreed direction:** Organize reusable functionality primarily by capability or technical function. Game archetypes can be optional bundles or starting points, but should not impose hard genre boundaries.

For example, an RPG-related capability that does not inherently depend on rendering should be shareable between a 2D RPG and a 3D RPG. Conversely, chess-specific rules should not become global assumptions in a generic runtime.

“Firewalling” between games should come from meaningful dependency boundaries, appropriate isolation, versioning, compatibility work, and tests—not just placing unrelated code in differently named folders.

## 7. Use real dependencies, not copied templates

**Explicit decision:** Shared engine capabilities should be true code dependencies. The desired model is not primarily copying a template into every game and then letting each copy drift.

The engine should itself be a dependency. Its significant subcomponents should be separately usable where appropriate. Multiplayer was the clearest example: adding multiplayer should conceptually mean adding the relevant dependency and wiring it into the game.

That does not imply multiplayer integration is literally zero-work or that a package can invent the game’s synchronization rules. The desired architectural property is that the reusable capability is packaged independently rather than tangled into every game’s implementation.

General utility dependencies are also reasonable. They should support modularity, not become a catch-all that recreates the monolith under another name.

**Agreed direction:** Avoid one large, tightly coupled codebase full of cross-game dependencies. A monorepo is compatible with this goal when it contains real packages with clear boundaries.

**Recommendations raised:** Define public interfaces separately from implementation details, and retain a deliberate escape hatch when a game needs behavior that a shared package cannot reasonably support.

**Not decided:** The package manager, publication mechanism, registry technology, naming scheme, exact package granularity, or fork/override process. True dependencies do not by themselves require a public package registry.

## 8. Version shared capabilities and make upgrades agent-aware

**Agreed direction:** Engine and component versions should help establish compatibility. Older versioned code must remain accessible so games can continue using versions that work for them.

The goal is not to make every game move at once whenever a shared package changes. Games need meaningful control over which versions they consume, and upgrades must not casually destabilize other games.

Agent skills should make agents aware of available upgrades. An agent can decide that an upgrade makes sense and perform the work under the applicable orchestration policy. Backward compatibility and regression testing are important safeguards.

The user also raised the possibility of a periodic job that updates games’ dependencies. That was an idea to explore, not an approved schedule or a requirement for unconditional auto-updates.

**Not decided:** The default upgrade policy, cadence, versioning convention, exact compatibility rules, rollback process, or which changes may be applied automatically.

**Recommendation raised:** Treat changing a game’s dependencies and redeploying a published game as distinct decisions. The conversation did not settle deployment behavior.

Do not interpret a successful test run as a guarantee that every consuming game is unaffected. Package versions, compatibility expectations, and suitable regression coverage should work together.

## 9. Asset packs should also be versioned dependencies

**Agreed direction:** Asset packs should participate in the versioned-package model. Asset files themselves live separately from the code repositories; packages primarily link to or describe those assets rather than storing all the raw files in game repos.

The user’s example was a D&D-style asset pack to which wizard assets are added. That creates a new version of the pack. Another game should be able to update its asset-package dependency and gain access to those wizard assets without manually copying files between repositories.

Updating the package makes the assets available. It does not, by itself, decide how wizards behave or insert wizard gameplay into the second game. That remains a game-level decision.

A package may therefore provide metadata, asset references, and relevant integration code when useful. A small asset pack need not contain new runtime engine code simply to qualify as a package.

**Implementation recommendation:** Ensure a package version resolves to a stable set of assets. A version label provides weak isolation if an external URL can silently change the underlying file for all existing consumers.

**Not decided:** Manifest format, external storage provider, URL/version retention strategy, immutable paths or content addressing, caching, or the publication mechanism for new assets.

## 10. AIUR owns orchestration and merge authority

The orchestration platform referred to in the voice conversation as “Ayer,” “AIR,” or similar transcriptions is **AIUR**.

As described by the user, AIUR uses an executor agent that maintains the broader goal and coordinates implementation agents. Implementation agents take individual tickets, write code, and review their own work. For a Game Maker implementation, the executor’s broader context includes the games within that implementation.

**Agreed direction:** Open Game Maker should rely on AIUR’s orchestration and policy mechanisms rather than building a parallel merge-approval system.

The conversation identified flexibility in who can merge or request review: implementation agents may be allowed to merge their own PRs; the executor may have final review or merge authority; and the human may ask the executor to review something. The exact behavior should follow configuration and direction in AIUR.

Routine game creation and feature development should not depend on humans reading and approving code. Optional human involvement is not prohibited; it is simply not the normal operating requirement.

The user was unsure whether any new code was needed to support these choices and expected that much of it may already exist in AIUR. Verify existing capabilities before proposing new infrastructure.

### Executor oversight is not the same as mandatory executor review of every PR

The executor is the higher-context gate for important shared decisions and the curator of what enters the shared component library. That is compatible with policies allowing implementation agents to merge ordinary work themselves.

Do not collapse these into either extreme: “every change requires a human or executor review” or “any implementation agent may publish any component as shared without curation.”

## 11. Use command requests for significant shared decisions

**Existing mechanism described by the user:** AIUR supports command requests through which an implementation agent can ask the executor to weigh in on an important decision.

**Agreed direction:** Encode use of that mechanism in the Game Maker agent skill. Significant decisions affecting shared capabilities should be surfaced to the executor rather than handled entirely within a narrowly scoped implementation task.

An implementing agent may recognize that a change is a genuine reusable improvement. The executor supplies the broader context needed to assess consequences for the implementation’s other games and shared components.

A useful request would explain the proposed change, why it belongs in shared code, what might depend on it, and the compatibility or migration implications. This is a recommendation for useful content, not a newly specified command schema.

The conversation considered doing large generalizations or promotions as separate tasks. That was a recommendation, not a finalized rule. The exact threshold for inline work versus a new executor-assigned ticket remains open.

## 12. Make the Game Maker CLI the discovery interface for reusable code

The user described an existing Game Maker CLI that has primarily been thought of as a way to find assets.

**Agreed direction:** Extend that discovery model to packages and reusable components built by other agents. Reusable work produced while developing new gameplay loops should be discoverable and accessible to later agents, rather than remaining hidden in a particular game’s code.

**Explicit agent-skill requirement:** Search for existing capabilities before building a new one. Reuse appropriate packages instead of accidentally creating several incompatible solutions to the same problem.

Searching first is not a requirement to force an unsuitable package into a game. Agents still need to judge fit and may build something new when justified.

**Explicit curation decision:** The executor decides which components are reusable enough to register. Do not automatically expose every helper function or every game-local module as a shared component.

**Recommended discovery information:** A component’s purpose, source and scope, available versions, compatibility expectations, dependencies, public usage guidance, and a working example where useful. Exact CLI commands, registry schemas, search behavior, and registration implementation were not chosen.

The discovery mechanism should represent both implementation-shared capabilities and capabilities available from the core project. This follows from the two repository scopes below; it does not require a new public registry service.

## 13. Preserve the core-repository / implementation-repository split

The user described the current model as follows:

| Repository scope | Contents and responsibility |
| --- | --- |
| Core Open Game Maker repository | Game Maker itself and reusable core engine capabilities made available to implementations |
| Separate implementation repository | The code for that implementation’s generated games, plus components created while developing those games |

This is not a proposal to put every user’s games into the core repository. It is also not a decision to create a separate repository for every generated game. The implementation repository is the shared home for that implementation’s games and components.

**Agreed direction:** Organize implementation repositories clearly so games and reusable components coexist without turning into a tangle of incidental imports.

The user favors the monorepo approach within this model. Repository organization and package boundaries are separate concerns: several independently consumable packages may live in one repo.

### Reuse and promotion have two scopes

Within an implementation, an agent may identify code that should be shared across its games. The executor decides whether it belongs in the implementation’s reusable library and should be registered for discovery.

Across implementations, selected components may be promoted from an implementation repository into the core Game Maker repository. The example was building roughly fifteen games, discovering useful reusable components, and upstreaming them so future implementations have better starting points. Fifteen was illustrative, not a promotion threshold.

A useful conceptual progression is:

```text
Game-specific work
    → implementation-shared capability, when useful and executor-approved
    → core reusable capability, when suitable for broader contribution
```

This is not a mandatory lifecycle for every package. Agents should consume existing shared capabilities directly when available, and many game-specific modules should remain game-specific.

## 14. Enable upstream contribution without assuming universal repository access

For the first implementation, the user expects an agent to have access to both the implementation repository and the core Game Maker repository. That makes agent-assisted extraction and contribution practical without requiring a large new automation service.

Future implementations may not have that access. The design must not depend on every executor or implementation agent being able to write directly to the core repository.

**Desired capability:** Provide a practical way—at least an agent-driven workflow—to identify valuable components, generalize them where necessary, and contribute them upstream.

**Recommendation raised:** Promotion should establish a maintained, versioned dependency rather than leave two independent copies that silently drift. A proposal or contribution workflow is appropriate when direct access is unavailable.

**Not decided:** How automatic extraction should be, the exact upstream review process, how existing consumers migrate after promotion, and how duplicate local and core implementations are retired. Implementation-level executor approval does not by itself establish permission to merge into the upstream project.

The user wants to encourage people to open-source their game/implementation repositories. This was encouragement, not a requirement that all implementations be public. It also does not establish permission to redistribute every referenced asset pack; raw assets remain separate from repositories.

## 15. Agent-skill guidance to carry forward

The conversation repeatedly favored encoding behavior in agent skills and using existing orchestration rather than adding new infrastructure for every policy choice.

The agreed behavioral guidance is to search the CLI before building reusable functionality; preserve original asset metadata while enriching it; visually inspect and repair dioramas; use real versioned dependencies; consider appropriate dependency upgrades; and escalate significant shared decisions through AIUR command requests.

The implementing agent can identify opportunities for reuse, but the executor curates registration into the shared library. Agents should distinguish a game-specific request from a broadly useful capability and avoid importing game assumptions into general presentation or platform code.

The skill should also explain the difference between implementation-shared work and upstream core contributions. An agent with access to both repositories can help with both, but access and authority must not be assumed for future installations.

**Recommended addition:** Make version changes, affected consumers, compatibility evidence, and migration expectations visible in shared-package proposals. The exact checklist and enforcement mechanism remain implementation choices.

## 16. Remaining design choices and boundaries

The overall direction is sufficiently clear to inspect the code and plan implementation. The conversation did not resolve every mechanism.

| Area | What remains open |
| --- | --- |
| Package implementation | Granularity, package layout, exports, naming, tooling, publication, and versioning convention |
| Compatibility assurance | Required regression coverage, representative consuming games, and enforcement of package boundaries |
| Upgrade automation | Whether to run scheduled upgrades, which updates qualify, cadence, rollback, and published-game deployment behavior |
| Asset version integrity | Manifest structure, stable references, retention of old asset versions, and storage/caching details |
| Metadata enrichment | Provenance format and conflict-resolution behavior while retaining original metadata |
| CLI discovery | Exact commands, searchable fields, scope presentation, and executor-approved registration mechanics |
| Exceptional game needs | How to extend, override, or fork an unsuitable shared capability without coupling unrelated games |
| Promotion workflow | Inline versus separate tasks, extraction mechanics, upstream review, and consumer migration |
| Existing implementation | Which requirements are already satisfied by Game Maker or AIUR, and which are genuine gaps |

The number or format of dioramas per pack is not a blocking open question for this handoff; it was deliberately left with the existing implementation work.

## 17. Suggested next step for the implementation agent

Reconcile this direction with the current Game Maker repositories, asset pipeline, CLI, package boundaries, and AIUR integration. Identify what already exists, what needs adjustment, and what is genuinely missing before proposing new services or major rewrites.

A useful implementation plan would preserve the existing diorama work, establish or strengthen real dependency boundaries, make approved reusable code discoverable, and describe a practical agent-driven path for promotion from implementation-local sharing into core packages.

Evaluate that plan against the concrete examples from the discussion: a tiny sprite pack should remain lightweight; a richer pack should produce useful presentation capabilities without prescribing a game; adding wizard assets should make them available through an asset-package update; a 2D and a 3D RPG should be able to share suitable systems; and chess-specific changes should not destabilize an unrelated shooter.

**Bottom line:** Let useful capabilities accumulate across games and implementations, but keep reuse explicit, versioned, discoverable, and appropriately curated. Asset ingestion should improve the ecosystem without narrowing the kinds of games it can produce.
