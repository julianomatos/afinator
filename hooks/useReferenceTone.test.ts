import { describe, expect, test } from "vitest";

import { getReferenceToneHarmonicAmplitudes } from "@/hooks/useReferenceTone";

describe("getReferenceToneHarmonicAmplitudes", () => {
  test("adds harmonics for the low E, A, and D strings", () => {
    expect(getReferenceToneHarmonicAmplitudes(82.41)).toEqual([
      1, 0.6, 0.35, 0.2,
    ]);
    expect(getReferenceToneHarmonicAmplitudes(110)).toHaveLength(4);
    expect(getReferenceToneHarmonicAmplitudes(146.83)).toHaveLength(4);
  });

  test("uses a fundamental-only wave for higher strings", () => {
    expect(getReferenceToneHarmonicAmplitudes(196)).toEqual([1]);
    expect(getReferenceToneHarmonicAmplitudes(329.63)).toEqual([1]);
  });
});
