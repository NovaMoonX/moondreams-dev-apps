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

/** The connected categories the nightly grouping may read, each `<connector id>/<category id>`. */
export const RELATE_SYNCED_CATEGORIES = [
  'app:going-once/sales',
  'app:going-once/things',
  'app:going-once/pickups',
  'app:runway/horizon',
  'app:runway/upcomingBills',
  'app:waypoint/trips',
  'app:waypoint/myTasks',
] as const;
