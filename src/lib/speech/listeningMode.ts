/**
 * How a microphone is open, as a pure state machine any app can drive with `useSpeechCommands`:
 * OFF (closed), WAITING (open, ignoring everything but a wake phrase), WINDOW (open for commands for a few seconds)
 * and LOCKED (open for commands until a fixed time, no phrase). The caller owns the clocks: it sends `WINDOW_ENDED`,
 * `WAIT_ENDED` and `LOCK_ENDED` when `getWaitEnd`, its window length and `lockEndsAt` say so, and turns the recognizer
 * on or off when `getListeningEffect` says START or STOP.
 */
export type ListeningMode = 'TAP' | 'WAKE';

export type ListeningPhase = 'OFF' | 'WAITING' | 'WINDOW' | 'LOCKED';

export type ListeningStop =
  | 'denied'
  | 'service'
  | 'no-microphone'
  | 'unavailable'
  | 'language'
  | 'wake-idle'
  | 'lock-ended';

export interface ListeningState {
  mode: ListeningMode;
  phase: ListeningPhase;
  /** Changes each time a command window opens or is extended, so its timer starts over. */
  epoch: number;
  lockEndsAt: number | null;
  stopped: ListeningStop | null;
}

export type ListeningEvent =
  | { type: 'TAP_MIC' }
  /** `at` is the time of the tap, so the reduction stays pure. */
  | { type: 'CHOOSE'; choice: ListeningMode | 'LOCK'; at: number }
  /** Remembers how to listen without turning the mic on. */
  | { type: 'MODE'; mode: ListeningMode }
  | { type: 'WAKE_HEARD' }
  | { type: 'COMMAND_HEARD' }
  | { type: 'WINDOW_ENDED' }
  | { type: 'WAIT_ENDED' }
  | { type: 'LOCK_ENDED' }
  | { type: 'STOP' }
  | { type: 'ENGINE_STOPPED'; reason: ListeningStop };

export interface ListeningConfig {
  /** How long a kept-open mic stays open. */
  lockMs: number;
}

export const createListeningState = (mode: ListeningMode): ListeningState => ({
  mode,
  phase: 'OFF',
  epoch: 0,
  lockEndsAt: null,
  stopped: null,
});

const turnOff = (
  state: ListeningState,
  stopped: ListeningStop | null = null,
) => ({
  ...state,
  phase: 'OFF' as const,
  lockEndsAt: null,
  stopped,
});

const openWindow = (state: ListeningState): ListeningState => ({
  ...state,
  phase: 'WINDOW',
  epoch: state.epoch + 1,
  lockEndsAt: null,
  stopped: null,
});

const startWaiting = (state: ListeningState): ListeningState => ({
  ...state,
  phase: 'WAITING',
  lockEndsAt: null,
  stopped: null,
});

const closeWindow = (state: ListeningState) =>
  state.mode === 'WAKE' ? startWaiting(state) : turnOff(state);

const setMode = (
  state: ListeningState,
  mode: ListeningMode,
): ListeningState => {
  const next = state.mode === mode ? state : { ...state, mode };
  if (mode === 'TAP') {
    return state.phase === 'WAITING' || state.phase === 'LOCKED'
      ? turnOff(next)
      : next;
  }
  return state.phase === 'LOCKED' ? startWaiting(next) : next;
};

const choose = (
  state: ListeningState,
  choice: ListeningMode | 'LOCK',
  at: number,
  config: ListeningConfig,
): ListeningState => {
  if (choice === 'LOCK') {
    if (state.phase === 'LOCKED') return state;
    return {
      ...state,
      phase: 'LOCKED',
      lockEndsAt: at + config.lockMs,
      stopped: null,
    };
  }
  if (choice === 'WAKE' && state.phase === 'OFF') {
    return startWaiting({ ...state, mode: 'WAKE' });
  }
  return setMode(state, choice);
};

const tapMic = (state: ListeningState): ListeningState => {
  if (state.phase === 'OFF') return openWindow(state);
  if (state.phase === 'WINDOW') return closeWindow(state);
  return turnOff(state);
};

/** One pure reduction; one that changes nothing returns the same object. */
export const reduceListening = (
  state: ListeningState,
  event: ListeningEvent,
  config: ListeningConfig,
): ListeningState => {
  switch (event.type) {
    case 'TAP_MIC':
      return tapMic(state);
    case 'CHOOSE':
      return choose(state, event.choice, event.at, config);
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

/** A stretch of a wait for the phrase when the idle clock stands still: something is busy (`to` null while it is) or its grace after it finished. */
export interface BusySpan {
  from: number;
  to: number | null;
}

export interface WaitConfig {
  /** Quiet time after which a wait ends. */
  idleMs: number;
  /** A wait never lasts longer than this, whatever is busy. */
  maxMs: number;
}

/** When a wait for the phrase ends: after `idleMs` of quiet counted from `enteredAt` but not through busy stretches, and never later than `maxMs` after it began. */
export const getWaitEnd = (
  enteredAt: number,
  busy: BusySpan[],
  { idleMs, maxMs }: WaitConfig,
) => {
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
    { cursor: enteredAt, left: idleMs, end: null },
  );
  const end = counted.end ?? counted.cursor + counted.left;
  const result = Math.min(end, enteredAt + maxMs);
  return result;
};

/** The busy stretches of a wait after a look at what is going on: a stretch opens when the first thing is active and closes when none is, and each finish adds its grace once. */
export const recordBusy = (
  spans: BusySpan[],
  seen: {
    enteredAt: number;
    now: number;
    activeCount: number;
    lastFinishedAt: number | null;
  },
  { graceMs }: { graceMs: number },
) => {
  const hasOpen = spans.some((span) => span.to === null);
  const afterActive =
    seen.activeCount > 0
      ? hasOpen
        ? spans
        : [...spans, { from: seen.now, to: null }]
      : spans.map((span) =>
          span.to === null ? { ...span, to: seen.now } : span,
        );
  const isNewFinish =
    seen.lastFinishedAt !== null &&
    seen.lastFinishedAt >= seen.enteredAt &&
    !afterActive.some((span) => span.from === seen.lastFinishedAt);
  const result =
    isNewFinish && seen.lastFinishedAt !== null
      ? [
          ...afterActive,
          {
            from: seen.lastFinishedAt,
            to: seen.lastFinishedAt + graceMs,
          },
        ]
      : afterActive;
  return result;
};

/** START when the mic opens, STOP when it closes. */
export const getListeningEffect = (
  previous: ListeningState,
  next: ListeningState,
): 'START' | 'STOP' | null => {
  if (previous.phase === 'OFF' && next.phase !== 'OFF') return 'START';
  if (previous.phase !== 'OFF' && next.phase === 'OFF') return 'STOP';
  return null;
};


/** Which cue goes with a change of phase: a rising chime when the mic opens for commands or starts waiting, none when a window closes, a wait runs out, the mic is turned off or a failure stops it. */
export const getListeningCue = (
  previous: ListeningState,
  next: ListeningState,
): 'start' | null => {
  if (previous.phase === next.phase) return null;
  if (next.phase === 'OFF') return null;
  if (previous.phase === 'WINDOW' && next.phase === 'WAITING') return null;
  return 'start';
};
