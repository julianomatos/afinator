import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { TunerMeter } from "@/components/TunerMeter";
import type { TuningState } from "@/lib/audio/tuning-state";

const BASE_STATE: TuningState = {
  status: "near",
  frequency: 82.4,
  note: { name: "E", octave: 2, midi: 40, cents: 0 },
  cents: -5,
  direction: "flat",
  confidence: 1,
  highlightedStringIndex: 0,
};

function renderMeter(overrides: Partial<TuningState> = {}): string {
  return renderToStaticMarkup(
    <TunerMeter state={{ ...BASE_STATE, ...overrides }} />,
  );
}

describe("TunerMeter", () => {
  test("renders the no-signal message and a dimmed centered pointer", () => {
    const markup = renderMeter({
      status: "no-signal",
      frequency: null,
      note: null,
      cents: null,
      direction: null,
    });

    expect(markup).toContain("Toque uma corda");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('style="left:50%"');
    expect(markup).toContain("bg-zinc-600");
  });

  test("dims the idle note without dimming the surrounding status text", () => {
    const markup = renderToStaticMarkup(
      <TunerMeter
        inactive
        state={{
          ...BASE_STATE,
          status: "no-signal",
          frequency: null,
          note: null,
          cents: null,
          direction: null,
        }}
      />,
    );

    expect(markup).toContain("text-zinc-600");
    expect(markup).toContain("text-zinc-400");
    expect(markup).not.toContain("opacity-40");
  });

  test("renders note, cents, tuning message, and clamps the pointer", () => {
    const markup = renderMeter({
      status: "out-of-tune",
      cents: 67,
      direction: "sharp",
    });

    expect(markup).toContain("Muito agudo · Afrouxar");
    expect(markup).toContain("E");
    expect(markup).toContain("2");
    expect(markup).toContain("+67 ¢");
    expect(markup).toContain('style="left:100%"');
  });

  test("renders the tuned state and disables motion for reduced-motion users", () => {
    const markup = renderMeter({
      status: "in-tune",
      cents: 0,
      direction: null,
    });

    expect(markup).toContain("Afinado");
    expect(markup).toContain("motion-reduce:transition-none");
    expect(markup).toContain("✓");
  });
});
