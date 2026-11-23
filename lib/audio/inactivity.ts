import { IDLE_TIMEOUT_MS } from "@/lib/audio/constants";

export interface InactivityState {
  readonly lastActivityAtMs: number | null;
}

export interface InactivityUpdate {
  readonly state: InactivityState;
  readonly shouldPause: boolean;
}

/** Updates the idle timer from valid pitch readings and reference-tone suspension. */
export function updateInactivity(
  state: InactivityState,
  nowMs: number,
  hasValidReading: boolean,
  detectionSuspended: boolean,
): InactivityUpdate {
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("nowMs must be a finite number");
  }
  if (
    state.lastActivityAtMs !== null &&
    (!Number.isFinite(state.lastActivityAtMs) || state.lastActivityAtMs > nowMs)
  ) {
    throw new RangeError("lastActivityAtMs must be finite and not exceed nowMs");
  }

  if (hasValidReading || detectionSuspended || state.lastActivityAtMs === null) {
    return {
      state: { lastActivityAtMs: nowMs },
      shouldPause: false,
    };
  }

  return {
    state,
    shouldPause: nowMs - state.lastActivityAtMs >= IDLE_TIMEOUT_MS,
  };
}
