declare module 'fastnoise-lite' {
  export type FastNoiseType = 'OpenSimplex2' | 'Perlin' | 'Value' | 'Cellular';

  export default class FastNoiseLite {
    static readonly NoiseType: Readonly<Record<FastNoiseType, FastNoiseType>>;

    constructor(seed?: number);
    SetSeed(seed: number): void;
    SetFrequency(frequency: number): void;
    SetNoiseType(type: FastNoiseType): void;
    GetNoise(x: number, y: number, z?: number): number;
  }
}
