import { toComparable } from '@/utils/optionMatchUtils';
import type { HelmQuestion, QuestionAnswerValue } from '@apps/helm/types';

const MAX_SPOKEN_NAME_WORDS = 4;

export type QuestionChoice =
  { optionId: string; newName?: string } | { optionIds: string[] };

/** What a heard answer chooses on a question the server settles: one option, several (which topics, which siblings), or yes or no read as the option it names. Null when the words chose none. */
export function toQuestionChoice(
  question: HelmQuestion,
  value: QuestionAnswerValue | null,
): QuestionChoice | null {
  if (value === null) return null;
  if (value.shape === 'pickSeveral') {
    return question.kind === 'whichTopic' || question.kind === 'kinOrder'
      ? { optionIds: value.optionIds }
      : null;
  }
  if (value.shape === 'pickRecord') {
    if (question.kind !== 'whichKin') return null;
    return value.newName !== null
      ? { optionId: 'new', newName: value.newName }
      : value.ref
        ? { optionId: value.ref.id }
        : null;
  }
  return value.shape === 'pickOne' || value.shape === 'yesNo'
    ? { optionId: value.optionId }
    : null;
}

const SPOKEN_LEAD =
  /^(it'?s|it is|that'?s|their name is|his name is|her name is|add|called)\s+/i;

/** What a spoken name answers to "Who's your brother?": the one person it names, or a new person with those words as the name; null when the words are no short name or name two people. */
export function toKinSearchChoice(
  question: HelmQuestion,
  text: string,
  people: {
    id: string;
    name: string;
    aliases: string[];
    isSelf: boolean;
    isUnreadable: boolean;
  }[],
): QuestionChoice | null {
  if (question.kind !== 'whichKin' || question.shape !== 'pickRecord') {
    return null;
  }
  const words = text
    .trim()
    .replace(SPOKEN_LEAD, '')
    .replace(/[.!?]+$/, '')
    .trim();
  if (words === '' || words.split(/\s+/).length > MAX_SPOKEN_NAME_WORDS) {
    return null;
  }
  const wanted = toComparable(words);
  const hits = people.filter(
    (person) =>
      !person.isSelf &&
      !person.isUnreadable &&
      [person.name, ...person.aliases].some(
        (name) => toComparable(name) === wanted,
      ),
  );
  if (hits.length > 1) return null;
  return hits.length === 1
    ? { optionId: hits[0].id }
    : { optionId: 'new', newName: words };
}
