import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ActionBar,
  getManualTunerMode,
} from "@/components/ActionBar";
import type { TunerMode } from "@/lib/audio/tuning-state";

const DEFAULT_PROPS = {
  highlightedStringIndex: null,
  isReferenceTonePlaying: false,
  onModeChange: () => {},
  onToggleReferenceTone: () => {},
};

describe("ActionBar", () => {
  test("defaults manual mode to the highlighted string or low E when none is highlighted", () => {
    expect(getManualTunerMode({ kind: "auto" }, 4)).toEqual({
      kind: "manual",
      stringIndex: 4,
    });
    expect(getManualTunerMode({ kind: "auto" }, null)).toEqual({
      kind: "manual",
      stringIndex: 0,
    });
    expect(getManualTunerMode({ kind: "manual", stringIndex: 4 }, 2)).toEqual({
      kind: "manual",
      stringIndex: 4,
    });
  });

  test("disables the reference tone without a target and has no primary microphone action", () => {
    const markup = renderToStaticMarkup(
      <ActionBar {...DEFAULT_PROPS} mode={{ kind: "auto" }} />,
    );

    expect(markup).toContain("Automático");
    expect(markup).toContain("Ouvir Nota");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).not.toContain("Ligar microfone");
    expect(markup).toContain("min-h-12");
    expect(markup).toContain("safe-area-inset-bottom");
  });

  test("keeps a stop action available when a reference tone is playing", () => {
    const mode: TunerMode = { kind: "auto" };
    const markup = renderToStaticMarkup(
      <ActionBar
        {...DEFAULT_PROPS}
        isReferenceTonePlaying
        mode={mode}
      />,
    );

    expect(markup).toContain("Tocando…");
    expect(markup).toContain('aria-label="Parar tom de referência"');
  });

});
