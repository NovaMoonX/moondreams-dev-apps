import { REFLECT_BATCH } from './reflection/reflectionRuns.js';
import { RELATE_BATCH } from './reflection/relate/relateRuns.js';

/** The seven questions a job answers before it may run in a batch; each is true, and the terms are the standard data-handling terms. */
export interface BatchJobAnswers {
  nobodyWaits: boolean;
  canWait24h: boolean;
  idempotent: boolean;
  builtOnServer: boolean;
  staysInHelm: boolean;
  terms: 'standard';
  noStreamingOrTools: boolean;
}

export interface BatchJobSettings {
  jobId: string;
  /** Longest an answer may take, in hours; a batch offers 24. */
  maxWaitHours: number;
  maxAttempts: number;
  deleteAfterCollect: boolean;
  answers: BatchJobAnswers;
  /** What happens when the person wants the result now: the item itself runs at once, or the turn answers from what is already stored. */
  whenWantedNow: 'runAtOnce' | 'answerAtOnce';
}

export const BATCH_JOBS = {
  reflect: REFLECT_BATCH,
  relate: RELATE_BATCH,
} as const satisfies Record<string, BatchJobSettings>;
