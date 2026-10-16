import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useSpeechCommands } from '@/hooks/useSpeechCommands';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import {
  getCookCommandKey,
  normalizeTranscript,
  parseCookCommand,
  type CookCommand,
  type CookTimerScope,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';

/** The same command heard again this soon is the recognizer repeating itself, not the person. */
const REPEAT_GUARD_MS = 1200;
const MESSAGE_MS = { HEARD: 2500, ANSWER: 8000, PROBLEM: 5000 } as const;

export type CookVoiceResult =
  { ok: true; show?: string; speak?: string } | { ok: false; reason: string };

/** What a spoken command can do on the cooking screen: the same things a tap does, and nothing that writes. */
export interface CookVoiceActions {
  next: () => CookVoiceResult;
  back: () => CookVoiceResult;
  repeat: () => CookVoiceResult;
  showIngredients: () => CookVoiceResult;
  showSteps: () => CookVoiceResult;
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

const runCommand = (
  command: Exclude<CookCommand, { kind: 'STOP_LISTENING' }>,
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

interface UseCookVoiceOptions {
  uid: string;
  /** The step on screen as it is read aloud; null while no step is shown. */
  step: { key: string; spoken: string } | null;
}

const NO_ACTIONS: CookVoiceActions = {
  next: () => ({ ok: false, reason: '' }),
  back: () => ({ ok: false, reason: '' }),
  repeat: () => ({ ok: false, reason: '' }),
  showIngredients: () => ({ ok: false, reason: '' }),
  showSteps: () => ({ ok: false, reason: '' }),
  startTimer: () => ({ ok: false, reason: '' }),
  pauseTimer: () => ({ ok: false, reason: '' }),
  resumeTimer: () => ({ ok: false, reason: '' }),
  stopTimer: () => ({ ok: false, reason: '' }),
  timeLeft: () => ({ ok: false, reason: '' }),
  amount: () => ({ ok: false, reason: '' }),
  switchRecipe: () => ({ ok: false, reason: '' }),
  cycleRecipe: () => ({ ok: false, reason: '' }),
};

/** Hands-free cooking: listens for the cooking commands while the person has the mic on, runs them through the actions the screen hands to `connect` after each render, says what it heard and reads steps aloud when asked. Asks once before the first start, remembered per person on this device. */
export function useCookVoice({ uid, step }: UseCookVoiceOptions) {
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
  const [langs] = useState(() => ({
    listen: getListenLang(),
    speak: getPageLang(),
  }));
  const handlers = useRef<{
    actions: CookVoiceActions;
    context: CookVoiceContext | null;
  }>({ actions: NO_ACTIONS, context: null });
  const isReadingRef = useRef(isReadingAloud);
  const lastHeard = useRef({ key: '', at: 0 });
  const messageCount = useRef(0);
  const sayRef = useRef<(text: string) => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    isReadingRef.current = isReadingAloud;
  }, [isReadingAloud]);

  const connect = useCallback(
    (actions: CookVoiceActions, context: CookVoiceContext) => {
      handlers.current = { actions, context };
    },
    [],
  );

  const show = (text: string, tone: CookVoiceMessage['tone']) => {
    messageCount.current += 1;
    setMessage({ id: messageCount.current, text, tone });
  };

  const handleTranscript = (alternatives: string[]) => {
    const { context: shown, actions: run } = handlers.current;
    if (shown === null) return;
    const command = parseCookCommand(alternatives, shown);
    if (command === null) return;
    if (command.kind === 'STOP_LISTENING') {
      stopRef.current();
      setMessage(null);
      return;
    }
    if (hasDialogOnTop()) return;

    const key = getCookCommandKey(command);
    const now = Date.now();
    if (
      key === lastHeard.current.key &&
      now - lastHeard.current.at < REPEAT_GUARD_MS
    ) {
      return;
    }
    lastHeard.current = { key, at: now };

    const result = runCommand(command, run);
    if (!result.ok) {
      show(result.reason, 'PROBLEM');
      if (isReadingRef.current) sayRef.current(result.reason);
      return;
    }
    const heard =
      alternatives.find((guess) => parseCookCommand(guess, shown) !== null) ??
      alternatives[0];
    if (result.show) show(result.show, 'ANSWER');
    else show(`Heard “${normalizeTranscript(heard)}”`, 'HEARD');
    if (result.speak) sayRef.current(result.speak);
  };

  const speech = useSpeechCommands({
    lang: langs.listen,
    speechLang: langs.speak,
    onFinalTranscript: handleTranscript,
  });
  const { say, quiet, stop, start } = speech;

  useEffect(() => {
    sayRef.current = say;
    stopRef.current = stop;
  }, [say, stop]);

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

  useEffect(() => {
    if (isHearing && isReadingAloud && spoken !== null) {
      say(spoken);
      return;
    }
    quiet();
  }, [isHearing, isReadingAloud, stepKey, spoken, say, quiet]);

  const turnOn = () => {
    setHasAgreed(true);
    setIsExplainerOpen(false);
    setMessage(null);
    start();
  };

  const toggle = () => {
    if (speech.isOn) {
      stop();
      setMessage(null);
      return;
    }
    if (!hasAgreed) {
      setIsExplainerOpen(true);
      return;
    }
    setMessage(null);
    start();
  };

  return {
    isSupported: speech.isSupported,
    status: speech.status,
    isOn: speech.isOn,
    error: speech.error,
    message,
    isExplainerOpen,
    closeExplainer: () => setIsExplainerOpen(false),
    connect,
    turnOn,
    toggle,
    stop,
    isReadingAloud,
    setIsReadingAloud,
  };
}

export type CookVoice = ReturnType<typeof useCookVoice>;
