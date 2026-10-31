# B15: Reference builds and the risk of generic games

Date: 2026-10-24. Question from Kevin: would it help to give build agents reference builds (existing open-source games)? Will agents pointed at references make the same generic games?

- **Builds on:** B14 (skill plan, §5 skill-creator evals), B11 §4.7 (`gm` CLI) and §4.8 (skills list).
- **Evidence labels:** **[V]** I read the primary source (paper abstract or full text, vendor page, or the file via `gh api`). **[S]** secondary: search summaries, press, or aggregators.
- No third-party code was run. Star counts come from `gh api repos/...` on 2026-10-24.

## 1. Summary

1. **Yes, references help, but only small ones.** Retrieval clearly improves code correctness when the retrieved text is relevant (docs, nearby code) [V]. Nothing shows that whole example games help a strong model build a *different* game.
2. **Yes, the risk is real.** Examples anchor what the model writes. This shows up in four ways:
   - People shown an AI example copy its features more (design fixation) [V].
   - Code models carry over what is in their context, bugs included [V].
   - LLM-assisted outputs look more alike than human ones [V].
   - Different LLMs give strikingly similar answers to open prompts [V].

   We already pay this cost without references: models fall back to "the statistical centre" (Anthropic's own words about frontend design) [V]. A full reference game makes it worse. It gives the model a concrete centre to copy.
3. **The safe shape is "references for HOW, the brief for WHAT".**
   - Put mechanic-level **pattern cards** in the genre skills. Each card is small, typed, themeless and has tuning knobs.
   - `gm new` templates are **engine scaffolding only**: boot, SDK hooks, input map and a grey-box level. They carry no theme, art, names or sample enemies.
   - Add one **"name your defaults" pass** before coding. This copies the step that Anthropic's `frontend-design` skill uses against generic web pages [V].
   - Keep whole open-source games **out of build-agent context**. Use them as source material when we write cards, and as eval baselines.
4. **We can measure homogenization cheaply** inside the skill-creator loop:
   - code overlap with the cards (jscpd);
   - cross-brief code similarity;
   - screenshot embedding diversity (DINOv2 or CLIP, plus a Vendi score);
   - tunables left at card defaults;
   - a checklist of mechanics nobody asked for.
5. **V1 recommendation:** pattern cards plus scaffold-only templates, the defaults pass, the anti-copy rules in `gm-core`, and a 10-brief homogenization eval that must pass before a skill change ships. See §6.

## 2. Evidence

### 2.1 Examples anchor output (fixation and copying)

| Finding | Source | Label |
|---|---|---|
| 60 people sketched ideas after seeing an example. The group that used Midjourney repeated more of the example's 14 features than the baseline group (effect .32, BF 124). Their ideas also had less variety. Image search showed a similar pattern. Fixation was scored by counting features copied from the example. | Wadinambiarachchi et al., CHI 2024, arXiv 2403.11164 | [V] |
| Code LLMs condition heavily on what is already in context. One potential bug in the context cut CodeGen-2B's pass rate on buggy-HumanEval by more than 50%. Mitigations closed only part of the gap. This is direct evidence that code models follow whatever code you show them, good or bad. | Dinh et al., NeurIPS 2023, arXiv 2306.03438 | [V] |
| In-context learning has a measured "copy bias": models copy answers from the examples instead of learning the pattern. | Ali, Wolf, Titov, Findings of EACL 2026, arXiv 2410.01288 | [S] |
| Few-shot generation leans on the model's built-in knowledge and repeats popular entities. Retrieval that brings in *varied* content raised lexical and semantic diversity compared with 32-shot prompting. | Divekar & Durrett, SynthesizRR, EMNLP 2024, arXiv 2405.10040 | [V] |
| Instruction-tuned models with 3 seed examples produce outputs that are more alike than base-model outputs. | BARE, arXiv 2502.01697 | [S] |
| Anthropic's prompting guide says examples must be "diverse" and should "vary enough that Claude doesn't pick up unintended patterns". It suggests 3–5 examples. | platform.claude.com, prompting best practices | [V] |
| Anthropic's context-engineering post advises "a set of diverse, canonical examples" over long lists of edge cases. It also prefers just-in-time retrieval through tools over preloading context. | anthropic.com/engineering, effective context engineering | [V] |

**What I could not find:** a controlled study of coding agents given a full reference *game*, or a full app, and then asked for a different one. The claim that "a reference game makes games alike" is an inference from the rows above, not a measured result. Our own eval (§5) would be the first measurement.

### 2.2 Homogenization and mode collapse in LLM creative output

| Finding | Source | Label |
|---|---|---|
| Writers given AI story ideas wrote stories rated more creative, with the biggest gains for weaker writers. But those stories were more similar to each other than stories by humans alone. The authors call it a social dilemma: each writer gains, the group loses variety. | Doshi & Hauser, *Science Advances* 2024, arXiv 2312.00506 | [V] (arXiv abstract; journal page blocked) |
| Essays co-written with InstructGPT, but not base GPT-3, were more similar across authors. The drop came from the text the model wrote. The authors link it to RLHF-style tuning. | Padmakumar & He, ICLR 2024, arXiv 2309.05196 | [V] |
| Across 36 participants, ChatGPT users produced ideas that were less distinct from one another. They produced more ideas, in more detail, and felt less ownership. | Anderson, Shah, Kreminski, C&C 2024, arXiv 2402.01536 | [V] |
| RLHF "significantly reduces output diversity" compared with SFT. | Kirk et al., ICLR 2024, arXiv 2310.06452 | [V] |
| "Artificial Hivemind": 26k open queries. Each model repeats itself, and *different* models give strikingly similar answers. Switching model vendor does not buy diversity. | Jiang et al., arXiv 2510.22954 | [V] |
| Mode collapse is traced to "typicality bias": annotators prefer familiar text. Asking the model to list several candidates with probabilities (verbalized sampling) gave 1.6–2.1× the diversity in creative writing, with no loss in quality reported. | Zhang et al., arXiv 2510.01171 | [V] |
| Anthropic says generic "AI slop" UI comes from "distributional convergence": without direction the model samples from the high-probability centre. Its fix is a ~400-token skill. | claude.com blog, "Improving frontend design through skills" (Nov 2025) | [S] (English page didn't render; read the mirror) |
| The current `frontend-design` SKILL.md lists five trait clusters that AI designs fall into. It then asks for a two-pass process: write a design plan, check it against the brief ("work through a similar prompt to see if you arrive somewhere similar"), and revise anything generic before writing code. | `anthropics/skills` @ `dbd4588`, `skills/frontend-design/SKILL.md` (Apache-2.0) | [V] |

**What this means for us:** generic output is the *default*, with or without references. References decide *which* generic centre we get. The fix that works is a written check against the brief, plus generating several options.

### 2.3 Retrieval helps correctness

| Finding | Source | Label |
|---|---|---|
| Retrieving docs before generating code raised CoNaLa pass@1 by 52% relative on CodeT5. | Zhou et al., DocPrompting, ICLR 2023, arXiv 2207.05987 | [V] |
| Iterative retrieval of same-repo code beat in-file completion by more than 10% in every setting. | Zhang et al., RepoCoder, EMNLP 2023, arXiv 2303.12570 | [V] |
| CodeRAG-Bench: high-quality retrieved context gives "notable gains". But retrievers miss useful context when the words don't overlap, and generators gain little when context is long or poorly integrated. | Wang et al., arXiv 2406.14497 | [V] |
| Code models memorize training snippets, often license text included. This is a licensing risk when output is reused. | Yang et al., ICSE 2024, arXiv 2308.09932 | [S] |

**What this means for us:** what pays off is *relevant, short, API-correct* context, like docs and small patterns. B14 already chose this for the engine layer (Phaser official skills, CloudAI three.js). Long whole-game context is the case where CodeRAG-Bench found little gain.

### 2.4 How AI game makers handle templates

| Product | Approach | What it tells us | Label |
|---|---|---|---|
| **Phaser Game Agent** (June 2026) | Builds games from "a library of reusable, capability-named components". "A human plays every new game before its reusable parts get harvested back into that library." Each game's look and feel comes from the user's concept and chosen art style. | The closest match to our plan: mechanic-level parts, not reference games. Verified parts, with themes coming from the user. | [V] |
| **Rosebud AI** | 2D and 3D templates on the homepage, plus "remix" ("Create from here") on any showcase game. Its marketing lists Flappy Bird clones as typical first games. | Full-template remix. Fast, but the result *is* the template with edits. Good for "make me one like this", weak for new ideas. | [S] |
| **Websim** | Remix and fork any project, keeping attribution. Users edit the prompts of an existing project. | Same as Rosebud: forking is the main reuse path. | [S] |
| **Bezi** (Unity) | Indexes the user's own project (scripts, scenes, assets) as context. No reference-game library is described. | Context is *your* game, not someone else's. This matches our `gm assets list` and `gm scope` "reuse your own first" idea. | [S] |
| **Ludo.ai** | Ideation and market tools. "Game Ideator" and "Top Charts Blender" combine elements of existing successful games. Its docs say it does not make playable games. | Uses references on purpose for the *concept*, which is the opposite of what we want for the build. Worth knowing as a scope-chat idea ("like X meets Y") that the user opts into. | [S] |
| **Genie 3 / GameNGen** | World models that generate frames from a prompt or image. No game code. GameNGen is Doom-only. | Not relevant to code-template choices. | [S] |
| **Phaser Editor v5 Cursor starter** | A minimal template that ships with `AGENTS.md` and a Cursor skill. | Practitioner norm: scaffold plus agent instructions, not a sample game. | [S] |
| **Practitioner reports** | "Build Flappy Bird / Pacman / Frogger" prompts mostly replay code the model has seen. Vibe-coded clones of a dev's idea appeared within days. | Models are strongest at the famous clones. Without steering, vague briefs drift toward them. | [S] |

## 3. Design options

Token figures are rough estimates: about 4 characters per token, with skill sizes taken from B14 (awesome-gamedev skills average about 2k tokens).

| # | Option | Quality | Homogenization risk | Speed | Tokens per build | License and ops |
|---|---|---|---|---|---|---|
| A | **Full reference game in context** (one open-source game per genre) | Higher first-build success on that genre. Weak on briefs that don't fit the genre. Old or wrong API habits come along with it. | **High.** Same structure, tunables, mechanics, HUD layout, often names. | Fast for close briefs. Slow when the agent first strips out the reference. | 20k–100k+ | Each game's license (GPL, MIT, none) applies to anything copied. Hard to keep pinned to r186 or Phaser 4.2. |
| B | **Fixed genre template with sample content** (`gm new platformer` ships a hero, coins, slimes) | Good baseline. Every build starts playable. | **High.** Leftover coins, slimes and 3-lives HUDs show up in every game. | Fastest. | Low upfront, but the content leaks into the code. | We own it, so licensing is easy. |
| C | **Scaffold-only template** (boot, SDK hooks, input map, scene loop, grey-box level; no theme or entities) | Removes setup bugs. Gameplay quality then depends on the skills. | Low | Fast | ~2–5k (the files the agent reads) | Ours |
| D | **Pattern cards** (mechanic-level: jump buffer plus coyote time, camera follow with deadzone, inventory grid, wave spawner). Each is TypeScript, about 300–800 tokens, with tuning knobs and "when not to use". | Strong on game feel and correctness for the mechanic. No help with overall design. | Low to medium. Mechanics may still get added unasked, and default values may be left as they are. | Fast | ~0.5–3k (2–4 cards per job) | Ours. Written from open-source code without copying it. |
| E | **Abstracted design notes** (prose: "platformers feel good when…", knob tables) | Helps tuning and design judgment. Some risk of wrong code. | Lowest | Medium | ~0.2–1k per note | Ours |
| F | **Retrieval per request** (`gm docs pattern <q>` returns the 1–3 cards that match the scope) vs **fixed** (always load the genre bundle) | Per request: better relevance, fewer tokens. Risk: the retriever misses a card when the wording differs (CodeRAG-Bench). | Per request is lower, because cards only load when the scope asks for them. | Per request costs one extra tool call. | Per request is lower. | One small index |
| G | **Several diverse references vs one** | Several: the model has to extract the common pattern. | Several is lower than one. One gives a single centre to copy. | Several is slower. | Several costs N× tokens. | — |
| H | **Anti-copy rules plus a "name your defaults" pass** (theme, art, names, palette and mechanics come only from `gm scope`. Before coding, list the defaults you'd reach for and keep only what the brief supports.) | Small cost. The `frontend-design` skill reports it works on UI. | Lowers it in every option | +1 short planning step | ~300–600 | — |
| I | **Several candidates, then pick** (like verbalized sampling: the scope agent offers 3 distinct takes before locking) | Better fit to the user. Belongs to `gm-scope-options`, not the build. | Lowers it most at the WHAT level | One extra chat turn | ~1k | — |

**Read of the table:**
- A and B buy speed at the cost of sameness. A also brings license and API drift.
- C plus D (pattern cards, retrieved per request) plus H gives most of the correctness gain for a small part of the tokens and with low sameness.
- E is folded into the cards, as the "why" and the knob table.
- G matters only if we ever show code from more than one game. If we do, show 2–3 that differ.
- I sits at the scope stage, where the WHAT is decided.

## 4. Rules for pattern cards and templates (if adopted)

1. **One mechanic per card.** Each card has a TS snippet against our SDK (Phaser 4.2 or r186), its tunables exported as data for `gm-editor-tuning`, a "when to use / when not to", and a 3-line test using `advanceTime`.
2. **Themeless.** Use role names (`Player`, `Hazard`, `Pickup`). No art references, no colors, no fiction.
3. **No "obvious extras".** A jump card does not add double-jump. A pickup card does not add a score HUD.
4. **Tunables are required inputs, not silent defaults.** The card says "pick values from the brief's feel words". It gives the range, not one number. This makes card defaults easy to spot later (§5, M5).
5. **Provenance.** If a card is written while reading an open-source game, record the source and license in front matter, as B14 §3 does. Copy no code from no-license or copyleft repos.
6. **`gm new <template>` creates no entities.** It sets up boot, scene, SDK hooks (`render_game_to_text`, `advanceTime`, ready flag), input actions and a grey-box room. The genre skill then pulls the cards the scope needs.
7. **Whole open-source games** live in an internal corpus, outside the sandbox image. They are used to write cards, to mine "common mistakes" lists, and as the leakage corpus in evals.

## 5. Measuring homogenization in our evals

All the checks below are cheap and run after `gm run`. Each is either scripted per run, so it fits skill-creator's `grading.json` with `text/passed/evidence`, or computed per set by a small script next to `aggregate_benchmark`.

### 5.1 Metrics

| ID | Metric | How | Level | Cost |
|---|---|---|---|---|
| M1 | **Reference leakage** | `jscpd` (6.4k stars, MIT) over the game's `src/` against the cards and the internal reference corpus. Report the duplicated-token % and the largest clone. Exclude the `gm new` scaffold by diffing against a fresh scaffold. | Per run (assertion: under X%, e.g. 15%; tune on the first runs) | Seconds |
| M2 | **Cross-brief code similarity** | For N games from *different* briefs, take pairwise jscpd duplicate % or token-shingle Jaccard on non-scaffold code. Report the mean and max. | Per set | Seconds |
| M3 | **Screenshot diversity** | Embed `gm run` frames 60 and 300 with DINOv2 (13.5k stars, Apache-2.0) or CLIP (34.5k stars, MIT). Report the mean pairwise cosine and a Vendi score: the exponential of the entropy of the similarity matrix's eigenvalues (Friedman & Dieng, arXiv 2210.02410 [V]). The Vendi repo has only 169 stars, so reimplement the formula with numpy, which takes about 5 lines. | Per set | About 1 minute on CPU for 20 images |
| M4 | **Mechanics nobody asked for** | Compare the scope's mechanic list with what the game has. Get the game's mechanics from `render_game_to_text()` keys plus a grep checklist (double jump, coins/score, lives counter, dash, wall-jump, health bar, top-left score HUD, title "Game Over"). A grader flags each extra not in the scope. | Per run (assertion: 0 unasked extras from the checklist) | Seconds, plus one grader read |
| M5 | **Card-default fingerprint** | Read the exported tunables (`gm-editor-tuning` data). Count how many equal the example values in the cards (gravity, jump speed, camera lerp). | Per run (assertion: under half) | Seconds |
| M6 | **Brief fidelity** | Brief-specific nouns, colors and names appear in the code, strings or HUD text. Reverse check: no names or strings from the reference corpus. | Per run | Seconds |
| M7 | **Same-brief vs cross-brief ratio** | Run 2 briefs twice each. Cross-brief similarity (M2/M3) should be clearly above same-brief similarity. If the two are close, the briefs are not reaching the output. This is the warning sign. | Per set | Reuses M2 and M3 |
| Q | **Quality guard** | `gm check`, `gm test` and `gm run` green; FPS and `gm perf` budget; a playable-from-input script. | Per run (already planned in `gm-verify`) | — |

Note on M3: frames of a grey-box start screen look alike whatever the skill. Capture frames after scripted input, and compare against the no-skill baseline, not against zero.

### 5.2 Fitting into skill-creator (B14 §5)

- **Brief set.** 10 briefs that spread across the genres, plus 2 near-duplicate briefs for M7. Include at least 3 that fit no template (for example "a cooking rhythm game", "a lighthouse-keeper puzzle"). Store them in `evals/evals.json` as normal prompts.
- **Configs.** Three configs, all run in the same turn, as skill-creator requires:
  - `with_skill`: current cards and templates;
  - `baseline`: no genre skill;
  - optional `full_reference`: one OSS game in context. This config is the evidence for Kevin's question, and needs only one round.
- **Per-run assertions** (scripted): M1, M4, M5, M6 and Q go into `grading.json`.
- **Set metrics.** M2, M3 and M7 go into a `diversity.json` per configuration. A script (around 50 lines) writes one extra table into `benchmark.md` next to pass rate, time and tokens.
- **Ship gate for a skill change:**
  - pass rate not lower than before;
  - M2 and M3 diversity not lower than baseline by more than a set margin;
  - M1 under the threshold.

  Skill-creator's analyst pass already looks for non-discriminating assertions. Use it to drop any metric that never moves.
- **Human check.** Show the M3 contact sheet (`gm shot --sheet` across games) in the eval viewer. A person can spot "these all look alike" in one glance. Skill-creator says subjective quality should be judged by people, not forced into assertions.
- **Cost.** 10 briefs × 2 configs × 1 run = 20 builds per iteration. The metric scripts cost close to nothing next to the builds.

## 6. Recommendation for V1

1. **Don't put whole reference games in build-agent context.** Keep an internal corpus of open-source games for writing cards and for the M1 leakage check. Run the `full_reference` eval config once, so the decision rests on our own data.
2. **Make `gm new` scaffold-only.** The scaffold covers boot, SDK test hooks, the input action map, the scene loop and a grey-box level. It creates no entities, theme or HUD content. This changes B11 §4.7's "genre starter" wording: the genre comes from the skill and its cards, not from the template.
3. **Put pattern cards in each `gm-genre-*` and `gm-input`/`gm-vfx` skill's `references/`.** Retrieve them per request through the existing `gm docs` (`gm docs pattern <topic>`), with no new namespace. Sources follow B14: awesome-gamedev's platformer feel table and majid's game-feel, rewritten into the card format in §4.
4. **Add three rules to `gm-core`, about 300 tokens:**
   - The WHAT comes only from `gm scope`: theme, art, names, palette and mechanics. Cards and templates are HOW.
   - Before coding, write a 5-line plan and list "defaults I'd reach for". Drop or justify each one against the brief. This adapts the `frontend-design` two-pass method; that skill is Apache-2.0, so it can be adapted with notice.
   - Add no mechanic the scope doesn't list. Suggest it in `gm progress` instead.
5. **Spend diversity at scope time.** `gm-scope-options` offers 3 clearly different takes on a vague brief before locking it, in the style of verbalized sampling. Most sameness starts with vague briefs.
6. **Ship the §5 eval with the first genre skill (platformer).** Add M1, M4 and M5 as assertions now. Add M2, M3 and M7 after 10 games exist.

Not recommended for V1:
- A remix-any-game feature (Rosebud and Websim style). It is a product feature, not an agent aid, and belongs in a later product decision.
- Ludo-style "X meets Y" concept blending. If it ever exists, it belongs in the scope chat and only when the user asks.

## 7. Sources

**Papers**
- Wadinambiarachchi et al. "The Effects of Generative AI on Design Fixation and Divergent Thinking." CHI 2024. https://arxiv.org/abs/2403.11164 [V]
- Dinh et al. "Large Language Models of Code Fail at Completing Code with Potential Bugs." NeurIPS 2023. https://arxiv.org/abs/2306.03438 [V]
- Ali, Wolf, Titov. "Mitigating Copy Bias in In-Context Learning through Neuron Pruning." https://arxiv.org/abs/2410.01288 [S]
- Divekar & Durrett. "SynthesizRR." EMNLP 2024. https://arxiv.org/abs/2405.10040 [V]
- "BARE: Leveraging Base Language Models for Few-Shot Synthetic Data Generation." https://arxiv.org/abs/2502.01697 [S]
- Doshi & Hauser. "Generative AI enhances individual creativity but reduces the collective diversity of novel content." *Science Advances* 10, eadn5290 (2024). https://arxiv.org/abs/2312.00506, https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532 [V abstract]
- Padmakumar & He. "Does Writing with Language Models Reduce Content Diversity?" ICLR 2024. https://arxiv.org/abs/2309.05196 [V]
- Anderson, Shah, Kreminski. "Homogenization Effects of Large Language Models on Human Creative Ideation." C&C 2024. https://arxiv.org/abs/2402.01536 [V]
- Kirk et al. "Understanding the Effects of RLHF on LLM Generalisation and Diversity." https://arxiv.org/abs/2310.06452 [V]
- Jiang et al. "Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond)." https://arxiv.org/abs/2510.22954 [V]
- Zhang et al. "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity." https://arxiv.org/abs/2510.01171 [V]
- Zhou et al. "DocPrompting: Generating Code by Retrieving the Docs." ICLR 2023. https://arxiv.org/abs/2207.05987 [V]
- Zhang et al. "RepoCoder." EMNLP 2023. https://arxiv.org/abs/2303.12570 [V]
- Wang et al. "CodeRAG-Bench: Can Retrieval Augment Code Generation?" https://arxiv.org/abs/2406.14497 [V]
- Yang et al. "Unveiling Memorization in Code Models." ICSE 2024. https://arxiv.org/abs/2308.09932 [S]
- Friedman & Dieng. "The Vendi Score." https://arxiv.org/abs/2210.02410 [V]
- Shaib et al. "Standardizing the Measurement of Text Diversity." https://arxiv.org/abs/2403.00553 [V]. Useful if we ever compare design-plan text: compression ratio is a cheap proxy for repetition.
- Wang et al. "Self-Instruct." https://arxiv.org/abs/2212.10560 [V]. A precedent for a cheap similarity gate: new items are kept only if their ROUGE-L against every existing item is below 0.7.
- Faldor, Zhang, Cully, Clune. "OMNI-EPIC." https://arxiv.org/abs/2405.15568 [V]. Uses retrieved similar archive tasks as "stepping stones", asks for something "distinct from those already discovered", and then a model of interestingness discards near-repeats. This is the same retrieve-then-check-novelty shape we propose.
- Todd et al. "GAVEL: Generating Games via Evolution and Language Models." NeurIPS 2024. https://arxiv.org/abs/2407.09388 [S]. Uses quality-diversity (MAP-Elites) over game mechanics, which shows that game diversity can be measured over mechanics.

**Vendor and practitioner**
- Anthropic, prompting best practices (examples must be diverse). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices [V]
- Anthropic, "Effective context engineering for AI agents." https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents [V]
- Anthropic, "Improving frontend design through skills." https://claude.com/blog/improving-frontend-design-through-skills [S]
- `anthropics/skills` `skills/frontend-design/SKILL.md` and `skills/skill-creator/SKILL.md` @ `dbd4588f9e10`. https://github.com/anthropics/skills [V]
- Phaser Game Agent announcement. https://phaser.io/news/2026/06/phaser-game-agent [V]
- Phaser Editor v5 beta, and the Cursor starter template. https://phaser.io/news/2026/02/phaser-editor-v5-beta, https://github.com/phaserjs/editor-starter-template-cursor-javascript [S]
- Rosebud AI. https://rosebud.ai/g/3d, https://lab.rosebud.ai/blog/how-does-vibe-coding-work-for-games [S]
- Websim (secondary coverage). https://www.tomsguide.com/ai/meet-websim-the-ai-playground-that-lets-you-make-anything-you-can-imagine-in-seconds [S]
- Bezi. https://discussions.unity.com/t/released-bezi-ai-powered-game-development-assistant-for-unity/1708451 [S]
- Ludo.ai docs. https://ludo.ai/docs [S]
- Genie 3 and GameNGen coverage. https://heise.de/-10511028 [S]
- Processing forum on AI-built games. https://discourse.processing.org/t/games-built-using-ai-and-the-processing-api/46649 [S]
- Boing Boing, "Terrible games made with AI" (2026-10-12). https://boingboing.net/2026/10/12/terrible-games-made-with-ai.html [S]

**Tools (stars from `gh api`, 2026-10-24)**
- jscpd: https://github.com/kucherenko/jscpd (6.4k stars, MIT)
- DINOv2: https://github.com/facebookresearch/dinov2 (13.5k stars, Apache-2.0)
- CLIP: https://github.com/openai/CLIP (34.5k stars, MIT)
- Vendi-Score: https://github.com/vertaix/Vendi-Score (169 stars, MIT). Under the 1k-star rule, so reimplement the formula instead of depending on it.
- Dolos: https://github.com/dodona-edu/dolos (355 stars). Also under the rule. jscpd covers the same need.
