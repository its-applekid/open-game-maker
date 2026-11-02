import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { outputName } from './files.js';
import { manifestAsset, type BuildJob, type FreshJobResult } from './types.js';

const execFileAsync = promisify(execFile);

export async function buildAudio(job: BuildJob): Promise<FreshJobResult> {
  const item = job.items[0]!;
  const scratch = await mkdtemp(join(tmpdir(), 'gm-build-audio-'));
  const target = join(scratch, 'output.mp3');
  try {
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-i',
          item.source,
          '-af',
          'loudnorm=I=-16:TP=-1.5',
          '-codec:a',
          'libmp3lame',
          '-q:a',
          '4',
          target,
        ],
        { maxBuffer: 4 * 1024 * 1024, timeout: 120_000, killSignal: 'SIGKILL' },
      );
    } catch (error) {
      const detail = (error as { stderr?: string }).stderr?.trim().split('\n').slice(-2).join(' ') || String(error);
      throw new Error(`${item.entry.id}: ffmpeg failed: ${detail}`, { cause: error });
    }
    const bytes = await readFile(target);
    const name = outputName(job.slug, '*', bytes, 'mp3');
    return {
      files: { [name]: { bytes: bytes.length, decoders: [] } },
      assets: { [item.entry.id]: manifestAsset(item, { '*': name }) },
      buffers: { [name]: bytes },
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
