"use client";

import { STRINGS } from "@/lib/audio/pitch";
import {
  type TunerMode,
  type TuningState,
  type TuningStatus,
} from "@/lib/audio/tuning-state";

interface StringSelectorProps {
  readonly mode: TunerMode;
  readonly tuning: TuningState;
  readonly onModeChange: (mode: TunerMode) => void;
  readonly onStringSelect?: (stringIndex: number) => void;
}

const PORTUGUESE_STRING_NAMES: readonly string[] = [
  "Mi grave",
  "Lá",
  "Ré",
  "Sol",
  "Si",
  "Mi agudo",
];

const HIGHLIGHT_CLASSES: Record<TuningStatus, string> = {
  "no-signal": "border-zinc-700 text-zinc-200",
  "out-of-tune": "border-red-500 text-red-400 ring-2 ring-red-500/30",
  near: "border-amber-500 text-amber-400 ring-2 ring-amber-500/30",
  "in-tune": "border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/30",
};

export function getStringSelectionMode(
  mode: TunerMode,
  stringIndex: number,
): TunerMode {
  if (mode.kind === "manual" && mode.stringIndex === stringIndex) {
    return { kind: "auto" };
  }
  return { kind: "manual", stringIndex };
}

export function StringSelector({
  mode,
  tuning,
  onModeChange,
  onStringSelect,
}: StringSelectorProps) {
  return (
    <div
      aria-label="Cordas de afinação"
      className="grid grid-cols-6 gap-2"
      role="group"
    >
      {STRINGS.map((string) => {
        const isSelected =
          mode.kind === "manual" && mode.stringIndex === string.stringIndex;
        const isHighlighted =
          mode.kind === "auto" &&
          tuning.highlightedStringIndex === string.stringIndex;
        const stringDescription =
          PORTUGUESE_STRING_NAMES[string.stringIndex] ?? string.name;
        const stateClass = isHighlighted
          ? HIGHLIGHT_CLASSES[tuning.status]
          : "";
        const buttonClass = isSelected
          ? "border-zinc-100 bg-zinc-100 text-zinc-950 shadow-sm"
          : isHighlighted
            ? `border-2 bg-zinc-900 ${stateClass}`
            : "border-zinc-700 bg-zinc-900 text-zinc-200";
        const stateDescription = isSelected
          ? ", selecionada"
          : isHighlighted
            ? ", corda detectada"
            : "";

        return (
          <button
            key={string.stringIndex}
            aria-current={isHighlighted ? "true" : undefined}
            aria-label={`Corda ${string.stringNumber}, ${stringDescription}, ${string.name}${string.octave}${stateDescription}`}
            aria-pressed={isSelected}
            className={`relative flex h-12 min-w-0 touch-manipulation select-none flex-col items-center justify-center rounded-full border text-xs font-semibold leading-tight transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 motion-reduce:transition-none ${buttonClass}`}
            onClick={() => {
              if (onStringSelect !== undefined) {
                onStringSelect(string.stringIndex);
                return;
              }
              onModeChange(getStringSelectionMode(mode, string.stringIndex));
            }}
            type="button"
          >
            <span className="text-sm">
              {string.name}
              <span className="align-super text-[0.6rem]">{string.octave}</span>
            </span>
            <span className="text-[0.6rem] opacity-70">{string.stringNumber}</span>
            {isSelected && (
              <svg
                aria-hidden="true"
                className="absolute right-1 top-1 h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 16 16"
              >
                <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                <rect height="7" rx="1.5" width="10" x="3" y="7" />
                <path d="M8 10v1.5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
