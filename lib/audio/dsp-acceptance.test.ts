import { describe, expect, test } from "vitest";

import { RMS_GATE_ON } from "@/lib/audio/constants";
import {
  centsBetween,
  freqToMidiFloat,
  midiToFreq,
  STRINGS,
} from "@/lib/audio/pitch";
import {
  generateHarmonicSignal,
  generateWhiteNoise,
  HARMONIC_PROFILES,
  mixAtSnr,
  type HarmonicProfile,
} from "@/lib/audio/test-utils/signals";
import { detectPitch, rms } from "@/lib/audio/yin";
import { TuningStateMachine } from "@/lib/audio/tuning-state";

const DEVIATIONS_CENTS = [-40, -15, -5, 0, 5, 15, 40];
const HARMONIC_CASES: readonly {
  readonly name: HarmonicProfile;
  readonly amplitudes: readonly number[];
}[] = [
  {
    name: "fundamental-dominant",
    amplitudes: HARMONIC_PROFILES["fundamental-dominant"],
  },
  {
    name: "fundamental-weak",
    amplitudes: HARMONIC_PROFILES["fundamental-weak"],
  },
  {
    name: "three-harmonics",
    amplitudes: HARMONIC_PROFILES["three-harmonics"],
  },
];

const ACCEPTANCE_CONFIGURATIONS: readonly {
  readonly sampleRate: number;
  readonly snrDb: number;
}[] = [
  { sampleRate: 44100, snrDb: 30 },
  { sampleRate: 44100, snrDb: 20 },
  { sampleRate: 48000, snrDb: 30 },
  { sampleRate: 48000, snrDb: 20 },
];

describe("DSP acceptance matrix A1 and A3", () => {
  test.each(ACCEPTANCE_CONFIGURATIONS)(
    "$sampleRate Hz, $snrDb dB SNR",
    ({ sampleRate, snrDb }) => {
      const maximumErrorCents = snrDb === 30 ? 1.5 : 5.5;

      for (const guitarString of STRINGS) {
        for (const [deviationIndex, deviationCents] of DEVIATIONS_CENTS.entries()) {
          const targetFrequency = midiToFreq(
            guitarString.midi + deviationCents / 100,
          );
          for (const [profileIndex, profile] of HARMONIC_CASES.entries()) {
            const cleanSignal = generateHarmonicSignal({
              frequencyHz: targetFrequency,
              sampleRate,
              length: 4096,
              amplitudes: profile.amplitudes,
            });
            const noise = generateWhiteNoise({
              length: cleanSignal.length,
              seed:
                guitarString.midi * 100_000 +
                sampleRate +
                deviationIndex * 100 +
                profileIndex * 10 +
                snrDb,
            });
            const samples = mixAtSnr(cleanSignal, noise, snrDb);
            const detection = detectPitch(samples, sampleRate);
            const caseDescription =
              `${guitarString.name}${guitarString.octave} ${deviationCents} cents, ` +
              `${profile.name}, ${sampleRate} Hz, ${snrDb} dB SNR`;

            if (detection === null) {
              throw new Error(`YIN returned no pitch for ${caseDescription}`);
            }

            const errorCents = Math.abs(
              centsBetween(detection.freq, targetFrequency),
            );
            expect(errorCents, caseDescription).toBeLessThanOrEqual(
              maximumErrorCents,
            );
            expect(
              Math.round(freqToMidiFloat(detection.freq)),
              caseDescription,
            ).toBe(guitarString.midi);
          }
        }
      }
    },
    60_000,
  );
});

describe("DSP silence and noise acceptance A2", () => {
  test(
    "rejects 1000 frames of silence, sub-gate noise, and high-level white noise",
    () => {
      const frames = 1000;
      const sampleRate = 44100;
      const silence = new Float32Array(4096);
      const subGateNoise = generateWhiteNoise({
        length: 4096,
        seed: 1,
        amplitude: RMS_GATE_ON / 2,
      });
      const subGateRms = rms(subGateNoise);
      const tuner = new TuningStateMachine();

      expect(subGateRms).toBeLessThan(RMS_GATE_ON);
      for (let frame = 0; frame < frames; frame += 1) {
        expect(detectPitch(silence, sampleRate)).toBeNull();
        expect(
          tuner.process({
            detection: null,
            rms: subGateRms,
            nowMs: frame,
            mode: { kind: "auto" },
          }).status,
        ).toBe("no-signal");

        const highLevelNoise = noiseAtRms(10_000 + frame, 0.05);
        expect(rms(highLevelNoise)).toBeCloseTo(0.05, 5);
        expect(detectPitch(highLevelNoise, sampleRate)).toBeNull();
      }
    },
    120_000,
  );
});

function noiseAtRms(seed: number, targetRms: number): Float32Array {
  const noise = generateWhiteNoise({ length: 4096, seed });
  const scale = targetRms / rms(noise);
  return Float32Array.from(noise, (sample) => sample * scale);
}
