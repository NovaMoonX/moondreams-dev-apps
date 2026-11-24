import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import { mintEmailAddress } from '../../../email/mintEmailAddress.js';
import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import {
  EMAIL_ADDRESS_PREFIX,
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
    const address = await mintEmailAddress({
      firestore: getFirestore(),
      uid,
      tokenPath: emailTokenPath,
      intakePath: intakePath(uid),
      prefix: EMAIL_ADDRESS_PREFIX,
      oldTokenOf: (old) => (typeof old?.token === 'string' ? old.token : null),
      intakeDocument: ({ token, now, createdAt }) => ({
        id: 'address',
        token,
        createdAt,
        updatedAt: now,
        lastReceivedAt: null,
        confirmAt: null,
        autoConfirm: null,
        confirmProvider: null,
        sealed: null,
      }),
    });
    return { address };
  },
);
