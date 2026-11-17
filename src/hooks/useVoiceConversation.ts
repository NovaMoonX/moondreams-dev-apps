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
  needsMicrophoneAsk,
  peekMicrophonePermission,
  readMicrophonePermission,
  rememberRecognitionRefused,
  wasMicrophoneGranted,
  watchMicrophonePermission,
} from '@/lib/speech/microphonePermission';
import { readWakePhrase } from '@/lib/speech/speechText';
import {
  hasSameWords,
  isBargeConfirmed,
  readTurnEndDelay,
} from '@/lib/speech/turnEnd';
import { isOnDeviceLang } from '@/lib/speech/onDevice/config';
import {
  createOnDeviceStt,
  listenOnDevice,
} from '@/lib/speech/onDevice/onDeviceStt';
import { BARGE_IN_GATE, openSpeechGate } from '@/lib/speech/voice/bargeIn';
import {
  canUseBrowserStt,
  createBrowserStt,
  type BrowserSttAdoption,
} from '@/lib/speech/voice/browserStt';
import { createDeepgramStt } from '@/lib/speech/voice/deepgramStream';
import { createCloudTts } from '@/lib/speech/voice/cloudTts';
import { createDeviceTts } from '@/lib/speech/voice/deviceTts';
import { createPlaybackQueue } from '@/lib/speech/voice/playbackQueue';
import {
  createSpeechCache,
  isOtherVoice,
  withSpeechCache,
  withSpeechVoice,
  type SpeechSource,
  type SpeechVoice,
} from '@/lib/speech/voice/speechSource';
import type {
  CloudHeldReason,
  FrameSource,
  SpeechDelivery,
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
  /** A tapped listen ended on a lasting failure (the microphone refused, recognition off). */
  onUnavailable?: (reason: VoiceUnavailableReason) => void;
  /** The opt-in natural voice is downloaded and ready (`useNaturalVoice().isReady`). */
  isNaturalVoiceReady?: boolean;
  /** The opt-in recognition model is downloaded (`useOnDeviceRecognition().isOn`): it listens whenever the cloud doesn't, waits for the wake phrase and hears a barge-in, all on the device. */
  isOnDeviceReady?: boolean;
  /** Silence this long before anything is heard ends the listen; once words are heard, the turn ends when they stop changing (`getSettleMs`). */
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
  /** A live conversation (`startLive`) ends after this long with nothing heard or said (one the wake phrase started ends sooner if nothing is said at all, and one with its microphone off waits longer). */
  liveIdleMs?: number;
  /** A live conversation ended on its own: an end phrase closed a turn (after its reply), it went quiet for too long, the page was left, or listening stopped working. */
  onLiveEnd?: (why: VoiceLiveEnd) => void;
  /** Waits for a phrase on the device (the downloaded model, else the browser's own recognition) while nothing else is going on and the page is visible; Null never does. `onWake` says whether the phrase may start a turn (the app readies its screen); the same listener, and the words said after the phrase, then carry on as that turn's listening. */
  wake?: {
    isOn: boolean;
    spellings: readonly string[];
    /** Names that also wake when the words after "hey" sound like one, for a recognizer that mishears them. */
    looseNames?: readonly string[];
    onWake: () => boolean;
    /** The turn the phrase starts opens a live conversation, as `startLive` does. */
    startsLive?: boolean;
  } | null;
}

export type VoiceListeningRoute = 'cloud' | 'device';
/** `unavailable`: listening can't work until something changes, and `onUnavailable` has said why; `failed`: it kept failing for no lasting reason. */
export type VoiceLiveEnd =
  'phrase' | 'quiet' | 'left' | 'unavailable' | 'failed';
/** What a repeat did: played, or why it could not. */
export type VoiceRepeat = 'played' | 'none' | 'muted';

const LISTEN_SHOW_DELAY_MS = 400;
const QUIET_MS = 8000;
const CONVERSATION_IDLE_MS = 10 * 60 * 1000;
const FIRST_LINE_FIRST_BYTE_MS = 4000;
const FOLLOW_UP_MS = 8000;
const LIVE_IDLE_MS = 2 * 60 * 1000;
// A phrase heard by mistake (a TV, a passing remark) must not hold the microphone for the full quiet limit.
const LIVE_FIRST_IDLE_MS = 15 * 1000;
const LIVE_MUTED_MS = 5 * 60 * 1000;
const LIVE_ERRORS_MAX = 3;
const LIVE_CHECK_MS = 1000;
// A reply's audio can end a beat before the queue says so; listening again a moment later never clips the next line.
const LIVE_REOPEN_MS = 250;
const WAKE_SETTLE_MS = 400;
const WAKE_RETRIES = 2;
const WAKE_RETRY_MS = 3000;
// An end phrase still closing the words this long after it was last heard counts; "that's all I need" keeps going.
const END_PHRASE_HOLD_MS = 900;
const BARGE_CONFIRM_MS = 1500;
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
  onUnavailable,
  isNaturalVoiceReady = false,
  isOnDeviceReady = false,
  quietMs = QUIET_MS,
  conversationIdleMs = CONVERSATION_IDLE_MS,
  cloudListening = null,
  cloudSpeaking = null,
  onCloudHeld,
  onBargeIn,
  liveIdleMs = LIVE_IDLE_MS,
  onLiveEnd,
  wake = null,
}: VoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSounding, setIsSounding] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isLiveMuted, setIsLiveMuted] = useState(false);
  const [liveSaid, setLiveSaid] = useState('');
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
    onUnavailable,
    isNaturalVoiceReady,
    canHearOnDevice,
    quietMs,
    conversationIdleMs,
    isMuted,
    cloudListening,
    cloudSpeaking,
    onCloudHeld,
    onBargeIn,
    liveIdleMs,
    onLiveEnd,
    wake,
    reason,
  });
  const gateHandler = useRef<
    ((source: FrameSource, isBargeIn: boolean) => void) | null
  >(null);
  const wakeHandler = useRef<
    | ((handoff: {
        source: FrameSource | null;
        seed: string;
        adopt: BrowserSttAdoption | null;
      }) => boolean)
    | null
  >(null);
  const pauseOnHide = useRef<() => void>(() => undefined);
  const reopenLive = useRef<() => void>(() => undefined);
  const checkLive = useRef<() => void>(() => undefined);
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
    showId: 0,
    followUpId: 0,
    isFollowUp: false,
    isUnasked: false,
    listenId: 0,
    gate: null as { close: () => void } | null,
    heardWords: '',
    pending: null as { text: string; timerId: number } | null,
    lastLine: null as {
      text: string;
      voice: SpeechVoice | null;
      delivery: SpeechDelivery | undefined;
    } | null,
    turnKey: 0,
    isLive: false,
    isLiveMuted: false,
    liveAt: 0,
    isLiveClosing: false,
    hasLiveTurn: false,
    liveErrors: 0,
    repeatId: 0,
    isGone: false,
  });
  const speechCache = useRef(createSpeechCache());

  useEffect(() => {
    latest.current = {
      lang,
      identity,
      endPhrases,
      onUtterance,
      readsClose,
      onNothingHeard,
      onDeviceListenFailed,
      onUnavailable,
      isNaturalVoiceReady,
      canHearOnDevice,
      quietMs,
      conversationIdleMs,
      isMuted,
      cloudListening,
      cloudSpeaking,
      onCloudHeld,
      onBargeIn,
      liveIdleMs,
      onLiveEnd,
      wake,
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
        const { voice: chosen } = run.current;
        return createCloudTts({
          source: withSpeechCache(
            chosen ? withSpeechVoice(cloud.source, chosen) : cloud.source,
            speechCache.current,
            chosen ? `${chosen.voiceId ?? ''}|${chosen.speed ?? ''}` : '',
          ),
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
            queueRef.current?.unduck();
          }
          syncBargeGate();
        }),
    });
    return queueRef.current;
  };

  const clearTimers = () => {
    window.clearTimeout(run.current.showId);
    run.current.showId = 0;
    setIsStarting(false);
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

  const armQuiet = (heardText = run.current.heardWords) => {
    if (run.current.pending) return;
    window.clearTimeout(run.current.quietId);
    run.current.quietId = window.setTimeout(
      finish,
      heardText.trim() === ''
        ? latest.current.quietMs
        : readTurnEndDelay(heardText),
    );
  };

  /** The person's voice over a line is confirmed: the line stops and this becomes an ordinary listen. */
  const confirmBarge = () => {
    const { pending } = run.current;
    if (!pending) return;
    window.clearTimeout(pending.timerId);
    run.current.pending = null;
    run.current.isLiveClosing = false;
    queueRef.current?.clear();
    latest.current.onBargeIn?.();
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    armQuiet();
  };

  /** Drops a listen that never confirmed a person: no utterance, no nothing-heard, no notice. */
  const abortPending = () => {
    const { pending } = run.current;
    if (!pending) return;
    window.clearTimeout(pending.timerId);
    run.current.isCancelled = true;
    run.current.cancelListening?.();
  };

  const toPlayedText = (pendingText: string) =>
    [pendingText, queueRef.current?.getPlayingText() ?? ''].join(' ');

  const handlePartial = (text: string) => {
    const { pending } = run.current;
    if (pending) {
      if (!isBargeConfirmed(text, toPlayedText(pending.text))) return;
      confirmBarge();
    }
    setHeard(text);
    if (text.trim() === '' || hasSameWords(text, run.current.heardWords)) {
      return;
    }
    run.current.heardWords = text;
    run.current.liveAt = Date.now();
    run.current.liveErrors = 0;
    armQuiet(text);
    window.clearTimeout(run.current.holdId);
    run.current.holdId = 0;
    const pattern = toEndPattern(latest.current.endPhrases);
    if (pattern?.test(text)) {
      run.current.holdId = window.setTimeout(finish, END_PHRASE_HOLD_MS);
    }
  };

  const endListen = () => {
    run.current.heardWords = '';
    clearTimers();
    run.current.stopListening = null;
    run.current.cancelListening = null;
    send({ type: 'STOP' });
    setIsListening(false);
    setListeningRoute(null);
    setIsPreparing(false);
    setHeard('');
  };

  const handleFinal = (text: string) => {
    if (
      run.current.pending &&
      !run.current.isCancelled &&
      isBargeConfirmed(text, toPlayedText(run.current.pending.text))
    ) {
      confirmBarge();
    }
    const wasPending = run.current.pending !== null;
    if (run.current.pending) {
      window.clearTimeout(run.current.pending.timerId);
      run.current.pending = null;
      run.current.isCancelled = true;
      queueRef.current?.unduck();
    }
    endListen();
    if (wasPending) defer(syncBargeGate);
    if (run.current.isCancelled) return;
    if (!submit(text, run.current.heardBy)) {
      // In a live conversation silence just waits for the next words.
      latest.current.onNothingHeard?.(
        !run.current.isUnasked && !run.current.isLive,
      );
    }
  };

  /** Hands the app words heard elsewhere as a finished utterance (end phrase taken off); false when nothing is left. */
  const submit = (text: string, sttProvider: string) => {
    const pattern = toEndPattern(latest.current.endPhrases);
    const said = (pattern ? text.replace(pattern, '') : text).trim();
    if (pattern?.test(text)) {
      endConversation();
      if (run.current.isLive) run.current.isLiveClosing = true;
    }
    // An end phrase that is the whole turn goes to the app as it was said only when the app reads closes itself.
    const handed =
      said === '' && pattern?.test(text) && latest.current.readsClose
        ? text.trim()
        : said;
    if (handed === '') return false;
    run.current.liveAt = Date.now();
    run.current.hasLiveTurn = true;
    run.current.liveErrors = 0;
    if (run.current.isLive) setLiveSaid(handed);
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
      abortPending();
      endFollowUp();
      closeGate();
      endLive('left');
    };
    checkLive.current = () => {
      if (!run.current.isLive || (queueRef.current?.isActive() ?? false)) {
        return;
      }
      if (Date.now() - run.current.liveAt >= liveLimit()) endLive('quiet');
    };
    reopenLive.current = () => {
      if (run.current.isLiveClosing) endLive('phrase');
      else if (latest.current.reason !== null) endLive('unavailable');
      else openFollowUp();
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
      !run.current.isLiveMuted &&
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
        gate: BARGE_IN_GATE,
      });
    }
  };

  // A refusal or an unsupported language stays (until the permission changes); any other failure ends this attempt only. Words already heard are kept and sent, so a hiccup never costs the person what they said.
  const handleError = (code: SttErrorCode) => {
    const said = run.current.heardWords;
    run.current.isCancelled = true;
    const isLasting = BLOCKED.includes(code) || code === 'language';
    const isAsked = !run.current.isUnasked && !run.current.isLive;
    const isRefusalShown = !run.current.isUnasked || run.current.isLive;
    const wasPending = run.current.pending !== null;
    const isMicrophoneAllowed =
      peekMicrophonePermission() === 'granted' || wasMicrophoneGranted();
    if (code === 'denied' && !isMicrophoneAllowed) rememberRecognitionRefused();
    const lasting: VoiceUnavailableReason | null =
      (code === 'denied' && !isMicrophoneAllowed) || code === 'no-microphone'
        ? 'no-permission'
        : code === 'denied' || code === 'service' || code === 'language'
          ? 'no-recognition'
          : null;
    if (lasting !== null) setReason(lasting);
    run.current.stopListening?.();
    handleFinal('');
    if (wasPending) return;
    const isKept = said !== '' && submit(said, run.current.heardBy);
    if (isLasting) {
      if (lasting !== null && isRefusalShown) {
        latest.current.onUnavailable?.(lasting);
      }
      endLive('unavailable');
      return;
    }
    if (isKept) return;
    if (run.current.isLive) {
      run.current.liveErrors += 1;
      if (run.current.liveErrors >= LIVE_ERRORS_MAX) {
        endLive('failed');
        return;
      }
    }
    if (
      run.current.heardBy === 'on-device' &&
      latest.current.onDeviceListenFailed
    ) {
      latest.current.onDeviceListenFailed(isAsked);
    } else latest.current.onNothingHeard?.(isAsked);
  };

  const listen = (
    options: {
      source?: FrameSource | null;
      /** Words already heard (what came with the wake phrase); shown at once and put before what the listener hears. */
      seed?: string;
      /** The person's voice opened this listen (a follow-up, a barge-in), so silence or a failure is not reported as theirs. */
      isUnasked?: boolean;
      /** A running browser listener that heard the wake phrase and carries on as this listen's. */
      adopt?: BrowserSttAdoption | null;
      /** The line this listen started over; it is only ducked until the person's words are confirmed as theirs. */
      pendingText?: string;
    } = {},
  ) => {
    if (reason !== null) return false;
    if (run.current.pending) {
      confirmBarge();
      return true;
    }
    endFollowUp();
    if (run.current.mode.phase !== 'OFF') return false;
    closeGate();
    unlockAudio();
    const { pendingText } = options;
    if (pendingText === undefined) getQueue().clear();
    else {
      getQueue().duck();
      run.current.pending = {
        text: pendingText,
        timerId: window.setTimeout(abortPending, BARGE_CONFIRM_MS),
      };
    }
    send({ type: 'TAP_MIC' });
    run.current.isCancelled = false;
    const { seed = '', adopt = null } = options;
    run.current.isUnasked = options.isUnasked === true;
    run.current.heardWords = '';
    run.current.listenId += 1;
    const listenId = run.current.listenId;
    // A listener stopped for an earlier listen can still report late; only this listen's own callbacks count.
    const isCurrent = () => run.current.listenId === listenId;
    // The phrase reader gives the seed in plain lower case, and the model on the device capitalises only its first word.
    const withSeed = (text: string) =>
      seed === ''
        ? text
        : [
            seed.charAt(0).toUpperCase() + seed.slice(1),
            run.current.heardBy === 'on-device' && !/^I\b/.test(text)
              ? text.charAt(0).toLowerCase() + text.slice(1)
              : text,
          ]
            .filter((part) => part !== '')
            .join(' ');
    const callbacks = {
      onPartial: (text: string) => {
        if (isCurrent()) handlePartial(withSeed(text));
      },
      onFinal: (text: string) => {
        if (isCurrent()) handleFinal(withSeed(text));
      },
      onSpeechStart: () => {
        if (!isCurrent()) return;
        window.clearTimeout(run.current.showId);
        setIsStarting(false);
        if (!run.current.pending) setIsListening(true);
        isMicGranted.current = true;
        setReason(null);
      },
      onListening: () => {
        if (!isCurrent()) return;
        setIsPreparing(false);
        armQuiet();
      },
      onError: (code: SttErrorCode) => {
        if (isCurrent()) handleError(code);
      },
      preRoll: null,
    };
    const startAdapter = (adapter: SttAdapter) => {
      run.current.heardBy = adapter.id;
      run.current.stopListening = () => adapter.stop();
      run.current.cancelListening = () => (adapter.cancel ?? adapter.stop)();
      setListeningRoute(adapter.route === 'cloud' ? 'cloud' : 'device');
      adapter.start(callbacks).catch((error: unknown) => {
        console.error('Voice listening did not start', error);
        if (isCurrent()) handleError('unavailable');
      });
    };
    const startDevice = (source: FrameSource | null) => {
      if (latest.current.canHearOnDevice) {
        if (run.current.heardWords === '') {
          window.clearTimeout(run.current.quietId);
        }
        setIsPreparing(source === null && pendingText === undefined);
        startAdapter(createOnDeviceStt({ source }));
        return;
      }
      armQuiet();
      source?.stop();
      startAdapter(
        createBrowserStt({
          lang: latest.current.lang,
          isFromTap: !run.current.isUnasked,
        }),
      );
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
    // Until the microphone is known to be allowed, a refusal can come back at once: showing Listening only after a moment keeps it from flashing.
    const isKnownAllowed =
      peekMicrophonePermission() === 'granted' ||
      wasMicrophoneGranted() ||
      isMicGranted.current;
    if (pendingText !== undefined) setIsStarting(false);
    else if (isKnownAllowed) setIsListening(true);
    else {
      window.clearTimeout(run.current.showId);
      setIsStarting(true);
      run.current.showId = window.setTimeout(() => {
        setIsStarting(false);
        setIsListening(true);
      }, LISTEN_SHOW_DELAY_MS);
    }
    if (pendingText === undefined) {
      setIsThinking(false);
      setHeard('');
    }
    if (seed !== '') handlePartial(withSeed(''));
    if (choice !== 'onDevice') armQuiet();
    if (adopt) {
      startAdapter(createBrowserStt({ lang: latest.current.lang, adopt }));
    } else if (choice === 'cloud' && cloud) {
      startAdapter(
        createDeepgramStt({
          lang: latest.current.lang,
          source: options.source ?? null,
          getToken: cloud.tokenSource.getToken,
          onUnavailable: (heldReason) => {
            if (
              !isCurrent() ||
              run.current.isCancelled ||
              run.current.mode.phase === 'OFF'
            ) {
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
    const playingText = queueRef.current?.getPlayingText() ?? null;
    const isOverLine = isBargeIn && canListen && playingText !== null;
    if (isBargeIn && canListen && !isOverLine) latest.current.onBargeIn?.();
    if (!canListen && run.current.isFollowUp) endFollowUp();
    if (
      !canListen ||
      !listen({
        source,
        isUnasked: true,
        ...(isOverLine && { pendingText: playingText }),
      })
    ) {
      source.stop();
      if (isOverLine) queueRef.current?.unduck();
    }
  };

  useEffect(() => {
    gateHandler.current = handleGate;
    wakeHandler.current = ({ source, seed, adopt }) => {
      if (run.current.pending !== null) return false;
      const start = () => listen({ source, seed, adopt });
      return latest.current.wake?.startsLive ? beginLive(start, true) : start();
    };
  });

  /** Opens a short window after a spoken answer in which speaking starts a listen without a tap; silence closes it with no sound and nothing sent. In a live conversation it stays open until the conversation's quiet runs out, muted voice or not. False when it can't open now (a line still waiting or playing, muted, already listening, the page hidden). */
  const openFollowUp = () => {
    const { isLive: isLiveNow, isLiveMuted: isMicMuted } = run.current;
    if (isLiveNow && run.current.isLiveClosing) {
      endLive('phrase');
      return false;
    }
    if (
      latest.current.reason !== null ||
      (latest.current.isMuted && !isLiveNow) ||
      isMicMuted ||
      run.current.mode.phase !== 'OFF' ||
      (queueRef.current?.isActive() ?? false) ||
      document.visibilityState === 'hidden'
    ) {
      return false;
    }
    const liveLeft = run.current.liveAt + liveLimit() - Date.now();
    if (isLiveNow && liveLeft <= 0) {
      endLive('quiet');
      return false;
    }
    closeGate();
    send({ type: 'TAP_MIC' });
    run.current.isFollowUp = true;
    run.current.stopListening = () => endFollowUp();
    run.current.cancelListening = () => endFollowUp();
    run.current.followUpId = window.setTimeout(
      () => (isLiveNow ? endLive('quiet') : endFollowUp()),
      isLiveNow ? liveLeft : FOLLOW_UP_MS,
    );
    run.current.gate = openSpeechGate({
      onSpeech: (source) => gateHandler.current?.(source, false),
      onUnavailable: () => {
        endFollowUp();
        if (!run.current.isLive) return;
        run.current.liveErrors += 1;
        if (run.current.liveErrors >= LIVE_ERRORS_MAX) endLive('failed');
      },
    });
    setIsFollowUpOpen(true);
    setIsListening(true);
    setIsThinking(false);
    setHeard('');
    return true;
  };

  const stop = () => {
    run.current.repeatId += 1;
    if (run.current.pending) {
      abortPending();
      getQueue().clear();
      setIsThinking(false);
      return;
    }
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
      /** A whispered line plays only in the cloud voice, never the device's. */
      delivery?: SpeechDelivery;
    },
  ): Promise<VoiceSpoken> => {
    endFollowUp(true);
    if (
      latest.current.isMuted &&
      run.current.isLive &&
      options.priority !== 'ack'
    ) {
      setSaying(text);
    }
    if (
      latest.current.isMuted ||
      (run.current.mode.phase !== 'OFF' && run.current.pending === null)
    ) {
      return Promise.resolve({ status: 'cancelled', adapterId: null });
    }
    return sayLine(text, options);
  };

  const sayLine = (
    text: string,
    options: Parameters<typeof speak>[1],
  ): Promise<VoiceSpoken> => {
    run.current.turnKey = Math.max(run.current.turnKey, options.turnKey);
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
        run.current.liveAt = Date.now();
        setSaying(text);
        setIsSounding(true);
        setIsThinking(false);
      },
    });
    void spoken.then((result) => {
      run.current.liveAt = Date.now();
      if (result.status !== 'cancelled') defer(() => setIsThinking(false));
      if (result.status === 'spoken' && line.priority !== 'ack') {
        run.current.lastLine = {
          text,
          voice: run.current.voice,
          delivery: line.delivery,
        };
      }
    });
    if (canAnswer) {
      void spoken.then((result) => {
        if (result.status === 'spoken') openFollowUp();
      });
    }
    return spoken;
  };

  /** Says the last reply or summary again, or a line the person tapped (kept audio costs no request), at the current turn so a reply on its way still plays; says why when it can't. A listen in progress is dropped unsent and opens again once the line ends (a live conversation reopens its own). */
  const repeat = (
    text?: string,
    options: {
      delivery?: SpeechDelivery;
      onResult?: (result: VoiceSpoken) => void;
    } = {},
  ): VoiceRepeat => {
    endFollowUp(true);
    const { lastLine } = run.current;
    const line = text ?? lastLine?.text ?? null;
    if (line === null) return 'none';
    if (latest.current.isMuted) return 'muted';
    const wasListening =
      run.current.mode.phase !== 'OFF' && run.current.pending === null;
    if (wasListening) cancel();
    if (lastLine !== null) run.current.voice ??= lastLine.voice;
    run.current.repeatId += 1;
    const { repeatId, listenId, turnKey } = run.current;
    // Saying the last line again keeps how it was said, so a whispered line is never repeated aloud.
    const delivery =
      options.delivery ?? (text === undefined ? lastLine?.delivery : undefined);
    void sayLine(line, {
      priority: 'reply',
      turnKey,
      delivery,
    }).then((result) => {
      options.onResult?.(result);
      const { current } = run;
      if (
        !wasListening ||
        current.isGone ||
        current.isLive ||
        current.repeatId !== repeatId ||
        current.listenId !== listenId ||
        current.turnKey !== turnKey ||
        current.isFollowUp ||
        current.pending !== null ||
        current.mode.phase !== 'OFF' ||
        latest.current.isMuted ||
        document.visibilityState === 'hidden' ||
        (queueRef.current?.isActive() ?? false)
      ) {
        return;
      }
      listen({ isUnasked: current.isUnasked });
    });
    return 'played';
  };

  /** How long a live conversation may go quiet before it ends, for where it is now. */
  const liveLimit = () =>
    run.current.isLiveMuted
      ? LIVE_MUTED_MS
      : run.current.hasLiveTurn
        ? latest.current.liveIdleMs
        : Math.min(LIVE_FIRST_IDLE_MS, latest.current.liveIdleMs);

  const beginLive = (start: () => boolean, isWoken = false) => {
    const wasLive = run.current.isLive;
    run.current.isLive = true;
    run.current.isLiveClosing = false;
    run.current.hasLiveTurn = !isWoken;
    run.current.liveErrors = 0;
    run.current.liveAt = Date.now();
    run.current.isLiveMuted = false;
    setIsLiveMuted(false);
    setLiveSaid('');
    setSaying('');
    if (!start()) {
      run.current.isLive = wasLive;
      return false;
    }
    setIsLive(true);
    return true;
  };

  /** Starts a live conversation: a listen now, and after every answer another, with no tap, until an end phrase, `endLive` or `liveIdleMs` of quiet. False when listening can't start. */
  const startLive = () => beginLive(() => listen());

  /** Ends a live conversation: drops what is being heard and said, never a turn already sent. Reports why unless the person ended it. */
  function endLive(why: VoiceLiveEnd | null = null) {
    if (!run.current.isLive) return;
    run.current.isLive = false;
    run.current.isLiveClosing = false;
    run.current.isLiveMuted = false;
    abortPending();
    endFollowUp(true);
    if (why !== 'phrase' && run.current.mode.phase !== 'OFF') cancel();
    if (why === null) queueRef.current?.clear();
    defer(() => {
      setIsLive(false);
      setIsLiveMuted(false);
    });
    if (why !== null) latest.current.onLiveEnd?.(why);
  }

  /** Pauses a live conversation's microphone (what is being heard is sent first) or opens it again; the quiet clock waits while it is paused. */
  const setLiveMuted = (isOn: boolean) => {
    if (!run.current.isLive) return;
    run.current.isLiveMuted = isOn;
    run.current.liveAt = Date.now();
    setIsLiveMuted(isOn);
    if (!isOn) return;
    abortPending();
    endFollowUp();
    closeGate();
    if (run.current.mode.phase !== 'OFF') finish();
  };

  const setMuted = (isOn: boolean) => {
    setIsMuted(isOn);
    latest.current.isMuted = isOn;
    if (isOn) {
      abortPending();
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
        if (needsMicrophoneAsk(permission)) setReason('no-permission');
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

  // A strict-mode remount runs the cleanup once before the screen is really gone.
  useEffect(() => {
    run.current.isGone = false;
  }, []);

  useEffect(
    () => () => {
      run.current.isGone = true;
      run.current.isCancelled = true;
      window.clearTimeout(run.current.quietId);
      window.clearTimeout(run.current.holdId);
      window.clearTimeout(run.current.showId);
      window.clearTimeout(run.current.pending?.timerId);
      run.current.cancelListening?.();
      pauseOnHide.current();
      queueRef.current?.clear();
    },
    [],
  );

  const isWakeActive =
    (wake?.isOn ?? false) &&
    !isLive &&
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
      current: null as ReturnType<typeof listenOnDevice> | null,
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
            latest.current.wake?.looseNames ?? [],
          );
          if (phrase === null) return;
          session.retries = 0;
          if (!(latest.current.wake?.onWake() ?? false)) return;
          const source = session.current?.handOver() ?? null;
          if (source === null) return;
          session.current = null;
          const isStarted =
            wakeHandler.current?.({
              source,
              seed: phrase.rests[0] ?? '',
              adopt: null,
            }) ?? false;
          if (isStarted) return;
          source.stop();
          open();
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
    const session = { isHandedOver: false };
    const listener = createSpeechListener(
      () => undefined,
      () => undefined,
    );
    const hear = (text: string, isFinal: boolean) => {
      const spellings = latest.current.wake?.spellings ?? [];
      const looseNames = latest.current.wake?.looseNames ?? [];
      if (
        session.isHandedOver ||
        readWakePhrase(text, spellings, looseNames) === null
      ) {
        return;
      }
      if (!(latest.current.wake?.onWake() ?? false)) return;
      session.isHandedOver =
        wakeHandler.current?.({
          source: null,
          seed: '',
          adopt: { listener, heard: { text, isFinal }, spellings, looseNames },
        }) ?? false;
    };
    listener.setOptions({
      lang,
      speechLang: lang,
      onHalt: (error) => {
        if (error === 'denied' || error === 'no-microphone') checkPermission();
      },
      onInterimTranscript: (text) => hear(text, false),
      onFinalTranscript: (alternatives) => {
        const spellings = latest.current.wake?.spellings ?? [];
        const looseNames = latest.current.wake?.looseNames ?? [];
        const guess = alternatives.find(
          (entry) => readWakePhrase(entry, spellings, looseNames) !== null,
        );
        if (guess === undefined) return false;
        hear(guess, true);
        return true;
      },
    });
    const handleVisibility = () =>
      document.visibilityState === 'hidden'
        ? listener.suspend()
        : listener.resume();
    document.addEventListener('visibilitychange', handleVisibility);
    // A follow-up window opens a moment after the last line ends; waiting keeps the phrase listener from starting and stopping in that gap.
    const startId = window.setTimeout(
      () => listener.start({ isFromTap: false }),
      WAKE_SETTLE_MS,
    );
    return () => {
      window.clearTimeout(startId);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (!session.isHandedOver) listener.teardown();
    };
  }, [isWakeActive, wakeListener, wakeSpellings, lang]);

  const isLiveIdle =
    isLive &&
    !isListening &&
    !isStarting &&
    !isThinking &&
    !isSpeaking &&
    !isSounding;
  // The quiet limit holds in every state, not only while listening waits for words: a reply that never comes or a microphone left off still ends the conversation.
  useEffect(() => {
    if (!isLive) return;
    const checkId = window.setInterval(
      () => checkLive.current(),
      LIVE_CHECK_MS,
    );
    return () => window.clearInterval(checkId);
  }, [isLive]);

  // Turning the microphone back on reopens listening even though the conversation never stopped being idle.
  useEffect(() => {
    if (!isLiveIdle) return;
    const reopenId = window.setTimeout(
      () => reopenLive.current(),
      LIVE_REOPEN_MS,
    );
    return () => window.clearTimeout(reopenId);
  }, [isLiveIdle, isLiveMuted]);

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
    /** A live conversation is on: each answer is followed by listening, with no tap. */
    isLive,
    /** The live conversation's microphone is paused. */
    isLiveMuted,
    /** What the person last said in this live conversation, and the last line said back (still shown once it has played). */
    liveSaid,
    lastLine: isLive ? saying : '',
    startLive,
    endLive: () => endLive(),
    setLiveMuted,
    /** Listening has started but the model on the device is still getting ready, so nothing is being heard yet. */
    isPreparing,
    /** A tapped listen is under way but not yet shown as listening, while a refusal could still come back at once. */
    isStarting,
    stop,
    cancel,
    closeByPhrase,
    speak,
    repeat,
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
