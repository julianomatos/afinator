import { describe, expect, test } from "vitest";

import {
  createSeededRandom,
  generateHarmonicSignal,
  generateSineWave,
  generateWhiteNoise,
  HARMONIC_PROFILES,
  mixAtSnr,
} from "@/lib/audio/test-utils/signals";

describe("synthetic signals", () => {
  test("generates a sine wave and a configurable harmonic sum", () => {
    const sine = generateSineWave({
      frequencyHz: 1,
      sampleRate: 4,
      length: 4,
    });
    const harmonics = generateHarmonicSignal({
      frequencyHz: 1,
      sampleRate: 4,
      length: 4,
      amplitudes: [1, 0.5],
    });

    expect(sine[1]).toBeCloseTo(1);
    expect(harmonics[1]).toBeCloseTo(1);
    expect(HARMONIC_PROFILES["fundamental-weak"]).toEqual([0.5, 1, 0.3]);
  });

  test("reproduces white noise for the same seed", () => {
    const first = generateWhiteNoise({ length: 256, seed: 12345 });
    const second = generateWhiteNoise({ length: 256, seed: 12345 });
    const differentSeed = generateWhiteNoise({ length: 256, seed: 12346 });

    expect(first).toEqual(second);
    expect(first).not.toEqual(differentSeed);
    expect(createSeededRandom(7)()).toBe(createSeededRandom(7)());
  });

  test("mixes noise at the requested SNR without mutating its inputs", () => {
    const signal = generateSineWave({
      frequencyHz: 5,
      sampleRate: 1000,
      length: 1000,
    });
    const noise = generateWhiteNoise({ length: 1000, seed: 42 });
    const originalSignal = signal.slice();
    const originalNoise = noise.slice();
    const mixed = mixAtSnr(signal, noise, 20);

    let signalPower = 0;
    let noisePower = 0;
    for (let index = 0; index < signal.length; index += 1) {
      const signalSample = signal[index];
      const noiseSample = noise[index];
      const mixedSample = mixed[index];
      if (
        signalSample === undefined ||
        noiseSample === undefined ||
        mixedSample === undefined
      ) {
        throw new Error("generated signal unexpectedly has a missing sample");
      }
      signalPower += signalSample * signalSample;
      noisePower += (mixedSample - signalSample) ** 2;
    }

    const actualSnrDb = 10 * Math.log10(signalPower / noisePower);
    expect(actualSnrDb).toBeCloseTo(20, 1);
    expect(signal).toEqual(originalSignal);
    expect(noise).toEqual(originalNoise);
  });
});
