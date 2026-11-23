import { STRINGS } from "@/lib/audio/pitch";
import type { TunerStatus } from "@/hooks/useTuner";
import type { TunerMode } from "@/lib/audio/tuning-state";

export function parseStoredTunerMode(value: string | null): TunerMode | null {
  if (value === "auto") {
    return { kind: "auto" };
  }
  if (value === null || !value.startsWith("manual:")) {
    return null;
  }

  const indexText = value.slice("manual:".length);
  if (!/^[0-5]$/.test(indexText)) {
    return null;
  }
  const stringIndex = Number(indexText);
  return STRINGS[stringIndex] === undefined
    ? null
    : { kind: "manual", stringIndex };
}

export function serializeTunerMode(mode: TunerMode): string {
  if (mode.kind === "auto") {
    return "auto";
  }
  if (STRINGS[mode.stringIndex] === undefined) {
    throw new RangeError("manual mode stringIndex is outside standard tuning");
  }
  return `manual:${mode.stringIndex}`;
}

export function getTunerStatusMessage(status: TunerStatus): string {
  switch (status.kind) {
    case "idle":
      return "Toque em Ligar e dedilhe uma corda";
    case "requesting":
      return "Aguardando permissão do microfone…";
    case "listening":
      return "Ouvindo";
    case "paused":
      return "Pausado";
    case "error":
      switch (status.reason) {
        case "permission-denied":
          return "Sem acesso ao microfone. Libere nas configurações do navegador e tente de novo.";
        case "no-device":
          return "Nenhum microfone encontrado.";
        case "unsupported":
          return "Este navegador não suporta o afinador. Use Chrome, Safari ou Edge atualizados.";
        case "insecure-context":
          return "O afinador precisa de conexão segura (HTTPS).";
      }
  }
}
