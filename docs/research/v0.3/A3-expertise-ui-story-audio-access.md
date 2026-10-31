# A3 — Expertise spike: UI, story/narrative/dialogue, music/audio, child accessibility

**Areas:** S02 visual/UI design · S03 storytelling · S12 narrative design · S13 dialogue · S05 music and audio · S09 player accessibility (children aged 5 and 7)
**Spec basis:** v0.3 §1.2, §5.10, §5.11, §6, §11.1, §11.2, §12; R03, R18
**Access date for all sources:** 2026-10-21 (GitHub numbers come from `gh api repos/...` on that date)
**Out of scope here:** whether vendors allow use by children, retention terms, and COPPA (legal agent); gameplay, feel, levels and art (other agents); Claude-Code-Game-Studios (repo-mining agent).

Status labels used below: **[V]** checked against a primary source this session · **[U]** not verified · **[K]** canonical practice cited from background knowledge, not re-fetched this session.

> **Version scope (2026-10-25):** UI, story, narrative, dialogue, audio, `SpokenText` read-along and the WCAG/Game Accessibility Guidelines/XAG baseline are **V1**. Child-specific guidance (NN/g age bands, 64 px child targets, reading-grade and words-per-beat limits for ages 5–7, age profiles, child testers) is **V3** and tagged inline. Nothing here is V2-specific.
> The kid-first framing is superseded: V1 is for adult creators and players (18+). A kid-friendly presentation is a V3 parental-controls setting (B10). Where advice for kids still helps beginners, it now says "beginners".
> Superseded in part: voice providers, narration and highlighting by **B2** (ElevenLabs first, OpenAI second, Kokoro until approval); music and SFX tooling by **B5** (code-composed audio and free packs; no GPU server, so ACE-Step is off); touch input by **B7**; skill sourcing (`gm-audio`, `gm-dialogue-narration`) by **B14**.
> Canonical scope: `docs/spec/release-plan.md`.

---

## 0. Bottom line

1. **Of the six areas, only UI design has established skills with more than 1k stars.** Storytelling, narrative, dialogue, music and child accessibility have no skill above the ≥1k-star bar that fits a beginner-friendly web game. The gamedev pack (`awesome-gamedev-agent-skills`) has solid engine-neutral `audio-design`, `dialogue-systems` and `game-ui-ux` skills, but their code examples are Godot/Unity. **Adapt these; do not adopt them as they are.** Most of the value in these areas will come from **four custom skills** built on canonical guidelines (§7).
2. **Read-along word highlighting is solved through server-side timing data, not through the browser.** Azure, Amazon Polly, ElevenLabs and Cartesia return word or character timings [V]. Google returns timings only for SSML `<mark>` tags [V]. OpenAI TTS returns none (forum evidence only, not an official statement) [V/U]. Browser `speechSynthesis` boundary events are not reliable enough to be the main path on iPad: support depends on the voice, `charLength` was historically missing in Safari, and Android fires no events [V for Android and old Safari; **current iPadOS behavior is unverified, so test on a device**]. Make one platform data type, `SpokenText`: text plus audio plus word timings. Every speech path, including cached RPG dialogue, produces it.
3. **For narrative state, use a small typed fact store with storylets and quests in the Engine SDK, not Yarn Spinner.** Yarn Spinner has no maintained JS/TS runtime [V]. inkjs is MIT and maintained, but has 659 stars (an exception to the 1k rule) and is optional for dialogue-heavy RPGs. Continuity after updates comes from stable IDs, retired (never reused) facts, and a deterministic reachability/continuity validator.
4. **Music:** Tone.js (MIT), Tonal (MIT) and VCSL (CC0) are confirmed [V]. ACE-Step 1.5 code and weights are MIT [V], but it needs a GPU and Python, so it is build-time only and off the live path. BeepBox (MIT, 1.2k stars) stays optional. Do not use **smplr** (328 stars, and it loads remote sample sets by default [K]). Use `Tone.Sampler` with self-hosted VCSL instead. For SFX use ZzFX (MIT, 806 stars, an exception) or jsfxr (Unlicense).

---

## 1. Established skills: verified and quality-judged

| Repo (commit read) | Stars / last push / license | What I read | Quality verdict | Recommendation |
|---|---|---|---|---|
| anthropics/skills `frontend-design` (dbd4588f9e) | 182,793 / 2026-10-09 / no SPDX at repo level (per-skill license file) | The full SKILL.md, ~1.5k words (≈2k tokens) | Strong on aesthetic direction and a quality floor (responsive, focus, reduced motion). Says nothing about children, touch sizes, or low reading. | **Reuse** for platform UI work (HUD, editor shell). Pair it with the custom beginner-UX skill. |
| pbakaus/impeccable v4.7.0 (e132b1e7a8) | 84,495 / 2026-10-22 / Apache-2.0 | SKILL.md (1.6k words) plus its command table | The most complete design-workflow skill found: modes ("Operate" fits the editor), `critique`, `audit`, `onboard`, `clarify`, `adapt`. **Risk: its setup runs a launcher that downloads a self-contained binary on first run.** That is a supply-chain item for review, and it adds more token weight for each command reference. | **Adapt for platform-team use only** (`critique` and `audit` on HUD and editor PRs). Do not load it into per-game agents. Pin a commit and vendor it. Do not let the binary auto-download in CI without review. |
| nextlevelbuilder/ui-ux-pro-max-skill (623a9a9037) | 138,536 / 2026-10-21 / MIT | SKILL.md (2.1k words) | A good priority table (accessibility, then touch, then performance). Touch minimum 44×44 px with 8 px spacing. Depends on a Python search script and a large style database aimed at web/marketing products. | **Reference only.** Lift its priority ordering into our rubric. Don't load it. |
| vercel-labs/agent-skills `web-design-guidelines` (063bee94c3) | 32,779 / 2026-10-14 / none at repo level; guidelines repo is MIT (1,026 stars) | The whole SKILL.md | Small (≈250 tokens), but **it fetches the rules from a mutable `main` URL on every run**: unpinned remote instructions. | **Adapt.** Vendor `web-interface-guidelines` at a pinned commit and use it as a lint-style reviewer for platform UI. |
| gamedev-skills/awesome-gamedev-agent-skills (0a70cfc646) | 2,600 / 2026-10-09 / Apache-2.0 | `audio-design`, `dialogue-systems`, `game-ui-ux`, `save-systems`, genres `visual-novel` and `rpg` (≈1k words each, ≈1.4k tokens) | Correct, engine-neutral principles: buses in dB, ducking, vertical and horizontal adaptive music, a dialogue graph with line IDs, branch-walk validation, a screen stack, event-driven HUD, safe areas, and focus navigation. Examples are GDScript/Unity. Nothing for children. | **Adapt** into TypeScript versions (Tone.js buses, a Phaser 4 / DOM HUD). Keep the attribution (Apache-2.0 NOTICE). |
| plugin87/ux-ui-agent-skills `a11y-audit`, `ux-writing` (55156b40e3) | 2,738 / 2026-10-20 / MIT | Both SKILL.md files | Thin. Both depend on kit files that are missing unless the kit is installed. The "what → why → how" error formula is useful. | **Reject as a dependency.** Borrow the copy formulas. |
| Story and dialogue skills (searched) | danjdewhurst/story-skills 338 ⭐ MIT; zenstory-ai/drama-skills 3,193 ⭐ MIT (Chinese micro-drama); the rest below 100 | story-skills README | story-skills has a good **continuity-checker idea** (dead character reappears, payoff before setup, question resolved before it is asked). Everything else is novel or screenplay tooling. | **Below the bar: borrow the continuity-check pattern only.** Build a custom skill. |
| Music or child-accessibility skills (searched) | None above 10 stars | — | — | **Build a custom skill.** |

**Token footprint (≈1.35 tokens per word):** frontend-design ≈2k; impeccable core ≈2.2k plus 1–4k for each command reference; each gamedev skill ≈1.4k, plus references when they are pulled in; ui-ux-pro-max ≈2.9k plus search output.

---

## 2. Transferable canonical expertise

### S09 Accessibility for young children (drives the requirements for S02 and S13)

*Child-specific items in this subsection (NN/g age bands, 64 px child targets) are V3. The WCAG, Game Accessibility Guidelines and XAG items apply in V1.*

- **(V3)** **NN/g, "Children (Ages 3–12) on the Web"** (Sherwin and Nielsen, article dated 2019-01-13, 156 guidelines) [V]. Design for **narrow age bands: 3–5, 6–8, 9–12**. The two first users fall in different bands, and content a band too young reads as "for babies". Young children don't read, or read tentatively. Suggested font size is 14 pt for young children. **Redundant navigation is "very confusing" for children.** They ignore the browser Back button but use a prominent Back button inside the app. They avoid scrolling. They cannot tell ads from content. The article gives no touch-target figure.
- **WCAG 2.2:** SC 2.5.8 sets a **24×24 CSS px** minimum at level AA, with spacing, equivalent, inline, user-agent and essential exceptions [V]. SC 2.5.5 sets 44×44 at level AAA [K]. Apple HIG says 44 pt [K]. Material says 48 dp [K]. **Proposal (Kevin decides, §10):** 44 px minimum on the platform; **at least 64 px for primary child-facing play and HUD controls (V3)**, with 8 px or more spacing. The 64 px figure is a design heuristic, not a cited standard [U]. Also follow SC 2.5.7 (alternatives to dragging) and do not rely on hover, because iPad has none [K].
- **Game Accessibility Guidelines** [V]. Basic tier: simple, clear language and formatting; large, well-spaced interactive elements; interactive tutorials; adjustable game speed; **separate volume controls for effects, speech and music**; no flicker. Intermediate: reinforce essential text with visuals and/or speech; remind players of objectives and controls; contextual help; practice without failure; a visual cue for who is speaking; alternatives to holding buttons. Advanced: **pre-recorded voiceover for all text, including menus**; replay of all narrative and instructions; **subtitle pacing suited to the target age group (words per minute)**; precise timing never essential.
- **Xbox Accessibility Guidelines v3.2 (2023-06-08), XAG 104 Subtitles and captions** [V]. Subtitles on by default or before any sound plays. **No more than 40 characters per line and no more than two lines.** Break lines by hand. Mixed case and a sans-serif option. Name the speaker when the speaker changes. A configurable solid background with 0–100 % opacity. Scale up to at least 200 %. A live preview. Separate toggles for dialogue, barks and ambient captions. XAG 101 (text display) sets the minimum size [K].

### S03 / S12 / S13 Story, narrative and dialogue
- **Emily Short, "Beyond Branching: quality-based, salience-based, and waypoint narrative structures" (2016)** [V for existence and definitions], plus her later "storylets" essays [K]. A storylet is a piece of content with preconditions on world state. **Quality-based:** the player picks among the storylets that are currently legal. **Salience-based:** the system picks the most applicable one. For agent-generated games, storylets have two advantages: they compose under later additions (new content doesn't rewire a branch tree), and they validate cheaply.
- **Ink** (inkle/ink: MIT, 4,985 ⭐, pushed 2026-05-05) and **inkjs 2.4.0** (MIT, 659 ⭐, 2026-02-17) [V]. Prose-first. Tracks visit counts for free. Writers and LLMs produce it compactly. **Yarn Spinner** (MIT, 2,857 ⭐) is C#, with Unity, Godot and Rust ports, and **no official JS runtime**. The only JS runtimes are community ports `bondage.js` (62 ⭐) and `yarn-bound` (35 ⭐) [V]. Take Yarn's line IDs and `Speaker:` convention; skip the runtime.
- Ideas from the gamedev `dialogue-systems` skill [V]: line IDs, not literal strings. Keep variables separate from flow. Every node must end or branch. Apply `set` effects on the transition so they are not applied twice.
- **(V3)** Story craft for young audiences [K]: one clear want per character; concrete, visible stakes; a strong pattern of setup and payoff (rule of three); jokes that land without irony. Children aged 5–7 often read sarcasm literally, so avoid it in essential lines [U as a quantified claim].

### S05 Music and audio
- **Practice [K]:** Koji Kondo's approach of short memorable motifs fitted to the rhythm of play; loops that reward repetition. Vertical layering (stems by intensity) versus horizontal re-sequencing (segment swaps on bar boundaries). Stingers for win, lose and pickup. Duck music under speech. Vary pitch and choose among samples so repeated SFX don't sound mechanical. The gamedev `audio-design` skill encodes all of this correctly, including mixing in dB and a loudness target of about −14 to −16 LUFS [V as skill content; the LUFS target is industry practice, not a standard].
- **Speech intelligibility [K/U]:** keep the voice bus clearly louder than music. Duck music by about 10–15 dB with a fast attack (≈10 ms) and a slow release (300–500 ms). Avoid busy melodies in the vocal range under speech. These numbers are heuristics to tune by ear.

---

## 3. Synchronized word highlighting (technical finding)

| Source | Timing granularity | Notes |
|---|---|---|
| **Azure Speech** (`microsoft-cognitiveservices-speech-sdk` 1.53.0, MIT SDK) | **Word, punctuation and sentence boundaries:** `AudioOffset` (100 ns ticks), `Duration`, `TextOffset`, `WordLength` [V] | Events arrive faster than playback, so you must resync to the audio clock [V]. Browser support for the JS SDK is not confirmed by that page [U]. Run it server-side and ship the timings. |
| **Amazon Polly speech marks** | word, sentence, viseme, ssml [V] | Neural, long-form and standard engines only. **The generative engine is not listed** [V]. A separate request returns the marks. |
| **ElevenLabs** `/with-timestamps` (`@elevenlabs/elevenlabs-js` 2.74.0) | **Character level:** `alignment` and `normalized_alignment` [V]. A streaming variant (`/stream/with-timestamps`) is reported by SDK docs [U on the official page]. | Aggregate characters into words yourself. `normalized_alignment` handles spelled-out numbers. |
| **Cartesia** WebSocket `add_timestamps` (`@cartesia/cartesia-js` 4.2.0) | **Word level** (`words`, `start`, `end`), plus phoneme timestamps [V via docs search] | Pipecat already aligns text to audio with these timings. |
| **Google Cloud TTS** v1beta1 | Only `<mark>` tags in SSML (`SSML_MARK`) [V] | You can insert a mark before every word yourself. Which voices support this is not documented [U]. |
| **OpenAI TTS** (`gpt-4o-mini-tts`, `tts-1`) | **None** [V forum and absence of a field; not an official statement] | The workaround is to transcribe the output again for word timings, which adds cost and latency. |
| **Kokoro-82M** (hexgrad/kokoro, Apache-2.0, 9,572 ⭐; `kokoro-js` 1.2.1) | The Python `KPipeline` exposes per-token `start_ts`/`end_ts` (seen in third-party code) [U]. Not established for `kokoro-js` [U]. | A free, self-hostable option. Its voice quality for children is untested. |
| **Forced alignment** (WhisperX BSD-2, 24,764 ⭐; aeneas AGPL-3.0) | Word level for any audio | Python, preferably on a GPU. Build-time fallback only. The licenses of WhisperX's alignment models vary [U]. **Avoid aeneas (AGPL).** |
| **Browser `speechSynthesis`** | `boundary` events with `charIndex`; `charLength` historically missing on Safari; **none on Android Chrome/Firefox** [V, older sources]. Current iPadOS behavior is **unverified** and depends on the voice. `speak()` on iOS must come from a user gesture [V]. | Its audio cannot be routed through Web Audio (no ducking, no bus volume), and voices differ per device [K]. **Use it only as the free/offline fallback.** Feature-detect at runtime: if no `boundary` event arrives within about 500 ms of `start`, fall back to sentence-level highlighting. |

**Recommended design (an R03 input):**
- A platform type `SpokenText { id, text, lang, voiceId, provider, audioUrl, words: {text, charStart, charEnd, t0, t1}[], costMicros, cacheKey }`.
- `cacheKey = hash(normalizedText + voiceId + model + providerVersion)`.
- Pre-render game dialogue at build time. Helper speech is created per request. **Every path normalizes to `words[]`.**
- The renderer drives highlighting from `audio.currentTime` (or `AudioContext.currentTime`) inside `requestAnimationFrame`, never `setTimeout`.
- Draw highlights with the CSS Custom Highlight API where it is available, and fall back to one span per word. Safari support version is [U].
- Follow read-along practice: tap a word to hear that word (play `t0..t1`); show the whole caption before audio starts; offer slower playback (≈0.85×) for beginners (originally for the 5-year-old; V3).
- This also covers "always show the text" (§5.10): text comes first and audio is an enhancement.

---

## 4. Narrative state model and continuity after updates (S12)

Proposal for the Engine SDK (R01 and R09 input; status Proposed):

- **Fact store:** typed, namespaced facts (`bool | int | enum | string-id`), declared with Zod in a `narrative.schema.ts`. Each fact has a stable ID, a default value, and `introducedIn` / `retiredIn` versions. **IDs are never reused.** A deleted fact is retired, so old saves still load. Facts are stored in the save slot alongside the bounded migrations from §5.16.
- **Quests:** declarative objectives over facts: `{id, title, iconId, steps: [{id, done: FactExpr, hint: LineId}], reward}`. The HUD's quest list is drawn by the **platform** (§5.11), not by each game, so every game gets read-aloud and icons.
- **Storylets and dialogue:** units with `when: FactExpr`, `lines: LineId[]` and `effects`. Dialogue is either an SDK JSON graph (the default; the editor can edit it) or inkjs for prose-heavy RPGs. When inkjs is used, mirror ink variables into the fact store so saves and the editor see a single state.
- **Continuity validator** (deterministic, runs in CI, no LLM):
  - (a) Every quest is completable: search over fact effects from the initial state and every *migrated* save fixture.
  - (b) No dead-end dialogue nodes.
  - (c) No reference to a retired or undeclared fact, line, or character.
  - (d) Setup comes before payoff: a line that references a fact must be reachable only after that fact can be set. This is the story-skills idea.
  - (e) A diff report: "this update makes quest X unreachable for saves past step 2".
  - The validator also feeds the "promises as tests" learning idea from §6.3.
- **Player help within the rules (§6.2):** hints are `LineId`s attached to quest steps, so in-game help can only point at existing mechanics.

---

## 5. Audio pipeline (S05; §12.3 input)

- **Composition as data:** the agent writes a `song.json`: key, mode, tempo, bars per section, motifs (Tonal for scale, chord and range checks), instrument IDs, intensity layers 0–3, transitions quantized to the bar, and stingers. A small TypeScript player maps this onto **Tone.js** (Transport, Part, Sampler).
  - Pin Tone carefully: npm `latest` is 15.1.22 (2025-04-27) and `next` is 15.5.58 [V], while the repo was pushed 2026-10-21. Decide which to pin after a short compatibility check.
  - Instruments: **self-hosted VCSL** (CC0 at repo level [V]; per-sample provenance [U]). Keep only a curated subset of a few MB, encoded to Opus or AAC (iOS).
  - **SFX:** ZzFX (MIT, 806 ⭐, 1.4.0, an exception: tiny and parameter-as-data, so ideal for agents), then the Kenney CC0 packs, then generated SFX (legal agent's call).
- **Buses:** Master ← {Music, SFX, Voice, UI}. The platform settings sliders control these buses (Game Accessibility Guidelines basic tier). Duck Music automatically whenever Voice plays `SpokenText`.
- **iOS:** resume the `AudioContext` on the first gesture. The ringer/silent switch can mute Web Audio; Safari's `navigator.audioSession.type = 'playback'` may address this [U: check the version and behavior on a device].
- **ACE-Step 1.5** (MIT code and weights, model card claims licensed or royalty-free training data [V as claim]): needs about 4 GB VRAM or more plus Python. Railway has no GPU [K]. Treat it as an **optional offline build-time generator for title or ambient tracks** behind an approval step. Never put it on the live path.
- **BeepBox** (MIT, 4.2.0 from 2024): only if a chiptune genre needs its format. Otherwise Tone.js with square and triangle synths covers it.
- **Howler** (MIT, 25k ⭐, last npm release 2023): unnecessary if Tone owns audio. Use it only for plain one-shot playback, for example in the platform shell.

---

## 6. Quality rubrics and bounded evaluation (no paid benchmarks)

Each rubric scores pass/fail on deterministic items and 1–4 on judged items. "Fixture" means a checked-in sample game state.

**S02 UI (HUD, editor, onboarding)**
- Automated:
  - Playwright at 1366×768, 1024×1366 (iPad portrait), 1366×1024 and 390×844.
  - axe-core (MPL-2.0, 7,683 ⭐).
  - A script that checks every interactive element's box against ≥44 px, and ≥64 px for elements tagged `child-primary` (V3).
  - No text below 16 px in the HUD.
  - Every icon button has a label and a spoken label.
  - No hover-only affordances.
  - Screenshots are diffed against goldens.
- Judged, using impeccable `critique` or a vendored guidelines checklist:
  - Hierarchy: one primary action per screen.
  - The edit toggle is prominent but cannot be hit by accident.
  - Back is always present.
  - Each screen works with the text hidden (the "squint plus no-reading" test).
- Human: a first-time player (V1: an adult; the 5-year-old: V3) completes "start a game → pause → resume → find achievements" without help. Three tries, record time and taps.

**S03 Story**
- Judged, LLM with the rubric plus Kevin:
  - The creator's own drawn or spoken ideas appear by name: count how many creator-supplied elements survive into the brief.
  - A clear want and stakes.
  - Setup and payoff.
  - Tone fits the audience.
  - Total player-facing words stay within budget.
- Method: three fixed briefs (EarthBound-like RPG, a racer, a pet game). Compare an output with the custom skill against one without it, blind to Kevin. This answers the §11.2 demand to show that skills improve output.

**S12 Narrative**
- The continuity validator (§4) is the gate.
- Quest-reachability tests run against save fixtures from versions N−1 and N−2.
- Judged: are choices meaningful, i.e. does at least one later line or state differ?

**S13 Dialogue**
- Deterministic:
  - At most 40 characters per line and at most 2 lines per beat.
  - **(V3)** At most about 12 words per beat in play aimed at ages 5–7 [U heuristic].
  - **(V3)** Flesch-Kincaid grade of 2 or below for child-tagged games [U threshold].
  - Speaker named on change; every line has a `LineId`.
  - At most 3 choices, each with an icon.
  - Words per minute of the rendered audio are within a band (V1: one default band; per age profile: V3).
- Spoken check: render with TTS, re-transcribe with a free local tool, and flag lines whose transcript diverges (homographs, mispronounced names).

**S05 Audio**
- Offline render with `Tone.Offline` to WAV, then measure:
  - integrated LUFS and true peak below −1 dBTP (ffmpeg `ebur128`; ffmpeg runs only in CI);
  - loop-seam discontinuity (sample jump at the loop point);
  - transition events that land on bar boundaries (from scheduler logs);
  - voice-over-music level difference during ducking;
  - motif range within the instrument's range (Tonal).
- Human: a 30-second listen per state, thumbs up or down from Kevin (the children: V3); fatigue checked after 5 minutes of looping.

**S09 Accessibility**
- A checklist derived from the Game Accessibility Guidelines basic and intermediate tiers plus XAG 104 and WCAG 2.2 AA, applied per platform surface. The platform owns most items, so each game inherits them.
- Device test script on a real iPad:
  - read-along highlight drift: under 150 ms target [U heuristic];
  - mic permission flow;
  - silent-switch audio;
  - 200 % caption scale;
  - reduced motion.

Total cost: CI minutes plus a few dollars of TTS for fixtures, run once and cached. Cap it at **$10 per evaluation round** (proposal).

---

## 7. Custom skills to build, and selective loading

| Custom skill | Contents (built from) | Est. tokens | Loaded by |
|---|---|---|---|
| `gm-child-ux` (V1 as a beginner-UX skill; age bands and child targets: V3) | Age bands, targets, low-reading patterns (icon + label + speaker button), no redundant navigation, Back button, onboarding by doing, editor vs. HUD separation; WCAG, NN/g, Game Accessibility Guidelines, XAG | ≈2.5k | Platform UI work; per-game agents only when they build game-specific UI |
| `gm-story-brief` | A story brief built from the creator's input (preserve named ideas verbatim), want/stakes/payoff, word budget, tone per audience profile | ≈1.5k | The design specialist during narrowing (§5.4) |
| `gm-narrative-dialogue` | The SDK fact/quest/storylet schema, line rules (40 characters, 2 lines, speaker), choice rules, voiceability, hint authoring within the rules, migration and retire rules | ≈2.5k | RPG, adventure and visual-novel builds and later edits that touch content |
| `gm-audio` | song.json schema, bus layout, ducking, adaptive layers, stingers, SFX via ZzFX, iOS unlock, the evaluation script (adapted from the gamedev `audio-design` skill) | ≈2k | Any build that adds or changes audio |

**Loading rule:**
- The aiur specialist selector attaches skills by **tagged task type** (`ui`, `story`, `dialogue`, `audio`), never all of them.
- The rubrics live in separate `references/*.md` files, which only the reviewer or evaluation agent loads.
- Third-party skills (frontend-design, the gamedev pack, impeccable) are vendored at pinned commits with their licenses. Nothing fetches remote instructions at runtime.
- Approximate worst case for a dialogue-heavy RPG build: about 7k tokens of skills, versus more than 20k if everything were loaded.

---

## 8. Stack integration notes

- **Platform UI (HUD and editor shell):** DOM/CSS over the canvas, not Phaser UI, so axe, Playwright, the screen reader, CSS highlighting and text scaling all work. Both Phaser 4.2.1 and Three.js 0.186.1 [V npm] games render underneath.
- **The SDK exposes** `sdk.speak(SpokenText | LineId)`, `sdk.audio.bus(name)`, `sdk.narrative.facts`, `sdk.quests` and `sdk.captions`. Games call these and never reimplement captions or highlighting.
- **The voice package (R03)** owns the provider adapters that normalize timings into `words[]`.

## 9. Licensing and data questions (handed to the legal agent and Kevin)

- Do the VCSL per-instrument origins match the repo-level CC0 claim? [U]
- Which models does the WhisperX alignment use, and under which licenses? [U]
- ACE-Step: is MIT for the weights acceptable, and is the "licensed data" claim enough for a family product? (Legal agent.)
- TTS: are caching and re-serving rendered audio allowed under each provider's terms? (Legal agent.)
- Children's voice recordings must never be sent to new vendors during evaluation. Use only Kevin's or synthetic audio.
- The repo-level LICENSE is missing for anthropics/skills, vercel-labs/agent-skills and tonaljs/tonal. tonal's package.json says MIT [V]. Check the per-skill licenses before vendoring.

## 10. Next steps
1. **iPad device spike, half a day, no vendor cost.** Test `speechSynthesis` boundary events per voice, plus audioSession and the silent switch. Measure highlight drift with one pre-rendered Polly or Azure sample made from Kevin's text.
2. Prototype `SpokenText` with a single provider adapter and the highlight renderer. Add tap-to-hear-a-word.
3. Draft the SDK narrative schema and the continuity validator, using the EarthBound-style RPG as the fixture.
4. Write the four custom skills. Run the with-versus-without comparison on three briefs (§6).
5. Pin Tone.js (15.1.22 vs 15.5.x next) after a compatibility check; curate a VCSL subset.

## 11. Decisions for Kevin
1. **(V3)** **Child touch-target floor:** keep 44 px across the platform, or raise child-primary play/HUD controls to about 64 px (bigger and safer for a 5-year-old, but it uses more screen on phones)?
2. **(V3)** **Age profiles:** (V1 uses one adult-default rule set with read-along available.) Should a game (or the player) carry an audience profile ("5–7", "8–12", "all ages") that tightens text and words-per-minute limits, or should one adult-default rule set apply with read-along always on?
3. **Read-along default:** auto-play narration of every new text (for the youngest profile: V3), or only when the speaker button is tapped?
4. **Dialogue engine:** SDK JSON graph only for MVP (simplest, editable in the editor), or also allow inkjs for prose-heavy RPGs (better writing ergonomics, but it is an exception to the 1k-star rule)?
5. **Free fallback voice:** accept browser `speechSynthesis` with only sentence-level highlighting when offline or over budget, or always use paid pre-rendered speech for highlighted text?
6. **ACE-Step:** keep it as an optional offline generator (needs a GPU host outside Railway), or drop generated music from MVP and use Tone.js composition only?
