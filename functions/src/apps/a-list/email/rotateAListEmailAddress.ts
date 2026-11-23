import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { mintEmailAddress } from '../../../email/mintEmailAddress.js';
import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import {
  EMAIL_ADDRESS_PREFIX,
  EMAIL_TICKETS_GATE_ID,
  emailTokenPath,
  intakePath,
  membershipPath,
} from './emailPaths.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Gives the signed-in member a new private forwarding address; the one they had stops working at once. Creates the first one too. */
export const rotateAListEmailAddress = onCall(
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
      'a-list',
      EMAIL_TICKETS_GATE_ID,
      'off',
      'Tickets from email are not open for you yet.',
    );
    const uid = request.auth?.uid as string;
    const firestore = getFirestore();
    if (!(await firestore.doc(membershipPath(uid)).get()).exists) {
      throw new HttpsError(
        'failed-precondition',
        'Set up your membership first.',
      );
    }
    const address = await mintEmailAddress({
      firestore,
      uid,
      tokenPath: emailTokenPath,
      intakePath: intakePath(uid),
      prefix: EMAIL_ADDRESS_PREFIX,
    });
    return { address };
  },
);
