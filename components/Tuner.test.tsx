import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Tuner } from "@/components/Tuner";
import {
  getTunerStatusMessage,
  parseStoredTunerMode,
} from "@/components/tuner-utils";
import type { TunerStatus } from "@/hooks/useTuner";

const statusMessageCases: ReadonlyArray<readonly [TunerStatus, string]> = [
  [{ kind: "idle" }, "Toque em Ligar e dedilhe uma corda"],
  [{ kind: "requesting" }, "Aguardando permissão do microfone…"],
  [{ kind: "listening" }, "Ouvindo"],
  [{ kind: "paused" }, "Pausado"],
  [
    { kind: "error", reason: "permission-denied" },
    "Sem acesso ao microfone. Libere nas configurações do navegador e tente de novo.",
  ],
  [{ kind: "error", reason: "no-device" }, "Nenhum microfone encontrado."],
  [
    { kind: "error", reason: "unsupported" },
    "Este navegador não suporta o afinador. Use Chrome, Safari ou Edge atualizados.",
  ],
  [
    { kind: "error", reason: "insecure-context" },
    "O afinador precisa de conexão segura (HTTPS).",
  ],
];

describe("parseStoredTunerMode", () => {
  test("restores Auto and valid manual string selections", () => {
    expect(parseStoredTunerMode("auto")).toEqual({ kind: "auto" });
    expect(parseStoredTunerMode("manual:5")).toEqual({
      kind: "manual",
      stringIndex: 5,
    });
  });

  test("rejects malformed or out-of-range stored values", () => {
    expect(parseStoredTunerMode(null)).toBeNull();
    expect(parseStoredTunerMode("manual:6")).toBeNull();
    expect(parseStoredTunerMode("manual:1.5")).toBeNull();
    expect(parseStoredTunerMode("other")).toBeNull();
  });
});

describe("getTunerStatusMessage", () => {
  test.each(statusMessageCases)("maps %s to a clear message", (status, message) => {
    expect(getTunerStatusMessage(status)).toBe(message);
  });
});

describe("Tuner server render", () => {
  test("renders the idle screen without browser APIs during rendering", () => {
    const markup = renderToStaticMarkup(<Tuner />);

    expect(markup).toContain("Afinador de violão");
    expect(markup).toContain("Toque em Ligar e dedilhe uma corda");
    expect(markup).toContain("Ligar microfone");
  });
});
