import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import type { BatchJobSettings } from '../batchJobs.js';

export const REFLECT_BATCH = {
  jobId: 'reflect',
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

export const RUNS_PATH = 'apps/helm/reflectionRuns';
export const OPEN_RUN_STATUSES = ['creating', 'submitted'];
export const statePath = (uid: string) =>
  `apps/helm/server/${uid}/reflection/state`;

export type RunStatus = 'creating' | 'submitted' | 'collected' | 'lost';

export interface RunRequest {
  uid: string;
  dayKey: string;
  answersDueAt: number;
  /** What was counted against the day's budget when the request was made, in hundredths of a cent. */
  reserved: number;
}

export interface ReflectionRun {
  status: RunStatus;
  batchId: string | null;
  requests: Record<string, RunRequest>;
  superseded: string[];
  createdAt: number;
  submittedAt: number | null;
  collectedAt: number | null;
  deletedAtProvider: number | null;
}

export interface ReflectionState {
  runId: string | null;
  customId: string | null;
  answersDueAt: number | null;
  attempts: number;
  leaseUntil: number;
  continuation: null;
  lastDayKey: string | null;
}

const toNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

export const readState = (data: DocumentData | undefined): ReflectionState => ({
  runId: toText(data?.runId),
  customId: toText(data?.customId),
  answersDueAt:
    typeof data?.answersDueAt === 'number' ? data.answersDueAt : null,
  attempts: toNumber(data?.attempts, 0),
  leaseUntil: toNumber(data?.leaseUntil, 0),
  continuation: null,
  lastDayKey: toText(data?.lastDayKey),
});

const toRequests = (value: unknown): Record<string, RunRequest> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, request]) => {
          const { uid, dayKey, answersDueAt, reserved } = (request ??
            {}) as Record<string, unknown>;
          return typeof uid === 'string' &&
            typeof dayKey === 'string' &&
            typeof answersDueAt === 'number'
            ? [
                [
                  id,
                  {
                    uid,
                    dayKey,
                    answersDueAt,
                    reserved: toNumber(reserved, 0),
                  },
                ] as [string, RunRequest],
              ]
            : [];
        }),
      )
    : {};

export const readRun = (
  data: DocumentData | undefined,
): ReflectionRun | null =>
  data
    ? {
        status: data.status as RunStatus,
        batchId: toText(data.batchId),
        requests: toRequests(data.requests),
        superseded: Array.isArray(data.superseded)
          ? data.superseded.filter((id): id is string => typeof id === 'string')
          : [],
        createdAt: toNumber(data.createdAt, 0),
        submittedAt:
          typeof data.submittedAt === 'number' ? data.submittedAt : null,
        collectedAt:
          typeof data.collectedAt === 'number' ? data.collectedAt : null,
        deletedAtProvider:
          typeof data.deletedAtProvider === 'number'
            ? data.deletedAtProvider
            : null,
      }
    : null;

/** The state a person is left in once a request is done with: no lease, so the next hourly run may take them again if they are still due. */
export const toReleasedState = (
  attempts: number,
  lastDayKey: string | null,
): ReflectionState => ({
  runId: null,
  customId: null,
  answersDueAt: null,
  attempts,
  leaseUntil: 0,
  continuation: null,
  lastDayKey,
});

export const releaseLeaseIn = (
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  attempts: number,
  lastDayKey: string | null,
) =>
  transaction.set(
    firestore.doc(statePath(uid)),
    toReleasedState(attempts, lastDayKey),
  );

/** Takes a person out of every run still waiting, so a result that arrives later has no request to land on. */
export async function removeFromOpenRuns(firestore: Firestore, uid: string) {
  const open = await firestore
    .collection(RUNS_PATH)
    .where('status', 'in', OPEN_RUN_STATUSES)
    .get();
  const edits = open.docs.flatMap((doc) => {
    const ids = Object.entries(toRequests(doc.get('requests')))
      .filter(([, request]) => request.uid === uid)
      .map(([id]) => id);
    return ids.length > 0 ? [{ ref: doc.ref, ids }] : [];
  });
  await Promise.all(
    edits.map(({ ref, ids }) =>
      ref.update(
        Object.fromEntries(
          ids.map((id) => [`requests.${id}`, FieldValue.delete()]),
        ),
      ),
    ),
  );
  return edits.reduce((sum, { ids }) => sum + ids.length, 0);
}
