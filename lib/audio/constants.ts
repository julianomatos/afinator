/** A4 reference frequency in hertz. */
export const A4_HZ = 440;

/** Lowest pitch accepted by the tuner, in hertz. */
export const MIN_FREQ_HZ = 65;

/** Highest pitch accepted by the tuner, in hertz. */
export const MAX_FREQ_HZ = 1000;

/** YIN difference-function window length in samples. */
export const YIN_WINDOW = 2048;

/** Maximum accepted YIN aperiodicity; lower values require a more periodic signal. */
export const YIN_THRESHOLD = 0.15;

/** Number of samples between consecutive audio-analysis frames. */
export const HOP_SAMPLES = 2048;

/** RMS level that opens the amplitude gate, in full-scale amplitude. */
export const RMS_GATE_ON = 0.01;

/** RMS level that closes the amplitude gate, in full-scale amplitude. */
export const RMS_GATE_OFF = 0.006;

/** Time to retain the last valid pitch while a plucked string decays, in milliseconds. */
export const SIGNAL_HOLD_MS = 400;

/** Number of recent MIDI-pitch readings used by the median filter. */
export const MEDIAN_SIZE = 5;

/** EMA interpolation factor for the displayed pitch, unitless. */
export const EMA_ALPHA = 0.25;

/** Pitch jump treated as a new note rather than a smoothing outlier, in cents. */
export const JUMP_RESET_CENTS = 80;

/** Maximum absolute deviation to enter the in-tune state, in cents. */
export const IN_TUNE_ENTER_CENTS = 4;

/** Deviation beyond which the in-tune state is exited, in cents. */
export const IN_TUNE_EXIT_CENTS = 6;

/** Consecutive in-range frames required to enter the in-tune state. */
export const IN_TUNE_MIN_FRAMES = 3;

/** Maximum deviation classified as near-tuned rather than out-of-tune, in cents. */
export const NEAR_TUNE_CENTS = 15;

/** Maximum distance for highlighting a standard string in auto mode, in cents. */
export const STRING_HIGHLIGHT_MAX_CENTS = 100;

/** Maximum pitch distance accepted for a manually selected string, in cents. */
export const MANUAL_LOCK_WINDOW_CENTS = 300;

/** Peak output gain for a reference tone, relative to full-scale amplitude. */
export const REFERENCE_TONE_GAIN = 0.3;

/** Reference-tone attack duration, in milliseconds. */
export const REFERENCE_TONE_ATTACK_MS = 20;

/** Reference-tone release duration, in milliseconds. */
export const REFERENCE_TONE_RELEASE_MS = 80;

/** Maximum reference-tone playback duration, in milliseconds. */
export const REFERENCE_TONE_DURATION_MS = 4000;

/** Delay after a reference tone before pitch detection resumes, in milliseconds. */
export const REFERENCE_TONE_DETECTION_TAIL_MS = 300;

/** Frequencies below this value use harmonics to improve phone-speaker audibility, in hertz. */
export const REFERENCE_TONE_HARMONIC_CUTOFF_HZ = 150;

/** Relative partial amplitudes used for low guitar-string reference tones. */
export const REFERENCE_TONE_LOW_HARMONICS = Object.freeze([1, 0.6, 0.35, 0.2]);

/** Relative partial amplitudes used for higher guitar-string reference tones. */
export const REFERENCE_TONE_HIGH_HARMONICS = Object.freeze([1]);
