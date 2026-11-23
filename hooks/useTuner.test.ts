import { describe, expect, test } from "vitest";

import {
  getMediaErrorReason,
  type TunerErrorReason,
} from "@/hooks/useTuner";

const errorCases: ReadonlyArray<readonly [unknown, TunerErrorReason]> = [
  [{ name: "NotAllowedError" }, "permission-denied"],
  [{ name: "PermissionDeniedError" }, "permission-denied"],
  [{ name: "NotFoundError" }, "no-device"],
  [{ name: "DevicesNotFoundError" }, "no-device"],
  [{ name: "NotSupportedError" }, "unsupported"],
];

describe("getMediaErrorReason", () => {
  test.each(errorCases)("maps %s", (error, expectedReason) => {
    expect(getMediaErrorReason(error)).toBe(expectedReason);
  });

  test("leaves unrecognized failures for explicit fallback handling", () => {
    expect(getMediaErrorReason(new Error("unknown failure"))).toBeNull();
    expect(getMediaErrorReason(null)).toBeNull();
  });
});
