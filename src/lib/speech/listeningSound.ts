import { getAudioContext } from '@/lib/speech/audioContext';

export type ListeningCue = 'start' | 'stop';

const NOTE_GAP_S = 0.09;
const NOTE_LENGTH_S = 0.2;
/** Results the recognizer returns this soon after a cue ends are dropped: it may have heard the cue. */
export const CUE_DEAF_EXTRA_MS = 200;

const CUES: Record<ListeningCue, { hertz: [number, number]; volume: number }> =
  {
    start: { hertz: [659.25, 880], volume: 0.09 },
    stop: { hertz: [523.25, 392], volume: 0.045 },
  };

const playNote = (
  context: AudioContext,
  hertz: number,
  at: number,
  volume: number,
) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = hertz;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH_S);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + NOTE_LENGTH_S + 0.02);
};

/**
 * Plays a short two-note chime: rising when listening starts, lower and softer when it stops. Returns how many
 * milliseconds it lasts, or 0 when nothing was scheduled (no audio, a hidden page), so the caller can ignore what the
 * recognizer hears meanwhile. A context no tap has resumed yet stays silent. It fails quietly.
 */
export const playListeningSound = (cue: ListeningCue) => {
  try {
    const context = getAudioContext();
    if (
      context === null ||
      context.state === 'closed' ||
      document.visibilityState === 'hidden'
    ) {
      return 0;
    }
    context.resume().catch(() => undefined);
    const { hertz, volume } = CUES[cue];
    const start = context.currentTime + 0.01;
    playNote(context, hertz[0], start, volume);
    playNote(context, hertz[1], start + NOTE_GAP_S, volume);
    return Math.ceil((NOTE_GAP_S + NOTE_LENGTH_S + 0.01) * 1000);
  } catch (error) {
    console.error('Listening sound is not available', error);
    return 0;
  }
};
