import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { isGateOpenFor, type GateRollout, type GateSetting } from './gateLogic.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_EMAIL = 'nova@moondreams.dev';

/**
 * Throws `permission-denied` from a callable when the caller is kept out of a feature switch.
 * `defaultRollout` is the registry's (src/lib/gates/gates.registry.ts).
 */
export async function assertGateOpen(
  request: CallableRequest,
  appId: string,
  gateId: string,
  defaultRollout: GateRollout,
  message: string,
) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snapshot = await getFirestore().doc(`featureGates/${appId}`).get();
  const setting = (snapshot.data()?.gates as Record<string, GateSetting> | undefined)?.[gateId];
  const isAdmin =
    request.auth.token.admin === true ||
    (request.auth.token.email?.trim().toLowerCase() === ADMIN_EMAIL && request.auth.token.email_verified === true);
  if (!isGateOpenFor(setting, defaultRollout, { uid: request.auth.uid, isAdmin })) {
    throw new HttpsError('permission-denied', message);
  }
}
