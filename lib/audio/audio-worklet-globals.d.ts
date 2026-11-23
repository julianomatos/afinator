declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processor: new (...args: never[]) => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
