import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  HttpsError,
  onCall,
  type CallableOptions,
  type CallableRequest,
} from 'firebase-functions/v2/https';

import { canOpenApp } from '../appAccess.js';
import {
  SITE_ACCOUNT_ID,
  type EndConnectionRequest,
  isOutsideAccount,
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
  requestedScopes,
} from './grants.js';
import {
  READER_APPS,
  READER_SINKS,
  SOURCE_ADAPTERS,
  SOURCE_SECRETS,
} from './registry.js';
import { InProcessSourceClient } from './sourceClient.js';
import {
  clearSyncCursors,
  errorCause,
  syncGrant,
  type SyncDeps,
} from './syncRunner.js';
import { GOOGLE_SECRETS, revokeUnusedGoogleAccount } from './tokens.js';

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
  secrets: [
    ...Object.values(READER_SINKS).flatMap((sink) => sink.secrets),
    ...SOURCE_SECRETS,
  ],
};

const END_OPTIONS: CallableOptions = { ...OPTIONS, secrets: GOOGLE_SECRETS };

export const SYNC_THROTTLE_MS = 15 * 60_000;
const SYNC_NOW_THROTTLE_MS = 60_000;
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

const accountRef = (uid: string, accountId: string) =>
  getFirestore().doc(`connections/${uid}/accounts/${accountId}`);

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
  if (!isKnown(SOURCE_ADAPTERS, req.connectorId)) {
    throw new HttpsError('invalid-argument', "That source isn't available.");
  }
  const { manifest } = SOURCE_ADAPTERS[req.connectorId];
  const isOutside = manifest.connect.kind === 'oauth';
  const sourceAppId = readConnectorAppId(req.connectorId);
  const isAccountValid = isOutside
    ? isOutsideAccount(req.accountId)
    : sourceAppId !== null && req.accountId === SITE_ACCOUNT_ID;
  if (!isAccountValid) {
    throw new HttpsError('invalid-argument', "That account isn't available.");
  }
  if (!isOutside && req.options !== null) {
    throw new HttpsError('invalid-argument', "That request wasn't understood.");
  }
  if (req.categoryIds.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'Pick at least one thing to share.',
    );
  }
  assertDeclaredCategories(manifest, req.categoryIds);

  const firestore = getFirestore();
  const canOpen = await Promise.all(
    [req.readerAppId, ...(sourceAppId === null ? [] : [sourceAppId])].map(
      (appId) => canOpenApp(firestore, appId, auth),
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
  const needed = requestedScopes(manifest, req.categoryIds);
  await firestore.runTransaction(async (transaction) => {
    const [snapshot, account] = await Promise.all([
      transaction.get(ref),
      isOutside
        ? transaction.get(accountRef(auth.uid, req.accountId))
        : Promise.resolve(null),
    ]);
    if (account) {
      const data = account.data();
      const granted: unknown[] = Array.isArray(data?.grantedScopes)
        ? data.grantedScopes
        : [];
      if (
        !account.exists ||
        data?.status !== 'live' ||
        !needed.every((scope) => granted.includes(scope))
      ) {
        throw new HttpsError(
          'failed-precondition',
          "That account isn't connected for this. Connect it again.",
        );
      }
    }
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
    const manifest = SOURCE_ADAPTERS[current.connectorId].manifest;
    const isOutside = manifest.connect.kind === 'oauth';
    if (req.options !== undefined && !isOutside) {
      throw new HttpsError(
        'invalid-argument',
        "That request wasn't understood.",
      );
    }
    if (
      req.accountLabel !== undefined &&
      !isOutsideAccount(current.accountId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        "That request wasn't understood.",
      );
    }
    const labelRef = accountRef(auth.uid, current.accountId);
    const labelSnapshot =
      req.accountLabel !== undefined ? await transaction.get(labelRef) : null;
    if (labelSnapshot && !labelSnapshot.exists) {
      throw new HttpsError('not-found', "That account doesn't exist.");
    }
    const now = Date.now();
    const changes = req.categories ?? {};
    const categories = applyCategoryChanges(current, changes, manifest, now);
    const turnedOff = Object.entries(changes).flatMap(([id, isOn]) =>
      isOn ? [] : [id],
    );
    transaction.update(ref, {
      ...(req.categories ? { categories } : {}),
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
      ...(req.options !== undefined ? { options: req.options } : {}),
      updatedAt: now,
    });
    if (labelSnapshot) {
      transaction.update(labelRef, { label: req.accountLabel });
    }
    return { current, turnedOff };
  });

  await Promise.all(
    grant.turnedOff.map((id) =>
      clearSyncCursors(firestore, auth.uid, req.grantId, id),
    ),
  );
  const sink = sinkFor(grant.current.readerAppId);
  if (sink && grant.turnedOff.length > 0) {
    const session = sink.openSession(firestore, auth.uid);
    // A copy left by a failed delete goes at the next sync, which drops every category that is off.
    await Promise.all(
      grant.turnedOff.map((id) => session.deleteCategory(req.grantId, id)),
    ).catch((error: unknown) =>
      logger.warn('connections.update.deleteFailed', {
        grantId: req.grantId,
        cause: errorCause(error),
      }),
    );
  }
  return { grantId: req.grantId };
});

export const endConnection = onCall(END_OPTIONS, async (request) => {
  const auth = requireAuth(request);
  const req = readEndConnectionRequest(request.data);
  const result = await endAndClean(auth.uid, req);
  await revokeUnusedAccount(auth.uid, req.grantId);
  return result;
});

/** An outside account no live grant uses any more is signed out at Google and forgotten; a failure here is logged and never blocks. */
const revokeUnusedAccount = async (uid: string, grantId: string) => {
  try {
    const firestore = getFirestore();
    const snapshot = await grantRef(uid, grantId).get();
    if (!snapshot.exists) return;
    const { accountId } = readGrant(snapshot.data());
    if (!isOutsideAccount(accountId)) return;
    await revokeUnusedGoogleAccount(firestore, uid, accountId);
  } catch (error) {
    logger.warn('connections.end.revokeFailed', { cause: errorCause(error) });
  }
};

const endAndClean = async (uid: string, req: EndConnectionRequest) => {
  const firestore = getFirestore();
  const ref = grantRef(uid, req.grantId);

  // The grant ends before any copy is touched, so a sync still running settles against the ended state and cleans up what it wrote.
  const ended = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new HttpsError('not-found', "That connection doesn't exist.");
    const grant = readGrant(snapshot.data());
    const sink = sinkFor(grant.readerAppId);
    if (grant.status === 'ended') {
      return {
        sink,
        endedAt: grant.endedAt ?? Date.now(),
        keptCopies: grant.keptCopies,
      };
    }
    const endedAt = Date.now();
    const deleteAfter = endedAt + (sink?.keptCopyDays ?? 0) * DAY_MS;
    const keptCopies =
      sink !== null && !req.deleteCopies ? { count: 0, deleteAfter } : null;
    transaction.update(ref, {
      status: 'ended',
      endedAt,
      keptCopies,
      syncLeaseUntil: null,
      updatedAt: endedAt,
    });
    return { sink, endedAt, keptCopies };
  });
  await clearSyncCursors(firestore, uid, req.grantId, null);
  if (!ended.sink) return { grantId: req.grantId };

  const session = ended.sink.openSession(firestore, uid);
  if (ended.keptCopies === null) {
    await session.deleteGrant(req.grantId);
    return { grantId: req.grantId };
  }
  const { deleteAfter } = ended.keptCopies;
  const kept = await session.keepGrant(
    req.grantId,
    ended.endedAt,
    deleteAfter ?? ended.endedAt,
  );
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    const grant = readGrant(current.data());
    if (grant.status !== 'ended' || grant.endedAt !== ended.endedAt) return;
    transaction.update(ref, {
      keptCopies:
        kept > 0
          ? { count: kept, deleteAfter: deleteAfter ?? ended.endedAt }
          : null,
    });
  });
  return { grantId: req.grantId };
};

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
    const hasUnreadCategory = Object.entries(grant.categories).some(
      ([id, category]) =>
        category.isOn &&
        grant.categoryState[id]?.lastOkAt == null &&
        grant.categoryState[id]?.lastError == null,
    );
    if (
      grant.lastSyncAt !== null &&
      grant.lastSyncAt > deps.now() - SYNC_NOW_THROTTLE_MS &&
      grant.updatedAt <= grant.lastSyncAt &&
      !hasUnreadCategory
    )
      return { synced: 0 };
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
