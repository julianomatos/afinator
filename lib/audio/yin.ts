import {
  MAX_FREQ_HZ,
  MIN_FREQ_HZ,
  YIN_THRESHOLD,
  YIN_WINDOW,
} from "@/lib/audio/constants";

export type PitchDetection = Readonly<{
  freq: number;
  confidence: number;
}>;

/** Returns the root-mean-square amplitude over the complete sample buffer. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) {
    throw new RangeError("samples must not be empty");
  }

  let sumOfSquares = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      throw new RangeError("samples must contain only finite values");
    }
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

/** Estimates the fundamental frequency using YIN, or returns null when no pitch is found. */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
): PitchDetection | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive finite number");
  }

  const tauMin = Math.floor(sampleRate / MAX_FREQ_HZ);
  const tauMax = Math.ceil(sampleRate / MIN_FREQ_HZ);
  if (samples.length < YIN_WINDOW + tauMax) {
    throw new RangeError(
      `samples must contain at least ${YIN_WINDOW + tauMax} samples at this sample rate`,
    );
  }
  if (rms(samples) === 0) {
    return null;
  }

  const difference = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let index = 0; index < YIN_WINDOW; index += 1) {
      const current = samples[index];
      const delayed = samples[index + tau];
      if (current === undefined || delayed === undefined) {
        throw new RangeError("samples do not contain the required YIN window");
      }
      const delta = current - delayed;
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  const cumulativeMeanNormalizedDifference = new Float64Array(tauMax + 1);
  cumulativeMeanNormalizedDifference[0] = 1;
  let cumulativeDifference = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    const differenceAtTau = difference[tau];
    if (differenceAtTau === undefined) {
      throw new RangeError("YIN difference array is incomplete");
    }
    cumulativeDifference += differenceAtTau;
    cumulativeMeanNormalizedDifference[tau] =
      cumulativeDifference === 0
        ? 1
        : (differenceAtTau * tau) / cumulativeDifference;
  }

  let selectedTau = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    const normalizedDifference = cumulativeMeanNormalizedDifference[tau];
    if (normalizedDifference !== undefined && normalizedDifference < YIN_THRESHOLD) {
      selectedTau = tau;
      while (selectedTau < tauMax) {
        const currentDifference =
          cumulativeMeanNormalizedDifference[selectedTau];
        const nextDifference =
          cumulativeMeanNormalizedDifference[selectedTau + 1];
        if (
          currentDifference === undefined ||
          nextDifference === undefined ||
          nextDifference >= currentDifference
        ) {
          break;
        }
        selectedTau += 1;
      }
      break;
    }
  }

  if (selectedTau < 0) {
    return null;
  }

  const refinedTau = interpolateMinimum(
    cumulativeMeanNormalizedDifference,
    selectedTau,
    tauMax,
  );
  const freq = sampleRate / refinedTau;
  if (!Number.isFinite(freq) || freq < MIN_FREQ_HZ || freq > MAX_FREQ_HZ) {
    return null;
  }

  const selectedConfidence =
    cumulativeMeanNormalizedDifference[selectedTau];
  if (selectedConfidence === undefined) {
    throw new RangeError("YIN confidence value is unavailable");
  }

  return {
    freq,
    confidence: 1 - selectedConfidence,
  };
}

function interpolateMinimum(
  values: Float64Array,
  tau: number,
  tauMax: number,
): number {
  if (tau <= 0 || tau >= tauMax) {
    return tau;
  }

  const before = values[tau - 1];
  const center = values[tau];
  const after = values[tau + 1];
  if (before === undefined || center === undefined || after === undefined) {
    return tau;
  }

  const denominator = before - 2 * center + after;
  if (denominator === 0) {
    return tau;
  }

  const adjustment = (before - after) / (2 * denominator);
  if (!Number.isFinite(adjustment)) {
    return tau;
  }
  return tau + Math.max(-1, Math.min(1, adjustment));
}
