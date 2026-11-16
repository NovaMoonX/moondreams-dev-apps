import { splitSentences } from '@/lib/speech/naturalVoice/sentences';

const MIN_SPEAK_GUARD_MS = 4000;
const MAX_SPEAK_GUARD_MS = 60_000;
const SPEAK_MS_PER_CHAR = 90;
// The guard only ends a reading the browser has stopped reporting; one still speaking is waited on, up to this long past it.
const GUARD_EXTENSION_MS = 120_000;
const GUARD_POLL_MS = 1000;
// Chrome stops a single utterance after about 15 seconds, so a reading is queued a sentence or two at a time.
const CHUNK_MIN_CHARS = 40;
const CHUNK_MAX_CHARS = 200;
// Chrome drops a reading started in the same moment as a cancel, so one that follows another waits a beat and a silent one is tried once more.
const CANCEL_SETTLE_MS = 80;
const MAX_SPEAK_ATTEMPTS = 2;

interface SpeakOptions {
  lang: string;
  onStart?: () => void;
  /** Runs once, when the reading ends, fails, is cancelled or outlasts a guard for its length. */
  onEnd?: () => void;
  /** Gives up when the reading hasn't started by then (`onNoStart`, then `onEnd`). */
  startTimeoutMs?: number;
  onNoStart?: () => void;
  /** How far through the text the voice is (0 to 1); at each sentence start and, where the browser reports word boundaries, between them. */
  onProgress?: (fraction: number) => void;
}

const normalizeLang = (lang: string) => lang.toLowerCase().replace('_', '-');

/** The browser's text-to-speech, or null where it is missing. */
export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  return window.speechSynthesis ?? null;
}

const VOICE_QUALITY_HINTS: [RegExp, number][] = [
  [/espeak|\bcompact\b/i, -2],
  [/\b(natural|neural)\b|premium|enhanced|siri/i, 3],
  [/^google\b/i, 2],
];

/** How natural a voice sounds, guessed from its name (browsers expose no quality field): Edge's "Natural" voices, Apple's Premium, Enhanced and Siri voices and Google's voices rank above a plain system voice, and eSpeak or an Apple "compact" voice below it. */
export function getVoiceQuality(voice: SpeechSynthesisVoice): number {
  const result =
    VOICE_QUALITY_HINTS.find(([hint]) => hint.test(voice.name))?.[1] ?? 0;
  return result;
}

/** A voice for `lang`: the exact language first, then the same language from another region; within that the most natural-sounding by name, then one on the device (a network voice sends what it reads to its vendor), then the browser's default. */
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
  const rank = (voice: SpeechSynthesisVoice) =>
    getVoiceQuality(voice) * 4 +
    (voice.localService ? 2 : 0) +
    (voice.default ? 1 : 0);
  const result = pool.reduce<SpeechSynthesisVoice | null>(
    (best, voice) => (best === null || rank(voice) > rank(best) ? voice : best),
    null,
  );
  return result;
}

// Kept so the browser can't collect a reading before its `end` arrives (Chrome drops the event otherwise).
const reading: { current: SpeechSynthesisUtterance[] | null } = {
  current: null,
};

/** Reads `text` aloud, cancelling whatever was being read. Returns a function that stops it. Where text-to-speech is missing it calls `onEnd` at once. */
export function speakText(
  text: string,
  { lang, onStart, onEnd, startTimeoutMs, onNoStart, onProgress }: SpeakOptions,
): () => void {
  const synth = getSpeechSynthesis();
  if (synth === null || typeof SpeechSynthesisUtterance === 'undefined') {
    onEnd?.();
    return () => undefined;
  }

  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();
  const voice = pickVoice(synth.getVoices(), lang);
  const split = splitSentences(text, {
    minChars: CHUNK_MIN_CHARS,
    maxChars: CHUNK_MAX_CHARS,
  });
  const chunks = split.length > 0 ? split : [text];
  const wholeChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const starts = chunks.map((_, index) =>
    chunks.slice(0, index).reduce((sum, chunk) => sum + chunk.length, 0),
  );
  const reportAt = (index: number, charIndex: number) =>
    onProgress?.(
      Math.min(1, (starts[index]! + charIndex) / Math.max(1, wholeChars)),
    );

  const state = {
    isEnded: false,
    guardId: 0,
    startId: 0,
    speakId: 0,
    attempts: 0,
    utterances: null as SpeechSynthesisUtterance[] | null,
    hardStopAt: 0,
  };
  const finish = () => {
    if (state.isEnded) return;
    state.isEnded = true;
    window.clearTimeout(state.guardId);
    window.clearTimeout(state.startId);
    window.clearTimeout(state.speakId);
    if (reading.current === state.utterances) reading.current = null;
    onEnd?.();
  };
  const speakOnce = () => {
    if (state.isEnded) return;
    state.attempts += 1;
    const utterances = chunks.map((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      if (voice !== null) utterance.voice = voice;
      utterance.onstart = () => {
        window.clearTimeout(state.startId);
        if (index === 0) onStart?.();
        reportAt(index, 0);
      };
      utterance.onboundary = (event) => reportAt(index, event.charIndex);
      utterance.onend = index === chunks.length - 1 ? finish : null;
      utterance.onerror = finish;
      return utterance;
    });
    state.utterances = utterances;
    reading.current = utterances;
    if (startTimeoutMs !== undefined) {
      state.startId = window.setTimeout(() => {
        if (state.isEnded) return;
        utterances.forEach((utterance) => {
          utterance.onend = null;
          utterance.onerror = null;
        });
        synth.cancel();
        if (state.attempts < MAX_SPEAK_ATTEMPTS) {
          state.speakId = window.setTimeout(speakOnce, CANCEL_SETTLE_MS);
          return;
        }
        onNoStart?.();
        finish();
      }, startTimeoutMs);
    }
    try {
      synth.resume();
      utterances.forEach((utterance) => synth.speak(utterance));
    } catch (error) {
      console.error('Text could not be read aloud', error);
      finish();
    }
  };

  const guardMs = Math.min(
    MAX_SPEAK_GUARD_MS,
    MIN_SPEAK_GUARD_MS + wholeChars * SPEAK_MS_PER_CHAR,
  );
  const checkGuard = () => {
    if (state.isEnded) return;
    if (synth.speaking && Date.now() < state.hardStopAt) {
      state.guardId = window.setTimeout(checkGuard, GUARD_POLL_MS);
      return;
    }
    if (synth.speaking) synth.cancel();
    finish();
  };
  state.hardStopAt = Date.now() + guardMs + GUARD_EXTENSION_MS;
  state.guardId = window.setTimeout(checkGuard, guardMs);
  if (wasBusy) state.speakId = window.setTimeout(speakOnce, CANCEL_SETTLE_MS);
  else speakOnce();

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
