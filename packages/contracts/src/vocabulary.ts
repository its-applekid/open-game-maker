import type { AssetCard } from './card.generated.js';

type Describe = NonNullable<AssetCard['describe']>;
type Element<T> = T extends readonly (infer E)[] ? E : never;

/**
 * The audio direction vocabulary: the values a music or sound-effect card can carry, in the order a creator meets them.
 *
 * The asset-card schema (`schemas/asset-card.schema.json`) stays the source of truth — `satisfies` makes a value the
 * schema does not allow a compile error, and `test/vocabulary.test.ts` fails when the schema grows a value that is
 * missing here. The audio-style picker (#357) builds its tiles from these lists and queries the cards by them, so a
 * value it offers must be one the tagging step can actually write.
 */

/** `describe.moods`, dark to bright. */
export const MOODS = [
  'dark',
  'tense',
  'eerie',
  'mysterious',
  'sad',
  'calm',
  'cozy',
  'cheerful',
  'playful',
  'energetic',
  'epic',
  'triumphant',
  'neutral',
] as const satisfies readonly Element<NonNullable<Describe['moods']>>[];

/** `describe.genre`, the style axis a creator picks before any pack (chiptune, orchestral). */
export const GENRES = [
  'orchestral',
  'cinematic',
  'classical',
  'piano',
  'rock',
  'metal',
  'pop',
  'electronic',
  'ambient',
  'acoustic',
  'folk',
  'country',
  'blues',
  'jazz',
  'funk',
  'hip-hop',
  'world',
  'latin',
  'chiptune',
  'experimental',
] as const satisfies readonly Element<NonNullable<Describe['genre']>>[];

/**
 * The `describe.game_fit` keys: situations a music track is scored against.
 *
 * Not `satisfies`-checked like the lists above: the schema closes this field's *keys* with `propertyNames`, which the
 * generated TypeScript flattens to an open `{[k: string]: number}`, so a compile check would accept any string.
 * `test/vocabulary.test.ts` reads `propertyNames` and keeps this list equal to it.
 */
export const GAME_FIT = [
  'combat',
  'boss',
  'chase',
  'stealth',
  'exploration',
  'travel',
  'wandering',
  'puzzle',
  'menu',
  'town',
  'tavern',
  'dungeon',
  'victory',
  'defeat',
  'sad-scene',
  'romance',
  'desolate',
  'tension-build',
  'celebration',
  'rest',
  'montage',
  'credits',
  'horror',
  'ambient-bed',
] as const;

/** `describe.instruments`: what the music is played on. */
export const INSTRUMENTS = [
  'piano',
  'keys',
  'organ',
  'strings',
  'solo-violin',
  'cello',
  'brass',
  'trumpet',
  'horns',
  'woodwinds',
  'flute',
  'sax',
  'choir',
  'lead-vocals',
  'acoustic-guitar',
  'electric-guitar',
  'bass',
  'synth-bass',
  'drums',
  'drum-machine',
  'percussion',
  'taiko',
  'orchestral-percussion',
  'synth-lead',
  'synth-pad',
  'arpeggiator',
  'harp',
  'bells',
  'mallets',
  'accordion',
  'fiddle',
  'banjo',
  'ukulele',
  'sound-design',
] as const satisfies readonly Element<NonNullable<Describe['instruments']>>[];

export type Mood = (typeof MOODS)[number];
export type Genre = (typeof GENRES)[number];
export type GameFit = (typeof GAME_FIT)[number];
export type Instrument = (typeof INSTRUMENTS)[number];

/**
 * One offered audio style tile (#357): a style axis and a mood axis, picked as a single direction. The picker shows
 * one tile per entry and each tile plays one pre-rendered 60 s montage; the direction is stored on the game, never the
 * pack ids. The list is taste-led (the ticket's wording), not every facet combination the cards could produce: it is
 * the handful of directions a creator recognises, and the montage builder renders a sample only for the styles whose
 * audio is carded. Add a style when its cards exist; a tile without a montage is worse than no tile.
 */
export type AudioStyle = {
  id: string;
  label: string;
  style: Genre;
  mood: Mood;
};

export const AUDIO_STYLES = [
  { id: 'chiptune-playful', label: 'Chiptune · Playful', style: 'chiptune', mood: 'playful' },
  { id: 'chiptune-energetic', label: 'Chiptune · Energetic', style: 'chiptune', mood: 'energetic' },
  { id: 'orchestral-epic', label: 'Orchestral · Epic', style: 'orchestral', mood: 'epic' },
  { id: 'orchestral-sad', label: 'Orchestral · Sad', style: 'orchestral', mood: 'sad' },
  { id: 'cinematic-tense', label: 'Cinematic · Tense', style: 'cinematic', mood: 'tense' },
  { id: 'acoustic-cozy', label: 'Acoustic · Cozy', style: 'acoustic', mood: 'cozy' },
  { id: 'electronic-energetic', label: 'Electronic · Energetic', style: 'electronic', mood: 'energetic' },
  { id: 'ambient-calm', label: 'Ambient · Calm', style: 'ambient', mood: 'calm' },
  { id: 'ambient-mysterious', label: 'Ambient · Mysterious', style: 'ambient', mood: 'mysterious' },
  { id: 'rock-energetic', label: 'Rock · Energetic', style: 'rock', mood: 'energetic' },
  { id: 'piano-sad', label: 'Piano · Sad', style: 'piano', mood: 'sad' },
  { id: 'folk-cheerful', label: 'Folk · Cheerful', style: 'folk', mood: 'cheerful' },
] as const satisfies readonly AudioStyle[];

/** The style a tile names, as a card query's `genres`/`moods` filters, or undefined for an id not in the list. */
export function audioStyle(id: string | undefined): AudioStyle | undefined {
  return AUDIO_STYLES.find((style) => style.id === id);
}
