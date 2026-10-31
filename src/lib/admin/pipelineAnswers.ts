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
  /** The asks these answer, so the dashboard stops counting them. */
  marks: string[];
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

export interface PipelineSettleRequest {
  prNumber: number | null;
  sessionId: string | null;
  text: string;
  outcome: 'done' | 'skipped' | 'open';
}

const settlePipelineAskCallable = httpsCallable<
  PipelineSettleRequest,
  { ok: boolean; error: string | null; at: number | null }
>(functions, 'settlePipelineAsk', { timeout: 60_000 });

/** Ticks off, sets aside or reopens one ask: in its status comment on GitHub when it has one, and for the dashboard. */
export async function settlePipelineAsk(request: PipelineSettleRequest) {
  const result = await settlePipelineAskCallable(request);
  return result.data;
}

export interface PipelineMergeResult {
  ok: boolean;
  /** `asked`: a comment asked the session driving it to merge; `merged`: merged on GitHub. */
  outcome: 'asked' | 'merged' | null;
  url: string | null;
  error: string | null;
  isSample: boolean;
}

const mergePipelinePrCallable = httpsCallable<{ prNumber: number }, PipelineMergeResult>(
  functions,
  'mergePipelinePr',
  { timeout: 120_000 },
);

/** Merges a pull request, or asks the session driving it to, once the server has checked its gates again. */
export async function mergePipelinePr(prNumber: number) {
  const result = await mergePipelinePrCallable({ prNumber });
  return result.data;
}
