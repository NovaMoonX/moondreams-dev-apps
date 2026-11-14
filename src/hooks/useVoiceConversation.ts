import { useEffect, useRef, useState } from 'react';

import { createSpeechListener } from '@/hooks/useSpeechCommands';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { unlockAudio } from '@/lib/speech/audioContext';
import { playListeningSound } from '@/lib/speech/listeningSound';
import {
  createListeningState,
  getListeningEffect,
  reduceListening,
  type ListeningEvent,
} from '@/lib/speech/listeningMode';
import {
  readMicrophonePermission,
  watchMicrophonePermission,
} from '@/lib/speech/microphonePermission';
import { readWakePhrase } from '@/lib/speech/speechText';
import { isOnDeviceLang } from '@/lib/speech/onDevice/config';
import {
  createOnDeviceStt,
  listenOnDevice,
} from '@/lib/speech/onDevice/onDeviceStt';
import { openSpeechGate } from '@/lib/speech/voice/bargeIn';
import {
  canUseBrowserStt,
  createBrowserStt,
} from '@/lib/speech/voice/browserStt';
import { createDeepgramStt } from '@/lib/speech/voice/deepgramStream';
import { createCloudTts } from '@/lib/speech/voice/cloudTts';
import { createDeviceTts } from '@/lib/speech/voice/deviceTts';
import { createPlaybackQueue } from '@/lib/speech/voice/playbackQueue';
import {
  isOtherVoice,
  withSpeechVoice,
  type SpeechSource,
  type SpeechVoice,
} from '@/lib/speech/voice/speechSource';
import type {
  CloudHeldReason,
  FrameSource,
  SpeechPriority,
  SttAdapter,
  SttErrorCode,
  VoiceIdentity,
} from '@/lib/speech/voice/types';
import {
  pickListener,
  pickSpeaker,
  pickWakeListener,
} from '@/lib/speech/voice/voiceRouter';
import type { VoiceTokenSource } from '@/lib/speech/voice/voiceToken';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type VoiceUnavailableReason = 'no-recognition' | 'no-permission';

export interface VoiceSpoken {
  status: 'spoken' | 'cancelled' | 'failed';
  /** Which adapter said it ('cloud:{provider}', 'natural' or 'system'); null when none did. */
  adapterId: string | null;
}

interface VoiceConversationOptions {
  lang: string;
  identity: VoiceIdentity;
  /** Words that end an utterance when they close it ("that's all"), supplied by the app. */
  endPhrases: string[];
  /** Gets the finished utterance, never empty, with any end phrase taken off, and which listener heard it ('deepgram', 'on-device' or 'browser'). */
  onUtterance: (text: string, heardBy: { sttProvider: string }) => void;
  /** The app reads a turn that is only an end phrase as a close (and calls `closeByPhrase`); without it that turn ends the conversation and is not handed over. */
  readsClose?: boolean;
  /** Listening ended with nothing heard (not a cancel). `isAsked` is false when the listen started without a tap (the person's voice opened it after a reply or over a line), where saying so would be a fault the person didn't earn. */
  onNothingHeard?: (isAsked: boolean) => void;
  /** The model on the device couldn't start or died while listening; `isAsked` is as for `onNothingHeard`. Without it this counts as nothing heard. */
  onDeviceListenFailed?: (isAsked: boolean) => void;
  /** The opt-in natural voice is downloaded and ready (`useNaturalVoice().isReady`). */
  isNaturalVoiceReady?: boolean;
  /** The opt-in recognition model is downloaded (`useOnDeviceRecognition().isOn`): it listens whenever the cloud doesn't, waits for the wake phrase and hears a barge-in, all on the device. */
  isOnDeviceReady?: boolean;
  /** Words the recognizer should expect (names the person has told the app), read at the start of each listen and never sent mid-stream. */
  getNameHints?: () => string[];
  /** Silence this long ends the utterance. */
  quietMs?: number;
  /** The cloud turned this device away for the rest of the local day; called once per day. */
  onCloudHeld?: (reason: CloudHeldReason) => void;
  /** Listens in the cloud while `isAllowed`, online and not held for the day; the device takes over whenever it can't (the downloaded model, else the browser's recognition). Null listens on the device only. */
  cloudListening?: { tokenSource: VoiceTokenSource; isAllowed: boolean } | null;
  /** Speaks a `reply` or `summary` in the cloud while `isAllowed`, online and not held for the day; the device voice takes over whenever it can't. An `ack` always stays on the device, and so does the rest of a conversation once a line falls back. Null speaks on the device only. */
  cloudSpeaking?: {
    source: SpeechSource;
    isAllowed: boolean;
    /** Read once at a conversation's first cloud line; that voice lasts until it ends. */
    readVoice?: () => SpeechVoice;
  } | null;
  /** A conversation ends after this long with no line spoken; the cloud voice is tried again for the next. */
  conversationIdleMs?: number;
  /** The person started talking over a line that was playing; the line is already stopped and listening is starting. */
  onBargeIn?: () => void;
  /** Waits for a phrase on the device (the downloaded model, else the browser's own recognition) while nothing else is going on and the page is visible; Null never does. `onWake` gets the words said after the phrase in the same breath, null when there were none, with which listener heard them, and says whether it started something. */
  wake?: {
    isOn: boolean;
    spellings: readonly string[];
    onWake: (rest: string | null, heardBy: { sttProvider: string }) => boolean;
  } | null;
}

export type VoiceListeningRoute = 'cloud' | 'device';

const QUIET_MS = 8000;
const CONVERSATION_IDLE_MS = 10 * 60 * 1000;
const FIRST_LINE_FIRST_BYTE_MS = 4000;
const FOLLOW_UP_MS = 8000;
const WAKE_SETTLE_MS = 400;
const WAKE_RETRIES = 2;
const WAKE_RETRY_MS = 3000;
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
 * downloaded on-device model's otherwise, else the browser's; a `reply` or `summary` is spoken in the cloud when the app allows it, the device otherwise (a conversation ends after `conversationIdleMs` with no line, an end phrase, or a stop). The app supplies its phrases and what an utterance becomes.
 */
export function useVoiceConversation({
  lang,
  identity,
  endPhrases,
  onUtterance,
  readsClose = false,
  onNothingHeard,
  onDeviceListenFailed,
  isNaturalVoiceReady = false,
  isOnDeviceReady = false,
  quietMs = QUIET_MS,
  conversationIdleMs = CONVERSATION_IDLE_MS,
  cloudListening = null,
  cloudSpeaking = null,
  onCloudHeld,
  onBargeIn,
  wake = null,
  getNameHints,
}: VoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSounding, setIsSounding] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [heard, setHeard] = useState('');
  const [saying, setSaying] = useState('');
  const [held, setHeld] = useState<{
    day: string;
    reason: CloudHeldReason;
  } | null>(null);
  const [listeningRoute, setListeningRoute] =
    useState<VoiceListeningRoute | null>(null);
  const [lastingReason, setReason] = useState<VoiceUnavailableReason | null>(
    () => (canUseBrowserStt() ? null : 'no-recognition'),
  );
  const canHearOnDevice = isOnDeviceReady && isOnDeviceLang(lang);
  // Recognition the browser lacks is no reason to stop once the model on the device can hear.
  const reason =
    lastingReason === 'no-recognition' && canHearOnDevice
      ? null
      : lastingReason;
  const latest = useRef({
    lang,
    identity,
    endPhrases,
    onUtterance,
    readsClose,
    onNothingHeard,
    onDeviceListenFailed,
    isNaturalVoiceReady,
    canHearOnDevice,
    quietMs,
    conversationIdleMs,
    isMuted,
    cloudListening,
    cloudSpeaking,
    onCloudHeld,
    onBargeIn,
    wake,
    getNameHints,
    reason,
  });
  const gateHandler = useRef<
    ((source: FrameSource, isBargeIn: boolean) => void) | null
  >(null);
  const pauseOnHide = useRef<() => void>(() => undefined);
  const isMicGranted = useRef(false);
  const run = useRef({
    heldDay: null as string | null,
    speechHeldDay: null as string | null,
    isDeviceSticky: false,
    voice: null as SpeechVoice | null,
    hasSpokenCloud: false,
    lastLineAt: null as number | null,
    heardBy: 'browser',
    mode: createListeningState('TAP'),
    isCancelled: false,
    stopListening: null as (() => void) | null,
    cancelListening: null as (() => void) | null,
    quietId: 0,
    holdId: 0,
    followUpId: 0,
    isFollowUp: false,
    isUnasked: false,
    gate: null as { close: () => void } | null,
  });

  useEffect(() => {
    latest.current = {
      lang,
      identity,
      endPhrases,
      onUtterance,
      readsClose,
      onNothingHeard,
      onDeviceListenFailed,
      isNaturalVoiceReady,
      canHearOnDevice,
      quietMs,
      conversationIdleMs,
      isMuted,
      cloudListening,
      cloudSpeaking,
      onCloudHeld,
      onBargeIn,
      wake,
      getNameHints,
      reason,
    };
  });

  // A state change waits a tick so it never lands inside an effect body.
  const defer = (apply: () => void) => queueMicrotask(apply);

  const queueRef = useRef<ReturnType<typeof createPlaybackQueue> | null>(null);
  const getQueue = () => {
    queueRef.current ??= createPlaybackQueue({
      pick: (priority) => {
        const { lang: speechLang, identity: voice } = latest.current;
        const cloud = latest.current.cloudSpeaking;
        const today = toLocalDateInputValue(Date.now());
        // A voice the person picked since this conversation began starts it afresh, so the pick is heard at once.
        const wanted = cloud?.readVoice ? cloud.readVoice() : null;
        if (isOtherVoice(run.current.voice, wanted)) endConversation();
        const isNaturalReady =
          latest.current.isNaturalVoiceReady && voice.device.naturalVoice;
        const choice = pickSpeaker({
          isOnline: navigator.onLine,
          priority,
          isNaturalVoiceReady: isNaturalReady,
          isCloudAllowed: cloud?.isAllowed ?? false,
          isCloudHeld: run.current.speechHeldDay === today,
          isDeviceSticky: run.current.isDeviceSticky,
          hasCloud: cloud !== null,
        });
        if (choice !== 'cloud' && cloud?.isAllowed && priority !== 'ack') {
          run.current.isDeviceSticky = true;
        }
        const device = createDeviceTts({
          isNatural:
            choice === 'natural' || (choice === 'cloud' && isNaturalReady),
          lang: speechLang,
        });
        if (choice !== 'cloud' || !cloud) return device;
        const isFirstLine = !run.current.hasSpokenCloud;
        run.current.hasSpokenCloud = true;
        run.current.voice ??= wanted;
        return createCloudTts({
          source: run.current.voice
            ? withSpeechVoice(cloud.source, run.current.voice)
            : cloud.source,
          fallback: device,
          ...(isFirstLine && { firstByteMs: FIRST_LINE_FIRST_BYTE_MS }),
          onHeld: () => {
            run.current.speechHeldDay = today;
          },
          onFallback: () => {
            run.current.isDeviceSticky = true;
          },
        });
      },
      onActiveChange: (isActive) =>
        queueMicrotask(() => {
          setIsSpeaking(isActive);
          if (!isActive) {
            setIsSounding(false);
            run.current.lastLineAt = Date.now();
          }
          syncBargeGate();
        }),
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

  const endConversation = () => {
    run.current.isDeviceSticky = false;
    run.current.voice = null;
    run.current.hasSpokenCloud = false;
    run.current.lastLineAt = null;
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
    setIsPreparing(false);
    setHeard('');
    if (run.current.isCancelled) return;
    if (!submit(text, run.current.heardBy)) {
      latest.current.onNothingHeard?.(!run.current.isUnasked);
    }
  };

  /** Hands the app words heard elsewhere as a finished utterance (end phrase taken off); false when nothing is left. */
  const submit = (text: string, sttProvider: string) => {
    const pattern = toEndPattern(latest.current.endPhrases);
    const said = (pattern ? text.replace(pattern, '') : text).trim();
    const isEnded = pattern?.test(text) ?? false;
    if (isEnded) endConversation();
    // An end phrase that is the whole turn goes to the app as it was said only when the app reads closes itself.
    const handed =
      said === '' && isEnded && latest.current.readsClose ? text.trim() : said;
    if (handed === '') return false;
    setIsThinking(true);
    latest.current.onUtterance(handed, { sttProvider });
    return true;
  };

  /** The app read the words as a closing phrase: nothing is sent, no window reopens, whatever was being said is cut off and the falling cue plays once. The microphone is already released when a final transcript arrives. */
  const closeByPhrase = () => {
    send({ type: 'CLOSE_HEARD' });
    endFollowUp();
    closeGate();
    stop();
    setHeard('');
    playListeningSound('close');
  };

  const closeGate = () => {
    run.current.gate?.close();
    run.current.gate = null;
  };

  const endFollowUp = (isDeferred = false) => {
    if (!run.current.isFollowUp) return;
    run.current.isFollowUp = false;
    window.clearTimeout(run.current.followUpId);
    run.current.followUpId = 0;
    closeGate();
    send({ type: 'WINDOW_ENDED' });
    run.current.stopListening = null;
    run.current.cancelListening = null;
    const closeWindow = () => {
      setIsFollowUpOpen(false);
      setIsListening(false);
    };
    if (isDeferred) defer(closeWindow);
    else closeWindow();
  };

  useEffect(() => {
    pauseOnHide.current = () => {
      endFollowUp();
      closeGate();
    };
  });

  // The microphone is open on the device only while a line that its echo cancellation can hear is playing, and nothing leaves it until the person speaks (and nothing at all when the model on the device listens).
  const syncBargeGate = () => {
    if (run.current.isFollowUp) return;
    const cloud = latest.current.cloudListening;
    const wants =
      latest.current.reason === null &&
      isMicGranted.current &&
      document.visibilityState !== 'hidden' &&
      !latest.current.isMuted &&
      run.current.mode.phase === 'OFF' &&
      (queueRef.current?.isPlayingThroughWebAudio() ?? false) &&
      pickListener({
        isOnline: navigator.onLine,
        isCloudAllowed: cloud?.isAllowed ?? false,
        isCloudHeld: run.current.heldDay === toLocalDateInputValue(Date.now()),
        hasCloud: cloud !== null,
        isOnDeviceReady: latest.current.canHearOnDevice,
      }) !== 'browser';
    if (!wants) closeGate();
    else {
      run.current.gate ??= openSpeechGate({
        onSpeech: (source) => gateHandler.current?.(source, true),
      });
    }
  };

  // A refusal or an unsupported language stays (until the permission changes); any other failure ends this attempt only, said as nothing heard.
  const handleError = (code: SttErrorCode) => {
    run.current.isCancelled = true;
    const isLasting = BLOCKED.includes(code) || code === 'language';
    if (code === 'denied' || code === 'no-microphone')
      setReason('no-permission');
    else if (code === 'service' || code === 'language')
      setReason('no-recognition');
    run.current.stopListening?.();
    handleFinal('');
    if (isLasting) return;
    const isAsked = !run.current.isUnasked;
    if (
      run.current.heardBy === 'on-device' &&
      latest.current.onDeviceListenFailed
    ) {
      latest.current.onDeviceListenFailed(isAsked);
    } else latest.current.onNothingHeard?.(isAsked);
  };

  const listen = (options: { source?: FrameSource | null } = {}) => {
    if (reason !== null) return false;
    endFollowUp();
    if (run.current.mode.phase !== 'OFF') return false;
    closeGate();
    unlockAudio();
    getQueue().clear();
    send({ type: 'TAP_MIC' });
    run.current.isCancelled = false;
    run.current.isUnasked = (options.source ?? null) !== null;
    const callbacks = {
      onPartial: handlePartial,
      onFinal: handleFinal,
      onSpeechStart: () => {
        isMicGranted.current = true;
        setReason(null);
      },
      onListening: () => {
        setIsPreparing(false);
        armQuiet();
      },
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
    const nameHints = latest.current.getNameHints?.() ?? null;
    const startDevice = (source: FrameSource | null) => {
      if (latest.current.canHearOnDevice) {
        window.clearTimeout(run.current.quietId);
        setIsPreparing(source === null);
        startAdapter(createOnDeviceStt({ source }));
        return;
      }
      armQuiet();
      source?.stop();
      startAdapter(createBrowserStt({ lang: latest.current.lang, nameHints }));
    };
    const cloud = latest.current.cloudListening;
    const today = toLocalDateInputValue(Date.now());
    if (held !== null && held.day !== today) setHeld(null);
    const choice = pickListener({
      isOnline: navigator.onLine,
      isCloudAllowed: cloud?.isAllowed ?? false,
      isCloudHeld: run.current.heldDay === today,
      hasCloud: cloud !== null,
      isOnDeviceReady: latest.current.canHearOnDevice,
    });
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    if (choice !== 'onDevice') armQuiet();
    if (choice === 'cloud' && cloud) {
      startAdapter(
        createDeepgramStt({
          lang: latest.current.lang,
          source: options.source ?? null,
          keyterms: nameHints,
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
            startDevice(null);
          },
          onClosed: cloud.tokenSource.reportClosed,
        }),
      );
    } else {
      startDevice(options.source ?? null);
    }
    return true;
  };

  const handleGate = (source: FrameSource, isBargeIn: boolean) => {
    run.current.gate = null;
    const canListen =
      latest.current.reason === null &&
      (run.current.isFollowUp || run.current.mode.phase === 'OFF');
    if (isBargeIn && canListen) latest.current.onBargeIn?.();
    if (!canListen && run.current.isFollowUp) endFollowUp();
    if (!canListen || !listen({ source })) source.stop();
  };

  useEffect(() => {
    gateHandler.current = handleGate;
  });

  /** Opens a short window after a spoken answer in which speaking starts a listen without a tap; silence closes it with no sound and nothing sent. False when it can't open now (a line still waiting or playing, muted, already listening, the page hidden). */
  const openFollowUp = () => {
    if (
      latest.current.reason !== null ||
      latest.current.isMuted ||
      run.current.mode.phase !== 'OFF' ||
      (queueRef.current?.isActive() ?? false) ||
      document.visibilityState === 'hidden'
    ) {
      return false;
    }
    closeGate();
    send({ type: 'TAP_MIC' });
    run.current.isFollowUp = true;
    run.current.stopListening = () => endFollowUp();
    run.current.cancelListening = () => endFollowUp();
    run.current.followUpId = window.setTimeout(
      () => endFollowUp(),
      FOLLOW_UP_MS,
    );
    run.current.gate = openSpeechGate({
      onSpeech: (source) => gateHandler.current?.(source, false),
      onUnavailable: () => endFollowUp(),
    });
    setIsFollowUpOpen(true);
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    return true;
  };

  const stop = () => {
    if (run.current.mode.phase !== 'OFF') {
      // Stopping while listening sends what was heard, so the conversation goes on.
      finish();
      return;
    }
    getQueue().clear();
    setIsThinking(false);
    endConversation();
  };

  const cancel = () => {
    if (run.current.mode.phase === 'OFF') return;
    run.current.isCancelled = true;
    clearTimers();
    run.current.cancelListening?.();
  };

  const speak = (
    text: string,
    options: {
      priority: SpeechPriority;
      turnKey: number;
      /** The person may answer once this line has been said: when it is the last one waiting, a short window opens in which speaking starts a listen without a tap. */
      canAnswer?: boolean;
    },
  ): Promise<VoiceSpoken> => {
    endFollowUp(true);
    if (latest.current.isMuted || run.current.mode.phase !== 'OFF') {
      return Promise.resolve({ status: 'cancelled', adapterId: null });
    }
    const { lastLineAt } = run.current;
    if (
      lastLineAt !== null &&
      Date.now() - lastLineAt >= latest.current.conversationIdleMs
    ) {
      endConversation();
    }
    const { canAnswer = false, ...line } = options;
    const spoken = getQueue().enqueue(text, {
      ...line,
      onStart: () => {
        setSaying(text);
        setIsSounding(true);
        setIsThinking(false);
      },
    });
    void spoken.then((result) => {
      if (result.status !== 'cancelled') defer(() => setIsThinking(false));
    });
    if (canAnswer) {
      void spoken.then((result) => {
        if (result.status === 'spoken') openFollowUp();
      });
    }
    return spoken;
  };

  const setMuted = (isOn: boolean) => {
    setIsMuted(isOn);
    latest.current.isMuted = isOn;
    if (isOn) {
      getQueue().clear();
      endFollowUp();
      closeGate();
    }
  };

  const checkPermission = () => {
    readMicrophonePermission()
      .then((permission) => {
        if (permission !== 'unknown') {
          isMicGranted.current = permission === 'granted';
        }
        if (permission === 'denied') setReason('no-permission');
        else
          setReason((current) =>
            current === 'no-permission' ? null : current,
          );
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    checkPermission();
    return watchMicrophonePermission(checkPermission);
  }, []);
  useOnTabReturn(checkPermission);

  useEffect(() => {
    const handleHidden = () => {
      if (document.visibilityState === 'hidden') pauseOnHide.current();
    };
    document.addEventListener('visibilitychange', handleHidden);
    return () => document.removeEventListener('visibilitychange', handleHidden);
  }, []);

  useEffect(
    () => () => {
      run.current.isCancelled = true;
      window.clearTimeout(run.current.quietId);
      window.clearTimeout(run.current.holdId);
      run.current.cancelListening?.();
      pauseOnHide.current();
      queueRef.current?.clear();
    },
    [],
  );

  const isWakeActive =
    (wake?.isOn ?? false) &&
    reason === null &&
    !isListening &&
    !isThinking &&
    !isSpeaking &&
    (canHearOnDevice || canUseBrowserStt());
  const wakeSpellings = wake?.spellings.join('|') ?? '';
  const wakeListener = pickWakeListener({ isOnDeviceReady: canHearOnDevice });

  // The phrase is heard on the device only; nothing is listened to in the cloud until after it.
  useEffect(() => {
    if (!isWakeActive || wakeListener !== 'onDevice') return;
    const session = {
      current: null as { close: () => void } | null,
      startId: 0,
      retries: 0,
    };
    const open = () => {
      session.current?.close();
      session.current = listenOnDevice({
        onPhrase: (text) => {
          const phrase = readWakePhrase(
            text,
            latest.current.wake?.spellings ?? [],
          );
          if (phrase === null) return;
          session.retries = 0;
          session.current?.close();
          session.current = null;
          const isStarted =
            latest.current.wake?.onWake(phrase.rests[0] || null, {
              sttProvider: 'on-device',
            }) ?? false;
          if (!isStarted) open();
        },
        onUnavailable: (code) => {
          session.current = null;
          if (code === 'denied' || code === 'no-microphone') {
            checkPermission();
            return;
          }
          console.warn('Wake listening on the device stopped', code);
          if (session.retries >= WAKE_RETRIES) return;
          session.retries += 1;
          window.clearTimeout(session.startId);
          session.startId = window.setTimeout(open, WAKE_RETRY_MS);
        },
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        session.current?.close();
        session.current = null;
      } else if (session.current === null) open();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    session.startId = window.setTimeout(open, WAKE_SETTLE_MS);
    return () => {
      window.clearTimeout(session.startId);
      document.removeEventListener('visibilitychange', handleVisibility);
      session.current?.close();
    };
  }, [isWakeActive, wakeListener, wakeSpellings]);

  useEffect(() => {
    if (!isWakeActive || wakeListener !== 'browser') return;
    const listener = createSpeechListener(
      () => undefined,
      () => undefined,
    );
    listener.setOptions({
      lang,
      speechLang: lang,
      onHalt: (error) => {
        if (error === 'denied' || error === 'no-microphone') checkPermission();
      },
      onFinalTranscript: (alternatives) => {
        const phrase = readWakePhrase(
          alternatives,
          latest.current.wake?.spellings ?? [],
        );
        if (phrase === null) return false;
        const rest =
          phrase.rests.find((entry) => entry !== null && entry !== '') ?? null;
        listener.stop();
        const isStarted =
          latest.current.wake?.onWake(rest, { sttProvider: 'browser' }) ??
          false;
        if (!isStarted) listener.start();
        return true;
      },
    });
    const handleVisibility = () =>
      document.visibilityState === 'hidden'
        ? listener.suspend()
        : listener.resume();
    document.addEventListener('visibilitychange', handleVisibility);
    // A follow-up window opens a moment after the last line ends; waiting keeps the phrase listener from starting and stopping in that gap.
    const startId = window.setTimeout(listener.start, WAKE_SETTLE_MS);
    return () => {
      window.clearTimeout(startId);
      document.removeEventListener('visibilitychange', handleVisibility);
      listener.teardown();
    };
  }, [isWakeActive, wakeListener, wakeSpellings, lang]);

  const state: VoiceState = isListening
    ? 'listening'
    : isSounding
      ? 'speaking'
      : isThinking || isSpeaking
        ? 'thinking'
        : 'idle';

  return {
    state,
    heard,
    /** The line being said right now; empty otherwise. */
    saying: isSounding ? saying : '',
    isMuted,
    setMuted,
    listen,
    submit,
    /** The short window after an answer is open: listening for the person to speak, nothing sent yet. */
    isFollowUpOpen,
    /** Listening has started but the model on the device is still getting ready, so nothing is being heard yet. */
    isPreparing,
    stop,
    cancel,
    closeByPhrase,
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
