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
  isSummaryMissing,
} from './countDay.js';
import {
  pickDaySummaryProvider,
  writeHelmDaySummary,
  type DaySummaryResult,
} from './writeDaySummary.js';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_SIZE = 5;

export type WriteSummary = (
  uid: string,
  dayKey: string,
  now: number,
) => Promise<DaySummaryResult>;

export interface SummaryRun {
  checked: number;
  written: number;
  failed: number;
}

const isActive = (status: unknown) =>
  status === 'received' || status === 'interpreting';

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
  const run: SummaryRun = { checked: 0, written: 0, failed: 0 };
  const handle = async (uid: string, timeZone: string) => {
    try {
      const { dayKey, isStarted } = getSummaryDay(now, timeZone);
      if (!isStarted) return;
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
              }
            : null,
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
          .select('status')
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
        hasActiveCapture: day.docs.some((doc) => isActive(doc.get('status'))),
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
  const people = profiles.docs.map((doc) => ({
    uid: doc.id,
    timeZone: (doc.get('timeZone') as string | undefined) ?? 'UTC',
  }));
  await Array.from(
    { length: Math.ceil(people.length / BATCH_SIZE) },
    (_, index) => people.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  ).reduce(
    (previous, batch) =>
      previous.then(() =>
        Promise.all(batch.map((person) => handle(person.uid, person.timeZone))),
      ),
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
    const run = await runDaySummaries(firestore, (uid, dayKey, now) =>
      writeHelmDaySummary(firestore, provider, keyring, uid, dayKey, now),
    );
    logger.info('helm.daySummary.run', run);
  },
);
