import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useNaturalVoice } from '@/hooks/useNaturalVoice';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { useSpeechCommands } from '@/hooks/useSpeechCommands';
import type { ListeningCue } from '@/lib/speech/listeningSound';
import { readMicrophonePermission } from '@/lib/speech/microphonePermission';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import { COOK_WINDOW_MS } from '@apps/pinch/constants';
import {
  getCookCommandKey,
  type CookCommand,
  type CookTimerScope,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';
import {
  createVoiceState,
  getVoiceCue,
  getVoiceEffect,
  getWakeWaitEnd,
  planHeard,
  recordWakeBusy,
  reduceVoice,
  type VoiceEvent,
  type WakeBusySpan,
  type VoiceMode,
  type VoiceStop,
} from '@apps/pinch/utils/cookVoiceMode';

/** The same command heard again this soon is the recognizer repeating itself, not the person. */
const REPEAT_GUARD_MS = 1200;
const MESSAGE_MS = {
  HEARD: 2500,
  ANSWER: 8000,
  PROBLEM: 5000,
  MISSED: 3500,
} as const;
/** How long the line says why voice control stopped; the unlit mic says the rest. */
const STOP_LINE_MS = 8000;
const MAX_QUOTE_CHARS = 22;

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

/** A stop that a tap on the mic explains again before it retries; a quiet stretch or the lock running out only needs the tap. */
const isExplainedStop = (stop: VoiceStop | null) =>
  stop !== null && stop !== 'wake-idle' && stop !== 'lock-ended';

const quote = (text: string) =>
  text.length > MAX_QUOTE_CHARS
    ? `${text.slice(0, MAX_QUOTE_CHARS).trimEnd()}…`
    : text;

interface UseCookVoiceOptions {
  uid: string;
  /** The step on screen as it is read aloud; null while no step is shown (a reading already going, such as an answer, then carries on). */
  step: { key: string; spoken: string } | null;
  /** Runs inside the tap that turns voice control on, for browser features that need a tap (the timer's sound). */
  onTurnOn?: () => void;
  /** How many timers run now, and when the latest one rang: the wait for the wake phrase does not count the time a timer runs or the two minutes after one rings. */
  runningTimers: number;
  lastRingAt: number | null;
  /** A timer has rung and waits to be dismissed: the listening chime stays quiet so it never masks the alarm. */
  isAlarmRinging: boolean;
}

/** Hands-free cooking: listens for the cooking commands in the way the person chose (one window per tap, waiting for the wake phrase, or kept open for fifteen minutes), runs them through the actions the screen hands to `connect` after each render, says what it heard and reads steps aloud when asked. Asks once before the first start, remembered per person on this device, and again after a stop it has to explain. When the wake phrase was chosen on this device and the browser already holds the microphone permission, waiting starts by itself as cooking opens (quietly, with no chime), since the person chose it. */
export function useCookVoice({
  uid,
  step,
  onTurnOn,
  runningTimers,
  lastRingAt,
  isAlarmRinging,
}: UseCookVoiceOptions) {
  const [hasAgreed, setHasAgreed] = useLocalStoragePreference(
    `pinch:${uid}:voice:agreed`,
    false,
  );
  const [isReadingAloud, setIsReadingAloud] = useLocalStoragePreference(
    `pinch:${uid}:voice:read-aloud`,
    false,
  );
  const [isWaitingPreferred, setIsWaitingPreferred] = useLocalStoragePreference(
    `pinch:${uid}:voice:wake`,
    false,
  );
  const natural = useNaturalVoice(`pinch:${uid}:voice:natural`);
  const [machine, setMachine] = useState(() =>
    createVoiceState(isWaitingPreferred ? 'WAKE' : 'TAP'),
  );
  const [shouldAutoWait] = useState(() => isWaitingPreferred && hasAgreed);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [message, setMessage] = useState<CookVoiceMessage | null>(null);
  const [expiredStop, setExpiredStop] = useState<VoiceStop | null>(null);
  const [langs] = useState(() => ({
    listen: getListenLang(),
    speak: getPageLang(),
  }));
  const handlers = useRef<{
    run: (command: CookActionCommand) => CookVoiceResult;
    context: CookVoiceContext;
  } | null>(null);
  const machineRef = useRef(machine);
  const lastHeard = useRef({ key: '', at: 0 });
  const messageCount = useRef(0);
  const readStepKey = useRef<string | null>(null);
  const waitRef = useRef<{ enteredAt: number; spans: WakeBusySpan[] } | null>(
    null,
  );
  const controls = useRef<{
    begin: () => void;
    stop: () => void;
    say: (text: string) => void;
    cue: (kind: ListeningCue) => void;
  }>({
    begin: () => undefined,
    stop: () => undefined,
    say: () => undefined,
    cue: () => undefined,
  });

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

  const send = useCallback(
    (event: VoiceEvent, options?: { isSilent?: boolean }) => {
      const previous = machineRef.current;
      const next = reduceVoice(previous, event);
      if (next === previous) return;
      machineRef.current = next;
      setMachine(next);
      const effect = getVoiceEffect(previous, next);
      if (effect === 'START') controls.current.begin();
      if (effect === 'STOP') controls.current.stop();
      const cue = options?.isSilent ? null : getVoiceCue(previous, next);
      if (cue !== null) controls.current.cue(cue);
    },
    [],
  );

  const carryOut = (
    heard: { command: CookCommand; transcript: string },
    run: (command: CookActionCommand) => CookVoiceResult,
  ) => {
    const { command, transcript } = heard;
    if (command.kind === 'STOP_LISTENING') {
      send({ type: 'STOP' });
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

    send({ type: 'COMMAND_HEARD' });
    const result = run(command);
    if (!result.ok) {
      show(result.reason, 'PROBLEM');
      if (isReadingAloud || result.isSpoken) {
        controls.current.say(result.spoken ?? result.reason);
      }
      return true;
    }
    if (result.show) show(result.show, 'ANSWER');
    else show(`Heard “${transcript}”`, 'HEARD');
    if (result.speak) controls.current.say(result.speak);
    return true;
  };

  const handleTranscript = (alternatives: string[]) => {
    if (handlers.current === null) return false;
    const { context: shown, run } = handlers.current;
    const plan = planHeard(machineRef.current.phase, alternatives, shown);
    if (plan.kind === 'IGNORE') return false;
    if (plan.kind === 'COMMAND') return carryOut(plan.heard, run);
    if (plan.kind === 'CLEAR') {
      setMessage(null);
      return false;
    }
    if (plan.kind === 'WAKE') {
      if (plan.heard?.command.kind === 'STOP_LISTENING') {
        return carryOut(plan.heard, run);
      }
      if (hasDialogOnTop()) return false;
      send({ type: 'WAKE_HEARD' }, { isSilent: plan.heard !== null });
      setMessage(null);
      return plan.heard === null ? true : carryOut(plan.heard, run);
    }
    if (hasDialogOnTop()) {
      setMessage(null);
      return false;
    }
    show(`Not a command: “${quote(alternatives[0])}”`, 'MISSED');
    return false;
  };

  const speech = useSpeechCommands({
    lang: langs.listen,
    speechLang: langs.speak,
    onFinalTranscript: handleTranscript,
    isNaturalVoice: natural.isOn,
    onHalt: (error) => {
      if (error !== 'idle') send({ type: 'ENGINE_STOPPED', reason: error });
    },
  });
  const { say, quiet, stop, start, cue } = speech;

  const begin = () => {
    readStepKey.current = null;
    setExpiredStop(null);
    setMessage(null);
    onTurnOn?.();
    start();
  };

  useEffect(() => {
    controls.current = {
      begin,
      stop,
      say,
      cue: (kind) => {
        if (!isAlarmRinging) cue(kind);
      },
    };
  });

  useEffect(() => {
    if (!shouldAutoWait || !speech.isSupported) return;
    const attempt = { isCancelled: false };
    readMicrophonePermission().then((permission) => {
      if (attempt.isCancelled || permission !== 'granted') return;
      if (machineRef.current.phase !== 'OFF') return;
      send(
        { type: 'CHOOSE', choice: 'WAKE', at: Date.now() },
        { isSilent: true },
      );
    });
    return () => {
      attempt.isCancelled = true;
    };
  }, [shouldAutoWait, speech.isSupported, send]);

  const { phase, epoch, lockEndsAt, stopped } = machine;
  const isListening = speech.status === 'listening';

  useEffect(() => {
    if (phase !== 'WINDOW' || !isListening) return;
    const timeoutId = window.setTimeout(
      () => send({ type: 'WINDOW_ENDED' }),
      COOK_WINDOW_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [phase, epoch, isListening, send]);

  useEffect(() => {
    if (phase !== 'WAITING') {
      waitRef.current = null;
      return;
    }
    const now = Date.now();
    const enteredAt = waitRef.current?.enteredAt ?? now;
    const spans = recordWakeBusy(waitRef.current?.spans ?? [], {
      enteredAt,
      now,
      runningTimers,
      lastRingAt,
    });
    waitRef.current = { enteredAt, spans };
    const timeoutId = window.setTimeout(
      () => send({ type: 'WAIT_ENDED' }),
      Math.max(0, getWakeWaitEnd(enteredAt, spans) - now),
    );
    return () => window.clearTimeout(timeoutId);
  }, [phase, runningTimers, lastRingAt, send]);

  useEffect(() => {
    if (lockEndsAt === null) return;
    const timer = { id: 0 };
    const settle = () => {
      const left = lockEndsAt - Date.now();
      if (left <= 0) send({ type: 'LOCK_ENDED' });
      else timer.id = window.setTimeout(settle, left);
    };
    timer.id = window.setTimeout(settle, Math.max(0, lockEndsAt - Date.now()));
    return () => window.clearTimeout(timer.id);
  }, [lockEndsAt, send]);

  useOnTabReturn(() => {
    const endsAt = machineRef.current.lockEndsAt;
    if (endsAt !== null && Date.now() >= endsAt) send({ type: 'LOCK_ENDED' });
  });

  useEffect(() => {
    if (stopped === null) return;
    const timeoutId = window.setTimeout(
      () => setExpiredStop(stopped),
      STOP_LINE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [stopped]);

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

  const turnOn = () => {
    setHasAgreed(true);
    setIsExplainerOpen(false);
    send({ type: 'TAP_MIC' });
  };

  const toggle = () => {
    if (machine.phase !== 'OFF') {
      send({ type: 'TAP_MIC' });
      setMessage(null);
      return;
    }
    if (!hasAgreed || isExplainedStop(machine.stopped)) {
      setIsExplainerOpen(true);
      return;
    }
    send({ type: 'TAP_MIC' });
  };

  const chooseMode = (mode: VoiceMode) => {
    setIsWaitingPreferred(mode === 'WAKE');
    send({ type: 'MODE', mode });
  };

  /** A row in the voice sheet: it changes how the mic listens now, and "Tap to talk" and the wake phrase are remembered for next time. */
  const choose = (choice: VoiceMode | 'LOCK') => {
    if (choice !== 'LOCK') setIsWaitingPreferred(choice === 'WAKE');
    send({ type: 'CHOOSE', choice, at: Date.now() });
  };

  const stopVoice = useCallback(() => send({ type: 'STOP' }), [send]);

  const setReadingAloud = (isOn: boolean) => {
    readStepKey.current = null;
    setIsReadingAloud(isOn);
  };

  return {
    isSupported: speech.isSupported,
    status: speech.status,
    /** The mic is open, whether it waits for the wake phrase or takes commands. */
    isOn: phase !== 'OFF',
    phase,
    /** How the mic listens when it is on (the lock is never remembered). */
    mode: machine.mode,
    /** Changes with each command window that opens or is extended: keys the draining bar. */
    windowKey: epoch,
    /** When the fifteen minutes end, while it is kept open. */
    lockEndsAt,
    /** Why voice control last stopped by itself, until it starts again. */
    error: stopped,
    /** The stop the line still mentions: for a few seconds after it happens. */
    shownError: stopped === expiredStop ? null : stopped,
    message,
    isExplainerOpen,
    closeExplainer: () => setIsExplainerOpen(false),
    isSheetOpen,
    openSheet: () => setIsSheetOpen(true),
    closeSheet: () => setIsSheetOpen(false),
    connect,
    turnOn,
    toggle,
    stop: stopVoice,
    chooseMode,
    choose,
    isReadingAloud,
    setIsReadingAloud: setReadingAloud,
    natural,
  };
}

export type CookVoice = ReturnType<typeof useCookVoice>;
