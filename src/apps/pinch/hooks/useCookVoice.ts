import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import {
  useSpeechCommands,
  type SpeechCommandsError,
} from '@/hooks/useSpeechCommands';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import {
  getCookCommandKey,
  readCookCommand,
  type CookCommand,
  type CookTimerScope,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';

/** The same command heard again this soon is the recognizer repeating itself, not the person. */
const REPEAT_GUARD_MS = 1200;
const MESSAGE_MS = { HEARD: 2500, ANSWER: 8000, PROBLEM: 5000 } as const;
/** How long the line says why voice control stopped; the unlit mic says the rest. */
const ERROR_LINE_MS = 8000;
/** Ten minutes without a command turns voice control off, so the room isn't heard after the cooking. */
const IDLE_STOP_MS = 10 * 60_000;

export type CookVoiceResult =
  | { ok: true; show?: string; speak?: string }
  /** `isSpoken`: said aloud even with Read steps aloud off (it answers a question or a ringing timer). */
  | { ok: false; reason: string; spoken?: string; isSpoken?: boolean };

/** What a spoken command can do on the cooking screen: the same things a tap does, and nothing that writes. */
export interface CookVoiceActions {
  next: () => CookVoiceResult;
  back: () => CookVoiceResult;
  repeat: () => CookVoiceResult;
  showIngredients: () => CookVoiceResult;
  showSteps: () => CookVoiceResult;
  finish: () => CookVoiceResult;
  startTimer: (seconds: number | null) => CookVoiceResult;
  pauseTimer: (seconds: number | null) => CookVoiceResult;
  resumeTimer: (seconds: number | null) => CookVoiceResult;
  stopTimer: (seconds: number | null, scope: CookTimerScope) => CookVoiceResult;
  timeLeft: () => CookVoiceResult;
  amount: (lineIds: string[], query: string) => CookVoiceResult;
  switchRecipe: (
    recipeId: string | null,
    candidates: string[],
  ) => CookVoiceResult;
  cycleRecipe: (direction: 1 | -1) => CookVoiceResult;
}

export interface CookVoiceMessage {
  id: number;
  text: string;
  tone: keyof typeof MESSAGE_MS;
}

/** A command the screen carries out (everything but "stop listening", which the hook handles). */
export type CookActionCommand = Exclude<
  CookCommand,
  { kind: 'STOP_LISTENING' }
>;

/** Runs a command through the screen's actions. */
export const runCookCommand = (
  command: CookActionCommand,
  actions: CookVoiceActions,
): CookVoiceResult => {
  switch (command.kind) {
    case 'NEXT':
      return actions.next();
    case 'BACK':
      return actions.back();
    case 'REPEAT':
      return actions.repeat();
    case 'SHOW_INGREDIENTS':
      return actions.showIngredients();
    case 'SHOW_STEPS':
      return actions.showSteps();
    case 'FINISH':
      return actions.finish();
    case 'START_TIMER':
      return actions.startTimer(command.seconds);
    case 'PAUSE_TIMER':
      return actions.pauseTimer(command.seconds);
    case 'RESUME_TIMER':
      return actions.resumeTimer(command.seconds);
    case 'STOP_TIMER':
      return actions.stopTimer(command.seconds, command.scope);
    case 'TIME_LEFT':
      return actions.timeLeft();
    case 'AMOUNT':
      return actions.amount(command.lineIds, command.query);
    case 'SWITCH_RECIPE':
      return actions.switchRecipe(command.recipeId, command.candidates);
    case 'CYCLE_RECIPE':
      return actions.cycleRecipe(command.direction);
  }
};

const getPageLang = () =>
  (typeof navigator === 'undefined' ? '' : navigator.language.split('@')[0]) ||
  'en-US';

/** The commands are English, so listening stays English when the page's language isn't. */
const getListenLang = () => {
  const lang = getPageLang();
  return lang.toLowerCase().startsWith('en') ? lang : 'en-US';
};

/** Stops that a tap on the mic should explain again before it retries (a pause for quiet only needs the tap). */
const isExplainedStop = (error: SpeechCommandsError | null) =>
  error !== null && error !== 'idle';

interface UseCookVoiceOptions {
  uid: string;
  /** The step on screen as it is read aloud; null while no step is shown (a reading already going, such as an answer, then carries on). */
  step: { key: string; spoken: string } | null;
  /** Runs inside the tap that turns voice control on, for browser features that need a tap (the timer's sound). */
  onTurnOn?: () => void;
}

/** Hands-free cooking: listens for the cooking commands while the person has the mic on, runs them through the actions the screen hands to `connect` after each render, says what it heard and reads steps aloud when asked. Asks once before the first start, remembered per person on this device, and again after a stop it has to explain. */
export function useCookVoice({ uid, step, onTurnOn }: UseCookVoiceOptions) {
  const [hasAgreed, setHasAgreed] = useLocalStoragePreference(
    `pinch:${uid}:voice:agreed`,
    false,
  );
  const [isReadingAloud, setIsReadingAloud] = useLocalStoragePreference(
    `pinch:${uid}:voice:read-aloud`,
    false,
  );
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [message, setMessage] = useState<CookVoiceMessage | null>(null);
  const [expiredError, setExpiredError] = useState<SpeechCommandsError | null>(
    null,
  );
  const [langs] = useState(() => ({
    listen: getListenLang(),
    speak: getPageLang(),
  }));
  const handlers = useRef<{
    run: (command: CookActionCommand) => CookVoiceResult;
    context: CookVoiceContext;
  } | null>(null);
  const lastHeard = useRef({ key: '', at: 0 });
  const messageCount = useRef(0);
  const sayRef = useRef<(text: string) => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);
  const readStepKey = useRef<string | null>(null);

  const connect = useCallback(
    (
      run: (command: CookActionCommand) => CookVoiceResult,
      context: CookVoiceContext,
    ) => {
      handlers.current = { run, context };
    },
    [],
  );

  const show = (text: string, tone: CookVoiceMessage['tone']) => {
    messageCount.current += 1;
    setMessage({ id: messageCount.current, text, tone });
  };

  const handleTranscript = (alternatives: string[]) => {
    if (handlers.current === null) return false;
    const { context: shown, run } = handlers.current;
    const heard = readCookCommand(alternatives, shown);
    if (heard === null) {
      setMessage(null);
      return false;
    }
    const { command, transcript } = heard;
    if (command.kind === 'STOP_LISTENING') {
      stopRef.current();
      setMessage(null);
      return true;
    }
    if (hasDialogOnTop()) return false;

    const key = getCookCommandKey(command);
    const now = Date.now();
    if (
      key === lastHeard.current.key &&
      now - lastHeard.current.at < REPEAT_GUARD_MS
    ) {
      return true;
    }
    lastHeard.current = { key, at: now };

    const result = run(command);
    if (!result.ok) {
      show(result.reason, 'PROBLEM');
      if (isReadingAloud || result.isSpoken) {
        sayRef.current(result.spoken ?? result.reason);
      }
      return true;
    }
    if (result.show) show(result.show, 'ANSWER');
    else show(`Heard “${transcript}”`, 'HEARD');
    if (result.speak) sayRef.current(result.speak);
    return true;
  };

  const speech = useSpeechCommands({
    lang: langs.listen,
    speechLang: langs.speak,
    onFinalTranscript: handleTranscript,
    idleStopMs: IDLE_STOP_MS,
  });
  const { say, quiet, stop, start } = speech;

  useEffect(() => {
    sayRef.current = say;
    stopRef.current = stop;
  }, [say, stop]);

  useEffect(() => {
    if (speech.error === null) return;
    const shownError = speech.error;
    const timeoutId = window.setTimeout(
      () => setExpiredError(shownError),
      ERROR_LINE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [speech.error]);

  useEffect(() => {
    if (message === null) return;
    const timeoutId = window.setTimeout(
      () =>
        setMessage((current) => (current?.id === message.id ? null : current)),
      MESSAGE_MS[message.tone],
    );
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const isHearing =
    speech.status === 'listening' || speech.status === 'speaking';
  const stepKey = step?.key ?? null;
  const spoken = step?.spoken ?? null;

  // A step is read once per showing: listening coming back (a hidden tab, a reading that ended) doesn't read it again.
  useEffect(() => {
    if (isHearing && isReadingAloud && spoken !== null) {
      if (readStepKey.current === stepKey) return;
      readStepKey.current = stepKey;
      say(spoken);
      return;
    }
    if (stepKey !== readStepKey.current) readStepKey.current = null;
    if (stepKey !== null) quiet();
  }, [isHearing, isReadingAloud, stepKey, spoken, say, quiet]);

  const begin = () => {
    readStepKey.current = null;
    setExpiredError(null);
    setMessage(null);
    onTurnOn?.();
    start();
  };

  const turnOn = () => {
    setHasAgreed(true);
    setIsExplainerOpen(false);
    begin();
  };

  const toggle = () => {
    if (speech.isOn) {
      stop();
      setMessage(null);
      return;
    }
    if (!hasAgreed || isExplainedStop(speech.error)) {
      setIsExplainerOpen(true);
      return;
    }
    begin();
  };

  const setReadingAloud = (isOn: boolean) => {
    readStepKey.current = null;
    setIsReadingAloud(isOn);
  };

  return {
    isSupported: speech.isSupported,
    status: speech.status,
    isOn: speech.isOn,
    /** Why voice control last stopped by itself, until it starts again. */
    error: speech.error,
    /** The stop the line still mentions: for a few seconds after it happens. */
    shownError: speech.error === expiredError ? null : speech.error,
    message,
    isExplainerOpen,
    closeExplainer: () => setIsExplainerOpen(false),
    connect,
    turnOn,
    toggle,
    stop,
    isReadingAloud,
    setIsReadingAloud: setReadingAloud,
  };
}

export type CookVoice = ReturnType<typeof useCookVoice>;
