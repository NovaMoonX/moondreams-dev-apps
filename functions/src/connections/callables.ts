import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  HttpsError,
  onCall,
  type CallableOptions,
  type CallableRequest,
} from 'firebase-functions/v2/https';

import { canOpenApp } from '../appAccess.js';
import {
  SITE_ACCOUNT_ID,
  readConnectorAppId,
  toGrantId,
} from '../vendor/connectionsContract.js';
import {
  applyCategoryChanges,
  assertDeclaredCategories,
  buildNewGrant,
  readEndConnectionRequest,
  readGrant,
  readGrantConnectionRequest,
  readUpdateConnectionRequest,
} from './grants.js';
import { READER_APPS, SOURCE_ADAPTERS } from './registry.js';

if (getApps().length === 0) {
  initializeApp();
}

const OPTIONS: CallableOptions = {
  region: 'us-central1',
  maxInstances: 5,
  timeoutSeconds: 30,
  enforceAppCheck: true,
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

const requireAuth = (request: CallableRequest) => {
  const auth = request.auth;
  if (!auth)
    throw new HttpsError('unauthenticated', 'Sign in to connect apps.');
  return auth;
};

const grantRef = (uid: string, grantId: string) =>
  getFirestore().doc(`connections/${uid}/grants/${grantId}`);

const isKnown = <T>(table: Record<string, T>, id: string) =>
  Object.hasOwn(table, id);

export const grantConnection = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readGrantConnectionRequest(request.data);

  if (!isKnown(READER_APPS, req.readerAppId)) {
    throw new HttpsError(
      'invalid-argument',
      "That app can't read from other apps.",
    );
  }
  const sourceAppId = readConnectorAppId(req.connectorId);
  if (!isKnown(SOURCE_ADAPTERS, req.connectorId) || sourceAppId === null) {
    throw new HttpsError('invalid-argument', "That source isn't available.");
  }
  if (req.accountId !== SITE_ACCOUNT_ID) {
    throw new HttpsError('invalid-argument', "That account isn't available.");
  }
  const { manifest } = SOURCE_ADAPTERS[req.connectorId];
  if (req.categoryIds.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'Pick at least one thing to share.',
    );
  }
  assertDeclaredCategories(manifest, req.categoryIds);

  const firestore = getFirestore();
  const canOpen = await Promise.all(
    [req.readerAppId, sourceAppId].map((appId) =>
      canOpenApp(firestore, appId, auth),
    ),
  );
  if (!canOpen.every(Boolean)) {
    throw new HttpsError(
      'permission-denied',
      "You can't open one of those apps.",
    );
  }

  const grantId = toGrantId(req.readerAppId, req.connectorId, req.accountId);
  const ref = grantRef(auth.uid, grantId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && readGrant(snapshot.data()).status === 'live') {
      throw new HttpsError(
        'already-exists',
        'These apps are already connected.',
      );
    }
    transaction.set(ref, buildNewGrant(req, manifest, Date.now()));
  });
  return { grantId };
});

export const updateConnection = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readUpdateConnectionRequest(request.data);
  const firestore = getFirestore();
  const ref = grantRef(auth.uid, req.grantId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    const grant = readGrant(snapshot.data());
    if (grant.status === 'ended') {
      throw new HttpsError(
        'failed-precondition',
        "That connection isn't active.",
      );
    }
    if (!isKnown(SOURCE_ADAPTERS, grant.connectorId)) {
      throw new HttpsError(
        'failed-precondition',
        "That source isn't available.",
      );
    }
    const now = Date.now();
    const categories = applyCategoryChanges(
      grant,
      req.categories,
      SOURCE_ADAPTERS[grant.connectorId].manifest,
      now,
    );
    transaction.update(ref, { categories, updatedAt: now });
  });
  return { grantId: req.grantId };
});

export const endConnection = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readEndConnectionRequest(request.data);
  const firestore = getFirestore();
  const ref = grantRef(auth.uid, req.grantId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    if (readGrant(snapshot.data()).status === 'ended') return;
    const now = Date.now();
    transaction.update(ref, { status: 'ended', endedAt: now, updatedAt: now });
  });
  return { grantId: req.grantId };
});
