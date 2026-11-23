"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { detectPitch, rms } from "@/lib/audio/yin";
import {
  RmsGate,
  TuningStateMachine,
  type TunerMode,
  type TuningState,
} from "@/lib/audio/tuning-state";
import { isWorkletFrame } from "@/lib/audio/messages";
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
  | { kind: "paused" }
  | { kind: "error"; reason: TunerErrorReason };

export interface UseTunerResult {
  readonly status: TunerStatus;
  readonly tuning: TuningState;
  readonly start: () => Promise<void>;
  readonly pause: () => void;
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

  const pause = useCallback(() => {
    const currentKind = statusRef.current.kind;
    if (currentKind !== "listening" && currentKind !== "requesting") {
      return;
    }

    sessionIdRef.current += 1;
    startingRef.current = false;
    releaseAudioResources(true);
    updateStatus({ kind: "paused" });
  }, [releaseAudioResources, updateStatus]);

  const start = useCallback(async () => {
    if (startingRef.current || statusRef.current.kind === "listening") {
      return;
    }
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
          sessionIdRef.current += 1;
          startingRef.current = false;
          releaseAudioResources(true);
          updateStatus({ kind: "paused" });
        }
      };
      contextStateChangeRef.current = onContextStateChange;
      context.addEventListener("statechange", onContextStateChange);

      await context.resume();
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
          const detection =
            !detectionSuppressed && analysisGateRef.current?.update(frameRms)
            ? detectPitch(event.data.samples, event.data.sampleRate)
            : null;
          const nextTuning = tuningMachineRef.current?.process({
            detection,
            rms: frameRms,
            nowMs,
            mode: modeRef.current,
          });
          if (nextTuning !== undefined) {
            setTuning(nextTuning);
          }
        } catch (error: unknown) {
          failSession(sessionId, "unsupported", error);
        }
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(context.destination);
      updateStatus({ kind: "listening" });
    } catch (error: unknown) {
      if (sessionIdRef.current !== sessionId) {
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
  }, [failSession, releaseAudioResources, updateStatus]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pause();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sessionIdRef.current += 1;
      startingRef.current = false;
      releaseAudioResources(false);
    };
  }, [pause, releaseAudioResources]);

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
