# Uncle Kevin's Game Maker 2000: Product Spec (draft v0.1)

Draft of 21 October 2026, written by Claude from Kevin's notes and a day of research. Kevin owns every decision in it.

> **Version scope (2026-10-25):** this is a historical draft. Its kid-first and child-in-V1 scope is superseded. The current V1/V2/V3 split is in `release-plan.md`: V1 (MVP) is adults only (18+); teens are V2 (working); child accounts, parental controls and COPPA work are V3. Owner decisions since then are in `game-maker-2000-v0.5-decisions.md`.

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

## 1. Summary

A website where kids describe a video game, mostly by talking, and AI coding agents build it. The game is playable in minutes on any phone, tablet or computer. It's like Super Mario Maker: kids flip between playing and editing instantly, tweak their game with knobs and switches while agents build new parts in the background, play with family on the couch or online, and along the way learn how game design and software engineering work.

The first users are Kevin's nephew (7) and niece (5).

## 2. Goals and non-goals

**Goals (Decided)**
- Kids turn ideas into playable games quickly, and the first version is close to what they imagined.
- Games look and feel good: great design and graphics in stylized looks (pixel, low poly, toon), never generic.
- Every game plays on every device.
- Kids **learn game design and software engineering**, and get excited about both. This is a core goal, not a side effect.
- Kids **improve games over time** rather than generating throwaway ones.
- Token cost is controlled from day one, because Kevin pays for usage.
- Safe for young children: private by default, parent-controlled.

**Non-goals (Decided)**
- No realistic graphics, which cost too many tokens.
- No desktop game engines (Godot, Unity, Unreal) and no desktop-only tools in the live pipeline.
- No adult themes, ever, whatever the parent settings.
- Not a public social network: no open chat and no strangers.

## 3. Constraints and principles

- **Web-first (Decided).** Games are small web apps (hackathon or "vibe-coded" style). 3D uses Three.js. 2D uses Phaser 4, with KAPLAY or LittleJS for very simple games.
- **Established tools only (Decided).** Open-source dependencies need at least about 1,000 GitHub stars and active maintenance. Commercial services must be established companies. Exceptions are case by case. One pending: `smplr`, the best sampled-instrument library, has about 330 stars.
- **Art styles (Decided):** pixel art, low poly, toon and cel-shaded, plus the wizard's list below. No realism.
- **Private now, open source later (Decided).** The platform repo starts private. Household data and kids' games stay private forever.
- **Hard separation between platform and games (Decided).** See Section 9.
- **Bring your own agent (Decided).** An admin can plug in their own AI subscription or API key, using any provider aiur supports.

## 4. Users and roles

| Role | Who | Can do |
|---|---|---|
| **Platform owner / maintainer** | Kevin, plus anyone he adds | Everything, including prompting agents that can change the Game Maker platform itself |
| **Household admin** | A parent | Set up the household and kid profiles, parental controls, budgets, sharing, the AI provider and key. Cannot change the platform (Proposed: keep this separate from the maintainer role) |
| **Player** | A kid profile in a household | Play, create and edit games, within the admin's settings |
| **Guest** | A friend with a join code | Join a multiplayer game room only. No account, no creating, no chat |

**Auth (Decided in principle).** Normal web accounts, gatekept: sharing a URL must not let friends create games. Creation requires a signed-in household. Multiplayer play is open to guests through expiring join codes.
- **Proposed:** household accounts like Netflix profiles. The admin signs in with a passkey or email. Kids pick their avatar plus a picture PIN on a device the admin has signed in, so kids never have their own email or password.
- **Proposed:** no public sign-up. Households join by invite.
- **Proposed library:** Better Auth, self-hosted (organizations, roles, passkeys).

## 5. The experience

### 5.1 Home
Two big choices: **Play** a game, or **Make** a new one.

### 5.2 Play: the game wall
A scrolling wall of game tiles. Each tile plays a short looping clip of real gameplay, so kids see what a game is like before opening it.
- **Proposed:** clips are recorded automatically during the robot playtest of each build (Section 7.3), as short muted looping videos rather than GIFs, which are smaller and smoother.
- Which games each kid sees depends on household sharing settings.

### 5.3 Make: the create flow
A series of picture-first questions, spoken aloud for kids who can't read yet, plus an open "just tell me your idea" path by voice or drawing.

**Art (pick 1, Decided).** Each option should come with a note on difficulty:

| Option | What it means in practice | Build difficulty |
|---|---|---|
| 8-bit | NES-style pixel art, tiny palette | Easy |
| 16-bit | Richer pixel art, layered backgrounds | Easy |
| 32-bit | **Open:** GBA-style sprites or PS1-style wobbly low-poly 3D? | Medium |
| 64-voxel | Minecraft-like blocks | Medium |
| Cartoon | Bright toon look, matches free asset packs | Easy |
| Paper | Paper cutouts in a 3D world (Paper Mario feel) | Medium |
| Clay | Claymation look | Hard |
| Cel-shaded | Toon shading with outlines | Easy–medium |

**Style (multi-select).** Retro game, futuristic, cool, cute, old, creepy, cozy, epic, surreal.
- **Proposed:** pick up to 2. Odd mixes are fine; "spooky-cozy" is a real thing.

**Genre (up to 3, Decided).** RPG, platformer, adventure, craft, puzzle, battle, strategy, roguelike.
- **Proposed:** one is starred as the main genre, and the others add flavor.
- **Open:** "survival" came up as an example but isn't in the list.
- The admin can enable more genres, such as first-person shooter (Section 10).

**Reference games (Decided).** Each genre suggests popular games, for example survival: Minecraft and others. The kid can pick the ones they want to borrow from, or name their own, and the references go to the building agent.
- **Proposed:** filter suggestions by age rating. Project Zomboid, for example, is rated M. The parent sets the cap.
- **Proposed:** ask what they like about each reference ("Minecraft: building, exploring or monsters?"). That tells the agent far more than the title.

**Guidance along the way (Decided).** Short tips that teach which decisions matter and steer toward a first version that will work, e.g. "Craft games look great in voxel!" or "Clay is extra tricky, so your first version might look a little different."

**Open dictation and drawings (Decided).** Kids can describe the game freely, draw in the app, or show a paper drawing to the camera (Section 5.9).

### 5.4 Narrowing before building (Decided; saves tokens and improves fit)
1. **The voice agent narrows the options first.** It asks questions that cut down the possibilities, including ones the kid wouldn't have thought of. It never passes a raw transcript straight to a builder.
2. **Quick variants for bigger features.** The build agent first makes about **3 quick options**: screenshots for questions about looks, or 2–5 second playable demos for questions about feel (e.g. big jump vs small jump). It may also ask follow-up questions by form or voice. The kid picks one, or says "that one but bigger".
3. **Then the full build**, from a spec the kid has already chosen.

Example: the kid asks for a volcano, and gets three volcano sketches or three tiny playable volcanoes to choose from.

### 5.5 Building in the background: the progress board (Decided)
Several background agents can work on different new components at once. Each shows as a card with a picture, its current stage (planning, building, testing) and a progress bar. Queued requests wait for a free slot (Section 8).

### 5.6 Play ⇄ edit mode (Decided; the core idea)
Inspired by Super Mario Maker: one button flips instantly between playing and editing, so changing something and testing it is a very short loop.
- **The sidecar.** Every component an agent builds ships with **controls for the kid**: knobs, switches, sliders and levers (jump height, speed, number of enemies, lava on or off, colors, placing things on the map). Kids tune the game by hand, on the fly, with no agent involved. That's a second level of game design, and it's free in tokens.
- **Works on any genre.** The overlay must work over any game type, style or theme.
- **Proposed design:**
  - Every component declares a **tunables manifest**: kid label, icon, control type, range and default.
  - The overlay draws whatever is declared, from a small fixed set of control types: slider, switch, choice, color, count, place-on-map, and rule cards (Section 6).
  - An **editor-API skill** teaches every build agent to expose controls the same way.
  - Every tweak can be undone, and "put it back how the robot made it" is one tap.
  - Finished components drop into the running game without a restart (hot reload).
- While waiting for new components, kids keep tweaking in edit mode.

### 5.7 Bug button (Decided)
In edit mode, the kid taps a bug icon and says what happened.
- **Proposed data, kept minimal:**
  - the game's random seed, the last ~30 seconds of inputs and a state snapshot, so the bug can be replayed exactly;
  - recent errors and one small screenshot.
  - No audio and nothing identifying.
- A fixed bug can turn into a "promise" (an automatic test, Section 6).

### 5.8 Multiplayer (Decided: local and online, built in)
- **Local:** couch co-op on one screen. **Game controller support is mandatory** for local multiplayer: up to 4 gamepads, plus keyboards and touch.
  - **Proposed:** a shared input helper every game loads, so agents never write controller code themselves.
  - 3D games can use split-screen. 2D games use one shared screen with a camera that zooms to fit everyone.
- **Online:** friends join private rooms with short, expiring join codes.
  - **Proposed:** one shared relay server (PartyKit on Cloudflare); no accounts, no chat (at most preset emoji), preset animal names, no public matchmaking.
- **Proposed:** phones can join as extra controllers at family gatherings by scanning a QR code.

### 5.9 Drawing and photos (Decided)
- **A simple built-in drawing tool:** big brushes, a few colors, an eraser, undo and done. Drawings attach to requests as context (character designs, maps).
  - **Proposed:** a small custom canvas built on perfect-freehand. Excalidraw, with most of its tools hidden, for maps.
- **Paper drawings via the camera:** the app finds the paper, flattens and crops it, and strips location data before anything is sent.
  - Claude reads what it is.
  - An image model can restyle it into the game's art style, or turn it into a simple 3D model.
  - Photos may contain faces or rooms, so only the crop is sent and originals are not kept.

### 5.10 Voice conversation (Decided)
Two-way spoken conversation, not one-way dictation. The voice agent:
- helps kids say what they mean, asking clarifying questions in kid terms ("Is the dragon a friend or a baddie?");
- repeats back what it heard before costly work, and offers 2–3 picture choices when unsure;
- keeps technical questions for parents.

**Proposed UX:** a big push-to-talk button (no wake word), replies of one or two sentences, one warm character voice, and a clear "I'm a computer helper".

**Note:** speech recognition is noticeably worse for 5-year-olds than for older kids, so repeating back and offering picture choices matter.

## 6. Learning by making (Decided goal; ideas Proposed)

Model: Scratch's creative learning spiral (imagine, create, play, share, **reflect**) and Nintendo's *Game Builder Garage*. Teaching is short, happens in the moment and never blocks play. Rate limits already help: expensive new games plus free tweaks push kids toward improving existing games.

**Game design ideas**
- **The designer's question:** each build, the voice agent asks one question a designer would ask ("How does the player know they're winning?"). Answers are collected as cards.
- **Try it both ways:** two versions side by side, the kid picks one, the agent explains why it matters. This is A/B testing, and the narrowing step (5.4) does it naturally.
- **Robot playtesters with personalities** (e.g. Speedy, Careful, Newbie) show where players get stuck. **Open:** Kevin is still thinking about this one.
- **Watch someone else play:** markers where a sibling or grandparent got stuck. Making games for other people teaches empathy and difficulty.
- **The "fun river":** too easy drifts to Bored, too hard drifts to Scared, shown visually (the flow channel).
- **Broken strategies:** when a kid finds an exploit, celebrate it and ask how to fix it. This teaches balance and min-maxing.
- **Fun ingredients:** challenge, surprise, collecting, building, friends, story. When a game gets boring, ask which ingredient to add.

**Software engineering ideas (age-appropriate, no code required)**
- **Rule cards** ("When dino touches lava → lose a heart") that kids toggle, reorder and add. This is real event-based programming.
- **Knobs are variables**, with an optional "peek inside" view that highlights what changes.
- **The plan as picture steps:** big wishes become small jobs (breaking work down).
- **Promises become tests:** "The dino should never fall through the floor" is checked on every build.
- **Bug hunts** with replays. Bug reports teach "what I did, what happened, what I expected".
- **Time machine:** save points and "try a wild idea without breaking the good one" (version control).
- **Say exactly what you mean:** the kid's wish shown next to the robot's plan.

**Level ladder (Proposed; set per kid by the admin or earned)**

| Level | Unlocks |
|---|---|
| 1 | Play, knobs, voice wishes |
| 2 | Rule cards, playtest bots, try it both ways |
| 3 | Promises, time machine, plan steps |
| 4 | Peek at changed code, explained in plain words |
| 5 | Edit code alongside the agent |

**Reflection:** a 30-second voice recap at the end of each session goes into a design journal, and the parent dashboard shows which ideas came up.

## 7. System architecture

### 7.1 Orchestration (Decided)
- A long-running **aiur** instance on a server. A single **Executor** agent takes requests and delegates them to **implementation agents**.
- Kevin is splitting aiur into smaller sub-packages, several of which are expected to be reused directly here.
- **Voice component (Decided; Kevin is building it):** it forks the Executor's or an implementation agent's context onto a faster, cheaper model for real-time voice, and uses ElevenLabs for two-way speech. See the policy warning in Section 10.
- **Proposed:** **two Executors**.
  - The games Executor handles kids' requests and has no platform credentials.
  - A separate maintainer Executor, reachable only by Kevin, can change the platform.

### 7.2 What an implementation agent produces
- A small web game in the household's games repo, depending on a pinned version of the platform's **runtime package**: input helper, multiplayer helper, editor/tunables API and audio helpers.
- Every game exposes a debug hook (`window.__game`: state, seed, step, input) so bots can test it.

### 7.3 Playtest loop (Proposed)
After each build:
1. A headless browser bot (Playwright) plays on desktop and phone profiles, checks for errors and invariants ("the score changes", "you can lose", "frame rate is acceptable") and takes screenshots for the agent.
2. It records the clip for the game wall.

### 7.4 Hosting and runtime safety (Proposed)
- Games run in a sandboxed iframe on a separate domain. They talk to the platform only through a small message channel (editor API, multiplayer).
- Iframes need `allow="gamepad"`, so controllers work inside them.

## 8. Cost, models and rate limits (Decided: first-class rate limiting)

- **Model tiers by job (Decided in principle):** a heavier model for creating a new game, cheaper models for later features. **Proposed mapping on Anthropic models:**
  - Opus-class at high effort to create a game;
  - Sonnet-class at medium effort for features;
  - Haiku-class for voice, request sorting and summaries;
  - **no model at all** for knob tweaks.
  - Tiers are named by job (heavy, standard, light), so any provider plugged in by an admin can fill them.
- **Proposed:** measure before locking the split in. A stronger model at lower effort sometimes costs about the same per finished feature, and switching models resets the prompt cache.
- **Rate limits (Decided in principle):**
  - **Creation cooldown:** new games only every so often.
  - **Slots:** about 2–3 agents in flight per household; extra requests queue on the progress board.
- **Proposed:**
  - reserve a job's estimated cost when it starts, charge the actual usage when it ends, and stop runaway jobs;
  - monthly dollar caps per household, plus a global cap;
  - prompt caching of the skills and game code;
  - an advisory token budget per job.
- **Proposed kid-facing meter:** "build stars" that refill daily. A new game costs ~5, a feature 1–2, knob tweaks are free.

## 9. Separating the platform from the games (Decided)

- Only Kevin (and maintainers) can prompt agents that can change the Game Maker platform.
- Players with create access can only cause commits to **separate games repos**, which depend on the platform's published runtime.
- **Proposed enforcement:**
  - two Executors;
  - per-job, short-lived GitHub App tokens scoped to one games repo;
  - sandboxed build containers that hold only the game workspace;
  - branch protection on the platform repo;
  - a sandboxed game runtime.
- **Proposed:** one private games repo **per household**. Kid requests that need platform changes become tickets for Kevin ("Uncle Kevin has to build that part!").
- Before open-sourcing: keep secrets out of the repo from day one (add secret scanning) and choose a license.

## 10. Safety, privacy and parental controls

**Parental controls (Decided: admins can loosen kid guardrails within limits)**
- Admins decide things like whether first-person shooters or certain genres are allowed.
- **Proposed settings:**
  - presets ("Little kids", "Big kids", "Custom");
  - genre allowlist, first-person camera on/off, how fighting looks (bonk-and-poof, foam blasters, cartoon blasters), creepy styles on/off;
  - age-rating cap for references;
  - online play and who can join;
  - who sees each kid's games;
  - daily build stars, play-time limits and "ask a grown-up first" approval;
  - voice on/off;
  - learning level.
- **Always off, whatever the admin sets:** sexual content, gore, real people, open chat, collecting personal information.
- **Proposed enforcement:** the settings become a policy that shapes the wizard, the build skill and the art prompts, and a cheap safety check runs on every request before any agent starts.

**Content and IP**
- Never send a child's raw words to an image or 3D generator. Rewrite them into a fixed style template first.
- **"Make it like…" rules:**
  - copy rules and numbers, never art, names or an iconic look (Tetris v. Xio, 2012);
  - no trademarked names in games;
  - never fetch sprite rips;
  - screenshots and videos are analysis input only.

**Privacy (Proposed; needs legal review)**
- Under COPPA (amended 2025), a child's voice recording is personal information.
- Delete audio right after transcription, keep transcripts briefly, never train on kids' data, and get parental consent at sign-up.

**Vendor policy flags (verified 21 Oct 2026, worth re-checking)**
- **ElevenLabs:** prohibits apps aimed at under-18s without written approval, requires parental consent records, and offers zero data retention only on Enterprise. **This directly affects the planned voice component.** Fallbacks: Pipecat (open source, keeps Claude as the voice brain, any speech vendor) or OpenAI Realtime (allows under-13s with zero data retention).
- **ElevenLabs Music and Google Lyria (Gemini API):** both prohibit under-18 apps, so they're excluded for music.
- **Open:** whether a consumer AI subscription (vs an API key) may power a multi-user service under the bring-your-own-agent plan.

## 11. Proposed tech stack (from research)

| Area | Pick |
|---|---|
| 3D games | Three.js (+ Rapier physics, postprocessing for toon/pixel looks) |
| 2D games | Phaser 4; KAPLAY or LittleJS for simple ones |
| Agent skills | threejs-skills, awesome-gamedev-agent-skills, Anthropic official skills, webgpu-claude-skill later; ideas from Claude Code Game Studios; our own editor-API and music skills |
| Art | Free CC0 packs first (Kenney, Quaternius, KayKit); fal.ai (FLUX Kontext) or gpt-image for 2D; Meshy or TRELLIS for 3D; Lospec palettes |
| Sound effects | Tone.js, Kenney audio packs, ElevenLabs SFX (subject to its policy) |
| Edit mode | Zod (manifest), Tweakpane (panel base), Immer (undo), Vite hot reload, Tiled/LDtk level formats |
| Multiplayer | Browser Gamepad API + shared input helper; PartyKit relay; Colyseus if server-side rules are needed |
| "Make it like…" | Wikipedia/Wikidata, IGDB, RAWG, Fandom wikis, Gemini video understanding, OSGameClones, Celeste physics values |
| Playtesting | Playwright (+ Playwright MCP), Chrome DevTools MCP |
| Devices | nipplejs (touch joystick), detect-gpu (quality tiers) |
| Voice | Kevin's component + ElevenLabs (if approved); Pipecat + Silero VAD as fallback |
| Auth | Better Auth |
| Drawing | perfect-freehand canvas; jscanify for paper photos |

## 12. Music (Proposed)

Agents compose music as data, and it plays through real sampled instruments rather than beeps.
- **Engine and samples:** Tone.js (playback, looping, layers) + Tonal.js (music theory) + free CC0 VCSL samples, self-hosted.
- **Chiptune:** BeepBox song files for 8- and 16-bit games.
- **AI generation (optional, build time only):** ACE-Step 1.5 (open source, MIT), instrumental only.
- **Adaptive music:** layers fade in as intensity rises, section changes land on the bar line, and short stingers play for win, lose and pickup.
- **A custom game-music skill:**
  - a mood table (cozy, cute, creepy, epic) with key, tempo, chord progressions and instruments;
  - song-structure rules: 8–16 bar loops and a repeating motif;
  - automatic checks: notes in key, clean loop seam, no clipping or harshness;
  - kid-safe mixing: music quieter than sound effects, no jump scares.

## 13. What success looks like (Proposed)

- A first version that matches the kid's description well enough that they play it, then improve it.
- Kids come back to the same game across several sessions.
- Kids use edit mode more than they request new games.
- Kids start using design words on their own ("too hard", "unfair", "add a surprise").
- The household's monthly cost stays under the cap without kids feeling blocked.

## 14. Question bank (start here)

These questions are ordered so the answers that change the product most come first. Each has a one-line note on why it matters. **Start with the ★ questions.** The rest can follow in any order Kevin likes. Where a default is given, it's what the draft assumes if Kevin doesn't decide.

### A. Product thesis (most important)
1. ★ **Evidence.** What have the kids already done that shows they want this: drawn games on paper, built levels in Mario Maker, made things in Minecraft or Roblox, asked to "make a game"? *Why: the strongest real moment should anchor the first version.*
2. ★ **A real session.** Picture one Saturday session. Who's in the room (kid alone, with Kevin, with a parent), on what device, and for how long? How does it differ for the 5-year-old and the 7-year-old? *Why: it decides whether creation needs an adult present, which shapes voice, safety and approvals.*
3. ★ **What they'd do otherwise.** What do they play or make today instead, and what would this give them that Mario Maker, Roblox or Minecraft can't? *Why: names the product's real edge.*
4. ★ **The smallest delightful version.** What's the smallest version that would delight them in the first month? For example: one art style, two genres, knobs only, couch co-op only, no online play, no drawing. Which spec features could wait? *Why: the spec is large, and the first release needs a hard edge.*
5. ★ **Family project or product?** Is this for Kevin's family, a handful of invited families, or eventually the public? *Why: it changes auth, legal review, cost, support and the open-source plan.*
6. **What lasts.** In 12–18 months, when one-prompt game making is everywhere (Rosebud, Astrocade, Roblox's assistant), what stays special here: the learning ladder, the family focus, Uncle Kevin's curation, quality? *Why: separates lasting value from features every competitor will copy.*
7. **The wrong product.** What could this accidentally become: a slop generator, a screen-time trap, a coding course that feels like school, or a dev tool only Kevin enjoys? Which would be worst? *Why: makes the guardrails concrete.*
8. **How it fails.** What would have to be true for this to flop: the kids bored within a week, builds too slow, costs too high, speech recognition frustrating, parents uneasy? *Why: each answer becomes a risk to design against.*

### B. Decisions that shape the product
9. ★ **Templates or from scratch?** Should new games start from a small set of curated, high-quality genre templates that agents customize, or be generated from scratch each time? *Why: templates are probably the biggest lever on both quality and cost, but they narrow variety. Default: templates for the first release.*
10. ★ **Waiting.** A first build may take several minutes. Is creation live (the kid waits and watches the progress board), or request-now-play-later? What does a 5-year-old do during a 5-minute wait? *Why: decides how much the narrowing step, edit mode and a "while you wait" activity have to carry.*
11. **Whose game is it?** One kid per game, or shared family projects both kids edit? What happens when one sibling changes the other's game? *Why: ownership, permissions and version history all depend on it.*
12. **Main device.** iPad, laptop or TV? *Why: drives controllers, voice, drawing, camera and performance priorities.*
13. **Reusable components.** Should a component one game gets (the "flying cat", say) be reusable in other games, building a family library over time? *Why: compounding value plus lower cost, but it adds curation work for Kevin.*
14. **Kevin's role.** Curator who approves new components or games, or hands-off maintainer? *Why: sets how much the platform needs review tools.*
15. **Edit mode in the first release.** Knobs only, or rule cards and Mario Maker-style placing things on a map too? Is the level editor 2D-only at first? *Why: the level editor is the most expensive edit-mode feature.*
16. **When a build fails.** What does the kid see: a retry, a simpler fallback version, or "Uncle Kevin will fix it"? *Why: failure handling is how a 5-year-old experiences the product.*
17. **Keeping games.** Do games live forever with full history? Can kids delete them? Can a game be downloaded or kept offline? *Why: storage, privacy and expectations.*

### C. Create flow
18. **"32-bit" art:** Game Boy Advance-style sprites, or PS1-style wobbly low-poly 3D? *Default: PS1-style 3D, for a clear 2D/3D split.*
19. **Style:** cap at 2 picks? *Default: 2.* Add **survival** to the genres?
20. **Clashing picks:** should guidance block hard combinations (clay + strategy), or only comment and let the kid choose? *Default: comment, never block.*
21. **Narrowing:** how many questions before a kid gets bored, and when are the three variants screenshots versus playable demos? *Default: at most 3 questions; demos only for feel questions.*
22. **Reference games:** what's the default age-rating cap, and who can add custom references?

### D. Learning
23. ★ **What learning success looks like at 6 months, for each kid:** using design words, fixing their own bugs, making a game for someone else? *Why: without a concrete target, "teaching" drifts into either nagging or nothing.*
24. **How explicit before it feels like school?** Who controls the teaching level: the kid, the parent, or automatic?
25. **Robot playtesters with personalities:** in or out? What would make them fun rather than critical?
26. **Code:** should kids ever see real code, and at what level or age?

### E. Multiplayer and social
27. **Online play with whom, first:** cousins in other houses, school friends (whose parents would need to consent), or family only?
28. **Sharing beyond the household:** ever? *Why: raises IP, moderation and legal stakes sharply.*
29. **Controllers:** which gamepads does the household actually have, and how many?

### F. Voice and input
30. ★ **Voice vendor:** ask ElevenLabs for written approval for an under-18 app, or plan on Pipecat (open source, any speech vendor) or OpenAI Realtime from the start?
31. **Can the 5-year-old use voice alone,** or will she need an adult or picture choices most of the time?
32. **Drawing:** a core way to create, or an optional extra? Add a pixel-grid mode for 8- and 16-bit games?

### G. Cost and budget
33. ★ **Monthly ceiling:** what monthly spend per household is comfortable? What happens at the cap: a hard stop, knobs only, or a request to a parent?
34. **Who pays** when other families join: their own key only (bring your own agent), or Kevin covers some of it?
35. **Build stars** visible to kids: motivating or stressful? What are the numbers (cost of a new game, feature, daily refill)?
36. **Model tiers:** which models per job, and run a small measurement before deciding?

### H. Safety, privacy and legal
37. **Default guardrails** for "Little kids" and "Big kids". Is anything beyond the platform's always-off list never allowed?
38. **What's stored and for how long:** voice transcripts, drawings, photos, gameplay clips?
39. **Legal review:** when does it happen? *Default: before the first household outside Kevin's family.*
40. **Bring your own agent:** may consumer subscriptions be used, or API keys only?

### I. Platform and operations
41. **aiur dependencies:** which aiur sub-packages must exist before the first release? Is Game Maker meant to drive their development?
42. **Hosting and uptime:** where does it run, and what happens if it's down on a Saturday morning?
43. **Open-sourcing trigger:** what milestone flips the platform repo to public?
44. **Name:** is "Uncle Kevin's Game Maker 2000" what kids see?

## 15. Reference

- Research catalog of tools, skills, engines and services, with screenshots: https://claude.ai/artifact/SchanfZLWf27tjj2i7fZxk (private to Kevin).
- Repo: github.com/its-everdred/uncle-kevins-game-maker-2000 (private), branch `research`.

---

## Change log
- v0.1 (21 Oct 2026): first draft by Claude from Kevin's voice notes and the research catalog. The question bank was built with compound-engineering's brainstorm lenses (product pressure test and blindspot map).
