# Open Game Maker 2000: where the build stands, and the new-game pipeline (voice briefing, 2026-11-03)

A briefing for a voice conversation with Kevin. Walk through sections 1–3 briefly, spend most of the time on
section 5 (questions), then send back a short list: question id, Kevin's answer in his own words, and anything new he
asked for. Claude turns that into decisions and tickets.

## 1. Where the build stands

**Live today at weaver.makeopen.games (Kevin's hosted instance):**
- Title screen with the looping town scene; sign-in by email link (sent from noreply@makeopen.games through Resend);
  allow-list sign-in (only addresses the operator lists can sign in; Kevin's admin address, his regular address and a
  QA address).
- Games screen, the new-game steps (genre, vibe, style, world, players, point of view) and the scope chat.
- The style step with the SmallScaleInt living dioramas, now back on **v4** (Kevin's pick; no more showcase changes
  for now).
- Behind it: a GitHub App on the Open-Games repo, one bot account (its-applekid) for intake and builds, the Codex
  login for game builds, and the fleet's own aiur daemon building Game Maker itself.

**Built but not yet working end to end:**
- **Create → build → play.** Pressing Finish saves the game, but the next step still tries to create one GitHub repo
  per game, which the App cannot do. Four tickets move games into folders of the Open-Games monorepo (`games/<name>/`
  plus shared `packages/`), switch creation and per-game build daemons to it, and prove create, edit, play, publish and
  rollback on weaver (#444 → #445 + #446 → #447). ETA: about a day of fleet time.
- **Voice.** One-way (talk instead of type, ElevenLabs Scribe) and two-way (live ElevenLabs agent) are both coded but
  switched off; the voice service has never run on the host. Ticket #465 wires both, reusing aiur's voice pieces and
  filing aiur tickets where aiur needs changes.

**In flight (UI asks from today):** Gruvbox colours with a green, flat Start (#451); the top-right menu becomes a
hamburger with build progress, a loading ring while a build runs, volume slider and bug report (#459); no age check
(#461); passkey fix (#457); instances ship every owned asset and the prototype's music (#456); logo setting (#448);
pick-3 circles with a shake (#462); New game "+" fix (#466); few-games layout that opens on the first game (#467); the
makeopen.games marketing site (#441, built; deploys on Kevin's go).

**Kevin still holds:** signing aiur in to both Claude accounts (two commands); the go to deploy the marketing site; the
device proof for fast second loads (#340).

## 2. Decisions made today

| Decision | What it means |
|---|---|
| weaver.makeopen.games is Kevin's instance; makeopen.games is the project's marketing site | Instances open on the title screen; the marketing site lives in the core repo |
| One monorepo per instance (Open-Games) | `games/<name>/` and `packages/`; no repo per game; creators never connect GitHub |
| One bot account for intake and builds | Simpler; accepted that an agent could queue work for itself |
| Allow-list sign-in, no age check | Only listed addresses can sign in; the birth-date step goes |
| Gruvbox, flat, green primary, no highlight borders | Applies to every screen including the title chrome |
| Showcase frozen on v4 | v5 and v6 kept on disk; no new showcase work until Kevin reopens it |

## 3. The new-game pipeline Kevin described

**What he wants, in short:** a request to make a *new game* is not an ordinary change request. It should:

1. **Be marked as a new game in a structured way** (a field or label, not a guess from wording), so it is routed
   differently from "make the hero faster".
2. **Not start a worker automatically.** The Executor listens for new-game tickets only and takes them itself.
3. **Run a new-game skill:** an aiur agent does a compound-engineering loop on the description: brainstorm, ask the
   important questions (skipping what the two-way voice conversation already settled), then plan.
4. **Break the game into about a dozen parallel tickets** across engine layers (UI, pixel art or models, maps, game
   design, story, music and sound, and so on), create an aiur **Build Order**, tag **features and epics**, and use every
   Build Order feature so a lot of work lands quickly.
5. **Ask rich design questions.** New-game agents are encouraged to send design and product questions up to the
   Executor and Kevin, with options that are prototype screenshots, GIFs or short videos, or audio clips for music,
   not only text. Front-load these during creation, far more than for normal changes.
6. **Surface questions in the app.** When any job asks a question, the Executor knows, and the app tells the user:
   the top-right menu button shakes or shows a badge; inside, the user sees which job is asking.
7. **Group jobs by game in the menu.** Each ticket is one progress bar, always grouped by game. A new game's 10+ jobs
   look like one coordinated build (one group with an overall bar and its parts), clearly different from a game with
   two unrelated feature requests.

**What already exists to build on:**

| Need | Exists today | Gap |
|---|---|---|
| Structured request type | The app files intake issues with a per-game label | No "new game" type or label; every intake issue is dispatched the same way |
| No automatic worker | aiur only dispatches tickets in its queue labels | Need a label or state the daemon ignores, and the Executor subscribes to |
| Executor listener | aiur has executor subscriptions and a watch stream | A filter for new-game tickets and a handoff into the skill |
| New-game skill | Game skills for platformers, input, HUD, audio, multiplayer; gm-design-loop, gm-assets, gm-verify | No new-game skill; no decomposition template for games |
| Build Orders, epics, features | aiur `build-orders`, `epic set`, `feature create`, GitHub dependency graph | Wiring a generated plan into them automatically |
| Questions with options | aiur Commands: question, options, recommendation, blocking flag, ticket, context file | **Options are text only.** Images, GIFs, video and audio options need an aiur change |
| Question surfaced in the app | aiur knows open Commands; the app has notifications | The app does not read Commands; no menu badge or shake; no answer screen |
| Jobs grouped by game | Build progress exists per job; the menu ticket (#459) lists builds | No grouping by game or Build Order; no "new game" group view |

## 4. Approaches (brainstorm)

**A. Executor-run spike, then a Build Order (Kevin's sketch).** A new-game request lands as a parked issue with a
`request:new-game` type. The Executor's listener picks it up and starts one aiur agent with the new-game skill: it reads
the scope chat and voice transcript, asks a short round of design Commands (with media options), writes a game design
brief, then decomposes it into ~12 tickets with dependencies, features, epics and a Build Order; the Executor queues the
order. Strength: matches the existing compound loop and aiur's planning model. Risk: the first spike is serial; the user
waits for it before anything visible happens.

**B. Template first, spike in parallel.** On Finish, the app immediately builds a playable starter from the chosen
style's starter scene and a game template (so the user plays something in minutes), while approach A runs alongside and
its tickets replace the starter piece by piece. Strength: instant feedback. Risk: the starter can set expectations the
real design then changes.

**C. Questions first, in the creation flow.** Move most design questions into the creation flow itself: after the scope
chat, a "design board" step shows the agent's option sets (art directions, map sketches, music clips) before any build
starts; only then does the spike decompose. Strength: the user decides with full attention, once. Risk: a longer
creation flow before the first build.

**Recommendation:** A as the backbone, with C's design board as where its Commands appear during creation, and B
deferred until A works. The open questions below decide the details.

## 5. Questions for Kevin

**Request and routing**
- **N1. What counts as a new game?** Only the "New game" flow, or also a chat request like "make me a racing game" from
  inside an existing game? Recommendation: only the New game flow; a chat request offers to start one.
- **N2. Where does the request live?** One GitHub issue in Open-Games with a `request:new-game` label, holding the
  creation choices, scope chat and voice transcript? Or a record in the app that the Executor reads? Recommendation:
  the issue, so aiur and the Executor see it natively.
- **N3. Who approves the plan?** After the spike decomposes the game, does Kevin (or the creator) approve the ticket
  list and Build Order before agents start, or does the Executor start it at once? For family members, is it the
  creator or Kevin who approves?
- **N4. Budget.** A new game may spin up 10+ agents. Is there a per-game cap (agents, hours, or a token budget), and
  what happens when it is reached?

**The new-game skill**
- **S1. Layers.** Which ticket lanes should every new game get? Proposed: game design doc, core loop and controls, UI and
  HUD, characters and sprites or models, map and level, story and dialogue, music, sound effects, voice lines, menus and
  save, polish and juice, test and verify. Add or cut?
- **S2. Size.** About a dozen tickets per game: is that the target for a first playable, or for a fuller game?
- **S3. What "done" means for the first build.** One level, playable on a phone, with music? A vertical slice? Something
  else?
- **S4. Reuse.** Should the skill prefer existing packages in the instance's `packages/` and the core engine, and file a
  promotion ticket when two games need the same thing (the "rule of two")?
- **S5. Starter scenes.** Should a new game start from the chosen style's showcase scenes (v4 regions) when they fit?

**Questions to the user**
- **Q1. How many questions up front?** A cap (for example five option sets) before the build starts, with everything
  else decided by the agent?
- **Q2. Skip what is known.** If the voice conversation already covered something, the agent skips it. Should it show
  "here is what I understood" for a one-tap confirm, or skip silently?
- **Q3. Media options.** Which kinds matter most: still mock-ups, short looping GIFs or videos, audio clips for music
  and sound, playable micro-prototypes? Which first?
- **Q4. Who answers?** The creator (a family member) or Kevin as operator, or both, for different kinds of question?
- **Q5. Blocking.** May agents keep working on other tickets while a question waits? How long before the Executor picks
  the recommended option itself?
- **Q6. Voice answers.** Should the two-way voice agent be able to read questions out and take spoken answers?

**Notifications and the menu**
- **M1. Signal.** When a job asks a question: menu button shake, a badge with a count, a push notification to the
  phone, or a mix? Which for a blocking question?
- **M2. Grouping.** Always group jobs by game. For a new game, show one group with an overall bar plus its parts
  collapsed underneath? Show the Build Order's layers (art, map, story) as sub-groups?
- **M3. Answer place.** Answer questions inside the menu panel, or open a full-screen "design board" for that game?
- **M4. Done signal.** When a new game's first build is playable, what should happen: a notification, the menu button
  turning green, the game opening by itself?

**aiur changes (to file on aiur-team/aiur)**
- **A1. Media options in Commands.** Add image, GIF, video and audio attachments to Command options (stored with the
  Command, shown in the dashboard, readable by the app). Agree to file this?
- **A2. App access to Commands.** The app needs to list and answer Commands for a game (through the API, with the
  user's permission). Same ticket or separate?
- **A3. Dispatch exception.** A ticket type the daemon never auto-dispatches, with an Executor subscription for it. Use
  an existing aiur mechanism if one fits, else file it.

**Scope and timing**
- **T1. Order.** Should the new-game pipeline wait until create → build → play works on weaver (#447) and Kevin's QA pass,
  or start in parallel?
- **T2. First test game.** Which game should be the first full run of the pipeline (genre, style, players)?
- **T3. Voice first?** Should two-way voice (#465) land before the pipeline, so the first new game is scoped by voice?

## 6. Blockers Kevin holds

| Blocker | Why | What to do |
|---|---|---|
| aiur sign-in to both Claude accounts | aiur has only Codex accounts; the new-game spike may use Claude | Run the two login commands Claude sent |
| Marketing site go | makeopen.games still shows the instance | Say "deploy the marketing site" |
| Device proof (#340) | Proves fast second loads on iPad and Android | After the caching work, with the devices |

## 7. What to send back

A list: each question id (N1…T3) with Kevin's answer in his words, anything he cleared from section 6, and anything new
he asked for.
