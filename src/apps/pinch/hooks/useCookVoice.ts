import { useCallback, useEffect, useRef, useState } from 'react';

import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { useNaturalVoice } from '@/hooks/useNaturalVoice';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { useSpeechCommands } from '@/hooks/useSpeechCommands';
import type { ListeningCue } from '@/lib/speech/listeningSound';
import { readMicrophonePermission } from '@/lib/speech/microphonePermission';
import { getNaturalVoiceState } from '@/lib/speech/naturalVoice/naturalVoiceEngine';
import { recordTurn, type TurnLogData } from '@/lib/speech/turnLog';
import {
  createCloudSpeaker,
  getDeviceLineWaitMs,
} from '@/lib/speech/voice/cloudSpeaker';
import type { SpeechPriority } from '@/lib/speech/voice/types';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import type { MeasureUnit } from '@/utils/measureUtils';
import { COOK_WINDOW_MS } from '@apps/pinch/constants';
import type { PepperLook } from '@apps/pinch/types';
import { createPepperSpeechSource } from '@apps/pinch/utils/pepperSpeech';
import {
  getCookCommandKey,
  stepCookReading,
  type CookCommand,
  type CookEntryKind,
  type CookScrollTo,
  type CookReadingQueue,
  type CookReadingSegment,
  type CookServingsChange,
  type CookSpokenView,
  type CookTimerAnswer,
  type CookTimerScope,
  type CookTimerTarget,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';
import {
  createVoiceState,
  getVoiceCue,
  getVoiceEffect,
  getWakeWaitEnd,
  planHeard,
  readAddressedGuesses,
  readWakeWord,
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
const NOTES_PAUSE_MS = 1000;
const NO_SEGMENTS: CookReadingSegment[] = [];
/** How long the "Go ahead" prompt may take to start before the chime stands in for it (a voice that can't speak never starts). */
const DICTATION_PROMPT_WAIT_MS = 1600;
const NOTES_LEAD = 'Your tips and notes for this step.';
const MAX_QUOTE_CHARS = 22;
const MAX_PEPPER_ALTERNATIVES = 4;
const LINE_MS_PER_CHAR = 70;
const WINDOW_HOLD_MS = 1000;
const END_POLL_MS = 250;

export type CookVoiceResult =
  | { ok: true; show?: string; speak?: string }
  | { ok: false; reason: string; spoken?: string };

/** What a spoken command can do on the cooking screen: the same things a tap does, and nothing that writes. */
export interface CookVoiceActions {
  next: () => CookVoiceResult;
  back: () => CookVoiceResult;
  repeat: () => CookVoiceResult;
  showIngredients: () => CookVoiceResult;
  showSteps: () => CookVoiceResult;
  finish: () => CookVoiceResult;
  showTimers: () => CookVoiceResult;
  startTimer: (seconds: number | null, name: string | null) => CookVoiceResult;
  pauseTimer: (target: CookTimerTarget) => CookVoiceResult;
  resumeTimer: (target: CookTimerTarget) => CookVoiceResult;
  stopTimer: (
    target: CookTimerTarget,
    scope: CookTimerScope,
  ) => CookVoiceResult;
  extendTimer: (seconds: number, target: CookTimerTarget) => CookVoiceResult;
  renameTimer: (target: CookTimerTarget, name: string) => CookVoiceResult;
  timeLeft: (target: CookTimerTarget) => CookVoiceResult;
  answerTimer: (answer: CookTimerAnswer) => CookVoiceResult;
  amount: (lineIds: string[], query: string) => CookVoiceResult;
  convert: (
    lineIds: string[],
    query: string,
    unit: MeasureUnit,
  ) => CookVoiceResult;
  convertAmount: (
    amount: number,
    from: MeasureUnit,
    to: MeasureUnit,
  ) => CookVoiceResult;
  switchRecipe: (
    recipeId: string | null,
    candidates: string[],
  ) => CookVoiceResult;
  cycleRecipe: (direction: 1 | -1) => CookVoiceResult;
  setServings: (
    change: CookServingsChange,
    recipeId: string | null,
  ) => CookVoiceResult;
  answerDish: (recipeId: string) => CookVoiceResult;
  tellServings: () => CookVoiceResult;
  readTips: () => CookVoiceResult;
  readNotes: () => CookVoiceResult;
  readChanges: () => CookVoiceResult;
  showEntries: (kind: CookEntryKind) => CookVoiceResult;
  closeEntries: () => CookVoiceResult;
  showStepAmounts: () => CookVoiceResult;
  showLastNote: () => CookVoiceResult;
  addEntry: (kind: CookEntryKind) => CookVoiceResult;
  dictation: (text: string) => CookVoiceResult;
  undoEntry: () => CookVoiceResult;
  startCooking: () => CookVoiceResult;
  gotIngredient: (queries: string[], isOut: boolean) => CookVoiceResult;
  markAdded: (queries: string[], isAdded: boolean) => CookVoiceResult;
  markAllAdded: () => CookVoiceResult;
  scroll: (to: CookScrollTo) => CookVoiceResult;
  tickAll: () => CookVoiceResult;
  untickAll: () => CookVoiceResult;
  readLeft: () => CookVoiceResult;
  readTools: () => CookVoiceResult;
  setGatherLayout: (layout: 'ALL' | 'PARTS') => CookVoiceResult;
}

/** What cooking mode hands the voice while Pepper is on: where words that are no command go, and the facts the listener must respect. */
export interface CookPepperRoute {
  /** A turn is being worked out or spoken: the window for talking stays open and a step moved by Pepper isn't read over it. */
  isBusy: () => boolean;
  /** Whether the step that just changed was moved by Pepper itself, and not by a tap; reading it settles the answer. */
  takeMove: () => boolean;
  hasPending: () => boolean;
  /** Settles a waiting yes or no from one guess; null when none waits or the guess was neither. */
  answerPending: (heard: string) => { said?: string } | null;
  /** Drops a waiting yes or no, for a turn that is not its answer. */
  clearPending: () => void;
  /** Sends what was heard, best guess first, with the others after it. */
  ask: (heard: string, alternatives: string[]) => void;
  cancel: () => void;
}

interface QueuedLine {
  text: string;
  canAnswer: boolean;
  resolve: () => void;
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
    case 'SHOW_TIMERS':
      return actions.showTimers();
    case 'START_TIMER':
      return actions.startTimer(command.seconds, command.name);
    case 'PAUSE_TIMER':
      return actions.pauseTimer(command.target);
    case 'RESUME_TIMER':
      return actions.resumeTimer(command.target);
    case 'STOP_TIMER':
      return actions.stopTimer(command.target, command.scope);
    case 'EXTEND_TIMER':
      return actions.extendTimer(command.seconds, command.target);
    case 'RENAME_TIMER':
      return actions.renameTimer(command.target, command.name);
    case 'TIME_LEFT':
      return actions.timeLeft(command.target);
    case 'TIMER_ANSWER':
      return actions.answerTimer(command.answer);
    case 'AMOUNT':
      return actions.amount(command.lineIds, command.query);
    case 'CONVERT':
      return actions.convert(command.lineIds, command.query, command.unit);
    case 'CONVERT_AMOUNT':
      return actions.convertAmount(command.amount, command.from, command.to);
    case 'SWITCH_RECIPE':
      return actions.switchRecipe(command.recipeId, command.candidates);
    case 'CYCLE_RECIPE':
      return actions.cycleRecipe(command.direction);
    case 'SET_SERVINGS':
      return actions.setServings(command.change, command.recipeId ?? null);
    case 'DISH_ANSWER':
      return actions.answerDish(command.recipeId);
    case 'TELL_SERVINGS':
      return actions.tellServings();
    case 'READ_TIPS':
      return actions.readTips();
    case 'READ_NOTES':
      return actions.readNotes();
    case 'READ_CHANGES':
      return actions.readChanges();
    case 'SHOW_ENTRIES':
      return actions.showEntries(command.entryKind);
    case 'SHOW_STEP_AMOUNTS':
      return actions.showStepAmounts();
    case 'SHOW_LAST_NOTE':
      return actions.showLastNote();
    case 'CLOSE_ENTRIES':
      return actions.closeEntries();
    case 'ADD_ENTRY':
      return actions.addEntry(command.entryKind);
    case 'DICTATION':
      return actions.dictation(command.text);
    case 'UNDO_ENTRY':
      return actions.undoEntry();
    case 'START_COOKING':
      return actions.startCooking();
    case 'GOT_INGREDIENT':
      return actions.gotIngredient(command.queries, command.isOut);
    case 'MARK_ADDED':
      return actions.markAdded(command.queries, command.isAdded);
    case 'MARK_ALL_ADDED':
      return actions.markAllAdded();
    case 'SCROLL':
      return actions.scroll(command.to);
    case 'TICK_ALL':
      return actions.tickAll();
    case 'UNTICK_ALL':
      return actions.untickAll();
    case 'READ_LEFT':
      return actions.readLeft();
    case 'READ_TOOLS':
      return actions.readTools();
    case 'SET_GATHER_LAYOUT':
      return actions.setGatherLayout(command.layout);
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

/** Notes what a heard phrase became in the conversation log. */
const routed = (text: string, data?: TurnLogData) =>
  recordTurn('routed', text, data ?? null);

/** Why the natural voice didn't say a line: it was off, or on and not ready or too slow. */
const getNaturalReason = (isNaturalWanted: boolean) => {
  const { status, problem } = getNaturalVoiceState();
  return isNaturalWanted
    ? status === 'ready'
      ? 'natural voice was on but too slow or failed on this line'
      : `natural voice was on but not used (${status}${problem === null ? '' : `: ${problem}`})`
    : 'natural voice is off';
};

/** Why a line was read by the browser's voice while Pepper's cloud voice is not in use. */
const getVoiceReason = (isNaturalWanted: boolean) =>
  [
    'the cloud voice is only used while Pepper is on',
    getNaturalReason(isNaturalWanted),
    ...(navigator.onLine ? [] : ['offline']),
  ].join('; ');

const quote = (text: string) =>
  text.length > MAX_QUOTE_CHARS
    ? `${text.slice(0, MAX_QUOTE_CHARS).trimEnd()}…`
    : text;

interface UseCookVoiceOptions {
  uid: string;
  /** The step on screen as it is read aloud; null while no step is shown (a reading already going, such as an answer, then carries on). */
  step: {
    key: string;
    spoken: string;
    /** What was written for the step, read after it kind by kind: the note from last time, then tips, notes and planned changes. */
    notesSegments: CookReadingSegment[];
  } | null;
  /** Puts the view being read on screen (and null takes it down again when the reading is over). */
  onShowView?: (view: CookSpokenView | null) => void;
  /** The view open above the step's bubbles now, so the reading never closes or reopens one the person changed. */
  openView?: CookSpokenView | null;
  /** Runs inside the tap that turns voice control on, for browser features that need a tap (the timer's sound). */
  onTurnOn?: () => void;
  /** How many timers run now, and when the latest one rang: the wait for the wake phrase does not count the time a timer runs or the two minutes after one rings. */
  runningTimers: number;
  lastRingAt: number | null;
  /** The next thing said is written down as a tip, note or change: the words picked up are kept to show, and a chime marks when to start saying them. */
  dictationKey?: string | null;
  /** A timer has rung and waits to be dismissed: the listening chime stays quiet so it never masks the alarm. */
  isAlarmRinging: boolean;
  /** A line to say after the step's own words, or null; looking never uses it up. */
  peekStepOffer?: () => string | null;
  /** Called once the step the offer was added to is heard, which is what uses the offer up. */
  commitStepOffer?: () => void;
}

/** Hands-free cooking: listens for the cooking commands in the way the person chose (one window per tap, waiting for the wake phrase, or kept open for fifteen minutes), runs them through the actions the screen hands to `connect` after each render, says what it heard and reads steps aloud when asked. Asks once before the first start, remembered with the person's account (their choices here, in `PinchSettings.voice`, follow them to another device; an older choice kept on this device stands until they choose again), and again after a stop it has to explain. When the wake phrase was chosen on this device and the browser already holds the microphone permission, waiting starts by itself as cooking opens (quietly, with no chime), since the person chose it. */
export function useCookVoice({
  uid,
  step,
  onShowView,
  openView = null,
  onTurnOn,
  runningTimers,
  lastRingAt,
  isAlarmRinging,
  dictationKey = null,
  peekStepOffer,
  commitStepOffer,
}: UseCookVoiceOptions) {
  const { settings, save: saveSettings } = usePinchSettings(uid);
  const [localAgreed, setLocalAgreed] = useLocalStoragePreference(
    `pinch:${uid}:voice:agreed`,
    false,
  );
  const [localReadingAloud, setLocalReadingAloud] = useLocalStoragePreference(
    `pinch:${uid}:voice:read-aloud`,
    false,
  );
  const [localReadingNotes, setLocalReadingNotes] = useLocalStoragePreference(
    `pinch:${uid}:voice:read-notes`,
    false,
  );
  const [localWaiting, setLocalWaiting] = useLocalStoragePreference(
    `pinch:${uid}:voice:wake`,
    false,
  );
  const hasAgreed = settings.voice.hasAgreed ?? localAgreed;
  const isReadingAloud = settings.voice.isReadingAloud ?? localReadingAloud;
  const isReadingNotes = settings.voice.isReadingNotes ?? localReadingNotes;
  const isWaitingPreferred = settings.voice.isWaiting ?? localWaiting;
  const look = settings.voice.look;
  const setHasAgreed = (next: boolean) => {
    setLocalAgreed(next);
    void saveSettings({ voice: { hasAgreed: next } });
  };
  const setIsReadingAloud = (next: boolean) => {
    setLocalReadingAloud(next);
    void saveSettings({ voice: { isReadingAloud: next } });
  };
  const setIsReadingNotes = (next: boolean) => {
    setLocalReadingNotes(next);
    void saveSettings({ voice: { isReadingNotes: next } });
  };
  const setLook = (next: PepperLook) => {
    void saveSettings({ voice: { look: next } });
  };
  const setIsWaitingPreferred = (next: boolean) => {
    setLocalWaiting(next);
    void saveSettings({ voice: { isWaiting: next } });
  };
  const natural = useNaturalVoice(`pinch:${uid}:voice:natural`);
  const isPepperOn = useIsGateOpen('pinch', 'pepper');
  const [speechSource] = useState(createPepperSpeechSource);
  const linePriority = useRef<SpeechPriority>('ack');
  const [machine, setMachine] = useState(() =>
    createVoiceState(isWaitingPreferred ? 'WAKE' : 'TAP'),
  );
  const [shouldAutoWait] = useState(() => isWaitingPreferred && hasAgreed);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [heard, setHeard] = useState<{ key: string; text: string } | null>(
    null,
  );
  const [message, setMessage] = useState<CookVoiceMessage | null>(null);
  const [expiredStop, setExpiredStop] = useState<VoiceStop | null>(null);
  const [langs] = useState(() => ({
    listen: getListenLang(),
    speak: getPageLang(),
  }));
  const naturalRef = useRef(natural.isOn);
  const pepperSpeaker = useRef<ReturnType<typeof createCloudSpeaker> | null>(
    null,
  );
  const handlers = useRef<{
    run: (command: CookActionCommand) => CookVoiceResult;
    context: CookVoiceContext;
  } | null>(null);
  const pepperRoute = useRef<CookPepperRoute | null>(null);
  // Bumped by each new turn, so a close Pepper asked for earlier no longer applies.
  const ending = useRef(0);
  useEffect(
    () => () => {
      ending.current += 1;
    },
    [],
  );
  const lines = useRef<{
    items: QueuedLine[];
    active: QueuedLine | null;
    hasStarted: boolean;
    timeoutId: number;
  }>({ items: [], active: null, hasStarted: false, timeoutId: 0 });
  const playLine = useRef<() => void>(() => undefined);
  const machineRef = useRef(machine);
  const lastHeard = useRef({ key: '', at: 0 });
  const messageCount = useRef(0);
  const readStepKey = useRef<string | null>(null);
  const stepSpokenKey = useRef<string | null>(null);
  const notesQueue = useRef<CookReadingQueue | null>(null);
  const segmentsRef = useRef<CookReadingSegment[]>(NO_SEGMENTS);
  const onShowViewRef = useRef(onShowView);
  const stepOfferRef = useRef({ peekStepOffer, commitStepOffer });
  const offeredKey = useRef<string | null>(null);
  const openViewRef = useRef(openView);
  const isReadingRef = useRef({ isAloud: false, isNotes: false });
  const waitRef = useRef<{ enteredAt: number; spans: WakeBusySpan[] } | null>(
    null,
  );
  const controls = useRef<{
    begin: () => void;
    stop: () => void;
    say: (text: string) => void;
    quiet: () => void;
    cue: (kind: ListeningCue) => void;
  }>({
    begin: () => undefined,
    stop: () => undefined,
    say: () => undefined,
    quiet: () => undefined,
    cue: () => undefined,
  });

  const connectPepper = useCallback((route: CookPepperRoute | null) => {
    pepperRoute.current = route;
  }, []);

  const clearLines = useCallback(() => {
    const state = lines.current;
    window.clearTimeout(state.timeoutId);
    const pending = [...(state.active ? [state.active] : []), ...state.items];
    lines.current = { ...state, items: [], active: null, hasStarted: false };
    pending.forEach((line) => line.resolve());
    pepperRoute.current?.clearPending();
  }, []);

  const sayInOrder = useCallback(
    (text: string, options: { canAnswer: boolean }) =>
      new Promise<void>((resolve) => {
        if (text.trim() === '') {
          resolve();
          return;
        }
        lines.current.items.push({
          text,
          canAnswer: options.canAnswer,
          resolve,
        });
        if (lines.current.active === null) playLine.current();
      }),
    [],
  );

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
      if (next.phase === 'OFF') {
        pepperRoute.current?.cancel();
        clearLines();
        pepperSpeaker.current?.reset();
      }
      const effect = getVoiceEffect(previous, next);
      if (effect === 'START') controls.current.begin();
      if (effect === 'STOP') controls.current.stop();
      const cue = options?.isSilent ? null : getVoiceCue(previous, next);
      if (cue !== null) controls.current.cue(cue);
    },
    [clearLines],
  );

  const carryOut = (
    heard: { command: CookCommand; transcript: string },
    run: (command: CookActionCommand) => CookVoiceResult,
  ) => {
    const { command, transcript } = heard;
    ending.current += 1;
    if (command.kind === 'STOP_LISTENING') {
      routed('set command: STOP_LISTENING');
      send({ type: 'STOP' });
      setMessage(null);
      return true;
    }
    if (hasDialogOnTop()) {
      routed(`nothing: ${command.kind} heard while a dialog is open`);
      return false;
    }

    pepperRoute.current?.clearPending();
    const key = getCookCommandKey(command);
    const now = Date.now();
    if (
      key === lastHeard.current.key &&
      now - lastHeard.current.at < REPEAT_GUARD_MS
    ) {
      routed(
        `nothing: ${command.kind} again within ${REPEAT_GUARD_MS} ms, taken as an echo`,
      );
      return true;
    }
    lastHeard.current = { key, at: now };

    send({ type: 'COMMAND_HEARD' });
    const result = run(command);
    routed(
      result.ok
        ? `set command: ${command.kind}`
        : `set command: ${command.kind}, refused`,
      result.ok
        ? { said: result.speak ?? result.show ?? null }
        : { reason: result.reason, said: result.spoken ?? result.reason },
    );
    if (!result.ok) {
      show(result.reason, 'PROBLEM');
      notesQueue.current = null;
      controls.current.say(result.spoken ?? result.reason);
      return true;
    }
    if (result.show) show(result.show, 'ANSWER');
    else show(`Heard “${transcript}”`, 'HEARD');
    const spoken = result.speak ?? result.show;
    if (spoken) {
      notesQueue.current = null;
      controls.current.say(spoken);
    }
    return true;
  };

  const carryPepperRun = (run: { said?: string }, route: CookPepperRoute) => {
    routed('answered Pepper’s question (yes or no)', {
      said: run.said ?? null,
    });
    send({ type: 'WAKE_HEARD' }, { isSilent: true });
    setMessage(null);
    if (run.said === undefined) return true;
    show(run.said, 'ANSWER');
    notesQueue.current = null;
    void sayInOrder(run.said, { canAnswer: route.hasPending() });
    return true;
  };

  const carryAsk = (guesses: string[], route: CookPepperRoute) => {
    if (hasDialogOnTop()) {
      routed('nothing: a question for Pepper while a dialog is open', {
        guesses,
      });
      return false;
    }
    ending.current += 1;
    routed(`asked Pepper (natural language): “${guesses[0]}”`, {
      alternatives: guesses.slice(1),
    });
    send({ type: 'WAKE_HEARD' }, { isSilent: true });
    show(`Heard “${quote(guesses[0])}”`, 'HEARD');
    notesQueue.current = null;
    route.cancel();
    clearLines();
    controls.current.quiet();
    route.ask(guesses[0], guesses.slice(1, 1 + MAX_PEPPER_ALTERNATIVES));
    return true;
  };

  const handleTranscript = (
    alternatives: string[],
    confidences: (number | null)[],
  ) => {
    setHeard(null);
    const route = pepperRoute.current;
    const { phase: heardPhase } = machineRef.current;
    recordTurn('heard', `“${alternatives[0]}”`, {
      listener: 'browser speech recognition',
      phase: heardPhase,
      hasWakePhrase: readWakeWord(alternatives) !== null,
      isAssistantOn: route !== null,
      alternatives: alternatives.map((guess, at) => {
        const confidence = confidences[at];
        return typeof confidence === 'number' && confidence > 0
          ? `${guess} (${confidence.toFixed(2)})`
          : guess;
      }),
    });
    if (handlers.current === null) {
      routed('nothing: the cooking screen is not ready for commands');
      return false;
    }
    const { context: shown, run } = handlers.current;
    if (route !== null && route.hasPending() && !hasDialogOnTop()) {
      const [top] = readAddressedGuesses(heardPhase, alternatives);
      const answered = top === undefined ? null : route.answerPending(top);
      if (answered !== null) return carryPepperRun(answered, route);
    }
    const plan = planHeard(heardPhase, alternatives, shown, route !== null);
    if (plan.kind === 'IGNORE') {
      routed(
        heardPhase === 'OFF'
          ? 'nothing: the mic is off'
          : 'nothing: no wake phrase (waiting for it)',
      );
      return false;
    }
    if (plan.kind === 'COMMAND') return carryOut(plan.heard, run);
    if (plan.kind === 'ASK') {
      return route === null ? false : carryAsk(plan.guesses, route);
    }
    if (plan.kind === 'CLEAR') {
      routed('nothing: no command matched and no wake phrase');
      setMessage(null);
      return false;
    }
    if (plan.kind === 'WAKE') {
      if (plan.heard?.command.kind === 'STOP_LISTENING') {
        return carryOut(plan.heard, run);
      }
      if (hasDialogOnTop()) {
        routed('nothing: wake phrase while a dialog is open');
        return false;
      }
      if (plan.heard === null) {
        routed('nothing: the wake phrase alone, now listening for a command');
      }
      send({ type: 'WAKE_HEARD' }, { isSilent: plan.heard !== null });
      setMessage(null);
      return plan.heard === null ? true : carryOut(plan.heard, run);
    }
    if (hasDialogOnTop()) {
      routed('nothing: no command matched, and a dialog is open');
      setMessage(null);
      return false;
    }
    routed(
      route === null
        ? 'nothing: no command matched, and Pepper is off'
        : 'nothing: no command matched, and no words were left to send to Pepper',
    );
    show(`Not a command: “${quote(alternatives[0])}”`, 'MISSED');
    return false;
  };

  const speech = useSpeechCommands({
    lang: langs.listen,
    speechLang: langs.speak,
    onFinalTranscript: handleTranscript,
    onInterimTranscript: (text) => {
      const key = dictationKeyRef.current;
      if (key !== null) setHeard({ key, text });
    },
    isNaturalVoice: natural.isOn,
    onVoice: (voice, text) =>
      recordTurn('spoken', `“${text}”`, {
        voice:
          voice === 'natural' ? 'natural on-device voice' : 'browser voice',
        ...(voice === 'natural' ? {} : { why: getVoiceReason(natural.isOn) }),
      }),
    speak: isPepperOn
      ? (text, handlers) =>
          pepperSpeaker.current?.speak(text, handlers) ?? (() => undefined)
      : undefined,
    onHalt: (error) => {
      if (error !== 'idle') send({ type: 'ENGINE_STOPPED', reason: error });
    },
  });
  const { say, quiet, stop, start, cue } = speech;
  useEffect(() => {
    naturalRef.current = natural.isOn;
  });
  useEffect(() => {
    pepperSpeaker.current = createCloudSpeaker({
      source: speechSource,
      lang: langs.speak,
      isNatural: () => naturalRef.current,
      getPriority: () => linePriority.current,
      onSpoken: (text, { voice, cloudFailure }) => {
        if (lines.current.active !== null) lines.current.hasStarted = true;
        recordTurn('spoken', `“${text}”`, {
          voice,
          ...(cloudFailure === null
            ? {}
            : {
                why: [
                  `cloud voice failed (${cloudFailure.stage}: ${cloudFailure.detail})`,
                  ...(voice === 'browser voice'
                    ? [getNaturalReason(naturalRef.current)]
                    : []),
                  ...(navigator.onLine ? [] : ['offline']),
                ].join('; '),
              }),
        });
      },
      onCut: (cause) =>
        recordTurn(
          'failed',
          `cloud voice stopped partway (${cause.stage}: ${cause.detail})`,
        ),
    });
  }, [speechSource, langs.speak]);
  const dictationKeyRef = useRef(dictationKey);
  const chime = useRef({
    isArmed: false,
    hasSpoken: false,
    timeoutId: 0,
  });
  useEffect(() => {
    dictationKeyRef.current = dictationKey;
    const state = chime.current;
    const fire = () => {
      window.clearTimeout(state.timeoutId);
      state.isArmed = false;
      if (!isAlarmRinging) cue('start');
    };
    if (dictationKey === null) {
      window.clearTimeout(state.timeoutId);
      state.isArmed = false;
      return;
    }
    if (!state.isArmed) {
      state.isArmed = true;
      state.hasSpoken = false;
      state.timeoutId = window.setTimeout(() => {
        if (state.isArmed && !state.hasSpoken) fire();
      }, DICTATION_PROMPT_WAIT_MS);
    }
    if (speech.status === 'speaking') state.hasSpoken = true;
    if (speech.status === 'listening' && state.hasSpoken) fire();
  }, [dictationKey, speech.status, isAlarmRinging, cue]);

  const begin = () => {
    readStepKey.current = null;
    stepSpokenKey.current = null;
    notesQueue.current = null;
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
      quiet,
      cue: (kind) => {
        if (!isAlarmRinging) cue(kind);
      },
    };
  });

  useEffect(() => {
    playLine.current = () => {
      const state = lines.current;
      window.clearTimeout(state.timeoutId);
      const finished = state.active;
      state.active = null;
      state.hasStarted = false;
      finished?.resolve();
      if (finished?.canAnswer) send({ type: 'WAKE_HEARD' }, { isSilent: true });
      const next = state.items.shift();
      if (next === undefined) return;
      state.active = next;
      linePriority.current = 'reply';
      controls.current.say(next.text);
      linePriority.current = 'ack';
      state.timeoutId = window.setTimeout(
        () => {
          const now = lines.current;
          if (now.active === next && !now.hasStarted) playLine.current();
        },
        speech.status === 'off'
          ? Math.max(1500, next.text.length * LINE_MS_PER_CHAR)
          : isPepperOn
            ? (pepperSpeaker.current?.getLineWaitMs() ??
              getDeviceLineWaitMs(natural.isOn))
            : getDeviceLineWaitMs(natural.isOn),
      );
    };
  });

  useEffect(() => {
    const state = lines.current;
    if (state.active === null) return;
    // A cloud line says 'speaking' before its first sound, so only the speaker's own start counts for it.
    if (speech.status === 'speaking') {
      if (!isPepperOn) state.hasStarted = true;
      return;
    }
    if (state.hasStarted) playLine.current();
  }, [speech.status, isPepperOn]);

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
    const timer = { id: 0 };
    const settle = () => {
      if (pepperRoute.current?.isBusy()) {
        timer.id = window.setTimeout(settle, WINDOW_HOLD_MS);
        return;
      }
      send({ type: 'WINDOW_ENDED' });
    };
    timer.id = window.setTimeout(settle, COOK_WINDOW_MS);
    return () => window.clearTimeout(timer.id);
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
  const stepWords = step?.spoken ?? null;
  const segments = step?.notesSegments ?? NO_SEGMENTS;
  useEffect(() => {
    segmentsRef.current = segments;
    onShowViewRef.current = onShowView;
    stepOfferRef.current = { peekStepOffer, commitStepOffer };
    openViewRef.current = openView;
    isReadingRef.current = { isAloud: isReadingAloud, isNotes: isReadingNotes };
  });
  const spoken = stepWords;

  // A step is read once per showing: listening coming back (a hidden tab, a reading that ended) doesn't read it again.
  const lastReading = useRef({ isAloud: isReadingAloud, stepKey });
  useEffect(() => {
    const previous = lastReading.current;
    lastReading.current = { isAloud: isReadingAloud, stepKey };
    const route = pepperRoute.current;
    const queued = lines.current;
    const isBusy =
      (route?.isBusy() ?? false) ||
      (route?.hasPending() ?? false) ||
      queued.active !== null ||
      queued.items.length > 0;
    const isPepperMove =
      isBusy && previous.stepKey !== stepKey && route?.takeMove() === true;
    // A tap on a step while anything is still being said or asked cuts it off, and the step is read as usual.
    if (isBusy && previous.stepKey !== stepKey && !isPepperMove) {
      ending.current += 1;
      route?.cancel();
      clearLines();
    }
    if (isHearing && isReadingAloud && spoken !== null) {
      if (readStepKey.current === stepKey) return;
      readStepKey.current = stepKey;
      if (isPepperMove) return;
      notesQueue.current =
        isReadingNotes && segments.length > 0 && stepKey !== null
          ? {
              key: stepKey,
              next: 0,
              opened: null,
              segments: segmentsRef.current,
            }
          : null;
      const offer = stepOfferRef.current.peekStepOffer?.() ?? null;
      offeredKey.current = offer === null ? null : stepKey;
      say(offer === null ? spoken : `${spoken} ${offer}`);
      if (speech.status === 'speaking') {
        stepSpokenKey.current = stepKey;
        if (offer !== null) {
          offeredKey.current = null;
          stepOfferRef.current.commitStepOffer?.();
        }
      }
      return;
    }
    if (stepKey !== readStepKey.current) {
      readStepKey.current = null;
      offeredKey.current = null;
    }
    // Only a step that moved on or a setting that went off cuts a reading short: a spoken answer starting up flips the status too and must not be cancelled by it.
    if (
      stepKey !== null &&
      !isPepperMove &&
      (previous.isAloud !== isReadingAloud || previous.stepKey !== stepKey)
    ) {
      quiet();
    }
  }, [
    isHearing,
    isReadingAloud,
    isReadingNotes,
    segments.length,
    stepKey,
    spoken,
    say,
    quiet,
    clearLines,
    speech.status,
  ]);

  useEffect(
    () => () => {
      clearLines();
      pepperSpeaker.current?.reset();
    },
    [clearLines],
  );

  // What was written for the step is its own reading, after the step has finished and a short pause, with its own lead-in, so it never runs into the instruction.
  useEffect(() => {
    if (speech.status === 'speaking' && readStepKey.current === stepKey) {
      stepSpokenKey.current = stepKey;
      if (offeredKey.current === stepKey) {
        offeredKey.current = null;
        stepOfferRef.current.commitStepOffer?.();
      }
    }
  }, [speech.status, stepKey]);

  useEffect(() => {
    const queue = notesQueue.current;
    if (queue === null || queue.key !== stepKey || stepKey === null) return;
    if (speech.status !== 'listening' || stepSpokenKey.current !== stepKey) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const current = notesQueue.current;
      if (current === null) return;
      const next = stepCookReading(current, {
        stepKey,
        isOn: isReadingRef.current.isAloud && isReadingRef.current.isNotes,
        openView: openViewRef.current,
      });
      if (next.kind === 'SAY') {
        notesQueue.current = next.queue;
        onShowViewRef.current?.(next.segment.view);
        say(
          next.isFirst
            ? `${NOTES_LEAD} ${next.segment.text}`
            : next.segment.text,
        );
        return;
      }
      notesQueue.current = null;
      if (next.kind === 'FINISH' && next.close !== null) {
        onShowViewRef.current?.(null);
      }
    }, NOTES_PAUSE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [speech.status, stepKey, say]);

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

  const stopVoice = useCallback(() => {
    send({ type: 'STOP' });
    setMessage(null);
  }, [send, setMessage]);

  /** Pepper judged the person done: once its reply has been said, the window closes as if it ran out, so the mic waits for the wake phrase again. Anything heard, a tap or a window reopened before then (a question in that reply, "Hey Pepper") keeps it open. */
  const endAfterReply = useCallback(() => {
    ending.current += 1;
    const mine = ending.current;
    const windowAt = machineRef.current.epoch;
    const settle = () => {
      if (ending.current !== mine) return;
      const queued = lines.current;
      const isSpeaking =
        (pepperRoute.current?.isBusy() ?? false) ||
        queued.active !== null ||
        queued.items.length > 0;
      if (isSpeaking) {
        window.setTimeout(settle, END_POLL_MS);
        return;
      }
      const isAsking = pepperRoute.current?.hasPending() ?? false;
      const { phase: now, epoch } = machineRef.current;
      if (isAsking || now !== 'WINDOW' || epoch !== windowAt) return;
      recordTurn('routed', 'Pepper ended the conversation: back to waiting');
      send({ type: 'WINDOW_ENDED' });
    };
    window.setTimeout(settle, END_POLL_MS);
  }, [send]);

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
    heardWords: heard !== null && heard.key === dictationKey ? heard.text : '',
    isExplainerOpen,
    closeExplainer: () => setIsExplainerOpen(false),
    isSheetOpen,
    openSheet: () => setIsSheetOpen(true),
    closeSheet: () => setIsSheetOpen(false),
    connect,
    connectPepper,
    /** Wakes the cloud voice's server ahead of the first line. */
    warmSpeech: speechSource.warm,
    /** Says a line after the ones before it, resolving once it has been said; `canAnswer` opens a window to answer it without the wake phrase. */
    speakInOrder: sayInOrder,
    endAfterReply,
    cancelSpeech: () => {
      clearLines();
      quiet();
    },
    turnOn,
    toggle,
    stop: stopVoice,
    chooseMode,
    choose,
    isReadingAloud,
    setIsReadingAloud: setReadingAloud,
    /** Reads a step's tips and notes right after the step. */
    isReadingNotes,
    setIsReadingNotes,
    /** How Pepper looks in the orb, saved with the account. */
    look,
    setLook,
    /** Speaks `text` now, whether or not the mic is on. */
    speak: (text: string) => {
      notesQueue.current = null;
      say(text);
    },
    natural,
  };
}

export type CookVoice = ReturnType<typeof useCookVoice>;
