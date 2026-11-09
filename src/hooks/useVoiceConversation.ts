import { useEffect, useRef, useState } from 'react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { unlockAudio } from '@/lib/speech/audioContext';
import {
  createListeningState,
  getListeningEffect,
  reduceListening,
  type ListeningEvent,
} from '@/lib/speech/listeningMode';
import { readMicrophonePermission } from '@/lib/speech/microphonePermission';
import {
  canUseBrowserStt,
  createBrowserStt,
} from '@/lib/speech/voice/browserStt';
import { createDeviceTts } from '@/lib/speech/voice/deviceTts';
import { createPlaybackQueue } from '@/lib/speech/voice/playbackQueue';
import type {
  SpeechPriority,
  SttAdapter,
  SttErrorCode,
  VoiceIdentity,
} from '@/lib/speech/voice/types';
import {
  pickListener,
  pickSpeaker,
  type ListenerChoice,
} from '@/lib/speech/voice/voiceRouter';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type VoiceUnavailableReason = 'no-recognition' | 'no-permission';

export interface VoiceSpoken {
  status: 'spoken' | 'cancelled' | 'failed';
  /** Which adapter said it ('natural' or 'system'); null when none did. */
  adapterId: string | null;
}

interface VoiceConversationOptions {
  lang: string;
  identity: VoiceIdentity;
  /** Words that end an utterance when they close it ("that's all"), supplied by the app. */
  endPhrases: string[];
  /** Gets the finished utterance, never empty, with any end phrase taken off. */
  onUtterance: (text: string) => void;
  /** The opt-in natural voice is downloaded and ready (`useNaturalVoice().isReady`). */
  isNaturalVoiceReady?: boolean;
  /** Silence this long ends the utterance. */
  quietMs?: number;
}

const QUIET_MS = 8000;
// An end phrase still closing the words this long after it was last heard counts; "that's all I need" keeps going.
const END_PHRASE_HOLD_MS = 900;
const TAP_CONFIG = { lockMs: 0 };
const BLOCKED: SttErrorCode[] = ['denied', 'service', 'no-microphone'];

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toEndPattern = (phrases: string[]) =>
  phrases.length === 0
    ? null
    : new RegExp(
        `(?:^|[\\s,.!?;:-])(?:${phrases
          .map((phrase) => escapeRegExp(phrase.trim()).replace(/['’]/g, "['’]"))
          .join('|')})[\\s.!?]*$`,
        'i',
      );

/**
 * Talks with the person by voice: tap to listen, the words appear as heard, and the line is handed to the app when the
 * person taps again, says an end phrase or is quiet for `quietMs`. Replies are spoken through a queue (an `ack` first,
 * a newer turn cutting the older turn's audio) by the voice `pickSpeaker` chooses, and muting silences every line until
 * the screen closes (never stored). Device listening and speaking only; the app supplies its phrases and what an
 * utterance becomes.
 */
export function useVoiceConversation({
  lang,
  identity,
  endPhrases,
  onUtterance,
  isNaturalVoiceReady = false,
  quietMs = QUIET_MS,
}: VoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [heard, setHeard] = useState('');
  const [saying, setSaying] = useState('');
  const [reason, setReason] = useState<VoiceUnavailableReason | null>(() =>
    canUseBrowserStt() ? null : 'no-recognition',
  );
  const latest = useRef({
    lang,
    identity,
    endPhrases,
    onUtterance,
    isNaturalVoiceReady,
    quietMs,
    isMuted,
  });
  const run = useRef({
    mode: createListeningState('TAP'),
    isCancelled: false,
    stopListening: null as (() => void) | null,
    quietId: 0,
    holdId: 0,
  });

  useEffect(() => {
    latest.current = {
      lang,
      identity,
      endPhrases,
      onUtterance,
      isNaturalVoiceReady,
      quietMs,
      isMuted,
    };
  });

  // Called from event handlers and from effects that call `speak`, so a state change waits a tick rather than land inside an effect body.
  const defer = (apply: () => void) => queueMicrotask(apply);

  const queueRef = useRef<ReturnType<typeof createPlaybackQueue> | null>(null);
  const getQueue = () => {
    queueRef.current ??= createPlaybackQueue({
      pick: (priority) => {
        const { lang: speechLang, identity: voice } = latest.current;
        const isNatural =
          pickSpeaker({
            isOnline: navigator.onLine,
            priority,
            isNaturalVoiceReady:
              latest.current.isNaturalVoiceReady && voice.device.naturalVoice,
          }) === 'natural';
        return createDeviceTts({ isNatural, lang: speechLang });
      },
      onActiveChange: (isActive) =>
        queueMicrotask(() => setIsSpeaking(isActive)),
    });
    return queueRef.current;
  };

  const clearTimers = () => {
    window.clearTimeout(run.current.quietId);
    window.clearTimeout(run.current.holdId);
    run.current.quietId = 0;
    run.current.holdId = 0;
  };

  const send = (event: ListeningEvent) => {
    const before = run.current.mode;
    run.current.mode = reduceListening(before, event, TAP_CONFIG);
    return getListeningEffect(before, run.current.mode);
  };

  const finish = () => {
    clearTimers();
    run.current.stopListening?.();
  };

  const armQuiet = () => {
    window.clearTimeout(run.current.quietId);
    run.current.quietId = window.setTimeout(finish, latest.current.quietMs);
  };

  const handlePartial = (text: string) => {
    setHeard(text);
    armQuiet();
    window.clearTimeout(run.current.holdId);
    run.current.holdId = 0;
    const pattern = toEndPattern(latest.current.endPhrases);
    if (pattern?.test(text)) {
      run.current.holdId = window.setTimeout(finish, END_PHRASE_HOLD_MS);
    }
  };

  const handleFinal = (text: string) => {
    clearTimers();
    run.current.stopListening = null;
    send({ type: 'STOP' });
    setIsListening(false);
    setHeard('');
    if (run.current.isCancelled) return;
    const pattern = toEndPattern(latest.current.endPhrases);
    const said = (pattern ? text.replace(pattern, '') : text).trim();
    if (said === '') return;
    setIsThinking(true);
    latest.current.onUtterance(said);
  };

  const handleError = (code: SttErrorCode) => {
    run.current.isCancelled = true;
    setReason(BLOCKED.includes(code) ? 'no-permission' : 'no-recognition');
    run.current.stopListening?.();
    handleFinal('');
  };

  const listen = () => {
    if (reason !== null || run.current.mode.phase !== 'OFF') return false;
    unlockAudio();
    getQueue().clear();
    send({ type: 'TAP_MIC' });
    run.current.isCancelled = false;
    const adapters: Record<ListenerChoice, () => SttAdapter> = {
      browser: () => createBrowserStt({ lang: latest.current.lang }),
    };
    const adapter = adapters[pickListener({ isOnline: navigator.onLine })]();
    run.current.stopListening = () => adapter.stop();
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    armQuiet();
    adapter
      .start({
        onPartial: handlePartial,
        onFinal: handleFinal,
        onSpeechStart: () => setReason(null),
        onError: handleError,
        preRoll: null,
      })
      .catch((error: unknown) => {
        console.error('Voice listening did not start', error);
        handleError('unavailable');
      });
    return true;
  };

  const stop = () => {
    if (run.current.mode.phase !== 'OFF') {
      finish();
      return;
    }
    getQueue().clear();
    setIsThinking(false);
  };

  const cancel = () => {
    if (run.current.mode.phase === 'OFF') return;
    run.current.isCancelled = true;
    finish();
  };

  const speak = (
    text: string,
    options: { priority: SpeechPriority; turnKey: number },
  ): Promise<VoiceSpoken> => {
    if (latest.current.isMuted || run.current.mode.phase !== 'OFF') {
      return Promise.resolve({ status: 'cancelled', adapterId: null });
    }
    defer(() => setIsThinking(false));
    return getQueue().enqueue(text, {
      ...options,
      onStart: () => setSaying(text),
    });
  };

  const setMuted = (isOn: boolean) => {
    setIsMuted(isOn);
    latest.current.isMuted = isOn;
    if (isOn) getQueue().clear();
  };

  const checkPermission = () => {
    readMicrophonePermission()
      .then((permission) => {
        if (permission === 'denied') setReason('no-permission');
        else
          setReason((current) =>
            current === 'no-permission' ? null : current,
          );
      })
      .catch(() => undefined);
  };

  useEffect(checkPermission, []);
  useOnTabReturn(checkPermission);

  useEffect(
    () => () => {
      run.current.isCancelled = true;
      window.clearTimeout(run.current.quietId);
      window.clearTimeout(run.current.holdId);
      run.current.stopListening?.();
      getQueue().clear();
    },
    [],
  );

  const state: VoiceState = isListening
    ? 'listening'
    : isSpeaking
      ? 'speaking'
      : isThinking
        ? 'thinking'
        : 'idle';

  return {
    state,
    heard,
    /** The line being said right now; empty otherwise. */
    saying: isSpeaking ? saying : '',
    isMuted,
    setMuted,
    listen,
    stop,
    cancel,
    speak,
    markThinking: () => setIsThinking(true),
    /** Ends "thinking" for a turn that has nothing to say. */
    settle: () => defer(() => setIsThinking(false)),
    isAvailable: reason === null,
    unavailableReason: reason,
  };
}
