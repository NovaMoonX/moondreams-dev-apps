import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  type EndConnectionRequest,
  isOutsideAccount,
} from '../vendor/connectionsContract.js';
import { readGrant } from './grants.js';
import { READER_SINKS } from './registry.js';
import { clearSyncCursors, errorCause } from './syncRunner.js';
import { revokeUnusedGoogleAccount } from './tokens.js';

const DAY_MS = 86_400_000;

export const grantRef = (uid: string, grantId: string) =>
  getFirestore().doc(`connections/${uid}/grants/${grantId}`);

export const accountRef = (uid: string, accountId: string) =>
  getFirestore().doc(`connections/${uid}/accounts/${accountId}`);

export const isKnown = <T>(table: Record<string, T>, id: string) =>
  Object.hasOwn(table, id);

export const sinkFor = (readerAppId: string) =>
  isKnown(READER_SINKS, readerAppId) ? READER_SINKS[readerAppId] : null;

/** An outside account no live grant uses any more is signed out at Google and forgotten; a failure here is logged and never blocks. */
export const revokeUnusedAccount = async (uid: string, grantId: string) => {
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

export const endAndClean = async (uid: string, req: EndConnectionRequest) => {
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
  try {
    await session.blankQuoted?.(req.grantId, ended.endedAt);
  } catch (error) {
    logger.error('connections.end.blankFailed', { cause: errorCause(error) });
  }
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
