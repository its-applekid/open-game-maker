import { readFile, writeFile } from 'node:fs/promises';

export function silentWav(durationMs = 1_000, rate = 24_000): Buffer {
  const audio = Buffer.alloc((rate * durationMs * 2) / 1_000);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audio.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

// Stands in for ffmpeg so results don't depend on the runner having it: rejects non-WAV input like ffmpeg does.
export async function fakeTranscode(wavPath: string, opusPath: string): Promise<void> {
  const wav = await readFile(wavPath);
  if (wav.subarray(0, 4).toString('latin1') !== 'RIFF') throw new Error('invalid WAV');
  await writeFile(opusPath, Buffer.concat([Buffer.from('OggS'), wav.subarray(44, 64)]));
}
