import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export interface PipelineAnswerItem {
  question: string;
  choice: string | null;
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
  error: string | null;
}

export const MAX_ANSWER_NOTE = 2000;

const answerPipelineQuestionsCallable = httpsCallable<
  { answers: PipelineAnswersForPr[] },
  { results: PipelineAnswerResult[] }
>(functions, 'answerPipelineQuestions', { timeout: 120_000 });

/** Posts each pull request's answers as one comment from the owner. */
export async function sendPipelineAnswers(answers: PipelineAnswersForPr[]) {
  const result = await answerPipelineQuestionsCallable({ answers });
  return result.data.results;
}
