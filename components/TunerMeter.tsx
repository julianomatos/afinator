import type { TuningState, TuningStatus } from "@/lib/audio/tuning-state";

interface TunerMeterProps {
  readonly state: TuningState;
  readonly inactive?: boolean;
}

interface StatusPresentation {
  readonly colorClass: string;
  readonly icon: string;
  readonly message: string;
}

const STATE_COLORS: Record<TuningStatus, string> = {
  "no-signal": "text-zinc-400",
  "out-of-tune": "text-red-500",
  near: "text-amber-500",
  "in-tune": "text-emerald-500",
};

const SCALE_MARKS = Array.from({ length: 11 }, (_, index) => index * 10 - 50);

function getStatusPresentation(state: TuningState): StatusPresentation {
  if (state.status === "no-signal") {
    return {
      colorClass: STATE_COLORS[state.status],
      icon: "—",
      message: "Toque uma corda",
    };
  }
  if (state.status === "in-tune") {
    return {
      colorClass: STATE_COLORS[state.status],
      icon: "✓",
      message: "Afinado",
    };
  }

  const isFlat =
    state.direction === "flat" ||
    (state.direction === null && state.cents !== null && state.cents < 0);
  const isSharp =
    state.direction === "sharp" ||
    (state.direction === null && state.cents !== null && state.cents > 0);
  if (state.status === "near") {
    if (isFlat) {
      return {
        colorClass: STATE_COLORS[state.status],
        icon: "▲",
        message: "Grave · Apertar",
      };
    }
    if (isSharp) {
      return {
        colorClass: STATE_COLORS[state.status],
        icon: "▼",
        message: "Agudo · Afrouxar",
      };
    }
    return {
      colorClass: STATE_COLORS[state.status],
      icon: "",
      message: "Quase afinado",
    };
  }

  if (isFlat) {
    return {
      colorClass: STATE_COLORS[state.status],
      icon: "▲▲",
      message: "Muito grave · Apertar",
    };
  }
  if (isSharp) {
    return {
      colorClass: STATE_COLORS[state.status],
      icon: "▼▼",
      message: "Muito agudo · Afrouxar",
    };
  }
  return {
    colorClass: STATE_COLORS[state.status],
    icon: "",
    message: "Desafinado",
  };
}

function formatCents(cents: number | null): string {
  if (cents === null) {
    return "— ¢";
  }
  const sign = cents < 0 ? "−" : cents > 0 ? "+" : "";
  return `${sign}${Math.round(Math.abs(cents))} ¢`;
}

export function TunerMeter({ state, inactive = false }: TunerMeterProps) {
  const presentation = getStatusPresentation(state);
  const cents = state.cents;
  const clampedCents = cents === null ? 0 : Math.min(50, Math.max(-50, cents));
  const pointerPosition = `${clampedCents + 50}%`;
  const pointerClass =
    state.status === "no-signal"
      ? "bg-zinc-600"
      : state.status === "in-tune"
        ? "bg-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]"
        : state.status === "near"
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <section
      aria-label="Medidor de afinação"
      className="w-full text-center"
      data-status={state.status}
    >
      <div
        aria-label={
          state.note === null
            ? "Sem nota detectada"
            : `Nota ${state.note.name}, oitava ${state.note.octave}`
        }
        className={`flex min-h-28 items-baseline justify-center gap-1 leading-none ${inactive ? "text-zinc-600" : presentation.colorClass}`}
      >
        {state.note === null ? (
          <span
            aria-hidden="true"
            className="text-[clamp(6rem,28vw,11rem)] font-bold tracking-tight"
          >
            --
          </span>
        ) : (
          <>
            <span className="text-[clamp(6rem,28vw,11rem)] font-bold tracking-tight">
              {state.note.name}
            </span>
            <span className="pb-2 text-3xl font-semibold">
              {state.note.octave}
            </span>
          </>
        )}
      </div>

      <p className="mt-3 tabular-nums text-base text-zinc-400">
        {state.frequency === null ? "—" : state.frequency.toFixed(1)} Hz
        <span aria-hidden="true"> · </span>
        {formatCents(state.cents)}
      </p>

      <div aria-hidden="true" className="mt-8">
        <div className="relative h-9">
          <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-zinc-800" />
          {SCALE_MARKS.map((mark) => (
            <span
              key={mark}
              className={`absolute top-2 w-px -translate-x-1/2 ${
                mark === 0 ? "h-5 bg-zinc-300" : "h-3 bg-zinc-600"
              }`}
              style={{ left: `${mark + 50}%` }}
            />
          ))}
          <span
            className={`absolute top-0 z-10 h-9 w-1 -translate-x-1/2 rounded-full transition-[left] duration-100 motion-reduce:transition-none ${pointerClass}`}
            style={{ left: pointerPosition }}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-zinc-500">
          <span>−50</span>
          <span>0</span>
          <span>+50</span>
        </div>
      </div>

      <p className={`mt-5 flex min-h-7 items-center justify-center gap-2 font-semibold ${presentation.colorClass}`}>
        {presentation.icon !== "" && (
          <span aria-hidden="true" className="text-lg">
            {presentation.icon}
          </span>
        )}
        <span aria-live="polite">{presentation.message}</span>
      </p>
    </section>
  );
}
