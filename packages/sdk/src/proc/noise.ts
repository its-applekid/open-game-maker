import FastNoiseLite, { type FastNoiseType } from 'fastnoise-lite';

export type NoiseType = FastNoiseType;

export interface Noise2 {
  at2(x: number, y: number): number;
}

export interface Noise extends Noise2 {
  at3(x: number, y: number, z: number): number;
}

export interface NoiseOptions {
  type?: NoiseType;
  frequency?: number;
}

export interface OctaveOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
}

export function createNoise(seed: number, options: NoiseOptions = {}): Noise {
  if (!Number.isFinite(seed)) throw new RangeError('noise seed must be finite');
  const frequency = options.frequency ?? 0.01;
  if (!Number.isFinite(frequency) || frequency < 0) {
    throw new RangeError('noise frequency must be a non-negative finite number');
  }

  const noise = new FastNoiseLite(seed);
  noise.SetNoiseType(FastNoiseLite.NoiseType[options.type ?? 'OpenSimplex2']);
  noise.SetFrequency(frequency);
  return {
    at2: (x, y) => noise.GetNoise(x, y),
    at3: (x, y, z) => noise.GetNoise(x, y, z),
  };
}

function octaveSettings(options: OctaveOptions, defaults: Required<OctaveOptions>): Required<OctaveOptions> {
  const settings = { ...defaults, ...options };
  if (!Number.isInteger(settings.octaves) || settings.octaves < 1) {
    throw new RangeError('noise octaves must be a positive integer');
  }
  if (!Number.isFinite(settings.lacunarity) || !Number.isFinite(settings.gain)) {
    throw new RangeError('noise lacunarity and gain must be finite');
  }
  return settings;
}

export function fbm(noise: Noise2, x: number, y: number, options: OctaveOptions = {}): number {
  const { octaves, lacunarity, gain } = octaveSettings(options, {
    octaves: 5,
    lacunarity: 2.03,
    gain: 0.5,
  });
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * (0.5 + 0.5 * noise.at2(x * frequency, y * frequency));
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum;
}

export function ridge(noise: Noise2, x: number, y: number, options: OctaveOptions = {}): number {
  const { octaves, lacunarity, gain } = octaveSettings(options, {
    octaves: 6,
    lacunarity: 2.1,
    gain: 0.5,
  });
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    const value = 1 - Math.abs(noise.at2(x * frequency, y * frequency));
    sum += amplitude * value * value;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum;
}
