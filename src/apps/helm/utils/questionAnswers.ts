import {
  readSpokenAnswer,
  type SpokenQuestion,
} from '@/lib/speech/readSpokenAnswer';
import { formatCents } from '@/utils/moneyUtils';
import { parseNaturalDate } from '@/utils/naturalDateUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { HelmQuestion, QuestionAnswerValue } from '@apps/helm/types';
import { getClockOf, getDueDay } from '@apps/helm/utils/captureReading';

export type SpokenAnswer =
  { kind: 'skip' } | { kind: 'answer'; value: QuestionAnswerValue };

const NEW_NAMES = ['someone new', 'new', 'a new one', 'new one', 'new person'];
const NONE_NAMES = ["don't link anyone", "don't link"];

const toSpokenQuestion = (question: HelmQuestion): SpokenQuestion => ({
  shape: question.shape,
  options: question.options.map((option) => ({
    id: option.id,
    label: option.label,
    detail: option.detail,
    aliases:
      option.id === 'new'
        ? NEW_NAMES
        : option.id === 'none'
          ? NONE_NAMES
          : undefined,
    isClosing: option.id === 'new' || option.id === 'none',
  })),
  noneOptionId: question.options.some((option) => option.id === 'none')
    ? 'none'
    : null,
  allowsSomethingElse: question.allowsSomethingElse,
  number: question.number,
  dateMode: question.dateMode,
});

const DATE_LEAD_WORDS = new Set(
  'on at by for the its it s is please maybe um uh around about till until'.split(
    ' ',
  ),
);

const toDateReader =
  (context: { now: number; timeZone: string }) => (text: string) => {
    const [first] = parseNaturalDate(text, context);
    if (!first) return null;
    const leftover = `${text.slice(0, first.start)} ${text.slice(first.end)}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word !== '' && !DATE_LEAD_WORDS.has(word));
    if (leftover.length > 0) return null;
    return first.due.kind === 'day'
      ? { date: first.due.date, time: null }
      : {
          date: getDueDay(first.due, context.timeZone),
          time: getClockOf(first.due.at, context.timeZone),
        };
  };

/** What a spoken answer says to an open question, as the value a tap would have written: an option, several, yes or no, words, a number, a day or time, a person or place, or Skip. A reply that is not clearly one of them is `null`, so it goes on as a turn. */
export function matchSpokenAnswer(
  text: string,
  question: HelmQuestion,
  context: { now: number; timeZone: string },
): SpokenAnswer | null {
  const read = readSpokenAnswer(toSpokenQuestion(question), text, {
    readDate: toDateReader(context),
  });
  if (read === null || read.kind === 'skip') return read;
  const { value } = read;
  if (value.shape === 'pickSeveral') {
    return { kind: 'answer', value: { ...value, otherText: null } };
  }
  if (value.shape !== 'pickRecord') return { kind: 'answer', value };
  const option = question.options.find((entry) => entry.id === value.optionId);
  // A new name can't be heard as an option, so the words go on as a turn.
  return option?.ref?.collection === 'who' ||
    option?.ref?.collection === 'places'
    ? {
        kind: 'answer',
        value: { shape: 'pickRecord', ref: option.ref, newName: null },
      }
    : null;
}

const joinLabels = (labels: string[]) =>
  labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;

const formatDay = (date: number) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));

const formatClock = (time: string) =>
  new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString(undefined, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  });

/** An answer in the words the turn that carries it seals ("Picked Snow chains and Sunscreen", "4 nights", "Friday, Nov 13"); `recordName` is the chosen person's or place's name when it is not one of the question's options. */
export function describeAnswer(
  question: HelmQuestion,
  value: QuestionAnswerValue,
  recordName: string | null = null,
): string {
  const labelOf = (id: string) =>
    question.options.find((option) => option.id === id)?.label ?? id;
  if (value.shape === 'yesNo') return labelOf(value.optionId);
  if (value.shape === 'pickOne') {
    return value.otherText ?? HELM_COPY.answerPicked(labelOf(value.optionId));
  }
  if (value.shape === 'pickSeveral') {
    return value.optionIds.includes('none')
      ? HELM_COPY.answerNone
      : HELM_COPY.answerPicked(
          joinLabels([
            ...value.optionIds.map(labelOf),
            ...(value.otherText ? [value.otherText] : []),
          ]),
        );
  }
  if (value.shape === 'freeText') return value.text;
  if (value.shape === 'number') {
    const { unit, isMoney } = question.number ?? {
      unit: null,
      isMoney: false,
    };
    if (isMoney) return formatCents(value.value);
    return unit ? `${value.value} ${unit}` : String(value.value);
  }
  if (value.shape === 'dateTime') {
    return value.date !== null && value.time !== null
      ? HELM_COPY.answerAt(formatDay(value.date), formatClock(value.time))
      : value.date !== null
        ? formatDay(value.date)
        : formatClock(value.time ?? '00:00');
  }
  if (value.newName !== null) {
    return question.recordKinds[0] === 'place'
      ? HELM_COPY.answerNewPlace(value.newName)
      : HELM_COPY.answerSomeoneNew(value.newName);
  }
  const chosen = question.options.find(
    (option) =>
      option.ref?.id === value.ref?.id &&
      option.ref?.collection === value.ref?.collection,
  );
  return recordName ?? chosen?.label ?? '';
}

/** The line a turn's card keeps after the question is answered ("You picked Snow chains and Sunscreen"). */
export function describeYourAnswer(
  question: HelmQuestion,
  value: QuestionAnswerValue,
  recordName: string | null = null,
): string {
  const words = describeAnswer(question, value, recordName);
  if (value.shape === 'freeText') return HELM_COPY.answerYouWrote(words);
  if (value.shape === 'yesNo') return HELM_COPY.answerYouSaid(words);
  if (value.shape === 'number' || value.shape === 'dateTime') {
    return HELM_COPY.answerYouAnswered(words);
  }
  if (
    (value.shape === 'pickSeveral' && value.optionIds.includes('none')) ||
    (value.shape === 'pickOne' && value.otherText !== null) ||
    (value.shape === 'pickRecord' && value.newName !== null)
  ) {
    return HELM_COPY.answerYouAnswered(words);
  }
  return HELM_COPY.answerYouPicked(words.replace(/^Picked /, ''));
}
