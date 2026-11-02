import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function issue(file, detail) {
  return { path: file, detail };
}

export function topLevelMp4Atoms(data) {
  const atoms = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    let size = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) throw new Error("truncated extended MP4 atom");
      size = Number(data.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = data.length - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || offset + size > data.length) {
      throw new Error(`invalid MP4 atom ${type || "<unknown>"} at ${offset}`);
    }
    atoms.push(type);
    offset += size;
  }
  if (offset !== data.length) throw new Error(`trailing ${data.length - offset} bytes after MP4 atoms`);
  return atoms;
}

export function inspectGif(data) {
  const signature = data.toString("ascii", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new Error("not a GIF87a/GIF89a file");
  }
  if (data.length < 10) throw new Error("truncated GIF header");
  const application = data.indexOf(Buffer.from("NETSCAPE2.0"));
  const loops = application < 0 || application + 15 > data.length
    ? undefined
    : data.readUInt16LE(application + 13);
  return {
    width: data.readUInt16LE(6),
    height: data.readUInt16LE(8),
    loops,
  };
}

async function inspectMp4(file) {
  const [{ stdout }, data] = await Promise.all([
    execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,profile,pix_fmt,width,height:format=duration",
      "-of", "json",
      file,
    ], { timeout: 30_000 }),
    readFile(file),
  ]);
  const probe = JSON.parse(stdout);
  return {
    ...probe.streams?.[0],
    duration: Number(probe.format?.duration),
    atoms: topLevelMp4Atoms(data),
  };
}

async function verifyTrack({ media, output, width, height, seconds, fps, library }) {
  const mp4File = path.join(output, media.mp4);
  const gifFile = path.join(output, media.gif);
  const posterFile = path.join(output, media.poster);
  const [video, gif, poster] = await Promise.all([
    inspectMp4(mp4File),
    readFile(gifFile).then(inspectGif),
    library.sharp().then((sharp) => sharp(posterFile).metadata()),
  ]);
  const details = [];

  if (video.codec_name !== "h264") details.push(`codec is ${video.codec_name}, expected h264`);
  if (!/^(?:Constrained Baseline|Baseline|Main|High)/u.test(video.profile ?? "")) {
    details.push(`H.264 profile is ${video.profile ?? "missing"}`);
  }
  if (video.pix_fmt !== "yuv420p") details.push(`pixel format is ${video.pix_fmt}, expected yuv420p`);
  if (video.width !== width || video.height !== height || width !== height) {
    details.push(`video dimensions are ${video.width}x${video.height}, expected ${width}x${height}`);
  }
  if (!Number.isFinite(video.duration) || Math.abs(video.duration - seconds) > Math.max(0.05, 1 / fps)) {
    details.push(`video duration is ${video.duration}, expected ${seconds}`);
  }
  if (video.atoms.indexOf("moov") < 0 || video.atoms.indexOf("mdat") < 0 || video.atoms.indexOf("moov") > video.atoms.indexOf("mdat")) {
    details.push("MP4 does not place moov before mdat");
  }
  if (gif.width !== gif.height || gif.width === 0) {
    details.push(`GIF dimensions are ${gif.width}x${gif.height}, expected a non-empty square`);
  }
  if (gif.loops !== 0) details.push(`GIF loop count is ${gif.loops ?? "missing"}, expected infinite (0)`);
  if (poster.width !== width || poster.height !== height || width !== height) {
    details.push(`poster dimensions are ${poster.width}x${poster.height}, expected ${width}x${height}`);
  }
  return details;
}

export async function verifyShowcaseMedia({ manifest, output, project, library }) {
  const issues = [];
  const [width, height] = project.sequence.layout.viewport;
  const fps = project.sequence.fps ?? 24;
  const stops = new Map(project.sequence.stops.map((stop) => [stop.id, stop]));

  for (const entry of manifest.stops) {
    const stop = stops.get(entry.id);
    for (const track of ["region", "sheet"]) {
      const at = `${entry.id}.${track}`;
      try {
        const details = await verifyTrack({
          media: entry[track],
          output,
          width,
          height,
          seconds: stop.seconds,
          fps,
          library,
        });
        for (const detail of details) issues.push(issue(at, detail));
      } catch (error) {
        issues.push(issue(at, error.message));
      }
    }
  }
  return issues;
}
