import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
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

/** `{}` → `{ linkToken }`: a short-lived token the bank window opens with. `{ linkId }` of the caller's `needsAttention` or `active` link opens that connection again so the person can sign in and pick accounts; `forCardDetails` on an active link asks only for agreement to share card details, with no account picking, and returns a null token when the bank can't share them. */
type SessionResult = { linkToken: string | null };

/** Records that the bank can't share card details, so the offer becomes "not shared" and no later reconnect asks again. */
const markCardConsentUnsupported = (
  firestore: Firestore,
  linkRef: DocumentReference,
  grantRef: DocumentReference,
) =>
  firestore.runTransaction(async (transaction) => {
    const link = await transaction.get(linkRef);
    if (link.data()?.status === 'revoked') return;
    transaction.update(grantRef, {
      isCardConsentUnsupported: true,
      isStatementsUnsupported: true,
      statementsCheckedAt: Date.now(),
    });
    transaction.update(linkRef, {
      cardDetails: 'unsupported',
      needsCardConsent: null,
    });
  });

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
      const result: SessionResult = { linkToken };
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
    const grantDoc = grantSnapshot.data() as ProviderGrantDoc;
    const isKnownUnsupported = grantDoc.isCardConsentUnsupported === true;
    if (isForCardDetails && isKnownUnsupported) {
      await markCardConsentUnsupported(
        firestore,
        linkSnapshot.ref,
        grantSnapshot.ref,
      );
      const result: SessionResult = { linkToken: null };
      return result;
    }
    const grant = openGrant(loadKeyringOrFail(), uid, grantDoc);
    const session = await withProvider(() =>
      provider.createLinkSession(uid, {
        accessToken: grant.credential,
        // Picking accounts again here would add accounts another sign-in at the same bank already shares.
        accountSelection: !isForCardDetails,
        askCardConsent:
          !isKnownUnsupported &&
          (isForCardDetails ||
            linkSnapshot.data()?.cardDetails === 'needsConsent' ||
            linkSnapshot.data()?.needsCardConsent === true),
      }),
    );
    if (session.isCardConsentUnsupported) {
      await markCardConsentUnsupported(
        firestore,
        linkSnapshot.ref,
        grantSnapshot.ref,
      );
    }
    if (isForCardDetails && session.isCardConsentUnsupported) {
      logger.info('runway.link.cardDetailsUnsupported');
      const result: SessionResult = { linkToken: null };
      return result;
    }
    const { linkToken } = session;
    logger.info('runway.link.reconnectSessionCreated');
    const result: SessionResult = { linkToken };
    return result;
  },
);
