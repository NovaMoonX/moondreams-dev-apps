import {
  mentionsQuietName,
  readPrivacyFacts,
  type PrivacyFacts,
} from '../privacy.js';
import { getDayIn, toKnownZone } from './spoken.js';

/** The calendar day an instant falls on in the person's zone, as YYYY-MM-DD. */
export const toDayKey = (at: number, timeZone: string) =>
  new Date(getDayIn(at, toKnownZone(timeZone))).toISOString().slice(0, 10);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** What an opened record says about being private and quiet. */
export const readQuietFacts = (sealed: Record<string, unknown>): PrivacyFacts =>
  readPrivacyFacts({
    privateMark:
      sealed.privateMark === 'health' ||
      sealed.privateMark === 'care' ||
      sealed.privateMark === 'person'
        ? sealed.privateMark
        : null,
    isPrivacyCleared: sealed.isPrivacyCleared === true,
    quietMark:
      sealed.quietMark === 'person' || sealed.quietMark === 'guessed'
        ? sealed.quietMark
        : null,
    quietUntil:
      typeof sealed.quietUntil === 'string' && DAY_RE.test(sealed.quietUntil)
        ? sealed.quietUntil
        : null,
    isQuietCleared: sealed.isQuietCleared === true,
  });

export type QuietKind = 'task' | 'project' | 'note';

/** The same key shape an answer's source records use. */
export const toQuietKey = (kind: QuietKind, id: string) => `${kind}:${id}`;

/** The quiet things of a turn: their source keys and the names a spoken line must not carry. */
export interface QuietIndex {
  keys: Set<string>;
  names: string[];
  /** Some quiet marks could not be read, so nothing can be said to be not quiet. */
  isUnknown: boolean;
  /** A tool read the words of something under a quiet project this turn. */
  isRead: boolean;
}

export const buildQuietIndex = (
  things: { kind: QuietKind; id: string; name: string; isQuiet: boolean }[],
  isUnknown = false,
): QuietIndex => {
  const quiet = things.filter((thing) => thing.isQuiet);
  return {
    keys: new Set(quiet.map((thing) => toQuietKey(thing.kind, thing.id))),
    names: [...new Set(quiet.map((thing) => thing.name))],
    isUnknown,
    isRead: false,
  };
};

/** Whether a turn must speak only the screen line: a quiet command was sent, an effect touched a quiet record, an answer rests on a quiet record, any line names a quiet thing, or the model said its words would give a secret away. */
export const isQuietTurn = (input: {
  index: QuietIndex;
  hasQuietCommand: boolean;
  touchesQuiet: boolean;
  keepQuiet: boolean;
  /** The keys of the records the turn's answer rests on, and the connections it quoted. */
  sourceKeys: readonly string[];
  texts: readonly (string | null | undefined)[];
}) =>
  input.hasQuietCommand ||
  input.touchesQuiet ||
  input.keepQuiet ||
  input.index.isUnknown ||
  input.index.isRead ||
  input.sourceKeys.some((key) => input.index.keys.has(key)) ||
  input.texts.some(
    (text) =>
      typeof text === 'string' && mentionsQuietName(text, input.index.names),
  );
