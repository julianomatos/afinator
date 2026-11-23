import { describe, expect, test } from "vitest";

import { midiToFreq } from "@/lib/audio/pitch";
import { TuningStateMachine, type TunerMode } from "@/lib/audio/tuning-state";

const autoMode: TunerMode = { kind: "auto" };
const e2ManualMode: TunerMode = { kind: "manual", stringIndex: 0 };

function detectionAtMidi(midiFloat: number) {
  return {
    freq: midiToFreq(midiFloat),
    confidence: 0.95,
  };
}

describe("TuningStateMachine", () => {
  test("opens and closes the RMS gate with hysteresis", () => {
    const machine = new TuningStateMachine();
    const detection = detectionAtMidi(69);

    expect(
      machine.process({ detection, rms: 0.009, nowMs: 0, mode: autoMode }).status,
    ).toBe("no-signal");
    expect(
      machine.process({ detection, rms: 0.011, nowMs: 10, mode: autoMode }).status,
    ).toBe("near");
    expect(
      machine.process({ detection, rms: 0.008, nowMs: 20, mode: autoMode }).status,
    ).toBe("near");
    expect(
      machine.process({ detection, rms: 0.005, nowMs: 30, mode: autoMode }).status,
    ).toBe("near");
    expect(
      machine.process({ detection: null, rms: 0.005, nowMs: 421, mode: autoMode })
        .status,
    ).toBe("no-signal");
  });

  test("holds the last pitch through signal decay, then clears it", () => {
    const machine = new TuningStateMachine();
    const detection = detectionAtMidi(69);

    const initial = machine.process({
      detection,
      rms: 0.02,
      nowMs: 0,
      mode: autoMode,
    });
    const held = machine.process({
      detection: null,
      rms: 0,
      nowMs: 399,
      mode: autoMode,
    });
    const expired = machine.process({
      detection: null,
      rms: 0,
      nowMs: 401,
      mode: autoMode,
    });

    expect(held.frequency).toBe(initial.frequency);
    expect(expired.status).toBe("no-signal");
    expect(expired.frequency).toBeNull();
  });

  test("highlights a nearby string and confirms in-tune over consecutive frames", () => {
    const machine = new TuningStateMachine();
    const g3PlusTwoCents = 55 + 2 / 100;
    let state = machine.process({
      detection: detectionAtMidi(g3PlusTwoCents),
      rms: 0.02,
      nowMs: 0,
      mode: autoMode,
    });

    for (let frame = 1; frame < 3; frame += 1) {
      state = machine.process({
        detection: detectionAtMidi(g3PlusTwoCents),
        rms: 0.02,
        nowMs: frame * 10,
        mode: autoMode,
      });
    }

    expect(state.status).toBe("in-tune");
    expect(state.note?.name).toBe("G");
    expect(state.note?.octave).toBe(3);
    expect(state.highlightedStringIndex).toBe(3);
  });

  test("does not flicker out of tune between 3 and 5 cents", () => {
    const machine = new TuningStateMachine();
    let nowMs = 0;
    let state = machine.process({
      detection: detectionAtMidi(69),
      rms: 0.02,
      nowMs,
      mode: autoMode,
    });

    for (let frame = 1; frame < 3; frame += 1) {
      nowMs += 10;
      state = machine.process({
        detection: detectionAtMidi(69),
        rms: 0.02,
        nowMs,
        mode: autoMode,
      });
    }
    expect(state.status).toBe("in-tune");

    for (const cents of [5, 3, 5, 3, 5]) {
      nowMs += 10;
      state = machine.process({
        detection: detectionAtMidi(69 + cents / 100),
        rms: 0.02,
        nowMs,
        mode: autoMode,
      });
      expect(state.status).toBe("in-tune");
    }
  });

  test("manual lock ignores another string and measures cents from its target", () => {
    const machine = new TuningStateMachine();
    const wrongString = machine.process({
      detection: detectionAtMidi(45),
      rms: 0.02,
      nowMs: 0,
      mode: e2ManualMode,
    });
    const e2EightyCentsFlat = machine.process({
      detection: detectionAtMidi(40 - 0.8),
      rms: 0.02,
      nowMs: 10,
      mode: e2ManualMode,
    });

    expect(wrongString.status).toBe("no-signal");
    expect(e2EightyCentsFlat.note?.name).toBe("D#");
    expect(e2EightyCentsFlat.note?.octave).toBe(2);
    expect(e2EightyCentsFlat.cents).toBeCloseTo(-80, 8);
    expect(e2EightyCentsFlat.direction).toBe("flat");
    expect(e2EightyCentsFlat.status).toBe("out-of-tune");
  });
});
