import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import {
  isGateOpenFor,
  type GateRollout,
  type GateSetting,
} from './gateLogic.js';

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
  if (
    !(await isGateOpenForToken(
      request.auth.token,
      appId,
      gateId,
      defaultRollout,
    ))
  ) {
    throw new HttpsError('permission-denied', message);
  }
}

const readSetting = async (appId: string, gateId: string) =>
  (
    (await getFirestore().doc(`featureGates/${appId}`).get()).data()?.gates as
      Record<string, GateSetting> | undefined
  )?.[gateId];

/** True when the holder of a verified ID token is let through a feature switch; admin status comes from the token, so nothing else is looked up. */
export async function isGateOpenForToken(
  token: DecodedIdToken,
  appId: string,
  gateId: string,
  defaultRollout: GateRollout,
) {
  const isAdmin =
    token.admin === true ||
    (token.email?.trim().toLowerCase() === ADMIN_EMAIL &&
      token.email_verified === true);
  return isGateOpenFor(await readSetting(appId, gateId), defaultRollout, {
    uid: token.uid,
    isAdmin,
  });
}

/** True when `uid` is let through a feature switch; for work with no caller (a webhook, a schedule). Admin status is read from the account. */
export async function isGateOpenForUid(
  uid: string,
  appId: string,
  gateId: string,
  defaultRollout: GateRollout,
) {
  const [setting, user] = await Promise.all([
    readSetting(appId, gateId),
    getAuth()
      .getUser(uid)
      .catch(() => null),
  ]);
  const isAdmin =
    user?.customClaims?.admin === true ||
    (user?.email?.trim().toLowerCase() === ADMIN_EMAIL &&
      user.emailVerified === true);
  return isGateOpenFor(setting, defaultRollout, { uid, isAdmin });
}
