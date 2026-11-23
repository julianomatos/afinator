"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { ActionBar } from "@/components/ActionBar";
import { StringSelector } from "@/components/StringSelector";
import { TunerMeter } from "@/components/TunerMeter";
import { useReferenceTone } from "@/hooks/useReferenceTone";
import { useTuner } from "@/hooks/useTuner";
import { useWakeLock } from "@/hooks/useWakeLock";
import { STRINGS } from "@/lib/audio/pitch";
import type { TunerMode } from "@/lib/audio/tuning-state";
import {
  getTunerStatusMessage,
  parseStoredTunerMode,
  serializeTunerMode,
} from "@/components/tuner-utils";
import { getStringSelectionMode } from "@/components/StringSelector";

const MODE_STORAGE_KEY = "afinador:last-mode";
const INITIAL_MODE: TunerMode = { kind: "auto" };

interface ModeSnapshot {
  readonly mode: TunerMode;
  readonly loaded: boolean;
}

interface ModeStore {
  readonly getSnapshot: () => ModeSnapshot;
  readonly getServerSnapshot: () => ModeSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setMode: (mode: TunerMode) => void;
  readonly hydrate: (mode: TunerMode | null) => void;
}

const INITIAL_MODE_SNAPSHOT: ModeSnapshot = {
  mode: INITIAL_MODE,
  loaded: false,
};

function createModeStore(): ModeStore {
  let snapshot = INITIAL_MODE_SNAPSHOT;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const isSameMode = (first: TunerMode, second: TunerMode): boolean =>
    first.kind === second.kind &&
    (first.kind === "auto" ||
      (second.kind === "manual" && first.stringIndex === second.stringIndex));

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL_MODE_SNAPSHOT,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMode: (mode) => {
      if (isSameMode(snapshot.mode, mode)) {
        return;
      }
      snapshot = { ...snapshot, mode };
      notify();
    },
    hydrate: (mode) => {
      const restoredMode = mode ?? snapshot.mode;
      if (snapshot.loaded && isSameMode(snapshot.mode, restoredMode)) {
        return;
      }
      snapshot = { mode: restoredMode, loaded: true };
      notify();
    },
  };
}

export function Tuner() {
  const [modeStore] = useState(createModeStore);
  const modeSnapshot = useSyncExternalStore(
    modeStore.subscribe,
    modeStore.getSnapshot,
    modeStore.getServerSnapshot,
  );
  const { mode, loaded: modeLoaded } = modeSnapshot;
  const [referenceToneError, setReferenceToneError] = useState<string | null>(
    null,
  );
  const { status, tuning, start, pause } = useTuner(mode);
  const { isPlaying, play, stop } = useReferenceTone();
  useWakeLock(status.kind === "listening");

  const targetString =
    mode.kind === "manual"
      ? STRINGS[mode.stringIndex]
      : tuning.highlightedStringIndex === null
        ? undefined
        : STRINGS[tuning.highlightedStringIndex];

  useEffect(() => {
    try {
      const restoredMode = parseStoredTunerMode(
        window.localStorage.getItem(MODE_STORAGE_KEY),
      );
      modeStore.hydrate(restoredMode);
    } catch (error: unknown) {
      console.warn("Não foi possível restaurar o modo de afinação.", error);
      modeStore.hydrate(null);
    }
  }, [modeStore]);

  useEffect(() => {
    if (!modeLoaded) {
      return;
    }
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, serializeTunerMode(mode));
    } catch (error: unknown) {
      console.warn("Não foi possível salvar o modo de afinação.", error);
    }
  }, [mode, modeLoaded]);

  const handleStart = useCallback((stringIndex?: number) => {
    if (
      status.kind === "requesting" ||
      status.kind === "listening" ||
      (status.kind === "error" &&
        (status.reason === "unsupported" ||
          status.reason === "insecure-context"))
    ) {
      return;
    }
    if (stringIndex !== undefined) {
      modeStore.setMode({ kind: "manual", stringIndex });
    } else if (status.kind === "idle") {
      modeStore.setMode({ kind: "auto" });
    }
    void start(stringIndex).catch((error: unknown) => {
      console.error("Não foi possível iniciar o afinador.", error);
    });
  }, [modeStore, start, status]);

  const handleStringSelect = useCallback(
    (stringIndex: number) => {
      if (status.kind === "listening" || status.kind === "requesting") {
        modeStore.setMode(
          getStringSelectionMode(mode, stringIndex),
        );
        return;
      }
      handleStart(stringIndex);
    },
    [handleStart, mode, modeStore, status.kind],
  );

  const handleReferenceToneToggle = useCallback(() => {
    setReferenceToneError(null);
    if (isPlaying) {
      stop();
      return;
    }
    if (targetString === undefined) {
      return;
    }
    void play(targetString.frequency).catch((error: unknown) => {
      console.error("Não foi possível tocar a nota de referência.", error);
      setReferenceToneError("Não foi possível reproduzir a nota de referência.");
    });
  }, [isPlaying, play, stop, targetString]);

  const statusColor =
    status.kind === "listening"
      ? "text-emerald-400"
      : status.kind === "error"
        ? "text-red-400"
        : "text-zinc-400";
  const startActionLabel =
    status.kind === "idle"
      ? "Toque para afinar"
      : status.kind === "paused"
        ? status.reason === "user"
          ? "Toque para afinar"
          : "Toque para retomar"
        : status.kind === "error" &&
            (status.reason === "permission-denied" ||
              status.reason === "no-device")
          ? "Tentar novamente"
          : null;

  return (
    <main className="flex min-h-dvh flex-col bg-[#09090B] px-4 py-4 text-zinc-50">
      <header className="flex min-h-12 items-center justify-between gap-3">
        <h1 className="sr-only">Afinador de violão</h1>
        <p aria-live="polite" className={`text-sm ${statusColor}`} role="status">
          {getTunerStatusMessage(status)}
        </p>
        {status.kind === "listening" && (
          <button
            aria-label="Pausar microfone"
            className="flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-lg text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 motion-reduce:transition-none"
            onClick={() => pause("user")}
            type="button"
          >
            <span aria-hidden="true">Ⅱ</span>
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col justify-center gap-7 py-5">
        <TunerMeter inactive={status.kind === "idle"} state={tuning} />
        {startActionLabel !== null && (
          <button
            className="mx-auto min-h-16 w-full max-w-sm touch-manipulation select-none rounded-2xl bg-emerald-500 px-5 text-lg font-bold text-zinc-950 shadow-lg shadow-emerald-950/30 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            disabled={
              status.kind === "error" &&
              (status.reason === "unsupported" ||
                status.reason === "insecure-context")
            }
            onClick={() => handleStart()}
            type="button"
          >
            {startActionLabel}
          </button>
        )}
        <StringSelector
          mode={mode}
          onModeChange={modeStore.setMode}
          onStringSelect={handleStringSelect}
          tuning={tuning}
        />
      </div>

      <ActionBar
        highlightedStringIndex={tuning.highlightedStringIndex}
        isReferenceTonePlaying={isPlaying}
        mode={mode}
        onModeChange={modeStore.setMode}
        onToggleReferenceTone={handleReferenceToneToggle}
      />

      {referenceToneError !== null && (
        <p className="pt-2 text-sm text-red-400" role="alert">
          {referenceToneError}
        </p>
      )}
    </main>
  );
}
