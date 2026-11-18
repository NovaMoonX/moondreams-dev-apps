import {
  describeThrown,
  recordSpeechEvent,
} from '@/lib/speech/speechDiagnostics';

const holder: { context: AudioContext | null; isArmed: boolean } = {
  context: null,
  isArmed: false,
};

/** The one `AudioContext` the page's speech sounds share, or null where the browser has none. */
export const getAudioContext = () => {
  try {
    if (typeof AudioContext === 'undefined') return null;
    holder.context ??= new AudioContext();
    return holder.context;
  } catch (error) {
    console.error('Audio is not available', error);
    recordSpeechEvent(`Audio could not start: ${describeThrown(error)}`);
    return null;
  }
};

/** Resumes the shared context; browsers allow it only from a tap, so call it inside the tap that turns a sound feature on. */
export const unlockAudio = () => {
  getAudioContext()
    ?.resume()
    .catch((error: unknown) => {
      recordSpeechEvent(`Audio could not resume: ${describeThrown(error)}`);
    });
};

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

/** Unlocks the shared context on the next tap or key anywhere, for a feature that starts without its own tap (a mic that opens with its screen). */
export const unlockAudioOnNextTap = () => {
  if (typeof document === 'undefined' || holder.isArmed) return;
  holder.isArmed = true;
  const unlock = () => {
    holder.isArmed = false;
    UNLOCK_EVENTS.forEach((name) =>
      document.removeEventListener(name, unlock, true),
    );
    unlockAudio();
  };
  UNLOCK_EVENTS.forEach((name) =>
    document.addEventListener(name, unlock, true),
  );
};

// Phone speakers and Bluetooth headphones sleep after a few seconds of silence and drop the first second or two of
// the sound that wakes them; a hiss too quiet to hear (about -70 dB, not digital zero, which some headphones ignore)
// wakes them, and the first word waits until it has played long enough.
const IDLE_MS = 3000;
const WAKE_SECONDS = 1.5;
const HISS_SECONDS = 4;
const HISS_LEVEL = 0.0003;

const output = {
  holds: 0,
  releasedAt: 0,
  wokenAt: 0,
  hissUntil: 0,
};

const playHiss = (context: AudioContext) => {
  const length = Math.round(context.sampleRate * HISS_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  buffer.copyToChannel(
    Float32Array.from({ length }, () => (Math.random() * 2 - 1) * HISS_LEVEL),
    0,
  );
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.connect(context.destination);
  node.start();
  output.hissUntil = context.currentTime + HISS_SECONDS;
};

/**
 * Keeps the speakers awake for one line: call it when the line is asked for, schedule its first sound no earlier than
 * `readyAt` (a context time) and call `release` when it ends. After a quiet spell it plays an inaudible hiss first.
 */
export const wakeAudioOutput = (context: AudioContext) => {
  const isIdle =
    output.holds === 0 &&
    Date.now() - output.releasedAt > IDLE_MS &&
    context.currentTime >= output.hissUntil;
  if (isIdle) {
    try {
      playHiss(context);
      output.wokenAt = context.currentTime;
      recordSpeechEvent('Speakers were quiet; woke them before speaking');
    } catch (error) {
      recordSpeechEvent(
        `Speakers could not be woken: ${describeThrown(error)}`,
      );
    }
  }
  output.holds += 1;
  const state = { isReleased: false };
  return {
    readyAt: output.wokenAt + WAKE_SECONDS,
    release: () => {
      if (state.isReleased) return;
      state.isReleased = true;
      output.holds -= 1;
      output.releasedAt = Date.now();
    },
  };
};
