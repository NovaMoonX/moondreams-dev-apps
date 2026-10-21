import {
  COOK_LOCK_MS,
  COOK_WAKE_IDLE_MS,
  COOK_WAKE_MAX_MS,
  COOK_WAKE_SPELLINGS,
  COOK_WAKE_TIMER_GRACE_MS,
} from '@apps/pinch/constants';
import {
  readCookCommand,
  toPlainText,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';

export type VoiceMode = 'TAP' | 'WAKE';

/** OFF: the mic is closed. WAITING: open, ignoring everything but the wake phrase. WINDOW: open for commands for a few seconds. LOCKED: open for commands until a fixed time, no wake phrase. */
export type VoicePhase = 'OFF' | 'WAITING' | 'WINDOW' | 'LOCKED';

export type VoiceStop =
  | 'denied'
  | 'service'
  | 'no-microphone'
  | 'unavailable'
  | 'language'
  | 'wake-idle'
  | 'lock-ended';

export interface VoiceState {
  mode: VoiceMode;
  phase: VoicePhase;
  /** Changes each time a command window opens or is extended, so its timer starts over. */
  epoch: number;
  lockEndsAt: number | null;
  stopped: VoiceStop | null;
}

export type VoiceEvent =
  | { type: 'TAP_MIC' }
  /** `at` is the time of the tap, so the step stays pure. */
  | { type: 'CHOOSE'; choice: VoiceMode | 'LOCK'; at: number }
  /** Remembers how to listen without turning the mic on. */
  | { type: 'MODE'; mode: VoiceMode }
  | { type: 'WAKE_HEARD' }
  | { type: 'COMMAND_HEARD' }
  | { type: 'WINDOW_ENDED' }
  | { type: 'WAIT_ENDED' }
  | { type: 'LOCK_ENDED' }
  | { type: 'STOP' }
  | { type: 'ENGINE_STOPPED'; reason: VoiceStop };

export const createVoiceState = (mode: VoiceMode): VoiceState => ({
  mode,
  phase: 'OFF',
  epoch: 0,
  lockEndsAt: null,
  stopped: null,
});

const turnOff = (state: VoiceState, stopped: VoiceStop | null = null) => ({
  ...state,
  phase: 'OFF' as const,
  lockEndsAt: null,
  stopped,
});

const openWindow = (state: VoiceState): VoiceState => ({
  ...state,
  phase: 'WINDOW',
  epoch: state.epoch + 1,
  lockEndsAt: null,
  stopped: null,
});

const startWaiting = (state: VoiceState): VoiceState => ({
  ...state,
  phase: 'WAITING',
  lockEndsAt: null,
  stopped: null,
});

const closeWindow = (state: VoiceState) =>
  state.mode === 'WAKE' ? startWaiting(state) : turnOff(state);

const setMode = (state: VoiceState, mode: VoiceMode): VoiceState => {
  const next = state.mode === mode ? state : { ...state, mode };
  if (mode === 'TAP') {
    return state.phase === 'WAITING' || state.phase === 'LOCKED'
      ? turnOff(next)
      : next;
  }
  return state.phase === 'LOCKED' ? startWaiting(next) : next;
};

const choose = (
  state: VoiceState,
  choice: VoiceMode | 'LOCK',
  at: number,
): VoiceState => {
  if (choice === 'LOCK') {
    if (state.phase === 'LOCKED') return state;
    return {
      ...state,
      phase: 'LOCKED',
      lockEndsAt: at + COOK_LOCK_MS,
      stopped: null,
    };
  }
  if (choice === 'WAKE' && state.phase === 'OFF') {
    return startWaiting({ ...state, mode: 'WAKE' });
  }
  return setMode(state, choice);
};

const tapMic = (state: VoiceState): VoiceState => {
  if (state.phase === 'OFF') return openWindow(state);
  if (state.phase === 'WINDOW') return closeWindow(state);
  return turnOff(state);
};

/** One pure step; a step that changes nothing returns the same object. */
export const reduceVoice = (
  state: VoiceState,
  event: VoiceEvent,
): VoiceState => {
  switch (event.type) {
    case 'TAP_MIC':
      return tapMic(state);
    case 'CHOOSE':
      return choose(state, event.choice, event.at);
    case 'MODE':
      return setMode(state, event.mode);
    case 'WAKE_HEARD':
      return state.phase === 'WAITING' || state.phase === 'WINDOW'
        ? openWindow(state)
        : state;
    case 'COMMAND_HEARD':
      return state.phase === 'WINDOW' ? openWindow(state) : state;
    case 'WINDOW_ENDED':
      return state.phase === 'WINDOW' ? closeWindow(state) : state;
    case 'WAIT_ENDED':
      return state.phase === 'WAITING' ? turnOff(state, 'wake-idle') : state;
    case 'LOCK_ENDED':
      return state.phase === 'LOCKED' ? turnOff(state, 'lock-ended') : state;
    case 'STOP':
      return state.phase === 'OFF' ? state : turnOff(state);
    case 'ENGINE_STOPPED':
      return state.phase === 'OFF' ? state : turnOff(state, event.reason);
  }
};

/** A stretch of a wait for the phrase when the idle clock stands still: a timer running (`to` null while it does) or the grace after one rang. */
export interface WakeBusySpan {
  from: number;
  to: number | null;
}

/** When a wait for the phrase ends: after `COOK_WAKE_IDLE_MS` of quiet counted from `enteredAt` but not through busy stretches, and never later than `COOK_WAKE_MAX_MS` after it began. */
export const getWakeWaitEnd = (enteredAt: number, busy: WakeBusySpan[]) => {
  const ordered = busy
    .map((span) => ({
      from: Math.max(span.from, enteredAt),
      to: span.to ?? Infinity,
    }))
    .sort((a, b) => a.from - b.from);
  const counted = ordered.reduce<{
    cursor: number;
    left: number;
    end: number | null;
  }>(
    (acc, span) => {
      if (acc.end !== null) return acc;
      const quiet = Math.max(0, span.from - acc.cursor);
      return quiet >= acc.left
        ? { ...acc, end: acc.cursor + acc.left }
        : {
            cursor: Math.max(acc.cursor, span.to),
            left: acc.left - quiet,
            end: null,
          };
    },
    { cursor: enteredAt, left: COOK_WAKE_IDLE_MS, end: null },
  );
  const end = counted.end ?? counted.cursor + counted.left;
  const result = Math.min(end, enteredAt + COOK_WAKE_MAX_MS);
  return result;
};

/** The busy stretches of a wait after a look at its timers: a stretch opens when the first one runs and closes when none does, and each ring adds its grace once. */
export const recordWakeBusy = (
  spans: WakeBusySpan[],
  seen: {
    enteredAt: number;
    now: number;
    runningTimers: number;
    lastRingAt: number | null;
  },
) => {
  const hasOpen = spans.some((span) => span.to === null);
  const afterRunning =
    seen.runningTimers > 0
      ? hasOpen
        ? spans
        : [...spans, { from: seen.now, to: null }]
      : spans.map((span) =>
          span.to === null ? { ...span, to: seen.now } : span,
        );
  const isNewRing =
    seen.lastRingAt !== null &&
    seen.lastRingAt >= seen.enteredAt &&
    !afterRunning.some((span) => span.from === seen.lastRingAt);
  const result =
    isNewRing && seen.lastRingAt !== null
      ? [
          ...afterRunning,
          {
            from: seen.lastRingAt,
            to: seen.lastRingAt + COOK_WAKE_TIMER_GRACE_MS,
          },
        ]
      : afterRunning;
  return result;
};

/** START when the mic opens, STOP when it closes. */
export const getVoiceEffect = (
  previous: VoiceState,
  next: VoiceState,
): 'START' | 'STOP' | null => {
  if (previous.phase === 'OFF' && next.phase !== 'OFF') return 'START';
  if (previous.phase !== 'OFF' && next.phase === 'OFF') return 'STOP';
  return null;
};

const WAKE_FILLERS = new Set([
  'um',
  'uh',
  'er',
  'hm',
  'hmm',
  'so',
  'ok',
  'okay',
  'well',
  'alright',
]);
const MAX_WAKE_FILLERS = 2;

const dropFillers = (text: string) => {
  const words = text.split(' ');
  const firstOther = words.findIndex((word) => !WAKE_FILLERS.has(word));
  const skipped = Math.min(
    firstOther === -1 ? words.length : firstOther,
    MAX_WAKE_FILLERS,
  );
  return words.slice(skipped).join(' ');
};

/** What follows the wake phrase at the start of a guess ("" when nothing does), or null: "add a pinch of salt" and "hey, pinch of salt" never wake it. */
const readWakeRest = (guess: string): string | null => {
  const text = dropFillers(toPlainText(guess));
  const spelling = COOK_WAKE_SPELLINGS.find(
    (candidate) => text === candidate || text.startsWith(`${candidate} `),
  );
  if (spelling === undefined) return null;
  const rest = text.slice(spelling.length).trim();
  return rest === 'of' || rest.startsWith('of ') ? null : rest;
};

/** Per guess, what follows the wake phrase, or null; null overall when no guess has it. Any guess can wake it, but what follows keeps its rank, so a lower-ranked "next" never runs. */
export const readWakeWord = (
  alternatives: string | string[],
): { rests: (string | null)[] } | null => {
  const guesses =
    typeof alternatives === 'string' ? [alternatives] : alternatives;
  const rests = guesses.map(readWakeRest);
  return rests.some((rest) => rest !== null) ? { rests } : null;
};

export type HeardPlan =
  | { kind: 'IGNORE' }
  | { kind: 'CLEAR' }
  | { kind: 'COMMAND'; heard: HeardCommand }
  | { kind: 'WAKE'; heard: HeardCommand | null }
  | { kind: 'MISSED' };

type HeardCommand = NonNullable<ReturnType<typeof readCookCommand>>;

/** What a finished phrase means in each phase: waiting hears only the wake phrase (and a command after it), a window runs commands and quotes back anything else, kept open runs commands and ignores the rest. */
export const planHeard = (
  phase: VoicePhase,
  alternatives: string[],
  context: CookVoiceContext,
): HeardPlan => {
  if (phase === 'OFF') return { kind: 'IGNORE' };
  const woke = readWakeWord(alternatives);
  if (phase === 'WAITING') {
    if (woke === null) return { kind: 'IGNORE' };
    const heard = readCookCommand(
      woke.rests.map((guess) => guess ?? ''),
      context,
    );
    return { kind: 'WAKE', heard };
  }
  const heard = readCookCommand(alternatives, context);
  if (heard !== null) return { kind: 'COMMAND', heard };
  if (phase === 'LOCKED') return { kind: 'CLEAR' };
  return woke === null ? { kind: 'MISSED' } : { kind: 'WAKE', heard: null };
};
