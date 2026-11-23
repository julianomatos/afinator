import { describe, expect, test, vi } from "vitest";

import {
  isPitchDetectionSuspended,
  SharedAudioContextManager,
  suspendPitchDetectionUntil,
  type ClosableAudioContext,
} from "@/hooks/audio-context";

class FakeAudioContext implements ClosableAudioContext {
  state = "running";
  closeCount = 0;

  close(): Promise<void> {
    this.closeCount += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

describe("SharedAudioContextManager", () => {
  test("shares one context and closes it only after the final lease is released", () => {
    const context = new FakeAudioContext();
    const createContext = vi.fn(() => context);
    const manager = new SharedAudioContextManager(createContext);
    const firstLease = manager.acquire();
    const secondLease = manager.acquire();

    expect(firstLease.context).toBe(secondLease.context);
    expect(createContext).toHaveBeenCalledTimes(1);

    firstLease.release();
    firstLease.release();
    expect(context.closeCount).toBe(0);

    secondLease.release();
    expect(context.closeCount).toBe(1);
  });

  test("creates a fresh context after all leases are released", () => {
    const contexts: FakeAudioContext[] = [];
    const manager = new SharedAudioContextManager(() => {
      const context = new FakeAudioContext();
      contexts.push(context);
      return context;
    });

    manager.acquire().release();
    const nextLease = manager.acquire();

    expect(contexts).toHaveLength(2);
    expect(nextLease.context).toBe(contexts[1]);
    nextLease.release();
  });
});

describe("pitch-detection suspension", () => {
  test("resumes at the requested time", () => {
    suspendPitchDetectionUntil(1300);

    expect(isPitchDetectionSuspended(1299)).toBe(true);
    expect(isPitchDetectionSuspended(1300)).toBe(false);
  });
});
