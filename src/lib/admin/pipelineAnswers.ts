import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export interface PipelineAnswerItem {
  question: string;
  choices: string[];
  other: string | null;
  note: string | null;
}

export interface PipelineAnswersForPr {
  prNumber: number;
  items: PipelineAnswerItem[];
}

export interface PipelineAnswerResult {
  prNumber: number;
  ok: boolean;
  url: string | null;
  /** When the comment was posted, in the server's time. */
  postedAt: number | null;
  error: string | null;
}

export const MAX_ANSWER_NOTE = 2000;

const answerPipelineQuestionsCallable = httpsCallable<
  { answers: PipelineAnswersForPr[]; attempt: string },
  { results: PipelineAnswerResult[]; isSample: boolean }
>(functions, 'answerPipelineQuestions', { timeout: 120_000 });

/** Posts each pull request's answers as one comment from the owner; a retry with the same `attempt` never posts twice. */
export async function sendPipelineAnswers(
  answers: PipelineAnswersForPr[],
  attempt: string,
) {
  const result = await answerPipelineQuestionsCallable({ answers, attempt });
  return { results: result.data.results, isSample: result.data.isSample === true };
}
