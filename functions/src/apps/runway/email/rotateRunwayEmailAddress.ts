import { randomBytes } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import {
  EMAIL_ADDRESS_PREFIX,
  EMAIL_DOMAIN,
  EMAIL_PURCHASES_GATE_ID,
  emailTokenPath,
  intakePath,
} from './emailShared.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Gives the signed-in person a new private forwarding address; the one they had stops working at once. Creates the first one too. */
export const rotateRunwayEmailAddress = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    await assertGateOpen(
      request,
      'runway',
      EMAIL_PURCHASES_GATE_ID,
      'off',
      'Purchases from email are not open for you yet.',
    );
    const uid = request.auth?.uid as string;
    const firestore = getFirestore();
    const token = randomBytes(16).toString('hex');
    const intakeRef = firestore.doc(intakePath(uid));
    const now = Date.now();
    await firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(intakeRef);
      const old = current.data();
      if (typeof old?.token === 'string') {
        transaction.delete(firestore.doc(emailTokenPath(old.token)));
      }
      transaction.set(firestore.doc(emailTokenPath(token)), {
        uid,
        createdAt: now,
      });
      transaction.set(intakeRef, {
        id: 'address',
        token,
        createdAt: typeof old?.createdAt === 'number' ? old.createdAt : now,
        updatedAt: now,
        lastReceivedAt: null,
        confirmAt: null,
        sealed: null,
      });
    });
    return { address: `${EMAIL_ADDRESS_PREFIX}-${token}@${EMAIL_DOMAIN}` };
  },
);
