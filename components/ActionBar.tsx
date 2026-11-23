"use client";

import { STRINGS } from "@/lib/audio/pitch";
import type { TunerMode } from "@/lib/audio/tuning-state";

interface ActionBarProps {
  readonly mode: TunerMode;
  readonly highlightedStringIndex: number | null;
  readonly isReferenceTonePlaying: boolean;
  readonly onModeChange: (mode: TunerMode) => void;
  readonly onToggleReferenceTone: () => void;
}

export function getManualTunerMode(
  mode: TunerMode,
  highlightedStringIndex: number | null,
): TunerMode {
  if (mode.kind === "manual") {
    return mode;
  }

  const highlightedString =
    highlightedStringIndex === null
      ? undefined
      : STRINGS[highlightedStringIndex];
  return {
    kind: "manual",
    stringIndex: highlightedString?.stringIndex ?? 0,
  };
}

export function ActionBar({
  mode,
  highlightedStringIndex,
  isReferenceTonePlaying,
  onModeChange,
  onToggleReferenceTone,
}: ActionBarProps) {
  const isManual = mode.kind === "manual";
  const hasHighlightedString =
    highlightedStringIndex !== null &&
    STRINGS[highlightedStringIndex] !== undefined;
  const hasReferenceTarget = isManual
    ? STRINGS[mode.stringIndex] !== undefined
    : hasHighlightedString;

  return (
    <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
      <div
        aria-label="Modo de afinação"
        className="grid grid-cols-2 gap-2"
        role="group"
      >
        <button
          aria-pressed={!isManual}
          className={`min-h-12 touch-manipulation select-none rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 motion-reduce:transition-none ${
            !isManual
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-700 bg-zinc-900 text-zinc-300"
          }`}
          onClick={() => onModeChange({ kind: "auto" })}
          type="button"
        >
          Automático
        </button>
        <button
          aria-pressed={isManual}
          className={`min-h-12 touch-manipulation select-none rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 motion-reduce:transition-none ${
            isManual
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-700 bg-zinc-900 text-zinc-300"
          }`}
          onClick={() =>
            onModeChange(getManualTunerMode(mode, highlightedStringIndex))
          }
          type="button"
        >
          Manual
        </button>
      </div>

      <button
        aria-label={
          isReferenceTonePlaying
            ? "Parar tom de referência"
            : "Ouvir nota de referência"
        }
        aria-pressed={isReferenceTonePlaying}
        className="flex min-h-12 w-full touch-manipulation select-none items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 font-semibold text-zinc-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        disabled={!hasReferenceTarget && !isReferenceTonePlaying}
        onClick={onToggleReferenceTone}
        type="button"
      >
        {isReferenceTonePlaying ? (
          <>
            <span
              aria-hidden="true"
              className="animate-pulse text-emerald-400 motion-reduce:animate-none"
            >
              ●
            </span>
            Tocando…
          </>
        ) : (
          "Ouvir Nota"
        )}
      </button>
    </div>
  );
}
