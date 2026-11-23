"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { detectPitch, rms } from "@/lib/audio/yin";
import {
  RmsGate,
  TuningStateMachine,
  type TunerMode,
  type TuningState,
} from "@/lib/audio/tuning-state";
import { MANUAL_LOCK_WINDOW_CENTS } from "@/lib/audio/constants";
import { centsBetween, STRINGS } from "@/lib/audio/pitch";
import { isWorkletFrame } from "@/lib/audio/messages";
import { AUTO_RESUME_TIMEOUT_MS } from "@/lib/audio/constants";
import {
  updateInactivity,
  type InactivityState,
} from "@/lib/audio/inactivity";
import {
  isPitchDetectionSuspended,
  sharedAudioContextManager,
  type AudioContextLease,
} from "@/hooks/audio-context";

export type TunerErrorReason =
  | "permission-denied"
  | "no-device"
  | "unsupported"
  | "insecure-context";

export type TunerStatus =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "listening" }
  | {
      kind: "paused";
      reason:
        | "user"
        | "hidden"
        | "inactivity"
        | "resume-required"
        | "interrupted";
    }
  | { kind: "error"; reason: TunerErrorReason };

export interface UseTunerResult {
  readonly status: TunerStatus;
  readonly tuning: TuningState;
  readonly start: (stringIndex?: number) => Promise<void>;
  readonly pause: (
    reason?: "user" | "hidden" | "inactivity" | "interrupted",
  ) => void;
}

const MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

const NO_TUNING_SIGNAL: TuningState = {
  status: "no-signal",
  frequency: null,
  note: null,
  cents: null,
  direction: null,
  confidence: null,
  highlightedStringIndex: null,
};

/** Connects microphone capture and the worklet to the pure DSP pipeline. */
export function useTuner(mode: TunerMode): UseTunerResult {
  const [status, setStatus] = useState<TunerStatus>({ kind: "idle" });
  const [tuning, setTuning] = useState<TuningState>(NO_TUNING_SIGNAL);
  const statusRef = useRef<TunerStatus>({ kind: "idle" });
  const modeRef = useRef(mode);
  const sessionIdRef = useRef(0);
  const startingRef = useRef(false);
  const contextLeaseRef = useRef<AudioContextLease | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const contextStateChangeRef = useRef<(() => void) | null>(null);
  const tuningMachineRef = useRef<TuningStateMachine | null>(null);
  const analysisGateRef = useRef<RmsGate | null>(null);
  const inactivityStateRef = useRef<InactivityState>({
    lastActivityAtMs: null,
  });

  if (tuningMachineRef.current === null) {
    tuningMachineRef.current = new TuningStateMachine();
  }
  if (analysisGateRef.current === null) {
    analysisGateRef.current = new RmsGate();
  }

  const updateStatus = useCallback((nextStatus: TunerStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const releaseAudioResources = useCallback((clearTuning: boolean) => {
    const worklet = workletRef.current;
    workletRef.current = null;
    if (worklet !== null) {
      worklet.port.onmessage = null;
      worklet.port.close();
      worklet.disconnect();
    }

    const source = sourceRef.current;
    sourceRef.current = null;
    source?.disconnect();

    const silentGain = silentGainRef.current;
    silentGainRef.current = null;
    silentGain?.disconnect();

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const contextLease = contextLeaseRef.current;
    contextLeaseRef.current = null;
    const stateChangeHandler = contextStateChangeRef.current;
    contextStateChangeRef.current = null;
    if (contextLease !== null) {
      const context = contextLease.context;
      if (stateChangeHandler !== null) {
        context.removeEventListener("statechange", stateChangeHandler);
      }
      contextLease.release();
    }

    tuningMachineRef.current?.reset();
    analysisGateRef.current?.reset();
    inactivityStateRef.current = { lastActivityAtMs: null };
    if (clearTuning) {
      setTuning(NO_TUNING_SIGNAL);
    }
  }, []);

  const failSession = useCallback(
    (
      sessionId: number,
      reason: TunerErrorReason,
      error: unknown,
    ): void => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      sessionIdRef.current += 1;
      startingRef.current = false;
      if (reason === "unsupported") {
        console.error("Unable to start tuner audio capture.", error);
      }
      releaseAudioResources(true);
      updateStatus({ kind: "error", reason });
    },
    [releaseAudioResources, updateStatus],
  );

  const pause = useCallback(
    (
      reason:
        | "user"
        | "hidden"
        | "inactivity"
        | "interrupted" = "user",
    ) => {
      const currentKind = statusRef.current.kind;
      if (currentKind !== "listening" && currentKind !== "requesting") {
        return;
      }

      sessionIdRef.current += 1;
      startingRef.current = false;
      releaseAudioResources(true);
      updateStatus({ kind: "paused", reason });
    },
    [releaseAudioResources, updateStatus],
  );

  const start = useCallback(async (stringIndex?: number) => {
    if (startingRef.current || statusRef.current.kind === "listening") {
      return;
    }
    if (stringIndex !== undefined) {
      const selectedString = STRINGS[stringIndex];
      if (selectedString === undefined) {
        throw new RangeError("stringIndex is outside standard tuning");
      }
      modeRef.current = { kind: "manual", stringIndex };
    } else if (statusRef.current.kind === "idle") {
      modeRef.current = { kind: "auto" };
    }
    const automaticResume =
      statusRef.current.kind === "paused" &&
      statusRef.current.reason === "hidden" &&
      stringIndex === undefined;
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      updateStatus({ kind: "error", reason: "unsupported" });
      return;
    }
    if (!window.isSecureContext) {
      updateStatus({ kind: "error", reason: "insecure-context" });
      return;
    }
    if (
      typeof window.AudioContext !== "function" ||
      typeof AudioWorkletNode === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      updateStatus({ kind: "error", reason: "unsupported" });
      return;
    }

    startingRef.current = true;
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    updateStatus({ kind: "requesting" });
    releaseAudioResources(true);

    let stage: "audio-context" | "worklet" | "microphone" = "audio-context";
    try {
      const contextLease = sharedAudioContextManager.acquire();
      contextLeaseRef.current = contextLease;
      const context = contextLease.context;

      const onContextStateChange = () => {
        const contextState: string = context.state;
        if (
          contextState === "interrupted" &&
          sessionIdRef.current === sessionId
        ) {
          pause("interrupted");
        }
      };
      contextStateChangeRef.current = onContextStateChange;
      context.addEventListener("statechange", onContextStateChange);

      if (automaticResume) {
        const resumed = await resumeAudioContextWithTimeout(
          context,
          AUTO_RESUME_TIMEOUT_MS,
        );
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        if (!resumed) {
          sessionIdRef.current += 1;
          startingRef.current = false;
          releaseAudioResources(true);
          updateStatus({ kind: "paused", reason: "resume-required" });
          return;
        }
      } else {
        await context.resume();
      }
      if (sessionIdRef.current !== sessionId) {
        return;
      }

      if (typeof context.audioWorklet?.addModule !== "function") {
        throw new Error("AudioWorklet is unavailable");
      }
      stage = "worklet";
      await context.audioWorklet.addModule("/worklets/pitch-processor.js");
      if (sessionIdRef.current !== sessionId) {
        return;
      }

      stage = "microphone";
      const stream =
        await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
      if (sessionIdRef.current !== sessionId) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      stage = "worklet";

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack === undefined) {
        failSession(
          sessionId,
          "no-device",
          new Error("Microphone stream did not contain an audio track"),
        );
        return;
      }
      warnIfAudioConstraintsWereIgnored(audioTrack);

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      const worklet = new AudioWorkletNode(context, "pitch-processor");
      workletRef.current = worklet;
      const silentGain = context.createGain();
      silentGainRef.current = silentGain;
      silentGain.gain.value = 0;

      worklet.port.onmessage = (event: MessageEvent<unknown>) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        if (!isWorkletFrame(event.data)) {
          failSession(
            sessionId,
            "unsupported",
            new Error("AudioWorklet sent an invalid frame"),
          );
          return;
        }

        try {
          const frameRms = rms(event.data.samples);
          const nowMs = performance.now();
          const detectionSuppressed = isPitchDetectionSuspended(nowMs);
          if (detectionSuppressed) {
            analysisGateRef.current?.reset();
          }
          const gateOpen = detectionSuppressed
            ? false
            : (analysisGateRef.current?.update(frameRms) ?? false);
          const detection = gateOpen
            ? detectPitch(event.data.samples, event.data.sampleRate)
            : null;
          const mode = modeRef.current;
          const hasValidReading =
            detection !== null && isAcceptedDetection(detection.freq, mode);
          const nextTuning = tuningMachineRef.current?.process({
            detection,
            rms: frameRms,
            nowMs,
            mode,
          });
          if (nextTuning !== undefined) {
            setTuning(nextTuning);
          }
          const inactivity = updateInactivity(
            inactivityStateRef.current,
            nowMs,
            hasValidReading,
            detectionSuppressed,
          );
          inactivityStateRef.current = inactivity.state;
          if (inactivity.shouldPause) {
            pause("inactivity");
          }
        } catch (error: unknown) {
          failSession(sessionId, "unsupported", error);
        }
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(context.destination);
      inactivityStateRef.current = {
        lastActivityAtMs: performance.now(),
      };
      updateStatus({ kind: "listening" });
    } catch (error: unknown) {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      if (automaticResume && stage === "audio-context") {
        sessionIdRef.current += 1;
        startingRef.current = false;
        releaseAudioResources(true);
        updateStatus({ kind: "paused", reason: "resume-required" });
        return;
      }
      const mediaReason =
        stage === "microphone" ? getMediaErrorReason(error) : null;
      failSession(sessionId, mediaReason ?? "unsupported", error);
    } finally {
      if (sessionIdRef.current === sessionId) {
        startingRef.current = false;
      }
    }
  }, [failSession, pause, releaseAudioResources, updateStatus]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pause("hidden");
      } else if (
        statusRef.current.kind === "paused" &&
        statusRef.current.reason === "hidden"
      ) {
        void start().catch((error: unknown) => {
          console.error("Não foi possível retomar o afinador.", error);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sessionIdRef.current += 1;
      startingRef.current = false;
      releaseAudioResources(false);
    };
  }, [pause, releaseAudioResources, start]);

  return { status, tuning, start, pause };
}

/** Maps browser media-capture exceptions to the public tuner error states. */
export function getMediaErrorReason(error: unknown): TunerErrorReason | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("name" in error) ||
    typeof error.name !== "string"
  ) {
    return null;
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "permission-denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no-device";
    case "NotSupportedError":
      return "unsupported";
    default:
      return null;
  }
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function isAcceptedDetection(frequencyHz: number, mode: TunerMode): boolean {
  if (mode.kind === "auto") {
    return true;
  }
  const targetString = STRINGS[mode.stringIndex];
  return (
    targetString !== undefined &&
    Math.abs(centsBetween(frequencyHz, targetString.frequency)) <=
      MANUAL_LOCK_WINDOW_CENTS
  );
}

function resumeAudioContextWithTimeout(
  context: AudioContext,
  timeoutMs: number,
): Promise<boolean> {
  if (context.state === "running") {
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (resumed: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      context.removeEventListener("statechange", handleStateChange);
      resolve(resumed);
    };
    const handleStateChange = () => {
      if (context.state === "running") {
        finish(true);
      }
    };
    const timeoutId = window.setTimeout(
      () => finish(context.state === "running"),
      timeoutMs,
    );
    context.addEventListener("statechange", handleStateChange);

    void context.resume().then(
      () => handleStateChange(),
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        context.removeEventListener("statechange", handleStateChange);
        reject(error);
      },
    );
    handleStateChange();
  });
}

function warnIfAudioConstraintsWereIgnored(track: MediaStreamTrack): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const settings = track.getSettings();
  const ignored: string[] = [];
  if (settings.echoCancellation !== false) {
    ignored.push("echoCancellation");
  }
  if (settings.noiseSuppression !== false) {
    ignored.push("noiseSuppression");
  }
  if (settings.autoGainControl !== false) {
    ignored.push("autoGainControl");
  }
  if (settings.channelCount !== 1) {
    ignored.push("channelCount");
  }
  if (ignored.length > 0) {
    console.warn(
      `The browser did not honor requested microphone settings: ${ignored.join(", ")}`,
    );
  }
}
