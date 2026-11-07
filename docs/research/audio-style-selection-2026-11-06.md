# Audio style selection: a direction, not a pack list (2026-11-06)

Research spike for #357. Kevin's ask, verbatim:

> add a ticket for selecting audio styles, include a similar form like the styles page, with categories for the
> resource packs and include a single sample file that can be played for each, but have the sample include a full
> minute of snippet slices from many songs, effects, etc. Do a research spike on this as part of the ticket, because
> this will differ quite a bit from visual libraries, where visual libraries include generally the full set of visuals.
> Audio libraries might be specific to soundtracks or ambient effects or sound effects or short snippets. So I don't
> know that we can be as black and white as we can. It's likely that we just need some general direction from the user,
> but that the audio agents should be able to use a bit more discretion to pull from sound effects, ambient noise, and
> even soundtrack songs from other packs. The user shouldn't be forced to choose all the specific audio packs, because
> their game may pull from many different packs. We're really just looking for sort of soundtrack genres or styles. For
> example, chiptune, orchestral, happy, sad. really looking for mood direction.

This doc answers the ticket's four questions with the code and the vocabulary that already exist (the audio direction
query from #364's §2 "direction" shape and the C3 vocabularies), and it is the plan the picker, the montage builder and
`gm-audio` follow. It changes nothing in the frozen planning pack; the product surfaces it decides are in this PR.

## Recommendation in one paragraph

The creator picks **one direction: a style axis and a mood axis** (chiptune / orchestral / acoustic / synth… × dark /
tense / … / cheerful / epic), never packs. Each tile plays **one 60-second montage** sliced from the tracks and effects
whose cards match that direction and crossfaded into a single MP3/OGG. The direction is stored on the game as
`choices.audio = { style, mood, other? }` and read by `gm-audio`, which then pulls freely across **every** pack whose
cards match the axes and whose licence allows the build. A style is offered **only when its audio is carded and its
montage is rendered**; the rest appear as #355 reaches them. The default when a creator skips the step is the game's
`vibe` mapped to the nearest mood and no style axis, so the agent chooses from the whole library rather than guessing a
pack.

## 1. How the audio library splits by kind

Audio is not one library the way a visual style family is. One card's `kind`/`subkind` says what it is, and the split is
the subkind vocabulary the schema already closes (C3 §3):

| Group | `subkind` | What it is | How long |
| --- | --- | --- | --- |
| Music | `music/track`, `music/loop`, `music/stinger` | Full tracks, seamless loops, short cues | 30 s – 5 min |
| Ambience | `ambience` | Background beds and room tone | 10 s – 2 min |
| Sound effects | `sfx/impact`, `sfx/footstep`, `sfx/pickup`, `sfx/explosion`, `sfx/magic`, `sfx/vehicle`, `sfx/creature`, `sfx/weapon`, `sfx/foley`, `sfx/ui`, `sfx/other` | Short events | 0.05 s – 3 s |
| Voice | `voice` | VO and synth voices | varies |

The visual-style page works because a family's packs hold "the generally full set of visuals" for that look. Audio does
not: a creator who picks "chiptune" wants chiptune *music* and also the *UI blips*, *coin pickups* and *footsteps* that
fit it, and those live in different packs — often in a Kenney SFX pack next to an unrelated visual family. So the
picker cannot be a pack chooser without forcing the creator to know the library. It has to be a **direction**, and the
agent spends the discretion.

The two facts that make a direction enough:

- **The cards already carry the axes.** #355 tags music with `describe.genre`, `describe.moods`, `describe.instruments`
  and `describe.game_fit`; SFX with `subkind`, `objects`, `materials` and a CLAP sound event. The direction query
  (`packages/asset-cards/src/search.ts`: all requested moods must match, any requested genre may) answers "everything
  that sounds like this" without a pack id.
- **The rights travel with the card, not the pack.** Each card's `resolved.rights` (uses, audience, redistribution) is
  the intersection of its own basis and its collection's (C3 §5), so the agent can reject a card by its row and never
  open the file. Pulling across packs does not weaken the licence gate.

## 2. What a creator should choose: the axes

Three axes exist on the cards. Two are worth asking a creator, one is the agent's to judge.

| Axis | Source field | Ask the creator? | Why |
| --- | --- | --- | --- |
| Style / genre | `describe.genre` (20 values) | **Yes**, as the first tile axis | The one axis a creator recognises instantly: chiptune, orchestral, acoustic, electronic. |
| Mood | `describe.moods` (13 values, dark → bright) | **Yes**, as the second tile axis | Kevin's "happy, sad": the emotional direction that survives across genres. |
| Situation | `describe.game_fit` (24 keys) | No — the agent reads it | Combat, boss, menu, town: the agent knows the scene it is scoring; the creator does not think in these words. |

The picker's tiles are the **taste-led intersection** of the two axes, not the cross-product: 20 genres × 13 moods is
260 tiles and a worse screen than the style page. The contract's `AUDIO_STYLES` (`packages/contracts/src/vocabulary.ts`)
lists the handful of directions a creator recognises — chiptune · playful, orchestral · epic, orchestral · sad,
cinematic · tense, acoustic · cozy, electronic · energetic, ambient · calm, ambient · mysterious, rock · energetic,
piano · sad, folk · cheerful — each a `{ id, label, style, mood }`. A creator can still type an "Other" direction,
which lands in `choices.audio.other` as free text.

The montage builder (`scripts/py/audio/style_montages.py`) derives its work from the cards, not from the tile list: it
groups audio cards by every `(genre, mood)` pair they carry, keeps pairs with enough distinct `variation_group`s, and
writes `<genre>-<mood>.mp3`. The API offers a tile only where the contract lists the direction **and** the file exists.
So the screen stays taste-led while "ship the styles whose audio is carded" holds mechanically: a tile without a montage
is never shown, and adding a style later is one row in `AUDIO_STYLES` once its cards exist.

**Recommended default:** no style axis, the mood nearest the game's `vibe`. A creator who skips the Sound step still
gets coherent audio, and the agent keeps full discretion over genre — which is what Kevin asked for.

## 3. How the audio agents pull across packs within the direction

`gm-audio` reads the direction and turns it into the card query #364 already defined:

```sh
gm assets search --kind audio --genre chiptune --mood playful --use in-game     # the direction
gm assets facets --kind audio                                                    # see the space when it is thin
gm assets info <id>                                                              # rights + the one-line facts
gm assets use <id>                                                               # then GmAudio.play() its id
```

- **Across packs, by cards.** The query reads the index and returns rows from every pack whose cards match; nothing in
  the direction names a pack. A `music/loop` and a `sfx/ui` from two different packs can both answer "chiptune ·
  playful".
- **Widen one axis when a pack is thin.** If `--genre chiptune --mood playful` returns too few rows, drop the mood (or
  the genre) and keep the other; the direction is a preference, not a filter the build must fail on.
- **The licence gate stays per card.** A row whose `rights.audience` is `private` or whose `redistribution` forbids the
  build cannot ship; the agent rejects it from the row and takes the next match. Direction never overrides rights.
- **The sample is for the creator, not the build.** The 60 s montage proves the direction sounds right; the build's
  audio is still chosen card by card from the manifest, so the montage file is never a game asset.

The tile's montage is the *creator's* evidence; the agent's evidence is the card row. That is the same split #364 draws
between a preview a human may open and the ids-and-facts row an agent reads.

## 4. How the choice is stored on the game

The direction is one field on the creation choices, `ScopeChoices.audio` (`packages/contracts/src/scope.ts`):

```json
{ "style": "chiptune", "mood": "playful", "other": "light as air" }
```

- **A direction, not pack ids.** No pack list is stored, so the agent is free to pull from any pack the cards match.
  The field is optional; a game created before the step existed still parses, and an empty direction falls back to the
  default above.
- **It rides the existing surfaces.** The scope ticket and the New Game parent issue render it as
  `- Audio direction: chiptune, playful`, so `gm-audio` and the scope agent both read the same line without a new API.
- **It is not a lockfile.** `assets.lock.json` still records the packs actually used; the direction only guides the
  choice. A build that needs a pack outside the direction can still use it and say why in the PR.

## 5. The montage builder and its limits

`style_montages.py` reads `cards.index.json`, the document `gm packs index` writes today. The ticket expects the builder
to query `assets.db` (#509) instead; it cannot yet, for a schema reason worth recording: the researched `cards` table
(`docs/research/asset-searchability-2026-11-05.md`, "Recommended index") carries `kind`, `style_family`, `duration_s`
and `loopable`, but the two axes this builder queries — `moods` and `describe.genre` — live only in the `cards_fts`
virtual table, and `audio.variation_group` is not a column at all. So the "SELECT … WHERE mood/genre … ORDER BY
duration, grouped by variation_group" the ticket describes has nothing to select from until #509 adds those columns.
The builder's `plan()` takes plain card dicts and knows nothing about where they came from, so the swap is one adapter
function, not a rewrite. It reads the index and for each pair:

1. keeps audio cards matching the pair, one per `variation_group` so a run of four sword impacts counts once;
2. slices a few seconds from each, deterministically offset into the track so the montage is not every file's intro;
3. crossfades the slices into one file (`acrossfade`, 48 kHz stereo) near 60 s, and prints the slices per pack.

Not measured here: the encode cost. ffmpeg is present on the host but broken in this ticket's sandbox (a missing
`libblas.so.3`), so the encode test skips; the plan and the command shape are tested without encoding. Measure the real
run on the host with `python3 -I scripts/py/audio/style_montages.py --dry-run` first (prints plans, no encode) and then
without `--dry-run`, and put the wall-clock in the PR that turns it on. The slice count is a few hundred cards per
style, not thousands of files, so the encode should stay well under the pre-processing budget in #364 §5.

## 6. What this ticket does not decide

- **Per-card audio choice inside a build.** `gm-audio` still picks the actual tracks and effects; the direction only
  narrows the search. A later ticket could learn a preferred direction per game from playtest feedback.
- **The montage's musical order.** The builder plays slices in pack/id order; a curated order is a follow-up if a tile
  sounds wrong in review. The creator judges the direction, not the arrangement.
- **The CLAP cost of tagging.** #355/#509 own that calibration; this ticket consumes the fields they write.
