"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  REFERENCE_TONE_ATTACK_MS,
  REFERENCE_TONE_DETECTION_TAIL_MS,
  REFERENCE_TONE_DURATION_MS,
  REFERENCE_TONE_GAIN,
  REFERENCE_TONE_HARMONIC_CUTOFF_HZ,
  REFERENCE_TONE_HIGH_HARMONICS,
  REFERENCE_TONE_LOW_HARMONICS,
  REFERENCE_TONE_RELEASE_MS,
} from "@/lib/audio/constants";
import {
  sharedAudioContextManager,
  suspendPitchDetectionUntil,
  type AudioContextLease,
} from "@/hooks/audio-context";

interface ActiveTone {
  readonly lease: AudioContextLease;
  oscillator: OscillatorNode | null;
  gain: GainNode | null;
  stateChangeHandler: (() => void) | null;
  stopping: boolean;
}

export interface UseReferenceToneResult {
  readonly isPlaying: boolean;
  readonly play: (frequencyHz: number) => Promise<void>;
  readonly stop: () => void;
}

/** Returns the partial amplitudes used to synthesize a string's reference tone. */
export function getReferenceToneHarmonicAmplitudes(
  frequencyHz: number,
): readonly number[] {
  return frequencyHz < REFERENCE_TONE_HARMONIC_CUTOFF_HZ
    ? REFERENCE_TONE_LOW_HARMONICS
    : REFERENCE_TONE_HIGH_HARMONICS;
}

/** Plays a short, enveloped reference tone through the shared audio context. */
export function useReferenceTone(): UseReferenceToneResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const toneRef = useRef<ActiveTone | null>(null);
  const mountedRef = useRef(true);

  const finishTone = useCallback((tone: ActiveTone) => {
    if (toneRef.current !== tone) {
      return;
    }
    toneRef.current = null;

    const context = tone.lease.context;
    if (tone.stateChangeHandler !== null) {
      context.removeEventListener("statechange", tone.stateChangeHandler);
      tone.stateChangeHandler = null;
    }

    const oscillator = tone.oscillator;
    tone.oscillator = null;
    if (oscillator !== null) {
      oscillator.onended = null;
      oscillator.disconnect();
    }

    const gain = tone.gain;
    tone.gain = null;
    gain?.disconnect();

    suspendPitchDetectionUntil(
      performance.now() + REFERENCE_TONE_DETECTION_TAIL_MS,
    );
    tone.lease.release();
    if (mountedRef.current) {
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    const tone = toneRef.current;
    if (tone === null || tone.stopping) {
      return;
    }

    const contextState: string = tone.lease.context.state;
    if (
      tone.oscillator === null ||
      tone.gain === null ||
      contextState !== "running"
    ) {
      finishTone(tone);
      return;
    }

    tone.stopping = true;
    const stopAt = tone.lease.context.currentTime;
    const releaseSeconds = REFERENCE_TONE_RELEASE_MS / 1000;
    tone.gain.gain.cancelScheduledValues(stopAt);
    tone.gain.gain.setTargetAtTime(0, stopAt, releaseSeconds / 5);
    tone.oscillator.stop(stopAt + releaseSeconds);
  }, [finishTone]);

  const play = useCallback(
    async (frequencyHz: number): Promise<void> => {
      if (toneRef.current !== null) {
        stop();
        return;
      }
      if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
        throw new RangeError("frequencyHz must be a positive finite number");
      }
      if (
        typeof window === "undefined" ||
        typeof window.AudioContext !== "function"
      ) {
        throw new Error("AudioContext is unavailable");
      }

      const lease = sharedAudioContextManager.acquire();
      const tone: ActiveTone = {
        lease,
        oscillator: null,
        gain: null,
        stateChangeHandler: null,
        stopping: false,
      };
      toneRef.current = tone;

      const context = lease.context;
      const onContextStateChange = () => {
        const contextState: string = context.state;
        if (
          contextState === "interrupted" ||
          contextState === "closed" ||
          (contextState === "suspended" &&
            typeof document !== "undefined" &&
            document.visibilityState === "hidden")
        ) {
          finishTone(tone);
        }
      };
      tone.stateChangeHandler = onContextStateChange;
      context.addEventListener("statechange", onContextStateChange);

      try {
        await context.resume();
        if (toneRef.current !== tone) {
          return;
        }

        const amplitudes = getReferenceToneHarmonicAmplitudes(frequencyHz);
        const real = new Float32Array(amplitudes.length + 1);
        const imaginary = new Float32Array(amplitudes.length + 1);
        amplitudes.forEach((amplitude, index) => {
          imaginary[index + 1] = amplitude;
        });

        const gain = context.createGain();
        tone.gain = gain;
        const oscillator = context.createOscillator();
        tone.oscillator = oscillator;
        oscillator.frequency.setValueAtTime(frequencyHz, context.currentTime);
        oscillator.setPeriodicWave(
          context.createPeriodicWave(real, imaginary, {
            disableNormalization: false,
          }),
        );
        oscillator.connect(gain);
        gain.connect(context.destination);

        const startAt = context.currentTime;
        const attackSeconds = REFERENCE_TONE_ATTACK_MS / 1000;
        const durationSeconds = REFERENCE_TONE_DURATION_MS / 1000;
        const releaseSeconds = REFERENCE_TONE_RELEASE_MS / 1000;
        const toneEndsAt = startAt + durationSeconds;
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(
          REFERENCE_TONE_GAIN,
          startAt + attackSeconds,
        );
        gain.gain.setValueAtTime(REFERENCE_TONE_GAIN, toneEndsAt);
        gain.gain.linearRampToValueAtTime(0, toneEndsAt + releaseSeconds);

        oscillator.onended = () => finishTone(tone);
        oscillator.start(startAt);
        oscillator.stop(toneEndsAt + releaseSeconds);
        suspendPitchDetectionUntil(
          performance.now() +
            REFERENCE_TONE_DURATION_MS +
            REFERENCE_TONE_RELEASE_MS +
            REFERENCE_TONE_DETECTION_TAIL_MS,
        );
        if (mountedRef.current) {
          setIsPlaying(true);
        }
      } catch (error: unknown) {
        finishTone(tone);
        throw error;
      }
    },
    [finishTone, stop],
  );

  useEffect(() => {
    mountedRef.current = true;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mountedRef.current = false;
      const tone = toneRef.current;
      if (tone !== null) {
        stop();
      }
    };
  }, [stop]);

  return { isPlaying, play, stop };
}
