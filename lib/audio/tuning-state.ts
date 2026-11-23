import {
  IN_TUNE_ENTER_CENTS,
  IN_TUNE_EXIT_CENTS,
  IN_TUNE_MIN_FRAMES,
  MANUAL_LOCK_WINDOW_CENTS,
  NEAR_TUNE_CENTS,
  RMS_GATE_OFF,
  RMS_GATE_ON,
  SIGNAL_HOLD_MS,
  STRING_HIGHLIGHT_MAX_CENTS,
} from "@/lib/audio/constants";
import {
  centsBetween,
  freqToMidiFloat,
  midiToFreq,
  nearestString,
  noteFromFreq,
  STRINGS,
  type GuitarString,
  type PitchNote,
} from "@/lib/audio/pitch";
import { PitchSmoother } from "@/lib/audio/smoother";
import type { PitchDetection } from "@/lib/audio/yin";

export type TunerMode =
  | Readonly<{ kind: "auto" }>
  | Readonly<{ kind: "manual"; stringIndex: number }>;

export type TuningStatus =
  | "no-signal"
  | "out-of-tune"
  | "near"
  | "in-tune";

export type TuningState = Readonly<{
  status: TuningStatus;
  frequency: number | null;
  note: PitchNote | null;
  cents: number | null;
  direction: "flat" | "sharp" | null;
  confidence: number | null;
  highlightedStringIndex: number | null;
}>;

export interface TuningFrame {
  readonly detection: PitchDetection | null;
  readonly rms: number;
  readonly nowMs: number;
  readonly mode: TunerMode;
}

/** Stateful, deterministic frame processor for the tuner UI. */
export class TuningStateMachine {
  private readonly smoother = new PitchSmoother();
  private gateOpen = false;
  private lastValidAtMs: number | null = null;
  private lastProcessedAtMs: number | null = null;
  private lastMidiFloat: number | null = null;
  private lastConfidence: number | null = null;
  private previousModeKey: string | null = null;
  private inTune = false;
  private inTuneFrames = 0;

  /** Applies gate, lock, smoothing, hold, and tuning-state hysteresis to a frame. */
  process(frame: TuningFrame): TuningState {
    validateFrame(frame);
    if (
      this.lastProcessedAtMs !== null &&
      frame.nowMs < this.lastProcessedAtMs
    ) {
      throw new RangeError("nowMs must not move backwards");
    }
    this.lastProcessedAtMs = frame.nowMs;

    const modeKey = getModeKey(frame.mode);
    if (this.previousModeKey !== null && this.previousModeKey !== modeKey) {
      this.clearSignalState();
    }
    this.previousModeKey = modeKey;

    this.updateGate(frame.rms);
    const targetString = getTargetString(frame.mode);

    if (
      this.gateOpen &&
      frame.detection !== null &&
      this.isWithinManualLock(frame.detection, targetString)
    ) {
      this.lastMidiFloat = this.smoother.push(
        freqToMidiFloat(frame.detection.freq),
      );
      this.lastValidAtMs = frame.nowMs;
      this.lastConfidence = frame.detection.confidence;
      return this.createSignalState(frame.mode, targetString, true);
    }

    if (
      this.lastValidAtMs !== null &&
      this.lastMidiFloat !== null &&
      frame.nowMs - this.lastValidAtMs <= SIGNAL_HOLD_MS
    ) {
      return this.createSignalState(frame.mode, targetString, false);
    }

    this.clearSignalState();
    return this.noSignalState(targetString);
  }

  /** Resets gate, smoothing, hold, and in-tune state. */
  reset(): void {
    this.clearSignalState();
    this.gateOpen = false;
    this.lastProcessedAtMs = null;
    this.previousModeKey = null;
  }

  private updateGate(frameRms: number): void {
    if (this.gateOpen) {
      if (frameRms < RMS_GATE_OFF) {
        this.gateOpen = false;
      }
    } else if (frameRms > RMS_GATE_ON) {
      this.gateOpen = true;
    }
  }

  private isWithinManualLock(
    detection: PitchDetection,
    targetString: GuitarString | null,
  ): boolean {
    if (targetString === null) {
      return true;
    }
    return (
      Math.abs(centsBetween(detection.freq, targetString.frequency)) <=
      MANUAL_LOCK_WINDOW_CENTS
    );
  }

  private createSignalState(
    mode: TunerMode,
    targetString: GuitarString | null,
    advanceInTuneState: boolean,
  ): TuningState {
    if (this.lastMidiFloat === null || this.lastConfidence === null) {
      throw new RangeError("cannot create a signal state without a pitch");
    }

    const frequency = midiToFreq(this.lastMidiFloat);
    const note = noteFromFreq(frequency);
    const cents =
      targetString === null
        ? note.cents
        : centsBetween(frequency, targetString.frequency);
    if (advanceInTuneState) {
      this.updateInTuneState(cents);
    }

    const status = this.getTuningStatus(cents);
    const highlightedStringIndex =
      targetString?.stringIndex ??
      nearestString(frequency, STRING_HIGHLIGHT_MAX_CENTS)?.stringIndex ??
      null;

    return {
      status,
      frequency,
      note,
      cents,
      direction: cents < 0 ? "flat" : cents > 0 ? "sharp" : null,
      confidence: this.lastConfidence,
      highlightedStringIndex,
    };
  }

  private updateInTuneState(cents: number): void {
    const absoluteCents = Math.abs(cents);
    if (this.inTune) {
      if (absoluteCents > IN_TUNE_EXIT_CENTS) {
        this.inTune = false;
        this.inTuneFrames = 0;
      }
      return;
    }

    if (absoluteCents <= IN_TUNE_ENTER_CENTS) {
      this.inTuneFrames += 1;
      if (this.inTuneFrames >= IN_TUNE_MIN_FRAMES) {
        this.inTune = true;
      }
    } else {
      this.inTuneFrames = 0;
    }
  }

  private getTuningStatus(cents: number): TuningStatus {
    if (this.inTune) {
      return "in-tune";
    }
    return Math.abs(cents) <= NEAR_TUNE_CENTS ? "near" : "out-of-tune";
  }

  private noSignalState(targetString: GuitarString | null): TuningState {
    return {
      status: "no-signal",
      frequency: null,
      note: null,
      cents: null,
      direction: null,
      confidence: null,
      highlightedStringIndex: targetString?.stringIndex ?? null,
    };
  }

  private clearSignalState(): void {
    this.smoother.reset();
    this.lastValidAtMs = null;
    this.lastMidiFloat = null;
    this.lastConfidence = null;
    this.inTune = false;
    this.inTuneFrames = 0;
  }
}

function getTargetString(mode: TunerMode): GuitarString | null {
  if (mode.kind === "auto") {
    return null;
  }

  const targetString = STRINGS[mode.stringIndex];
  if (targetString === undefined) {
    throw new RangeError("manual mode stringIndex is outside standard tuning");
  }
  return targetString;
}

function getModeKey(mode: TunerMode): string {
  if (mode.kind === "auto") {
    return "auto";
  }
  if (!Number.isInteger(mode.stringIndex)) {
    throw new RangeError("manual mode stringIndex must be an integer");
  }
  return `manual:${mode.stringIndex}`;
}

function validateFrame(frame: TuningFrame): void {
  if (!Number.isFinite(frame.rms) || frame.rms < 0) {
    throw new RangeError("rms must be a finite non-negative number");
  }
  if (!Number.isFinite(frame.nowMs)) {
    throw new RangeError("nowMs must be a finite number");
  }
  if (frame.detection !== null) {
    if (!Number.isFinite(frame.detection.freq) || frame.detection.freq <= 0) {
      throw new RangeError("detection frequency must be a positive finite number");
    }
    if (
      !Number.isFinite(frame.detection.confidence) ||
      frame.detection.confidence < 0 ||
      frame.detection.confidence > 1
    ) {
      throw new RangeError("detection confidence must be between 0 and 1");
    }
  }
}
