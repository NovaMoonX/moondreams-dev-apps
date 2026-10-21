import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { getFootprints, type Footprints } from './attribution.js';
import { getMonthStart, MonitoringAccessError, readMetric } from './monitoring.js';
import { getUsageMetrics, priceMetric, PRICING_LAST_CHECKED, type UsageLine } from './pricing.js';
import { readSampleMetric } from './sampleUsage.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';
const DAY_MS = 86_400_000;

export interface FirebaseUsageResponse {
  lines: UsageLine[];
  monthToDateCostUsd: number;
  projectedCostUsd: number;
  pricingCheckedOn: string;
  /** Null when only the per-app measurement failed; the totals above still stand. */
  footprints: Footprints | null;
  /** True when the totals are made up because the emulator can't reach Cloud Monitoring. */
  isSample: boolean;
  generatedAt: number;
}

// Totals come from Cloud Monitoring, the source behind the Firebase console's usage tabs.
// Reads, writes and bandwidth are project-wide there; only stored data can be split by app.
export const getFirebaseUsage = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const email = request.auth?.token.email?.trim().toLowerCase() ?? null;
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' && !process.env.K_SERVICE;
    const isAdminEmail = email === ADMIN_EMAIL && request.auth?.token.email_verified === true;
    const isEmulatorDev = isEmulator && request.auth?.token.dev === true;
    if (!request.auth || (!isAdminEmail && !isEmulatorDev && request.auth.token.admin !== true)) {
      throw new HttpsError('permission-denied', 'Only the admin can read usage.');
    }

    const projectId = process.env.GCLOUD_PROJECT;
    if (!projectId) {
      throw new HttpsError('failed-precondition', 'The project id is not available.');
    }

    const now = Date.now();
    const monthStart = getMonthStart(now);
    // At least one day, so the first hours of a month don't project from a sliver of data.
    const daysElapsed = Math.max(1, (now - monthStart) / DAY_MS);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const daysInMonth = Math.round((nextMonth.getTime() - monthStart) / DAY_MS);

    try {
      const [lines, footprints] = await Promise.all([
        Promise.all(
          getUsageMetrics(getStorage().bucket().name).map(async (spec) => {
            const daily = isEmulator
              ? readSampleMetric(spec, daysElapsed, daysInMonth)
              : await readMetric(projectId, spec, now);
            return priceMetric({ spec, daily, daysElapsed, daysInMonth });
          }),
        ),
        getFootprints(now).catch((error: unknown) => {
          console.error('firebaseUsage: footprints failed', (error as { code?: unknown }).code ?? 'unknown');
          return null;
        }),
      ]);

      const response: FirebaseUsageResponse = {
        lines,
        monthToDateCostUsd: lines.reduce((sum, line) => sum + line.monthToDateCostUsd, 0),
        projectedCostUsd: lines.reduce((sum, line) => sum + line.projectedCostUsd, 0),
        pricingCheckedOn: PRICING_LAST_CHECKED,
        footprints,
        isSample: isEmulator,
        generatedAt: now,
      };
      return response;
    } catch (error) {
      if (error instanceof MonitoringAccessError) {
        throw new HttpsError('failed-precondition', 'monitoring-role-missing');
      }
      console.error('firebaseUsage: failed', (error as { code?: unknown }).code ?? 'unknown');
      throw new HttpsError('internal', 'Could not read usage.');
    }
  },
);
