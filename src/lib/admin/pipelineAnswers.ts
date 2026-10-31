import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export interface PipelineAnswerItem {
  question: string;
  choices: string[];
  other: string | null;
  note: string | null;
}

/** A decision to change or a follow-up to do, opened as an issue when the pull request is already merged. */
export interface PipelineIssueRequest {
  kind: 'change' | 'followUp';
  title: string;
  words: string;
  /** The line's answered mark, which also identifies the issue so a retry never opens it twice. */
  mark: string;
}

export interface PipelineIssueResult {
  title: string;
  mark: string;
  url: string | null;
  isMade: boolean;
}

export interface PipelineAnswersForPr {
  prNumber: number;
  items: PipelineAnswerItem[];
  issues: PipelineIssueRequest[];
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
  /** The issues a merged pull request's answers became; empty on an open one. */
  issues: PipelineIssueResult[];
}

export const MAX_ANSWER_NOTE = 2000;
/** The most answers one comment holds. */
export const MAX_ANSWER_ITEMS = 21;

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
