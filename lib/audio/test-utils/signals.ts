export interface SineWaveOptions {
  readonly frequencyHz: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly amplitude?: number;
  readonly phaseRad?: number;
}

export interface HarmonicSignalOptions extends SineWaveOptions {
  readonly amplitudes: readonly number[];
}

export interface WhiteNoiseOptions {
  readonly length: number;
  readonly seed: number;
  readonly amplitude?: number;
}

export type HarmonicProfile =
  | "fundamental-dominant"
  | "fundamental-weak"
  | "three-harmonics";

/** Relative amplitudes for common synthetic guitar-string spectra. */
export const HARMONIC_PROFILES: Readonly<
  Record<HarmonicProfile, readonly number[]>
> = {
  "fundamental-dominant": [1, 0.35, 0.2],
  "fundamental-weak": [0.5, 1, 0.3],
  "three-harmonics": [1, 0.6, 0.35],
};

/** Generates a sine wave with a configurable sample rate, length, level, and phase. */
export function generateSineWave({
  frequencyHz,
  sampleRate,
  length,
  amplitude = 1,
  phaseRad = 0,
}: SineWaveOptions): Float32Array {
  assertPositiveFinite(frequencyHz, "frequencyHz");
  assertPositiveFinite(sampleRate, "sampleRate");
  assertSignalLength(length);
  assertFinite(amplitude, "amplitude");
  assertFinite(phaseRad, "phaseRad");

  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const timeSeconds = index / sampleRate;
    samples[index] =
      amplitude * Math.sin(2 * Math.PI * frequencyHz * timeSeconds + phaseRad);
  }
  return samples;
}

/** Generates a periodic signal whose amplitudes correspond to harmonics 1, 2, 3, ... */
export function generateHarmonicSignal({
  frequencyHz,
  sampleRate,
  length,
  amplitudes,
  phaseRad = 0,
}: HarmonicSignalOptions): Float32Array {
  assertPositiveFinite(frequencyHz, "frequencyHz");
  assertPositiveFinite(sampleRate, "sampleRate");
  assertSignalLength(length);
  assertFinite(phaseRad, "phaseRad");
  if (amplitudes.length === 0) {
    throw new RangeError("amplitudes must contain at least one harmonic");
  }
  for (const amplitude of amplitudes) {
    assertFinite(amplitude, "harmonic amplitude");
  }

  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const timeSeconds = index / sampleRate;
    let sample = 0;
    for (let harmonicIndex = 0; harmonicIndex < amplitudes.length; harmonicIndex += 1) {
      const harmonicAmplitude = amplitudes[harmonicIndex];
      if (harmonicAmplitude === undefined) {
        throw new RangeError("amplitudes must be a dense array");
      }
      const harmonicNumber = harmonicIndex + 1;
      sample +=
        harmonicAmplitude *
        Math.sin(
          2 * Math.PI * frequencyHz * harmonicNumber * timeSeconds +
            phaseRad * harmonicNumber,
        );
    }
    samples[index] = sample;
  }
  return samples;
}

/** Creates a reproducible uniform pseudo-random number generator using Mulberry32. */
export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new RangeError("seed must be an integer");
  }

  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generates deterministic uniform white noise in [-amplitude, amplitude]. */
export function generateWhiteNoise({
  length,
  seed,
  amplitude = 1,
}: WhiteNoiseOptions): Float32Array {
  assertSignalLength(length);
  if (!Number.isInteger(seed)) {
    throw new RangeError("seed must be an integer");
  }
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new RangeError("amplitude must be a finite non-negative number");
  }

  const random = createSeededRandom(seed);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = (random() * 2 - 1) * amplitude;
  }
  return samples;
}

/** Adds noise to a signal at the requested signal-to-noise ratio in decibels. */
export function mixAtSnr(
  signal: Float32Array,
  noise: Float32Array,
  snrDb: number,
): Float32Array {
  if (signal.length !== noise.length) {
    throw new RangeError("signal and noise must have equal lengths");
  }
  if (signal.length === 0) {
    throw new RangeError("signal and noise must not be empty");
  }
  assertFinite(snrDb, "snrDb");

  const signalRms = calculateRms(signal);
  const noiseRms = calculateRms(noise);
  if (signalRms === 0 || noiseRms === 0) {
    throw new RangeError("signal and noise must both have non-zero RMS");
  }

  const targetNoiseRms = signalRms / 10 ** (snrDb / 20);
  const noiseScale = targetNoiseRms / noiseRms;
  if (!Number.isFinite(noiseScale)) {
    throw new RangeError("snrDb is outside the supported numeric range");
  }

  const mixed = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const signalSample = signal[index];
    const noiseSample = noise[index];
    if (signalSample === undefined || noiseSample === undefined) {
      throw new RangeError("signal and noise must be dense arrays");
    }
    mixed[index] = signalSample + noiseSample * noiseScale;
  }
  return mixed;
}

function calculateRms(samples: Float32Array): number {
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

function assertSignalLength(length: number): void {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError("length must be a non-negative integer");
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}
