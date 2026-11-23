import { describe, expect, test } from "vitest";

import {
  centsBetween,
  freqToMidiFloat,
  midiToFreq,
  nearestString,
  noteFromFreq,
  STRINGS,
} from "@/lib/audio/pitch";

describe("pitch conversions", () => {
  test("converts A4 and fractional MIDI notes", () => {
    expect(freqToMidiFloat(440)).toBeCloseTo(69, 12);
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(69.5)).toBeCloseTo(440 * 2 ** (0.5 / 12), 12);
  });

  test("reports note name, octave, MIDI number, and cents", () => {
    expect(noteFromFreq(440)).toEqual({
      name: "A",
      octave: 4,
      midi: 69,
      cents: 0,
    });
    expect(noteFromFreq(midiToFreq(40))).toEqual({
      name: "E",
      octave: 2,
      midi: 40,
      cents: 0,
    });
  });

  test.each([-50, 50])("measures a signed %i-cent offset", (cents) => {
    const offsetFrequency = 440 * 2 ** (cents / 1200);
    expect(centsBetween(offsetFrequency, 440)).toBeCloseTo(cents, 10);
  });
});

describe("standard guitar strings", () => {
  test("calculates standard tuning frequencies from MIDI notes", () => {
    expect(
      STRINGS.map(({ name, octave, frequency }) => ({
        note: `${name}${octave}`,
        frequency,
      })),
    ).toEqual([
      { note: "E2", frequency: expect.closeTo(82.41, 2) },
      { note: "A2", frequency: expect.closeTo(110, 2) },
      { note: "D3", frequency: expect.closeTo(146.83, 2) },
      { note: "G3", frequency: expect.closeTo(196, 2) },
      { note: "B3", frequency: expect.closeTo(246.94, 2) },
      { note: "E4", frequency: expect.closeTo(329.63, 2) },
    ]);
  });

  test("returns the closest string only when it is within the cent threshold", () => {
    const e2 = midiToFreq(40);
    const midpointBetweenE2AndA2 = e2 * 2 ** (250 / 1200);

    expect(nearestString(e2, 0)?.midi).toBe(40);
    expect(nearestString(midpointBetweenE2AndA2, 249.99)).toBeNull();
    expect(nearestString(midpointBetweenE2AndA2, 250)?.midi).toBe(40);
  });
});
