import { A4_HZ } from "@/lib/audio/constants";

export type NoteName =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

export type PitchNote = Readonly<{
  name: NoteName;
  octave: number;
  midi: number;
  cents: number;
}>;

export type GuitarString = Readonly<{
  stringIndex: number;
  stringNumber: number;
  name: NoteName;
  octave: number;
  midi: number;
  frequency: number;
}>;

const NOTE_NAMES: readonly NoteName[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const STANDARD_TUNING: readonly Omit<GuitarString, "frequency" | "stringIndex">[] = [
  { stringNumber: 6, name: "E", octave: 2, midi: 40 },
  { stringNumber: 5, name: "A", octave: 2, midi: 45 },
  { stringNumber: 4, name: "D", octave: 3, midi: 50 },
  { stringNumber: 3, name: "G", octave: 3, midi: 55 },
  { stringNumber: 2, name: "B", octave: 3, midi: 59 },
  { stringNumber: 1, name: "E", octave: 4, midi: 64 },
];

/** Converts a positive frequency in hertz to its fractional MIDI note number. */
export function freqToMidiFloat(freq: number): number {
  assertPositiveFinite(freq, "freq");
  return 69 + 12 * Math.log2(freq / A4_HZ);
}

/** Converts a MIDI note number (including fractional values) to hertz. */
export function midiToFreq(midi: number): number {
  if (!Number.isFinite(midi)) {
    throw new RangeError("midi must be a finite number");
  }
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

/** Finds the nearest equal-tempered note and its deviation in cents. */
export function noteFromFreq(freq: number): PitchNote {
  const midiFloat = freqToMidiFloat(freq);
  const midi = Math.round(midiFloat);
  const noteIndex = ((midi % 12) + 12) % 12;
  const name = NOTE_NAMES[noteIndex];

  if (name === undefined) {
    throw new RangeError("frequency is outside the supported MIDI note range");
  }

  return {
    name,
    octave: Math.floor(midi / 12) - 1,
    midi,
    cents: 100 * (midiFloat - midi),
  };
}

/** Returns the signed cent distance from a measured frequency to a target frequency. */
export function centsBetween(freq: number, target: number): number {
  assertPositiveFinite(freq, "freq");
  assertPositiveFinite(target, "target");
  return 1200 * Math.log2(freq / target);
}

/** Standard guitar tuning, ordered from the lowest-pitched string to the highest. */
export const STRINGS: readonly GuitarString[] = STANDARD_TUNING.map(
  (guitarString, stringIndex) => ({
    ...guitarString,
    stringIndex,
    frequency: midiToFreq(guitarString.midi),
  }),
);

/** Returns the closest standard guitar string if it is within maxCents, otherwise null. */
export function nearestString(freq: number, maxCents: number): GuitarString | null {
  assertPositiveFinite(freq, "freq");
  if (!Number.isFinite(maxCents) || maxCents < 0) {
    throw new RangeError("maxCents must be a finite non-negative number");
  }

  let nearest: GuitarString | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const guitarString of STRINGS) {
    const distance = Math.abs(centsBetween(freq, guitarString.frequency));
    if (distance < nearestDistance) {
      nearest = guitarString;
      nearestDistance = distance;
    }
  }

  return nearest !== null && nearestDistance <= maxCents ? nearest : null;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}
