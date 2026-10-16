const MIN_SPEAK_GUARD_MS = 4000;
const MAX_SPEAK_GUARD_MS = 60_000;
const SPEAK_MS_PER_CHAR = 90;

interface SpeakOptions {
  lang: string;
  onStart?: () => void;
  /** Runs once, when the reading ends, fails, is cancelled or outlasts a guard for its length. */
  onEnd?: () => void;
  /** Gives up when the reading hasn't started by then (`onNoStart`, then `onEnd`). */
  startTimeoutMs?: number;
  onNoStart?: () => void;
}

const normalizeLang = (lang: string) => lang.toLowerCase().replace('_', '-');

/** The browser's text-to-speech, or null where it is missing. */
export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  return window.speechSynthesis ?? null;
}

/** A voice for `lang`: the exact language first, then the same language from another region, preferring one on the device. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | null {
  const wanted = normalizeLang(lang);
  const primary = wanted.split('-')[0];
  const exact = voices.filter((voice) => normalizeLang(voice.lang) === wanted);
  const pool =
    exact.length > 0
      ? exact
      : voices.filter(
          (voice) => normalizeLang(voice.lang).split('-')[0] === primary,
        );
  const result =
    pool.find((voice) => voice.localService) ??
    pool.find((voice) => voice.default) ??
    pool[0] ??
    null;
  return result;
}

// Kept so the browser can't collect a reading before its `end` arrives (Chrome drops the event otherwise).
const reading: { current: SpeechSynthesisUtterance | null } = { current: null };

/** Reads `text` aloud, cancelling whatever was being read. Returns a function that stops it. Where text-to-speech is missing it calls `onEnd` at once. */
export function speakText(
  text: string,
  { lang, onStart, onEnd, startTimeoutMs, onNoStart }: SpeakOptions,
): () => void {
  const synth = getSpeechSynthesis();
  if (synth === null || typeof SpeechSynthesisUtterance === 'undefined') {
    onEnd?.();
    return () => undefined;
  }

  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = pickVoice(synth.getVoices(), lang);
  if (voice !== null) utterance.voice = voice;

  const state = { isEnded: false, guardId: 0, startId: 0 };
  const finish = () => {
    if (state.isEnded) return;
    state.isEnded = true;
    window.clearTimeout(state.guardId);
    window.clearTimeout(state.startId);
    if (reading.current === utterance) reading.current = null;
    onEnd?.();
  };
  if (startTimeoutMs !== undefined) {
    state.startId = window.setTimeout(() => {
      if (state.isEnded) return;
      synth.cancel();
      onNoStart?.();
      finish();
    }, startTimeoutMs);
  }
  state.guardId = window.setTimeout(
    finish,
    Math.min(
      MAX_SPEAK_GUARD_MS,
      MIN_SPEAK_GUARD_MS + text.length * SPEAK_MS_PER_CHAR,
    ),
  );
  utterance.onstart = () => {
    window.clearTimeout(state.startId);
    onStart?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  reading.current = utterance;

  try {
    synth.speak(utterance);
  } catch (error) {
    console.error('Text could not be read aloud', error);
    finish();
  }

  return () => {
    if (state.isEnded) return;
    synth.cancel();
    finish();
  };
}

/** Readies text-to-speech from a tap with a silent, empty reading, since some browsers speak later only once a tap has. */
export function primeSpeech() {
  const synth = getSpeechSynthesis();
  if (synth === null || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    synth.speak(utterance);
  } catch (error) {
    console.error('Text-to-speech could not be readied', error);
  }
}
