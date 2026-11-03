const palettes = {
  dust: [[201, 165, 104], [231, 199, 139]],
  "falling-leaves": [[180, 91, 42], [224, 153, 52], [121, 139, 57]],
  pollen: [[238, 217, 111], [250, 235, 151]],
  embers: [[255, 94, 28], [255, 185, 58], [225, 52, 22]],
};

export const supportedWeatherKinds = new Set(["rain", "snow", ...Object.keys(palettes)]);

export function weatherLayers(weather) {
  return Array.isArray(weather) ? weather : weather ? [weather] : [];
}

export function validWeather(weather) {
  const layers = weatherLayers(weather);
  return layers.length > 0 && layers.every(
    (layer) => supportedWeatherKinds.has(layer?.kind) &&
      Number.isInteger(layer?.count) && layer.count > 0 &&
      (layer.wind === undefined || Number.isFinite(layer.wind)),
  );
}

function seedNumber(value) {
  let seed = 2166136261;
  for (const char of String(value)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

function random(seed) {
  let value = seed || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function blend(frame, x, y, rgb, alpha) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return;
  const index = (py * frame.width + px) * 4;
  const inverse = 255 - alpha;
  for (let channel = 0; channel < 3; channel += 1) {
    frame.data[index + channel] =
      (rgb[channel] * alpha + frame.data[index + channel] * inverse + 127) / 255;
  }
}

export function weatherTrajectories(frame, weather, tau, loopSeconds = 24) {
  if (!["rain", "snow"].includes(weather?.kind) || !(weather.count > 0)) return [];
  const loopTime = ((tau % loopSeconds) + loopSeconds) % loopSeconds;
  const next = random(seedNumber(`${weather.kind}:${weather.seed ?? "showcase"}`));
  const cycles = weather.kind === "snow" ? [2, 3, 4, 6] : [8, 10, 12, 16];
  const margin = weather.kind === "snow" ? 24 : 80;
  const span = frame.height + margin;
  const wind = weather.wind ?? (weather.kind === "snow" ? 18 : 32);
  const result = [];
  for (let index = 0; index < weather.count; index += 1) {
    const period = loopSeconds / cycles[Math.floor(next() * cycles.length)];
    const phase = next() * period;
    const baseX = next() * (frame.width + 120) - 60;
    const progress = ((loopTime + phase) % period) / period;
    const swayPhase = next() * Math.PI * 2;
    const y = progress * span - margin / 2;
    const x = baseX + progress * wind +
      (weather.kind === "snow" ? Math.sin(progress * Math.PI * 2 + swayPhase) * 5 : 0);
    result.push({ id: index, x, y, progress, period, sizeSeed: next() });
  }
  return result;
}

function drawPrecipitation(frame, weather, tau, loopSeconds, opacity) {
  for (const particle of weatherTrajectories(frame, weather, tau, loopSeconds)) {
    if (weather.kind === "snow") {
      const alpha = Math.round((120 + Math.floor(particle.sizeSeed * 80)) * opacity);
      const radius = particle.sizeSeed > 0.65 ? 2 : 1;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) <= radius + 1) {
            blend(frame, particle.x + dx, particle.y + dy, [232, 242, 245], alpha);
          }
        }
      }
      continue;
    }
    const length = 8 + Math.floor(particle.sizeSeed * 16);
    const width = 1 + Math.floor(particle.sizeSeed * 3);
    const alpha = Math.round((70 + Math.floor(particle.sizeSeed * 60)) * opacity);
    for (let step = 0; step < length; step += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        blend(frame, particle.x + dx - step * 0.22, particle.y + step, [184, 220, 226], alpha);
      }
    }
  }
}

function drawMotes(frame, weather, tau, loopSeconds, opacity, next) {
  const palette = palettes[weather.kind];
  const upward = weather.kind === "embers";
  const drift = weather.kind === "dust" ? 28 : weather.kind === "falling-leaves" ? 18 : 10;
  for (let index = 0; index < weather.count; index += 1) {
    const period = loopSeconds / (4 + Math.floor(next() * 5));
    const phase = next() * period;
    const progress = ((tau + phase) % period) / period;
    const baseX = next() * frame.width;
    const baseY = next() * frame.height;
    const direction = upward ? -1 : 1;
    const travel = weather.kind === "dust" ? 44 : frame.height * 0.28;
    const x = baseX + Math.sin(progress * Math.PI * 2 + next() * 4) * drift;
    const y = (baseY + direction * progress * travel + frame.height) % frame.height;
    const rgb = palette[Math.floor(next() * palette.length)];
    const radius = weather.kind === "falling-leaves" ? 2 : 1;
    const alpha = Math.round((weather.kind === "dust" ? 48 : 85 + Math.floor(next() * 70)) * opacity);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) <= radius + 1) blend(frame, x + dx, y + dy, rgb, alpha);
      }
    }
  }
}

export function drawWeather(frame, weather, tau, loopSeconds = 24, opacity = 1) {
  if (!weather?.kind || !(weather.count > 0) || opacity <= 0) return;
  const loopTime = ((tau % loopSeconds) + loopSeconds) % loopSeconds;
  const next = random(seedNumber(`${weather.kind}:${weather.seed ?? "showcase"}`));
  if (weather.kind === "rain" || weather.kind === "snow") {
    drawPrecipitation(frame, weather, loopTime, loopSeconds, opacity);
    return;
  }
  if (palettes[weather.kind]) drawMotes(frame, weather, loopTime, loopSeconds, opacity, next);
}

export function drawWeatherLayers(frame, weather, tau, loopSeconds = 24, opacity = 1) {
  for (const layer of weatherLayers(weather)) drawWeather(frame, layer, tau, loopSeconds, opacity);
}
