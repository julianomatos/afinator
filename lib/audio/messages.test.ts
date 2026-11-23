import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

import { isWorkletFrame, type WorkletFrame } from "@/lib/audio/messages";

type TestProcessor = {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

type TestProcessorConstructor = new () => TestProcessor;

describe("isWorkletFrame", () => {
  test("accepts frames that satisfy the worklet contract", () => {
    const frame: WorkletFrame = {
      type: "frame",
      samples: new Float32Array(4096),
      sampleRate: 48000,
    };

    expect(isWorkletFrame(frame)).toBe(true);
  });

  test.each([
    null,
    "frame",
    {},
    { type: "other", samples: new Float32Array(4096), sampleRate: 48000 },
    { type: "frame", samples: new Float32Array(2048), sampleRate: 48000 },
    { type: "frame", samples: [], sampleRate: 48000 },
    { type: "frame", samples: new Float32Array(4096), sampleRate: Number.NaN },
    { type: "frame", samples: new Float32Array(4096), sampleRate: 0 },
  ])("rejects malformed message %j", (message) => {
    expect(isWorkletFrame(message)).toBe(false);
  });
});

test("worklet posts complete windows in chronological order at each hop", () => {
  const source = readFileSync(
    new URL("../../public/worklets/pitch-processor.js", import.meta.url),
    "utf8",
  );
  const postedMessages: unknown[] = [];
  const registeredProcessors: TestProcessorConstructor[] = [];

  class TestAudioWorkletProcessor {
    readonly port = {
      postMessage(message: unknown) {
        postedMessages.push(message);
      },
    };
  }

  runInNewContext(source, {
    AudioWorkletProcessor: TestAudioWorkletProcessor,
    Float32Array,
    registerProcessor(
      name: string,
      processor: TestProcessorConstructor,
    ) {
      if (name === "pitch-processor") {
        registeredProcessors.push(processor);
      }
    },
    sampleRate: 48000,
  });

  const processorConstructor = registeredProcessors[0];
  if (processorConstructor === undefined) {
    throw new Error("pitch-processor was not registered");
  }

  const processor = new processorConstructor();
  let samplesProcessed = 0;
  const processBlocks = (blockCount: number) => {
    for (let block = 0; block < blockCount; block += 1) {
      const input = new Float32Array(128);
      for (let index = 0; index < input.length; index += 1) {
        input[index] = samplesProcessed + index;
      }
      processor.process([[input]], []);
      samplesProcessed += input.length;
    }
  };

  processBlocks(31);
  expect(postedMessages).toHaveLength(0);
  processBlocks(1);
  expect(postedMessages).toHaveLength(1);

  processBlocks(15);
  expect(postedMessages).toHaveLength(1);
  processBlocks(1);
  expect(postedMessages).toHaveLength(2);

  const firstFrame = postedMessages[0];
  const secondFrame = postedMessages[1];
  if (!isWorkletFrame(firstFrame) || !isWorkletFrame(secondFrame)) {
    throw new Error("worklet posted a message outside the frame contract");
  }

  expect(firstFrame.samples).toEqual(
    Float32Array.from({ length: 4096 }, (_, index) => index),
  );
  expect(secondFrame.samples).toEqual(
    Float32Array.from({ length: 4096 }, (_, index) => index + 2048),
  );
  expect(firstFrame.sampleRate).toBe(48000);
  expect(secondFrame.sampleRate).toBe(48000);
});
