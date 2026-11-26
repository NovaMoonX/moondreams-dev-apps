const STALE_MS = 400;
// Speech sits well under full scale, so the raw level is lifted before it is shown.
const GAIN = 5;
const FALL = 0.82;

const state = { level: 0, at: 0 };

/** Folds one 16-bit PCM frame of the microphone into the shown level; a loud frame rises at once and a quiet one falls away. */
export const reportInputFrame = (frame: ArrayBuffer) => {
  const samples = new Int16Array(frame);
  if (samples.length === 0) return;
  const sum = samples.reduce((total, value) => total + value * value, 0);
  const rms = Math.sqrt(sum / samples.length) / 0x8000;
  state.level = Math.max(Math.min(1, rms * GAIN), state.level * FALL);
  state.at = performance.now();
};

/** Forgets the level when the microphone is released. */
export const clearInputLevel = () => {
  state.level = 0;
  state.at = 0;
};

/** The microphone's level, 0 to 1, or null when no capture on this page is reporting one (the browser's own recognition hears the audio itself). */
export const readInputLevel = (): number | null =>
  performance.now() - state.at > STALE_MS ? null : state.level;
