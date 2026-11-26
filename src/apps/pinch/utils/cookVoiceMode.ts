import {
  createListeningState,
  getListeningCue,
  getListeningEffect,
  getWaitEnd,
  recordBusy,
  reduceListening,
  type BusySpan,
  type ListeningEvent,
  type ListeningMode,
  type ListeningPhase,
  type ListeningState,
  type ListeningStop,
} from '@/lib/speech/listeningMode';
import { readClosingPhrase } from '@/lib/speech/closingPhrase';
import { readWakePhrase } from '@/lib/speech/speechText';
import {
  COOK_LOCK_MS,
  COOK_WAKE_IDLE_MS,
  COOK_WAKE_MAX_MS,
  COOK_WAKE_SPELLINGS,
  COOK_WAKE_TIMER_GRACE_MS,
} from '@apps/pinch/constants';
import {
  readCookCommand,
  type CookVoiceContext,
} from '@apps/pinch/utils/cookVoice';

export type VoiceMode = ListeningMode;
export type VoicePhase = ListeningPhase;
export type VoiceStop = ListeningStop;
export type VoiceState = ListeningState;
export type VoiceEvent = ListeningEvent;
export type WakeBusySpan = BusySpan;

export const createVoiceState = createListeningState;
export const getVoiceEffect = getListeningEffect;
export const getVoiceCue = getListeningCue;

/** One pure step; a step that changes nothing returns the same object. */
export const reduceVoice = (state: VoiceState, event: VoiceEvent) =>
  reduceListening(state, event, { lockMs: COOK_LOCK_MS });

/** When a wait for the phrase ends: after `COOK_WAKE_IDLE_MS` of quiet counted from `enteredAt` but not through busy stretches, and never later than `COOK_WAKE_MAX_MS` after it began. */
export const getWakeWaitEnd = (enteredAt: number, busy: WakeBusySpan[]) =>
  getWaitEnd(enteredAt, busy, {
    idleMs: COOK_WAKE_IDLE_MS,
    maxMs: COOK_WAKE_MAX_MS,
  });

/** The busy stretches of a wait after a look at its timers: a stretch opens when the first one runs and closes when none does, and each ring adds its grace once. */
export const recordWakeBusy = (
  spans: WakeBusySpan[],
  seen: {
    enteredAt: number;
    now: number;
    runningTimers: number;
    lastRingAt: number | null;
  },
) =>
  recordBusy(
    spans,
    {
      enteredAt: seen.enteredAt,
      now: seen.now,
      activeCount: seen.runningTimers,
      lastFinishedAt: seen.lastRingAt,
    },
    { graceMs: COOK_WAKE_TIMER_GRACE_MS },
  );

/** Per guess, what follows the wake phrase, or null; null overall when no guess has it. Any guess can wake it, but what follows keeps its rank, so a lower-ranked "next" never runs. */
export const readWakeWord = (alternatives: string | string[]) =>
  readWakePhrase(alternatives, COOK_WAKE_SPELLINGS);

export type HeardPlan =
  | { kind: 'IGNORE' }
  | { kind: 'CLEAR' }
  | { kind: 'COMMAND'; heard: HeardCommand }
  | { kind: 'WAKE'; heard: HeardCommand | null }
  /** Words that are no command, for Pepper: the guesses best first, none of them empty. */
  | { kind: 'ASK'; guesses: string[] }
  | { kind: 'MISSED' }
  /** "Never mind", "stop talking", "shut up": stop talking and listening, with nothing said back. */
  | { kind: 'DISMISS' };

type HeardCommand = NonNullable<ReturnType<typeof readCookCommand>>;

/** The guesses with words in them, best first; none when the best one that had the phrase said nothing after it, so the phrase alone never asks. */
const toGuesses = (words: (string | null)[]) => {
  const lead = words.find((guess) => guess !== null);
  return (lead ?? '').trim() === ''
    ? []
    : words
        .map((guess) => (guess ?? '').trim())
        .filter((guess) => guess !== '');
};

/** The guesses meant for the app, best first: what follows the wake phrase, or everything said in a window; nothing while waiting without the phrase. */
export const readAddressedGuesses = (
  phase: VoicePhase,
  alternatives: string[],
) => {
  const woke = readWakeWord(alternatives);
  if (woke !== null) return toGuesses(woke.rests);
  return phase === 'WAITING' || phase === 'OFF' ? [] : toGuesses(alternatives);
};

/** A whole phrase that tells the voice to stop, best guess only; a bare "stop" stays the timer's word. */
const isDismissal = (text: string | null | undefined) => {
  const plain = (text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/, '');
  if (plain === '' || plain === 'stop') return false;
  const read = readClosingPhrase(plain);
  return read?.kind === 'dismiss' && read.position === 'whole';
};

/** What a finished phrase means in each phase: waiting hears only the wake phrase (and a command after it), a window runs commands and quotes back anything else, kept open runs commands and ignores the rest. With Pepper on, words that are no command go to it: after the wake phrase in any phase, and anything said in a window. */
export const planHeard = (
  phase: VoicePhase,
  alternatives: string[],
  context: CookVoiceContext,
  isPepperOn = false,
): HeardPlan => {
  if (phase === 'OFF') return { kind: 'IGNORE' };
  const woke = readWakeWord(alternatives);
  if (isDismissal(woke === null ? alternatives[0] : woke.rests[0])) {
    // Waiting and kept open both ignore room talk, so there it takes the wake phrase.
    if (woke !== null || phase === 'WINDOW') return { kind: 'DISMISS' };
    return phase === 'WAITING' ? { kind: 'IGNORE' } : { kind: 'CLEAR' };
  }
  if (phase === 'WAITING') {
    if (woke === null) return { kind: 'IGNORE' };
    const rests = woke.rests.map((guess) => guess ?? '');
    const heard = readCookCommand(rests, context);
    const guesses = toGuesses(woke.rests);
    if (heard === null && isPepperOn && guesses.length > 0) {
      return { kind: 'ASK', guesses };
    }
    return { kind: 'WAKE', heard };
  }
  const heard = readCookCommand(alternatives, context);
  if (heard !== null) return { kind: 'COMMAND', heard };
  if (isPepperOn && woke !== null) {
    const guesses = toGuesses(woke.rests);
    if (guesses.length > 0) return { kind: 'ASK', guesses };
  }
  if (isPepperOn && woke === null && phase === 'WINDOW') {
    const guesses = toGuesses(alternatives);
    if (guesses.length > 0) return { kind: 'ASK', guesses };
  }
  if (phase === 'LOCKED') return { kind: 'CLEAR' };
  return woke === null ? { kind: 'MISSED' } : { kind: 'WAKE', heard: null };
};
