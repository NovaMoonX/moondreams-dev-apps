import type { BatchJobSettings } from '../../batchJobs.js';

export const RELATE_BATCH = {
  jobId: 'relate',
  /** Longest an answer may take, in hours; a batch offers 24. */
  maxWaitHours: 24,
  maxAttempts: 3,
  deleteAfterCollect: true,
  answers: {
    nobodyWaits: true,
    canWait24h: true,
    idempotent: true,
    builtOnServer: true,
    staysInHelm: true,
    terms: 'standard',
    noStreamingOrTools: true,
  },
  whenWantedNow: 'answerAtOnce',
} as const satisfies BatchJobSettings;
