import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  getStringSelectionMode,
  StringSelector,
} from "@/components/StringSelector";
import type { TuningState } from "@/lib/audio/tuning-state";

const NO_SIGNAL: TuningState = {
  status: "no-signal",
  frequency: null,
  note: null,
  cents: null,
  direction: null,
  confidence: null,
  highlightedStringIndex: null,
};

describe("StringSelector", () => {
  test("renders all standard strings with accessible labels and touch targets", () => {
    const markup = renderToStaticMarkup(
      <StringSelector
        mode={{ kind: "auto" }}
        onModeChange={() => {}}
        tuning={{ ...NO_SIGNAL, highlightedStringIndex: 2, status: "near" }}
      />,
    );

    expect(markup).toContain('aria-label="Corda 6, Mi grave, E2"');
    expect(markup).toContain('aria-label="Corda 4, Ré, D3, corda detectada"');
    expect(markup).toContain("grid-cols-6");
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(6);
  });

  test("selects a string in manual mode and returns to auto when selected again", () => {
    const manualMode = getStringSelectionMode({ kind: "auto" }, 3);
    const autoMode = getStringSelectionMode(manualMode, 3);
    const otherStringMode = getStringSelectionMode(manualMode, 4);

    expect(manualMode).toEqual({ kind: "manual", stringIndex: 3 });
    expect(autoMode).toEqual({ kind: "auto" });
    expect(otherStringMode).toEqual({ kind: "manual", stringIndex: 4 });
  });
});
