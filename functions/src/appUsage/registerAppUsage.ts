import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { findFirstActivityAt as findAListStart } from '../apps/a-list/findFirstActivityAt.js';
import { findFirstActivityAt as findNineLivesStart } from '../apps/nine-lives/findFirstActivityAt.js';
import { findFirstActivityAt as findWaypointStart } from '../apps/waypoint/findFirstActivityAt.js';
import { findFirstActivityAt as findWorthTheWaitStart } from '../apps/worth-the-wait/findFirstActivityAt.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';

const FIRST_ACTIVITY_FINDERS: Record<string, (firestore: Firestore, uid: string) => Promise<number | null>> = {
  'a-list': findAListStart,
  'nine-lives': findNineLivesStart,
  waypoint: findWaypointStart,
  'worth-the-wait': findWorthTheWaitStart,
};

// Mirrors the app-visibility rules in firestore.rules.
function canUseApp(
  app: FirebaseFirestore.DocumentData | undefined,
  uid: string,
  email: string | null,
) {
  if (!app || app.status !== 'public') return false;
  if (!app.isRestricted) return true;

  const allowedUsers = Array.isArray(app.allowedUsers)
    ? app.allowedUsers.map((value) => String(value).trim().toLowerCase())
    : [];
  const result = allowedUsers.includes(uid.toLowerCase()) || (email !== null && allowedUsers.includes(email));
  return result;
}

// The oldest-data scan can be slow, so it only runs while the member has no record.
export const registerAppUsage = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const appId = typeof request.data?.appId === 'string' ? request.data.appId.trim() : '';
    const findFirstActivityAt = FIRST_ACTIVITY_FINDERS[appId];
    if (!findFirstActivityAt) {
      throw new HttpsError('invalid-argument', 'That app is not tracked.');
    }

    const firestore = getFirestore();
    const usageRef = firestore.doc(`apps/${appId}/usage/${uid}`);
    const existing = await usageRef.get();
    if (existing.exists) {
      return existing.data();
    }

    const email = request.auth?.token.email?.trim().toLowerCase() ?? null;
    const isPrivileged =
      email === ADMIN_EMAIL || request.auth?.token.admin === true || request.auth?.token.dev === true;
    if (!isPrivileged) {
      const appSnapshot = await firestore.doc(`apps/${appId}`).get();
      if (!canUseApp(appSnapshot.data(), uid, email)) {
        throw new HttpsError('permission-denied', 'You do not have access to this app.');
      }
    }

    const now = Date.now();
    const firstActivityAt = await findFirstActivityAt(firestore, uid);
    const usage = { uid, startedAt: Math.min(firstActivityAt ?? now, now), lastActiveAt: now };

    try {
      await usageRef.create(usage);
      return usage;
    } catch (error) {
      // gRPC ALREADY_EXISTS: a second tab or device registered at the same moment.
      if ((error as { code?: number }).code !== 6) throw error;
      const winner = await usageRef.get();
      return winner.data();
    }
  },
);
