import type { ModelRole } from './models.js';

/** What a batch stores at the provider: `standard` is stored until deleted, at most 29 days; zero data retention is never offered. */
export type DataTerms = 'standard';

export interface BatchJobSpec {
  role: ModelRole;
  terms: DataTerms[];
  /** Longest the answer may take, in hours; a batch offers 24. */
  maxWaitHours: number;
  maxAttempts: number;
  /** How many times a paused answer is continued. */
  maxContinuations: number;
  serverTools: string[];
  deleteAfterCollect: boolean;
  /** What a person asking sooner gets: that item run at once, or an answer from what is known. */
  whenWantedNow: 'runAtOnce' | 'answerAtOnce';
}

export type BatchJobId = 'reflect';

export const BATCH_JOBS: Record<BatchJobId, BatchJobSpec> = {
  reflect: {
    role: 'reflect',
    terms: ['standard'],
    maxWaitHours: 24,
    maxAttempts: 3,
    maxContinuations: 0,
    serverTools: [],
    deleteAfterCollect: true,
    whenWantedNow: 'answerAtOnce',
  },
};

export const isBatchJobId = (id: string): id is BatchJobId =>
  Object.hasOwn(BATCH_JOBS, id);
