import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { describeError, removeFolderFiles } from '../../share/shareFiles.js';
import { mintShareId } from '../../share/shareIds.js';
import { syncSaleCopies } from './salePhotoCopies.js';
import { linkRef, publicFolder, saleRef } from './saleLinkStore.js';
import { FINISHED_SALE_STATUS, isRecord, isSafeId } from './salePageView.js';

type LinkAction = 'create' | 'renew' | 'stop';

const ACTIONS: readonly LinkAction[] = ['create', 'renew', 'stop'];

const notFound = () =>
  new HttpsError(
    'not-found',
    "We couldn't find this sale. It may already be deleted.",
  );

/** The copy sweep stops starting things this long after the call began, well inside the function's timeout. */
const SWEEP_BUDGET_MS = 200_000;

async function sweepCopies(saleId: string, action: LinkAction, from: number) {
  const counts = await syncSaleCopies(saleId, from + SWEEP_BUDGET_MS).catch(
    (error: unknown) => {
      logger.error('goingOnce.link.copyFailed', { code: describeError(error) });
      return null;
    },
  );
  if (counts !== null) {
    logger.info('goingOnce.link.copied', { action, ...counts });
  }
}

const toCurrentId = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

/** The old address stops first and its files go before its record, so a link is never reported ended while its photos are still there. */
async function removeOldFiles(linkId: string | null) {
  if (linkId === null) {
    return;
  }

  await removeFolderFiles(publicFolder(linkId)).catch((error: unknown) => {
    logger.error('goingOnce.link.filesFailed', {
      link: linkId.slice(0, 4),
      code: describeError(error),
    });
    throw new HttpsError(
      'internal',
      "We couldn't finish that. Try again in a moment.",
    );
  });
}

/** On renew the old record is already gone, so the old folder is removed on its own, before any copying, and a failure here is logged and never undoes the renewal. */
async function removeRetiredFolder(linkId: string | null) {
  if (linkId === null) {
    return;
  }

  await removeFolderFiles(publicFolder(linkId)).catch((error: unknown) =>
    logger.error('goingOnce.link.retiredFilesFailed', {
      link: linkId.slice(0, 4),
      code: describeError(error),
    }),
  );
}

async function changeLink(uid: string, saleId: string, action: LinkAction) {
  const startedAt = Date.now();
  const before = await saleRef(saleId).get();
  if (!before.exists || before.get('ownerUid') !== uid) {
    throw notFound();
  }

  if (action !== 'stop' && before.get('status') === FINISHED_SALE_STATUS) {
    throw new HttpsError(
      'failed-precondition',
      'This sale is finished. Reopen it to turn the page on.',
    );
  }

  const oldId = toCurrentId(before.get('publicLinkId'));
  if (action === 'create' && oldId !== null) {
    await sweepCopies(saleId, action, startedAt);
    return { linkId: oldId };
  }
  if (action === 'stop' && oldId === null) {
    return { linkId: null };
  }

  await removeOldFiles(action === 'stop' ? oldId : null);
  const newId = action === 'stop' ? null : mintShareId();
  const now = Date.now();
  await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(saleRef(saleId));
    if (
      !current.exists ||
      current.get('ownerUid') !== uid ||
      toCurrentId(current.get('publicLinkId')) !== oldId
    ) {
      throw new HttpsError(
        'aborted',
        'The link just changed. Check it and try again.',
      );
    }

    if (oldId !== null) {
      transaction.delete(linkRef(oldId));
    }
    if (newId !== null) {
      transaction.create(linkRef(newId), {
        id: newId,
        saleId,
        createdBy: uid,
        createdAt: now,
      });
    }
    transaction.update(saleRef(saleId), {
      publicLinkId: newId,
      publicLinkChangedAt: newId === null ? null : now,
    });
  });
  if (action === 'renew') {
    await removeRetiredFolder(oldId);
  }
  if (newId !== null) {
    await sweepCopies(saleId, action, startedAt);
  }
  logger.info('goingOnce.link.changed', {
    action,
    link: (newId ?? oldId ?? '').slice(0, 4),
  });
  return { linkId: newId };
}

/**
 * Turns the sale's public page on, gives it a new address or turns it off, for the seller only. A missing sale, someone else's and a co-seller's call all answer one `not-found`.
 * On stop, files go before the record they belong to; on renew the old folder goes right after the swap; on create and renew the new address's photo copies are then made within a time budget before the call returns, and a create on a page that is already on runs that sweep again. The sale's own fields are written only here: `firestore.rules` refuses every client write to them.
 */
export const changeSalePublicLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    memory: '1GiB',
    timeoutSeconds: 300,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to change this link.');
    }

    const data = isRecord(request.data) ? request.data : {};
    const action = ACTIONS.find((choice) => choice === data.action);
    if (!isSafeId(data.saleId) || action === undefined) {
      throw new HttpsError(
        'invalid-argument',
        'Choose a sale and what to do with its link.',
      );
    }

    return changeLink(uid, data.saleId, action);
  },
);
