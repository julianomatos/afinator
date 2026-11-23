// @ts-check
/* global AudioWorkletProcessor, registerProcessor, sampleRate */

const RING_BUFFER_SIZE = 4096;
const HOP_SAMPLES = 2048;

/** Captures overlapping, chronological frames without running DSP on the audio thread. */
class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ringBuffer = new Float32Array(RING_BUFFER_SIZE);
    this.writeIndex = 0;
    this.samplesInBuffer = 0;
    this.samplesSinceLastPost = 0;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @returns {boolean}
   */
  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) {
        channel.fill(0);
      }
    }

    const input = inputs[0]?.[0];
    if (input === undefined) {
      return true;
    }

    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index];
      if (sample === undefined) {
        throw new RangeError("audio input contains a missing sample");
      }

      this.ringBuffer[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % RING_BUFFER_SIZE;

      if (this.samplesInBuffer < RING_BUFFER_SIZE) {
        this.samplesInBuffer += 1;
        if (this.samplesInBuffer === RING_BUFFER_SIZE) {
          this.postFrame();
        }
      } else {
        this.samplesSinceLastPost += 1;
        if (this.samplesSinceLastPost === HOP_SAMPLES) {
          this.samplesSinceLastPost = 0;
          this.postFrame();
        }
      }
    }

    return true;
  }

  postFrame() {
    const samples = new Float32Array(RING_BUFFER_SIZE);
    let readIndex = this.writeIndex;
    for (let index = 0; index < RING_BUFFER_SIZE; index += 1) {
      const sample = this.ringBuffer[readIndex];
      if (sample === undefined) {
        throw new RangeError("ring buffer contains a missing sample");
      }
      samples[index] = sample;
      readIndex = (readIndex + 1) % RING_BUFFER_SIZE;
    }

    this.port.postMessage(
      { type: "frame", samples, sampleRate },
      [samples.buffer],
    );
  }
}

registerProcessor("pitch-processor", PitchProcessor);
