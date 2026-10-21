import { useEffect, useState } from 'react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { unlockAudio, unlockAudioOnNextTap } from '@/lib/speech/audioContext';
import {
  CUE_DEAF_EXTRA_MS,
  playListeningSound,
  type ListeningCue,
} from '@/lib/speech/listeningSound';
import { readAloud } from '@/lib/speech/readAloud';
import { primeSpeech } from '@/utils/speechUtils';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

/** A session that ends sooner than this without hearing anything counts as a failed start. */
const FAST_SESSION_MS = 1500;
const RESTART_DELAYS_MS = [250, 500, 1000, 2000, 4000];
const MAX_FAST_FAILURES = RESTART_DELAYS_MS.length;
const MAX_ALTERNATIVES = 3;
/** A reading that hasn't started by then never will (no voice installed, a dropped event): stop trying to speak. */
const SPEECH_START_TIMEOUT_MS = 1500;

export type SpeechCommandsStatus =
  'off' | 'starting' | 'listening' | 'speaking';

/** Why listening stopped by itself: the microphone was refused, the browser's speech service is turned off, there is no microphone, the service kept failing, it can't listen in this language, or nothing was used for `idleStopMs`. */
export type SpeechCommandsError =
  'denied' | 'service' | 'no-microphone' | 'unavailable' | 'language' | 'idle';

interface Session {
  startedAt: number;
  hadResult: boolean;
  isFailed: boolean;
  isAborted: boolean;
  handled: Set<number>;
}

interface ListenerOptions {
  lang: string;
  speechLang: string;
  /** Gets each finished phrase's guesses, best first; returns true when it used the phrase. */
  onFinalTranscript: (alternatives: string[]) => boolean | void;
  /** Stops listening after this long with no phrase used; never when left out. */
  idleStopMs?: number;
  /** Runs when listening stops by itself (never for a `stop` the caller asked for), with why. */
  onHalt?: (error: SpeechCommandsError) => void;
  /** Read with the natural voice (see `useNaturalVoice`) whenever it is ready; the browser's voice otherwise. */
  isNaturalVoice?: boolean;
}

const getRecognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return null;
  }
  const scope = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const result =
    scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
  return result;
};

/** The listening machine behind `useSpeechCommands`, with its state setters passed in so it can be driven without React. */
export const createSpeechListener = (
  setStatus: (status: SpeechCommandsStatus) => void,
  setError: (error: SpeechCommandsError | null) => void,
) => {
  const state = {
    options: null as ListenerOptions | null,
    recognition: null as SpeechRecognitionLike | null,
    session: null as Session | null,
    isRunning: false,
    startAfterEnd: false,
    isWanted: false,
    isSpeaking: false,
    isHidden: false,
    failures: 0,
    restartId: 0,
    idleId: 0,
    canSpeak: true,
    speechToken: 0,
    stopReading: null as (() => void) | null,
    deafUntil: 0,
  };

  const clearRestart = () => {
    window.clearTimeout(state.restartId);
    state.restartId = 0;
  };

  const clearIdle = () => {
    window.clearTimeout(state.idleId);
    state.idleId = 0;
  };

  const armIdle = () => {
    clearIdle();
    const idleMs = state.options?.idleStopMs;
    if (idleMs === undefined || !state.isWanted) return;
    state.idleId = window.setTimeout(() => halt('idle'), idleMs);
  };

  const stopReading = () => {
    const stop = state.stopReading;
    state.stopReading = null;
    state.speechToken += 1;
    state.isSpeaking = false;
    stop?.();
  };

  const abortSession = () => {
    clearRestart();
    state.startAfterEnd = false;
    if (!state.isRunning || state.recognition === null) return;
    if (state.session !== null) state.session.isAborted = true;
    state.recognition.abort();
  };

  function halt(error: SpeechCommandsError) {
    state.isWanted = false;
    clearIdle();
    abortSession();
    stopReading();
    setStatus('off');
    setError(error);
    state.options?.onHalt?.(error);
  }

  const handleResult = (event: SpeechRecognitionEvent) => {
    const session = state.session;
    if (session === null || state.isSpeaking || !state.isWanted) return;
    session.hadResult = true;
    if (Date.now() < state.deafUntil) return;
    Array.from({ length: event.results.length }, (_, index) => index)
      .filter(
        (index) =>
          index >= event.resultIndex &&
          event.results[index].isFinal &&
          !session.handled.has(index),
      )
      .forEach((index) => {
        session.handled.add(index);
        const result = event.results[index];
        const alternatives = Array.from({ length: result.length }, (_, at) =>
          result[at].transcript.trim(),
        ).filter((transcript) => transcript !== '');
        if (
          alternatives.length > 0 &&
          state.options?.onFinalTranscript(alternatives)
        ) {
          armIdle();
        }
      });
  };

  const handleError = (event: SpeechRecognitionErrorEvent) => {
    const session = state.session;
    if (session === null) return;
    if (event.error === 'not-allowed') return halt('denied');
    if (event.error === 'service-not-allowed') return halt('service');
    if (event.error === 'audio-capture') return halt('no-microphone');
    if (event.error === 'language-not-supported') return halt('language');
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      session.isFailed = true;
    }
  };

  const countFailure = () => {
    state.failures += 1;
    if (state.failures >= MAX_FAST_FAILURES) {
      halt('unavailable');
      return;
    }
    state.restartId = window.setTimeout(
      beginSession,
      RESTART_DELAYS_MS[state.failures],
    );
  };

  const handleEnd = () => {
    const ended = state.session;
    state.isRunning = false;
    state.session = null;
    if (state.startAfterEnd) {
      state.startAfterEnd = false;
      beginSession();
      return;
    }
    if (
      !state.isWanted ||
      state.isSpeaking ||
      state.isHidden ||
      ended === null ||
      ended.isAborted
    ) {
      return;
    }
    const isFast =
      !ended.hadResult &&
      (ended.isFailed || Date.now() - ended.startedAt < FAST_SESSION_MS);
    if (isFast) {
      countFailure();
      return;
    }
    state.failures = 0;
    state.restartId = window.setTimeout(beginSession, RESTART_DELAYS_MS[0]);
  };

  const getRecognition = () => {
    if (state.recognition !== null) return state.recognition;
    const Recognition = getRecognitionConstructor();
    if (Recognition === null) return null;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = MAX_ALTERNATIVES;
    recognition.onstart = () => {
      if (!state.isWanted) {
        abortSession();
        return;
      }
      setStatus('listening');
    };
    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;
    state.recognition = recognition;
    return recognition;
  };

  function beginSession() {
    state.restartId = 0;
    if (!state.isWanted || state.isSpeaking || state.isHidden) return;
    if (state.isRunning) {
      if (state.session?.isAborted) state.startAfterEnd = true;
      return;
    }
    const recognition = getRecognition();
    if (recognition === null) return;
    recognition.lang = state.options?.lang ?? '';
    state.session = {
      startedAt: Date.now(),
      hadResult: false,
      isFailed: false,
      isAborted: false,
      handled: new Set(),
    };
    state.isRunning = true;
    try {
      recognition.start();
    } catch (error) {
      console.error('Speech recognition could not start', error);
      state.isRunning = false;
      state.session = null;
      countFailure();
    }
  }

  const mute = (ms: number) => {
    state.deafUntil = Math.max(state.deafUntil, Date.now() + ms);
  };

  return {
    setOptions: (options: ListenerOptions) => {
      state.options = options;
    },
    start: () => {
      if (state.isWanted || getRecognitionConstructor() === null) return;
      setError(null);
      state.isWanted = true;
      state.failures = 0;
      state.isHidden = document.visibilityState === 'hidden';
      unlockAudio();
      if (state.canSpeak) primeSpeech();
      setStatus('starting');
      armIdle();
      beginSession();
    },
    stop: () => {
      state.isWanted = false;
      clearIdle();
      abortSession();
      stopReading();
      setStatus('off');
    },
    say: (text: string) => {
      if (text.trim() === '' || !state.canSpeak) return;
      stopReading();
      const token = state.speechToken;
      state.isSpeaking = true;
      abortSession();
      state.stopReading = readAloud(text, {
        lang: state.options?.speechLang ?? '',
        isNatural: state.options?.isNaturalVoice === true,
        startTimeoutMs: SPEECH_START_TIMEOUT_MS,
        onNoStart: () => {
          state.canSpeak = false;
        },
        onStart: () => {
          if (token === state.speechToken && state.isWanted) {
            setStatus('speaking');
          }
        },
        onEnd: () => {
          if (token !== state.speechToken) return;
          state.stopReading = null;
          state.isSpeaking = false;
          if (!state.isWanted) return;
          setStatus(state.isHidden ? 'starting' : 'listening');
          beginSession();
        },
      });
    },
    mute,
    cue: (kind: ListeningCue) => {
      const lasts = playListeningSound(kind);
      if (lasts > 0) mute(lasts + CUE_DEAF_EXTRA_MS);
    },
    quiet: () => {
      if (state.stopReading === null && !state.isSpeaking) return;
      stopReading();
      beginSession();
    },
    suspend: () => {
      if (!state.isWanted || state.isHidden) return;
      state.isHidden = true;
      abortSession();
      stopReading();
      setStatus('starting');
    },
    resume: () => {
      if (!state.isWanted || !state.isHidden) return;
      state.isHidden = false;
      beginSession();
    },
    teardown: () => {
      state.isWanted = false;
      clearRestart();
      clearIdle();
      stopReading();
      const recognition = state.recognition;
      state.recognition = null;
      state.session = null;
      state.isRunning = false;
      state.startAfterEnd = false;
      if (recognition === null) return;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    },
  };
};

/** Whether this page can listen: the browser has speech recognition and the page is secure (https or localhost). */
export function canUseSpeechCommands() {
  return getRecognitionConstructor() !== null;
}

/**
 * Voice for any mini-app: listens for spoken phrases with the browser's speech recognition while the person has it on,
 * and only after `start`, which comes from a tap and readies the browser's voice and sound (an app may call it without
 * one only when the person's earlier choice and a granted microphone permission say so). It restarts after the browser
 * ends a session, backing off and giving up after repeated failures, pauses while `say` reads something aloud (so it
 * never hears itself; `quiet` cuts a reading short; a voice that never starts is given up for the session) and while the
 * page is hidden, and stops for good on a refused or missing microphone or after `idleStopMs` with nothing used (`onHalt`
 * says so). Phrase matching is the caller's. Secure pages only.
 *
 * The shared pieces around it live in `@/lib/speech`: `listeningMode` (the closed / waiting for a phrase / command
 * window / kept open machine and its clocks), `speechText` (`readWakePhrase`: a wake phrase at the start of what was
 * heard), `cue` here (a rising chime when listening starts, a lower one when it ends, ignored by the recognizer) and
 * `isNaturalVoice` with `@/hooks/useNaturalVoice` (an opt-in neural voice on the device, read through `readAloud`).
 */
export function useSpeechCommands({
  lang,
  speechLang,
  onFinalTranscript,
  idleStopMs,
  onHalt,
  isNaturalVoice,
}: ListenerOptions) {
  const [isSupported] = useState(canUseSpeechCommands);
  const [status, setStatus] = useState<SpeechCommandsStatus>('off');
  const [error, setError] = useState<SpeechCommandsError | null>(null);
  const [listener] = useState(() => createSpeechListener(setStatus, setError));

  useEffect(() => {
    listener.setOptions({
      lang,
      speechLang,
      onFinalTranscript,
      idleStopMs,
      onHalt,
      isNaturalVoice,
    });
  });

  useEffect(() => {
    if (isSupported) unlockAudioOnNextTap();
  }, [isSupported]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') listener.suspend();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      listener.teardown();
    };
  }, [listener]);

  useOnTabReturn(listener.resume);

  return {
    isSupported,
    status,
    isOn: status !== 'off',
    error,
    start: listener.start,
    stop: listener.stop,
    say: listener.say,
    quiet: listener.quiet,
    cue: listener.cue,
  };
}

export default useSpeechCommands;
