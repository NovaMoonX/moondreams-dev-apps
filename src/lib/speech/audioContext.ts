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
    return null;
  }
};

/** Resumes the shared context; browsers allow it only from a tap, so call it inside the tap that turns a sound feature on. */
export const unlockAudio = () => {
  getAudioContext()
    ?.resume()
    .catch(() => undefined);
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
