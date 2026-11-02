import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(binary, args) {
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} exited ${result.status}`);
}

function output(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${binary} exited ${result.status}`);
  return result.stdout;
}

const outDir = resolve(option('--out', join(gameRoot, '..', '..', '..', 'assets-local', 'sets', 'smallscaleint')));
const capturesDir = resolve(option('--captures', join(outDir, 'raw')));
const audioRoot = join(gameRoot, 'public', 'assets-local', 'audio');
const cues = JSON.parse(await readFile(join(gameRoot, 'src', 'trailer-cues.json'), 'utf8'));
const sceneIds = ['village', 'fight', 'loot', 'rural', 'interior', 'creatures'];
await mkdir(join(outDir, 'clips'), { recursive: true });

for (const id of sceneIds) {
  const source = join(capturesDir, id, 'desktop', 'run.mp4');
  const sourceProbe = JSON.parse(output('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', source,
  ]));
  const sourceDuration = Number(sourceProbe.format.duration);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error(`invalid ${id} capture duration`);
  const timing = (cues.sceneSeconds / sourceDuration).toFixed(12);
  run('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', source, '-t', String(cues.sceneSeconds), '-an',
    '-vf', `setpts=${timing}*PTS,tpad=stop_mode=clone:stop_duration=${cues.sceneSeconds},trim=duration=${cues.sceneSeconds},fps=60`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(outDir, 'clips', `${id}.mp4`),
  ]);
}

const clipInputs = sceneIds.flatMap((id) => ['-i', join(outDir, 'clips', `${id}.mp4`)]);
const concatLabels = sceneIds.map((_, index) => `[${index}:v]`).join('');
const sequence = join(outDir, 'sequence.mp4');
run('ffmpeg', [
  '-loglevel', 'error', '-y', ...clipInputs, '-filter_complex', `${concatLabels}concat=n=${sceneIds.length}:v=1:a=0[v]`,
  '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', sequence,
]);

const audioInputs = cues.cues.flatMap((cue) => ['-i', join(audioRoot, `${cue.sound}.ogg`)]);
const delayed = cues.cues.map((cue, index) => {
  const delay = Math.round(cue.at * 1_000);
  return `[${index + 1}:a]adelay=${delay}|${delay},volume=${cue.volume}[cue${index}]`;
});
const labels = cues.cues.map((_, index) => `[cue${index}]`).join('');
const filter = `${delayed.join(';')};${labels}amix=inputs=${cues.cues.length}:duration=longest:normalize=0,apad=pad_dur=${cues.duration},atrim=duration=${cues.duration},alimiter=limit=0.9[aout]`;
const trailer = join(outDir, 'trailer.mp4');
run('ffmpeg', [
  '-loglevel', 'error', '-y', '-i', sequence, ...audioInputs, '-filter_complex', filter,
  '-map', '0:v:0', '-map', '[aout]', '-t', String(cues.duration), '-c:v', 'copy', '-c:a', 'aac',
  '-b:a', '128k', '-movflags', '+faststart', trailer,
]);

const probe = JSON.parse(output('ffprobe', [
  '-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate:format=duration',
  '-of', 'json', trailer,
]));
const video = probe.streams.find(({ codec_type }) => codec_type === 'video');
const audio = probe.streams.find(({ codec_type }) => codec_type === 'audio');
const duration = Number(probe.format.duration);
if (!video || video.width !== 1440 || video.height !== 900 || video.avg_frame_rate !== '60/1') {
  throw new Error(`unexpected trailer video: ${JSON.stringify(video)}`);
}
if (!audio || Math.abs(duration - cues.duration) > 0.1) throw new Error(`unexpected trailer media: duration=${duration}`);
console.log(`built ${sceneIds.length} clips and ${duration.toFixed(2)} s trailer at 1440x900/60 fps`);
