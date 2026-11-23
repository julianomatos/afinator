import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ActionBar,
  getManualTunerMode,
} from "@/components/ActionBar";
import type { TunerMode } from "@/lib/audio/tuning-state";
import type { TunerStatus } from "@/hooks/useTuner";

const IDLE_STATUS: TunerStatus = { kind: "idle" };
const DEFAULT_PROPS = {
  highlightedStringIndex: null,
  tunerStatus: IDLE_STATUS,
  isReferenceTonePlaying: false,
  onModeChange: () => {},
  onToggleReferenceTone: () => {},
  onToggleMicrophone: () => {},
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

  test("disables reference tone without a target and exposes the microphone action", () => {
    const markup = renderToStaticMarkup(
      <ActionBar {...DEFAULT_PROPS} mode={{ kind: "auto" }} />,
    );

    expect(markup).toContain("Automático");
    expect(markup).toContain("Ouvir Nota");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Ligar microfone");
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
