import { describe, expect, test } from "vitest";

import { IDLE_TIMEOUT_MS } from "@/lib/audio/constants";
import { updateInactivity, type InactivityState } from "@/lib/audio/inactivity";

describe("updateInactivity", () => {
  test("pauses only after the timeout without a valid reading", () => {
    const state: InactivityState = { lastActivityAtMs: 1_000 };

    expect(
      updateInactivity(state, 1_000 + IDLE_TIMEOUT_MS - 1, false, false)
        .shouldPause,
    ).toBe(false);
    expect(
      updateInactivity(state, 1_000 + IDLE_TIMEOUT_MS, false, false)
        .shouldPause,
    ).toBe(true);
    expect(
      updateInactivity(state, 1_000 + IDLE_TIMEOUT_MS, true, false)
        .shouldPause,
    ).toBe(false);
  });

  test("restarts the idle timer on every valid reading", () => {
    const state: InactivityState = { lastActivityAtMs: 1_000 };
    const readingAtMs = 1_000 + IDLE_TIMEOUT_MS - 1;
    const update = updateInactivity(state, readingAtMs, true, false);

    expect(update.state.lastActivityAtMs).toBe(readingAtMs);
    expect(
      updateInactivity(
        update.state,
        readingAtMs + IDLE_TIMEOUT_MS - 1,
        false,
        false,
      ).shouldPause,
    ).toBe(false);
  });

  test("does not time out while reference-tone detection is suspended", () => {
    const suspendedAtMs = 2_000 + IDLE_TIMEOUT_MS * 2;
    const update = updateInactivity(
      { lastActivityAtMs: 2_000 },
      suspendedAtMs,
      false,
      true,
    );

    expect(update.shouldPause).toBe(false);
    expect(update.state.lastActivityAtMs).toBe(suspendedAtMs);
  });
});
