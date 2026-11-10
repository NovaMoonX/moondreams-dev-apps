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
  readDeleteKeptRequest,
  readSyncRequest,
  readUpdateConnectionRequest,
} from './grants.js';
import { READER_APPS, READER_SINKS, SOURCE_ADAPTERS } from './registry.js';
import { InProcessSourceClient } from './sourceClient.js';
import { syncGrant, type SyncDeps } from './syncRunner.js';

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

const SYNC_OPTIONS: CallableOptions = {
  ...OPTIONS,
  timeoutSeconds: 120,
  secrets: Object.values(READER_SINKS).flatMap((sink) => sink.secrets),
};

export const SYNC_THROTTLE_MS = 15 * 60_000;
const DAY_MS = 86_400_000;

export const syncDeps = (): SyncDeps => ({
  firestore: getFirestore(),
  source: new InProcessSourceClient(),
  sinks: READER_SINKS,
  now: () => Date.now(),
});

const sinkFor = (readerAppId: string) =>
  isKnown(READER_SINKS, readerAppId) ? READER_SINKS[readerAppId] : null;

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
    transaction.set(
      ref,
      buildNewGrant(
        req,
        manifest,
        Date.now(),
        snapshot.exists ? readGrant(snapshot.data()).keptCopies : null,
      ),
    );
  });
  return { grantId };
});

export const updateConnection = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readUpdateConnectionRequest(request.data);
  const firestore = getFirestore();
  const ref = grantRef(auth.uid, req.grantId);

  const grant = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    const current = readGrant(snapshot.data());
    if (current.status === 'ended') {
      throw new HttpsError(
        'failed-precondition',
        "That connection isn't active.",
      );
    }
    if (!isKnown(SOURCE_ADAPTERS, current.connectorId)) {
      throw new HttpsError(
        'failed-precondition',
        "That source isn't available.",
      );
    }
    const now = Date.now();
    const categories = applyCategoryChanges(
      current,
      req.categories,
      SOURCE_ADAPTERS[current.connectorId].manifest,
      now,
    );
    const turnedOff = Object.entries(req.categories).flatMap(([id, isOn]) =>
      isOn ? [] : [id],
    );
    transaction.update(ref, {
      categories,
      ...Object.fromEntries(
        turnedOff.map((id) => [
          `categoryState.${id}`,
          { lastOkAt: null, lastError: null, count: 0 },
        ]),
      ),
      ...(turnedOff.length > 0
        ? {
            errors: current.errors.filter(
              (error) => !turnedOff.includes(error.category),
            ),
          }
        : {}),
      updatedAt: now,
    });
    return { current, turnedOff };
  });

  const sink = sinkFor(grant.current.readerAppId);
  if (sink && grant.turnedOff.length > 0) {
    const session = sink.openSession(firestore, auth.uid);
    await Promise.all(
      grant.turnedOff.map((id) => session.deleteCategory(req.grantId, id)),
    );
  }
  return { grantId: req.grantId };
});

export const endConnection = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readEndConnectionRequest(request.data);
  const firestore = getFirestore();
  const ref = grantRef(auth.uid, req.grantId);

  const before = await ref.get();
  if (!before.exists)
    throw new HttpsError('not-found', "That connection doesn't exist.");
  const first = readGrant(before.data());
  if (first.status === 'ended') return { grantId: req.grantId };

  const sink = sinkFor(first.readerAppId);
  const session = sink?.openSession(firestore, auth.uid);
  const endedAt = Date.now();
  const deleteAfter = endedAt + (sink?.keptCopyDays ?? 0) * DAY_MS;
  const kept = await (async () => {
    if (!session) return 0;
    if (req.deleteCopies) {
      await session.deleteGrant(req.grantId);
      return 0;
    }
    return session.keepGrant(req.grantId, endedAt, deleteAfter);
  })();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    if (readGrant(snapshot.data()).status === 'ended') return;
    transaction.update(ref, {
      status: 'ended',
      endedAt,
      keptCopies: kept > 0 ? { count: kept, deleteAfter } : null,
      syncLeaseUntil: null,
      updatedAt: endedAt,
    });
  });
  return { grantId: req.grantId };
});

export const deleteKeptCopies = onCall(OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readDeleteKeptRequest(request.data);
  const firestore = getFirestore();
  const ref = grantRef(auth.uid, req.grantId);

  const snapshot = await ref.get();
  if (!snapshot.exists)
    throw new HttpsError('not-found', "That connection doesn't exist.");
  const grant = readGrant(snapshot.data());
  const sink = sinkFor(grant.readerAppId);
  if (!grant.keptCopies || !sink) return { deleted: 0 };

  const deleted = await sink
    .openSession(firestore, auth.uid)
    .deleteKept(req.grantId);
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) {
      transaction.update(ref, { keptCopies: null, updatedAt: Date.now() });
    }
  });
  return { deleted };
});

export const syncConnections = onCall(SYNC_OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const { grantId } = readSyncRequest(request.data);
  const deps = syncDeps();
  const firestore = deps.firestore;

  if (grantId !== null) {
    const snapshot = await grantRef(auth.uid, grantId).get();
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    const grant = readGrant(snapshot.data());
    if (grant.status === 'ended' || !sinkFor(grant.readerAppId)) {
      throw new HttpsError(
        'failed-precondition',
        "That connection isn't active.",
      );
    }
    const outcome = await syncGrant(deps, auth.uid, grantId);
    return { synced: outcome === 'synced' ? 1 : 0 };
  }

  const now = deps.now();
  const snapshots = await firestore
    .collection(`connections/${auth.uid}/grants`)
    .where('status', '==', 'live')
    .get();
  const due = snapshots.docs.filter((doc) => {
    const grant = readGrant(doc.data());
    return (
      sinkFor(grant.readerAppId) !== null &&
      (grant.lastSyncAt === null || grant.lastSyncAt < now - SYNC_THROTTLE_MS)
    );
  });
  const outcomes = await due.reduce<Promise<number>>(async (done, doc) => {
    const total = await done;
    return (await syncGrant(deps, auth.uid, doc.id)) === 'synced'
      ? total + 1
      : total;
  }, Promise.resolve(0));
  return { synced: outcomes };
});
