import { describe, expect, test } from "vitest";

import { PitchSmoother } from "@/lib/audio/smoother";

describe("PitchSmoother", () => {
  test("ignores an isolated octave outlier in five readings", () => {
    const smoother = new PitchSmoother();
    smoother.push(40);
    smoother.push(40);
    const beforeOutlier = smoother.push(40);

    expect(smoother.push(52)).toBe(beforeOutlier);
    expect(smoother.push(40)).toBe(beforeOutlier);
  });

  test("confirms a string change without dragging the old median or EMA", () => {
    const smoother = new PitchSmoother();
    smoother.push(40);
    smoother.push(40);
    const pendingJump = smoother.push(45);

    expect(pendingJump).toBe(40);
    expect(smoother.push(45)).toBe(45);
    expect(smoother.push(45)).toBe(45);
  });

  test("applies the median before the EMA and supports explicit reset", () => {
    const smoother = new PitchSmoother();

    expect(smoother.push(60)).toBe(60);
    expect(smoother.push(60.1)).toBeCloseTo(60.0125, 12);

    smoother.reset();
    expect(smoother.push(65)).toBe(65);
  });
});
