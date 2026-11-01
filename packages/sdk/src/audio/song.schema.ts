import { z } from 'zod';

const noteSchema = z.strictObject({
  t: z.string().regex(/^\d+:\d+:\d+$/),
  n: z.string().min(1).max(16),
  d: z.string().min(1).max(16),
  v: z.number().min(0).max(1).optional(),
});

const trackSchema = z.strictObject({
  id: z.string().min(1).max(64),
  instrument: z.enum(['synth', 'fm', 'membrane', 'pluck', 'sampler']),
  sampler: z.record(z.string(), z.string().min(1)).optional(),
  volumeDb: z.number().min(-60).max(12).optional(),
  pattern: z.array(noteSchema).max(2_048),
});

export const songSchema = z
  .strictObject({
    version: z.literal(1),
    bpm: z.number().min(40).max(240),
    loopBars: z.number().int().min(1).max(1_024),
    tracks: z.array(trackSchema).max(16),
  })
  .superRefine((song, context) => {
    let notes = 0;
    song.tracks.forEach((track, trackIndex) => {
      notes += track.pattern.length;
      if (track.instrument === 'sampler' && !track.sampler) {
        context.addIssue({
          code: 'custom',
          message: 'sampler instrument requires sampler assets',
          path: ['tracks', trackIndex],
        });
      }
      track.pattern.forEach((note, noteIndex) => {
        const [bar, beat, sixteenth] = note.t.split(':').map(Number);
        if (bar! >= song.loopBars || beat! > 3 || sixteenth! > 3) {
          context.addIssue({
            code: 'custom',
            message: 'note time must be inside loopBars',
            path: ['tracks', trackIndex, 'pattern', noteIndex, 't'],
          });
        }
      });
    });
    if (notes > 2_048) context.addIssue({ code: 'custom', message: 'song has more than 2048 notes', path: ['tracks'] });
  });

export type Song = z.infer<typeof songSchema>;
export type SongTrack = Song['tracks'][number];
export type SongNote = SongTrack['pattern'][number];
