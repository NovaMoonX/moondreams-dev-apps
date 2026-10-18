import { COOK_LOCK_MS, COOK_WAKE_SPELLINGS } from '@apps/pinch/constants';
import { toPlainText } from '@apps/pinch/utils/cookVoice';

/** How the mic is meant to be used when it is on: one command window per tap, or waiting for the wake phrase. */
export type VoiceMode = 'TAP' | 'WAKE';

/** OFF: the mic is closed. WAITING: open, ignoring everything but the wake phrase. WINDOW: open for commands for a few seconds. LOCKED: open for commands until a fixed time, no wake phrase. */
export type VoicePhase = 'OFF' | 'WAITING' | 'WINDOW' | 'LOCKED';

/** Why voice turned itself off: what the recognizer reported, or a time that ran out. */
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
  /** Counts the times a command window opened or was extended, so its timer and its draining bar start over. */
  epoch: number;
  /** When the lock ends: set exactly while the phase is LOCKED. */
  lockEndsAt: number | null;
  /** Why the last session ended on its own, until the mic is on again. */
  stopped: VoiceStop | null;
}

export type VoiceEvent =
  /** The mic button. */
  | { type: 'TAP_MIC' }
  /** A row in the voice sheet: "Tap to talk", "Say Hey Pinch" or "Keep listening". `at` is the time of the tap. */
  | { type: 'CHOOSE'; choice: VoiceMode | 'LOCK'; at: number }
  /** The pills in the first-use sheet: remembers how to listen without turning the mic on. */
  | { type: 'MODE'; mode: VoiceMode }
  | { type: 'WAKE_HEARD' }
  | { type: 'COMMAND_HEARD' }
  | { type: 'WINDOW_ENDED' }
  | { type: 'WAIT_ENDED' }
  | { type: 'LOCK_ENDED' }
  /** "Stop listening", Finish, leaving. */
  | { type: 'STOP' }
  /** The recognizer stopped by itself (a refused microphone, a speech service that kept failing). */
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

/** What each event does to the mic, as one pure step: the screen only carries out the change of phase (`getVoiceEffect`). A step that changes nothing returns the same object. */
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

/** What the screen has to do with the recognizer after a step: start it when the mic opens, stop it when it closes. */
export const getVoiceEffect = (
  previous: VoiceState,
  next: VoiceState,
): 'START' | 'STOP' | null => {
  if (previous.phase === 'OFF' && next.phase !== 'OFF') return 'START';
  if (previous.phase !== 'OFF' && next.phase === 'OFF') return 'STOP';
  return null;
};

/** Whether a phase is one where the person's commands run: not while the mic only waits for the wake phrase. */
export const isTakingCommands = (phase: VoicePhase) =>
  phase === 'WINDOW' || phase === 'LOCKED';

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

/** What follows the wake phrase when a guess starts with it (after up to two "um"/"okay"s), "" when nothing does, and null when it doesn't start with it: "add a pinch of salt", "okay, pinch the edges" and "hey, pinch of salt" never wake it. */
const readWakeRest = (guess: string): string | null => {
  const text = dropFillers(toPlainText(guess));
  const spelling = COOK_WAKE_SPELLINGS.find(
    (candidate) => text === candidate || text.startsWith(`${candidate} `),
  );
  if (spelling === undefined) return null;
  const rest = text.slice(spelling.length).trim();
  return rest === 'of' || rest.startsWith('of ') ? null : rest;
};

/** The wake phrase in a finished phrase's guesses (best first): for each guess what follows it, or null where that guess has no wake phrase; null overall when none does. Any guess can wake it (waking costs a few seconds of listening and nothing else), but what follows keeps its rank, so a lower-ranked "next" is still never a command. */
export const readWakeWord = (
  alternatives: string | string[],
): { rests: (string | null)[] } | null => {
  const guesses =
    typeof alternatives === 'string' ? [alternatives] : alternatives;
  const rests = guesses.map(readWakeRest);
  return rests.some((rest) => rest !== null) ? { rests } : null;
};
