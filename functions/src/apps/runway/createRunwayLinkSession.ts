import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { grantsPath, openGrant, type ProviderGrantDoc } from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  provider,
  requireLinkCaller,
  withProvider,
} from './link/linkShared.js';

if (getApps().length === 0) {
  initializeApp();
}

const readRequest = (
  data: unknown,
): { linkId: string | null; isForCardDetails: boolean } => {
  const none = { linkId: null, isForCardDetails: false };
  if (data === null || data === undefined) return none;
  const record = typeof data === 'object' && !Array.isArray(data) ? data : null;
  const keys = record === null ? [] : Object.keys(record);
  if (
    record === null ||
    keys.some((key) => key !== 'linkId' && key !== 'forCardDetails')
  ) {
    throw new HttpsError('invalid-argument', 'That request is not valid.');
  }
  if (keys.length === 0) return none;
  const { linkId, forCardDetails } = record as {
    linkId: unknown;
    forCardDetails?: unknown;
  };
  if (typeof linkId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(linkId)) {
    throw new HttpsError('invalid-argument', 'That link is not valid.');
  }
  if (forCardDetails !== undefined && forCardDetails !== true) {
    throw new HttpsError('invalid-argument', 'That request is not valid.');
  }
  return { linkId, isForCardDetails: forCardDetails === true };
};

/** `{}` → `{ linkToken }`: a short-lived token the bank window opens with. `{ linkId }` of the caller's `needsAttention` or `active` link opens that connection again so the person can sign in and pick accounts; `forCardDetails` on an active link asks only for agreement to share card details, with no account picking. */
export const createRunwayLinkSession = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const { linkId, isForCardDetails } = readRequest(request.data);
    if (linkId === null) {
      const { linkToken } = await withProvider(() =>
        provider.createLinkSession(uid),
      );
      logger.info('runway.link.sessionCreated');
      const result = { linkToken };
      return result;
    }
    const firestore = getFirestore();
    const [linkSnapshot, grantSnapshot] = await Promise.all([
      firestore.doc(planDocPath(uid, 'links', linkId)).get(),
      firestore.doc(`${grantsPath(uid)}/${linkId}`).get(),
    ]);
    const status = linkSnapshot.data()?.status;
    if (status !== 'needsAttention' && status !== 'active') {
      throw new HttpsError(
        'failed-precondition',
        'That bank is not linked right now.',
      );
    }
    if (isForCardDetails && status !== 'active') {
      throw new HttpsError(
        'failed-precondition',
        'Sign in at that bank again first.',
      );
    }
    if (!grantSnapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        'That bank cannot be reconnected. Link it again.',
      );
    }
    const grant = openGrant(
      loadKeyringOrFail(),
      uid,
      grantSnapshot.data() as ProviderGrantDoc,
    );
    const { linkToken } = await withProvider(() =>
      provider.createLinkSession(uid, {
        accessToken: grant.credential,
        // Picking accounts again here would add accounts another sign-in at the same bank already shares.
        accountSelection: !isForCardDetails,
        askCardConsent:
          isForCardDetails ||
          linkSnapshot.data()?.cardDetails === 'needsConsent' ||
          linkSnapshot.data()?.needsCardConsent === true,
      }),
    );
    logger.info('runway.link.reconnectSessionCreated');
    const result = { linkToken };
    return result;
  },
);
