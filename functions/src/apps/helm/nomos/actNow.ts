import { toComparable } from '../../../vendor/optionMatchUtils.js';
import { OBSERVATION_TAGS, type ObservationTag } from './said.js';

/** What a turn that says it is learning must never promise when learning is off; read as whole words, whatever the case. */
export const WATCHING_PHRASES = [
  'keep an eye',
  'watch for',
  "i'll notice",
  'noted',
] as const;

export const TURN_INTENTS = ['question', 'request', 'remark'] as const;

export type TurnIntent = (typeof TURN_INTENTS)[number];

export type ActNow = 'act' | 'note' | 'answered';

export type CaptureDisposition = 'acted' | 'noted' | 'answered';

export const toDisposition = (outcome: ActNow): CaptureDisposition =>
  outcome === 'act' ? 'acted' : outcome === 'note' ? 'noted' : 'answered';

export const OBSERVATION_KINDS = [
  'feeling',
  'reason',
  'outcome',
  'answer',
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export const MAX_OBSERVATIONS_PER_TURN = 3;
export const OBSERVATION_QUOTE_CAP = 200;

const WITHIN_MS = 2 * 86_400_000;

/** Whether a due or a start falls within two days of now, either way. */
export const isWithin48h = (at: number | null, now: number) =>
  at !== null && Math.abs(at - now) <= WITHIN_MS;

export interface ActSubject {
  isWithin48h: boolean;
  isCare: boolean;
}

/** A question answered stays answered; a plain request acts; a remark acts only when it touches something within 48 hours and no care item beyond that, and otherwise only what it said is kept. */
export function readActNow(input: {
  intent: TurnIntent;
  commands: { kind: string }[];
  subjects: ActSubject[];
}): ActNow {
  if (
    input.intent === 'question' ||
    input.commands.some((command) => command.kind === 'answer')
  )
    return 'answered';
  if (input.intent === 'request') return 'act';
  const hasConcrete = input.commands.some(
    (command) => command.kind !== 'remember',
  );
  return hasConcrete &&
    input.subjects.some((subject) => subject.isWithin48h) &&
    input.subjects.every((subject) => !subject.isCare || subject.isWithin48h)
    ? 'act'
    : 'note';
}

export const readTurnIntent = (
  value: unknown,
  hasAnswer: boolean,
): TurnIntent =>
  TURN_INTENTS.find((intent) => intent === value) ??
  (hasAnswer ? 'question' : 'request');

export interface ObservationRead {
  subject: {
    collection: 'habits' | 'projects' | 'tasks' | 'day';
    id: string | null;
  };
  kind: ObservationKind;
  tags: ObservationTag[];
  quote: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** What the model said it noticed, kept only when learning is on, its quote is in the turn's own words and its tags are in the closed list; an alias that names nothing is about the day. */
export function readObservations(
  value: unknown,
  context: {
    isLearningOn: boolean;
    turnText: string;
    resolve: (alias: string) => ObservationRead['subject'] | null;
  },
): ObservationRead[] {
  if (!context.isLearningOn || !Array.isArray(value)) return [];
  const said = toComparable(context.turnText);
  return value
    .filter(isRecord)
    .flatMap((item): ObservationRead[] => {
      const quote =
        typeof item.quote === 'string'
          ? item.quote.replace(/\s+/g, ' ').trim()
          : '';
      const kind = OBSERVATION_KINDS.find((entry) => entry === item.kind);
      const tags = [
        ...new Set(
          (Array.isArray(item.tags) ? item.tags : []).filter(
            (tag): tag is ObservationTag =>
              OBSERVATION_TAGS.some((known) => known === tag),
          ),
        ),
      ].slice(0, 3);
      if (
        !kind ||
        tags.length === 0 ||
        quote === '' ||
        quote.length > OBSERVATION_QUOTE_CAP ||
        !said.includes(toComparable(quote))
      )
        return [];
      const subject =
        typeof item.aboutAlias === 'string'
          ? context.resolve(item.aboutAlias)
          : null;
      return [
        {
          subject: subject ?? { collection: 'day', id: null },
          kind,
          tags,
          quote,
        },
      ];
    })
    .slice(0, MAX_OBSERVATIONS_PER_TURN);
}

const isWatching = (sentence: string) => {
  const plain = sentence.toLowerCase().replace(/[’‘]/g, "'");
  return WATCHING_PHRASES.some((phrase) =>
    new RegExp(`(^|[^\\p{L}])${phrase}($|[^\\p{L}])`, 'u').test(plain),
  );
};

/** The text without any sentence that says it is keeping watch; null when nothing is left. */
export const withoutWatchingPhrases = (text: string | null) => {
  if (text === null) return null;
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !isWatching(sentence))
    .join(' ')
    .trim();
  return kept === '' ? null : kept;
};
