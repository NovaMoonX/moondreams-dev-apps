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

// Phone speakers and Bluetooth headphones sleep after a few seconds of silence and drop up to a few seconds of the
// sound that wakes them, and no browser says when they are awake again. So a hiss too quiet to hear (about -70 dB, not
// digital zero, which some headphones ignore) wakes them before a first line and keeps them awake a minute after each.
const WAKE_SECONDS = 2.5;
const KEEP_AWAKE_MS = 60_000;
const HISS_SECONDS = 2;
const HISS_LEVEL = 0.0003;
// A hold that is never released (a suspended page whose sound never ends) lapses, so the hiss always stops.
const HOLD_MAX_MS = 120_000;

const output = {
  holds: new Map<object, number>(),
  hiss: null as AudioBufferSourceNode | null,
  wokenAt: 0,
  stopId: 0 as ReturnType<typeof setTimeout> | 0,
};

const dropLapsedHolds = (now: number) =>
  output.holds.forEach((until, hold) => {
    if (until <= now) output.holds.delete(hold);
  });

const startHiss = (context: AudioContext) => {
  const length = Math.round(context.sampleRate * HISS_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  buffer.copyToChannel(
    Float32Array.from({ length }, () => (Math.random() * 2 - 1) * HISS_LEVEL),
    0,
  );
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(context.destination);
  node.start();
  return node;
};

const stopHissLater = () => {
  clearTimeout(output.stopId);
  output.stopId = setTimeout(() => {
    dropLapsedHolds(Date.now());
    if (output.holds.size > 0) {
      stopHissLater();
      return;
    }
    try {
      output.hiss?.stop();
    } catch {
      // Already stopped.
    }
    output.hiss = null;
  }, KEEP_AWAKE_MS);
  // In Node (the checks) the timer must not hold the process open.
  (output.stopId as { unref?: () => void }).unref?.();
};

/** Keeps the speakers awake for one spoken line: its first sound starts no earlier than `readyAt`, and `release` ends the hold. */
export const wakeAudioOutput = (context: AudioContext) => {
  const now = Date.now();
  dropLapsedHolds(now);
  if (output.hiss === null) {
    try {
      output.hiss = startHiss(context);
      output.wokenAt = context.currentTime;
      recordSpeechEvent('Speakers were quiet; woke them before speaking');
    } catch (error) {
      recordSpeechEvent(
        `Speakers could not be woken: ${describeThrown(error)}`,
      );
    }
  }
  stopHissLater();
  const hold = {};
  output.holds.set(hold, now + HOLD_MAX_MS);
  return {
    readyAt: output.wokenAt + WAKE_SECONDS,
    release: () => {
      if (output.holds.delete(hold)) stopHissLater();
    },
  };
};
