import {
  EMA_ALPHA,
  JUMP_RESET_CENTS,
  MEDIAN_SIZE,
} from "@/lib/audio/constants";

/** Median filter followed by an EMA, both operating in fractional MIDI space. */
export class PitchSmoother {
  private readings: number[] = [];
  private smoothedMidiFloat: number | null = null;
  private pendingJumpMidiFloat: number | null = null;

  /** Adds a pitch reading and returns the median-and-EMA-smoothed MIDI value. */
  push(midiFloat: number): number {
    if (!Number.isFinite(midiFloat)) {
      throw new RangeError("midiFloat must be a finite number");
    }

    const currentMedian = this.currentMedian();
    if (
      currentMedian !== null &&
      Math.abs(midiFloat - currentMedian) * 100 > JUMP_RESET_CENTS
    ) {
      if (
        this.pendingJumpMidiFloat === null ||
        Math.abs(midiFloat - this.pendingJumpMidiFloat) * 100 > JUMP_RESET_CENTS
      ) {
        this.pendingJumpMidiFloat = midiFloat;
        return this.smoothedMidiFloat ?? currentMedian;
      }
      this.reset();
    }

    this.pendingJumpMidiFloat = null;
    this.readings.push(midiFloat);
    if (this.readings.length > MEDIAN_SIZE) {
      this.readings.shift();
    }

    const median = this.currentMedian();
    if (median === null) {
      throw new RangeError("cannot calculate a median from an empty reading window");
    }
    this.smoothedMidiFloat =
      this.smoothedMidiFloat === null
        ? median
        : this.smoothedMidiFloat + EMA_ALPHA * (median - this.smoothedMidiFloat);

    return this.smoothedMidiFloat;
  }

  /** Clears the median window, EMA value, and any unconfirmed jump. */
  reset(): void {
    this.readings = [];
    this.smoothedMidiFloat = null;
    this.pendingJumpMidiFloat = null;
  }

  private currentMedian(): number | null {
    if (this.readings.length === 0) {
      return null;
    }

    const sortedReadings = [...this.readings].sort((left, right) => left - right);
    const middleIndex = Math.floor(sortedReadings.length / 2);
    const middle = sortedReadings[middleIndex];
    if (middle === undefined) {
      return null;
    }
    if (sortedReadings.length % 2 === 1) {
      return middle;
    }

    const lowerMiddle = sortedReadings[middleIndex - 1];
    if (lowerMiddle === undefined) {
      return null;
    }
    return (lowerMiddle + middle) / 2;
  }
}
