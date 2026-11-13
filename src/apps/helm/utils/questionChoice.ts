import type { HelmQuestion, QuestionAnswerValue } from '@apps/helm/types';

export type QuestionChoice = { optionId: string } | { optionIds: string[] };

/** What a heard answer chooses on a question the server settles: one option, several (which topics), or yes or no read as the option it names. Null when the words chose none. */
export function toQuestionChoice(
  question: HelmQuestion,
  value: QuestionAnswerValue | null,
): QuestionChoice | null {
  if (value === null) return null;
  if (value.shape === 'pickSeveral') {
    return question.kind === 'whichTopic'
      ? { optionIds: value.optionIds }
      : null;
  }
  return value.shape === 'pickOne' || value.shape === 'yesNo'
    ? { optionId: value.optionId }
    : null;
}
