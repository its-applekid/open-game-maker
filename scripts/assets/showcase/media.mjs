export const publicationAttributes = Object.freeze({
  autoPlay: true,
  loop: true,
  muted: true,
  playsInline: true,
});

export function mp4Args({ width, height, fps }) {
  return [
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${width}x${height}`,
    "-framerate", String(fps),
    "-i", "-",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
  ];
}

export function gifArgs({ fps }) {
  return [
    "-vf", `fps=${fps},scale=256:256:flags=area,split[a][b];[a]palettegen[p];[b][p]paletteuse`,
    "-loop", "0",
  ];
}
