export interface ClosableAudioContext {
  readonly state: string;
  close(): Promise<void>;
}

export interface AudioContextLease<
  TContext extends ClosableAudioContext = AudioContext,
> {
  readonly context: TContext;
  readonly release: () => void;
}

export class SharedAudioContextManager<
  TContext extends ClosableAudioContext,
> {
  private context: TContext | null = null;
  private leaseCount = 0;

  constructor(private readonly createContext: () => TContext) {}

  acquire(): AudioContextLease<TContext> {
    if (this.context === null || this.context.state === "closed") {
      this.context = this.createContext();
      this.leaseCount = 0;
    }

    const context = this.context;
    this.leaseCount += 1;
    let released = false;

    return {
      context,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        if (this.context !== context) {
          return;
        }

        this.leaseCount -= 1;
        if (this.leaseCount === 0) {
          this.context = null;
          if (context.state !== "closed") {
            void context.close().catch((error: unknown) => {
              console.error("Unable to close the shared AudioContext.", error);
            });
          }
        }
      },
    };
  }
}

export const sharedAudioContextManager =
  new SharedAudioContextManager<AudioContext>(() => new AudioContext());

let pitchDetectionSuspendedUntilMs = 0;

export function suspendPitchDetectionUntil(untilMs: number): void {
  if (!Number.isFinite(untilMs)) {
    throw new RangeError("untilMs must be a finite number");
  }
  pitchDetectionSuspendedUntilMs = untilMs;
}

export function isPitchDetectionSuspended(nowMs: number): boolean {
  return nowMs < pitchDetectionSuspendedUntilMs;
}
