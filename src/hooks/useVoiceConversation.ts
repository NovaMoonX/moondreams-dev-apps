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
import { createDeepgramStt } from '@/lib/speech/voice/deepgramStream';
import { createDeviceTts } from '@/lib/speech/voice/deviceTts';
import { createPlaybackQueue } from '@/lib/speech/voice/playbackQueue';
import type {
  CloudHeldReason,
  SpeechPriority,
  SttAdapter,
  SttErrorCode,
  VoiceIdentity,
} from '@/lib/speech/voice/types';
import { pickListener, pickSpeaker } from '@/lib/speech/voice/voiceRouter';
import type { VoiceTokenSource } from '@/lib/speech/voice/voiceToken';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';

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
  /** Gets the finished utterance, never empty, with any end phrase taken off, and which listener heard it ('deepgram' or 'browser'). */
  onUtterance: (text: string, heardBy: { sttProvider: string }) => void;
  /** Listening ended with nothing heard (not a cancel). */
  onNothingHeard?: () => void;
  /** The opt-in natural voice is downloaded and ready (`useNaturalVoice().isReady`). */
  isNaturalVoiceReady?: boolean;
  /** Silence this long ends the utterance. */
  quietMs?: number;
  /** The cloud turned this device away for the rest of the local day; called once per day. */
  onCloudHeld?: (reason: CloudHeldReason) => void;
  /** Listens in the cloud while `isAllowed`, online and not held for the day; the browser's recognition takes over whenever it can't. Null listens with the browser only. */
  cloudListening?: { tokenSource: VoiceTokenSource; isAllowed: boolean } | null;
}

export type VoiceListeningRoute = 'cloud' | 'device';

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
 * the screen closes (never stored). Listening is the cloud's when the app allows it and `pickListener` agrees, the
 * browser's otherwise; speaking is on the device. The app supplies its phrases and what an utterance becomes.
 */
export function useVoiceConversation({
  lang,
  identity,
  endPhrases,
  onUtterance,
  onNothingHeard,
  isNaturalVoiceReady = false,
  quietMs = QUIET_MS,
  cloudListening = null,
  onCloudHeld,
}: VoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [heard, setHeard] = useState('');
  const [saying, setSaying] = useState('');
  const [held, setHeld] = useState<{
    day: string;
    reason: CloudHeldReason;
  } | null>(null);
  const [listeningRoute, setListeningRoute] =
    useState<VoiceListeningRoute | null>(null);
  const [reason, setReason] = useState<VoiceUnavailableReason | null>(() =>
    canUseBrowserStt() ? null : 'no-recognition',
  );
  const latest = useRef({
    lang,
    identity,
    endPhrases,
    onUtterance,
    onNothingHeard,
    isNaturalVoiceReady,
    quietMs,
    isMuted,
    cloudListening,
    onCloudHeld,
  });
  const run = useRef({
    heldDay: null as string | null,
    heardBy: 'browser',
    mode: createListeningState('TAP'),
    isCancelled: false,
    stopListening: null as (() => void) | null,
    cancelListening: null as (() => void) | null,
    quietId: 0,
    holdId: 0,
  });

  useEffect(() => {
    latest.current = {
      lang,
      identity,
      endPhrases,
      onUtterance,
      onNothingHeard,
      isNaturalVoiceReady,
      quietMs,
      isMuted,
      cloudListening,
      onCloudHeld,
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
    run.current.cancelListening = null;
    send({ type: 'STOP' });
    setIsListening(false);
    setListeningRoute(null);
    setHeard('');
    if (run.current.isCancelled) return;
    const pattern = toEndPattern(latest.current.endPhrases);
    const said = (pattern ? text.replace(pattern, '') : text).trim();
    if (said === '') {
      latest.current.onNothingHeard?.();
      return;
    }
    setIsThinking(true);
    latest.current.onUtterance(said, { sttProvider: run.current.heardBy });
  };

  // A refusal or an unsupported language stays (until the permission changes); any other failure ends this attempt only, said as nothing heard.
  const handleError = (code: SttErrorCode) => {
    run.current.isCancelled = true;
    const isLasting = BLOCKED.includes(code) || code === 'language';
    if (BLOCKED.includes(code)) setReason('no-permission');
    else if (code === 'language') setReason('no-recognition');
    run.current.stopListening?.();
    handleFinal('');
    if (!isLasting) latest.current.onNothingHeard?.();
  };

  const listen = () => {
    if (reason !== null || run.current.mode.phase !== 'OFF') return false;
    unlockAudio();
    getQueue().clear();
    send({ type: 'TAP_MIC' });
    run.current.isCancelled = false;
    const callbacks = {
      onPartial: handlePartial,
      onFinal: handleFinal,
      onSpeechStart: () => setReason(null),
      onError: handleError,
      preRoll: null,
    };
    const startAdapter = (adapter: SttAdapter) => {
      run.current.heardBy = adapter.id;
      run.current.stopListening = () => adapter.stop();
      run.current.cancelListening = () => (adapter.cancel ?? adapter.stop)();
      setListeningRoute(adapter.route === 'cloud' ? 'cloud' : 'device');
      adapter.start(callbacks).catch((error: unknown) => {
        console.error('Voice listening did not start', error);
        handleError('unavailable');
      });
    };
    const startBrowser = () => {
      armQuiet();
      startAdapter(createBrowserStt({ lang: latest.current.lang }));
    };
    const cloud = latest.current.cloudListening;
    const today = toLocalDateInputValue(Date.now());
    if (held !== null && held.day !== today) setHeld(null);
    const choice = pickListener({
      isOnline: navigator.onLine,
      isCloudAllowed: cloud?.isAllowed ?? false,
      isCloudHeld: run.current.heldDay === today,
      hasCloud: cloud !== null,
    });
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    armQuiet();
    if (choice === 'cloud' && cloud) {
      startAdapter(
        createDeepgramStt({
          lang: latest.current.lang,
          getToken: cloud.tokenSource.getToken,
          onUnavailable: (heldReason) => {
            if (run.current.isCancelled || run.current.mode.phase === 'OFF') {
              return;
            }
            if (heldReason !== null) {
              run.current.heldDay = today;
              setHeld({ day: today, reason: heldReason });
              latest.current.onCloudHeld?.(heldReason);
            }
            startBrowser();
          },
          onClosed: cloud.tokenSource.reportClosed,
        }),
      );
    } else startBrowser();
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
    clearTimers();
    run.current.cancelListening?.();
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
      run.current.cancelListening?.();
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
    /** Why the cloud turned this device away today; null while it hasn't, and again on a new day. */
    cloudHeld: held?.reason ?? null,
    /** Where the words being heard are listened to; null when not listening. */
    listeningRoute,
  };
}
