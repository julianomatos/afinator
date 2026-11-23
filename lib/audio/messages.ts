export type WorkletFrame = Readonly<{
  type: "frame";
  samples: Float32Array;
  sampleRate: number;
}>;

/** Narrows untrusted worklet messages to the frame contract. */
export function isWorkletFrame(message: unknown): message is WorkletFrame {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "frame" ||
    !("samples" in message) ||
    !(message.samples instanceof Float32Array) ||
    message.samples.length !== 4096 ||
    !("sampleRate" in message) ||
    typeof message.sampleRate !== "number" ||
    !Number.isFinite(message.sampleRate) ||
    message.sampleRate <= 0
  ) {
    return false;
  }
  return true;
}
