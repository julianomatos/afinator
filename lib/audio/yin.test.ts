import { describe, expect, test } from "vitest";

import {
  generateSineWave,
  generateWhiteNoise,
} from "@/lib/audio/test-utils/signals";
import { STRINGS } from "@/lib/audio/pitch";
import { detectPitch, rms } from "@/lib/audio/yin";

describe("YIN pitch detection", () => {
  test.each([44100, 48000])(
    "detects all standard strings at %i Hz sample rate",
    (sampleRate) => {
      for (const guitarString of STRINGS) {
        const detection = detectPitch(
          generateSineWave({
            frequencyHz: guitarString.frequency,
            sampleRate,
            length: 4096,
          }),
          sampleRate,
        );

        if (detection === null) {
          throw new Error(`no pitch detected for ${guitarString.name}${guitarString.octave}`);
        }

        const errorCents =
          1200 * Math.log2(detection.freq / guitarString.frequency);
        expect(Math.abs(errorCents)).toBeLessThanOrEqual(1.5);
        expect(detection.confidence).toBeGreaterThan(0.85);
      }
    },
  );

  test.each([44100, 48000])(
    "rejects silence and seeded white noise at %i Hz sample rate",
    (sampleRate) => {
      expect(detectPitch(new Float32Array(4096), sampleRate)).toBeNull();
      const rawNoise = generateWhiteNoise({
        length: 4096,
        seed: sampleRate,
      });
      const noiseScale = 0.05 / rms(rawNoise);
      const whiteNoise = Float32Array.from(
        rawNoise,
        (sample) => sample * noiseScale,
      );
      expect(rms(whiteNoise)).toBeCloseTo(0.05, 5);
      expect(detectPitch(whiteNoise, sampleRate)).toBeNull();
    },
  );
});

test("calculates RMS across the full sample buffer", () => {
  expect(rms(new Float32Array([3, 4]))).toBeCloseTo(Math.sqrt(12.5), 12);
});
