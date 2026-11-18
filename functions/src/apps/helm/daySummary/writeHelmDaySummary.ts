import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from '../sortHelmCapture.js';
import { isDayKey, shiftDayKey, toDayKeyIn } from './countDay.js';
import {
  pickDaySummaryProvider,
  writeHelmDaySummary as writeSummary,
  type DaySummaryResult,
} from './writeDaySummary.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_DAYS_BACK = 30;

export interface WriteDaySummaryResult {
  status: DaySummaryResult | 'tooSoon';
}

export const writeHelmDaySummary = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    minInstances: 0,
    timeoutSeconds: 90,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<WriteDaySummaryResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const dayKey = (request.data as { dayKey?: unknown } | null)?.dayKey;
    if (!isDayKey(dayKey)) {
      throw new HttpsError('invalid-argument', 'Pick a day.');
    }
    const firestore = getFirestore();
    const now = Date.now();
    const profile = await firestore.doc(`apps/helm/users/${uid}`).get();
    const today = toDayKeyIn(
      now,
      (profile.data()?.timeZone as string | undefined) ?? 'UTC',
    );
    if (dayKey >= today) return { status: 'tooSoon' };
    if (dayKey < shiftDayKey(today, -MAX_DAYS_BACK)) {
      throw new HttpsError('invalid-argument', 'That day is too far back.');
    }
    return {
      status: await writeSummary(
        firestore,
        pickDaySummaryProvider(),
        loadKeyringOrFail(),
        uid,
        dayKey,
        now,
      ),
    };
  },
);
