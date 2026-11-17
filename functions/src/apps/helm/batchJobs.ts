import { REFLECT_BATCH } from './reflection/reflectionRuns.js';
import { RELATE_BATCH } from './reflection/relate/relateRuns.js';

/** The seven answers a job gives before it may run in a batch. */
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
  maxWaitHours: number;
  maxAttempts: number;
  deleteAfterCollect: boolean;
  answers: BatchJobAnswers;
  /** Run the item at once, or answer the turn from what is stored. */
  whenWantedNow: 'runAtOnce' | 'answerAtOnce';
}

export const BATCH_JOBS = {
  reflect: REFLECT_BATCH,
  relate: RELATE_BATCH,
} as const satisfies Record<string, BatchJobSettings>;
