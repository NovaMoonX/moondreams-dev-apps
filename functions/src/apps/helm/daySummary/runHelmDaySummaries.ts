import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from '../sortHelmCapture.js';
import {
  getDayBounds,
  getSummaryDay,
  isDayQuiet,
  isStillSorting,
  isSummaryMissing,
} from './countDay.js';
import {
  collectDaySummaryBatches,
  submitDaySummaryBatch,
  type QueuedSummary,
} from './daySummaryBatch.js';
import {
  pickDaySummaryBatchProvider,
  pickDaySummaryProvider,
  prepareDaySummary,
  writeHelmDaySummary,
  type DaySummaryResult,
} from './writeDaySummary.js';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_SIZE = 5;
/** A run stops starting new people after this, leaving them to the next run inside the 540 s limit. */
const RUN_BUDGET_MS = 420_000;

export type WriteSummary = (
  uid: string,
  dayKey: string,
  now: number,
) => Promise<DaySummaryResult>;

export interface SummaryRun {
  checked: number;
  written: number;
  failed: number;
  deferred: number;
}

/** Writes yesterday's summary for each person whose local day has closed and gone quiet; the writer is injected so a run can be rehearsed without a model. */
export async function runDaySummaries(
  firestore: Firestore,
  write: WriteSummary,
  now = Date.now(),
): Promise<SummaryRun> {
  const profiles = await firestore
    .collection('apps/helm/users')
    .select('timeZone')
    .get();
  const run: SummaryRun = { checked: 0, written: 0, failed: 0, deferred: 0 };
  const startedAt = Date.now();
  const handle = async (uid: string, dayKey: string, timeZone: string) => {
    try {
      const base = `apps/helm/users/${uid}`;
      const existing = await firestore
        .doc(`${base}/daySummaries/${dayKey}`)
        .get();
      if (
        !isSummaryMissing(
          existing.exists
            ? {
                status: String(existing.get('status')),
                attempts: Number(existing.get('attempts') ?? 0),
                writtenAt: Number(existing.get('writtenAt') ?? 0),
                batchId:
                  typeof existing.get('batchId') === 'string'
                    ? (existing.get('batchId') as string)
                    : null,
                batchedAt:
                  typeof existing.get('batchedAt') === 'number'
                    ? (existing.get('batchedAt') as number)
                    : null,
              }
            : null,
          now,
        )
      ) {
        return;
      }
      const { dayStart, dayEnd } = getDayBounds(dayKey, timeZone);
      const [day, latest] = await Promise.all([
        firestore
          .collection(`${base}/captures`)
          .where('createdAt', '>=', dayStart)
          .where('createdAt', '<', dayEnd)
          .select('status', 'createdAt')
          .get(),
        firestore
          .collection(`${base}/captures`)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .select('createdAt')
          .get(),
      ]);
      const isQuiet = isDayQuiet({
        now,
        hasActiveCapture: day.docs.some((doc) =>
          isStillSorting(
            {
              status: doc.get('status'),
              createdAt: Number(doc.get('createdAt')),
            },
            now,
          ),
        ),
        latestCaptureAt: latest.empty
          ? null
          : Number(latest.docs[0].get('createdAt')),
      });
      if (!isQuiet) return;
      run.checked += 1;
      if ((await write(uid, dayKey, now)) === 'written') run.written += 1;
    } catch {
      run.failed += 1;
      logger.warn('helm.daySummary.runFailed');
    }
  };
  const people = profiles.docs.flatMap((doc) => {
    const timeZone = (doc.get('timeZone') as string | undefined) ?? 'UTC';
    const { dayKey, isOpen } = getSummaryDay(now, timeZone);
    return isOpen ? [{ uid: doc.id, dayKey, timeZone }] : [];
  });
  await Array.from(
    { length: Math.ceil(people.length / BATCH_SIZE) },
    (_, index) => people.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  ).reduce(
    (previous, batch) =>
      previous.then(() => {
        if (Date.now() - startedAt > RUN_BUDGET_MS) {
          run.deferred += batch.length;
          return null;
        }
        return Promise.all(
          batch.map((person) =>
            handle(person.uid, person.dayKey, person.timeZone),
          ),
        );
      }),
    Promise.resolve<unknown>(null),
  );
  return run;
}

export const runHelmDaySummaries = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  async () => {
    const firestore = getFirestore();
    const keyring = loadKeyringOrFail();
    const provider = pickDaySummaryProvider();
    const batchProvider = pickDaySummaryBatchProvider();
    if (!batchProvider) {
      const run = await runDaySummaries(firestore, (uid, dayKey, now) =>
        writeHelmDaySummary(firestore, provider, keyring, uid, dayKey, now),
      );
      logger.info('helm.daySummary.run', run);
      return;
    }
    await collectDaySummaryBatches(
      firestore,
      batchProvider,
      keyring,
      Date.now(),
    );
    const queued: QueuedSummary[] = [];
    const run = await runDaySummaries(firestore, async (uid, dayKey, now) => {
      const prepared = await prepareDaySummary(
        firestore,
        keyring,
        uid,
        dayKey,
        now,
        true,
      );
      if (!('request' in prepared)) return prepared.status;
      queued.push({
        uid,
        dayKey,
        reservedAt: prepared.reservedAt,
        request: prepared.request,
      });
      return 'counted';
    });
    const batched = await submitDaySummaryBatch(
      firestore,
      batchProvider,
      queued,
      Date.now(),
    ).catch(() => {
      logger.error('helm.daySummary.batchNotRecorded');
      return 0;
    });
    logger.info('helm.daySummary.run', { ...run, batched });
  },
);
