import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

// Entries go first: a revoked session that finds its trusted entry gone cannot reopen offline.
export const signOutEverywhere = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    enforceAppCheck: true,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    try {
      await getFirestore().recursiveDelete(
        getFirestore().collection(`trustedBrowsers/${uid}/browsers`),
      );
      await getAuth().revokeRefreshTokens(uid);
    } catch (error) {
      logger.error('auth.signOutEverywhere.failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
      throw new HttpsError('internal', 'Could not sign out everywhere.');
    }
    return { ok: true };
  },
);
