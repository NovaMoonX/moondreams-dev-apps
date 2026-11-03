import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { describeError, removeFolderFiles } from '../../share/shareFiles.js';
import {
  CONTACT_CLEAR_DELAY_MS,
  planFinish,
  type FinishAction,
} from './finishPlan.js';
import { linkRef, publicFolder, saleRef } from './saleLinkStore.js';
import { syncSaleCopies } from './salePhotoCopies.js';
import { isRecord, isSafeId } from './salePageView.js';

const ACTIONS: readonly FinishAction[] = ['finish', 'reopen'];

/** The copy sweep stops starting things this long after the call began, well inside the function's timeout. */
const SWEEP_BUDGET_MS = 200_000;

const notFound = () =>
  new HttpsError(
    'not-found',
    "We couldn't find this sale. It may already be deleted.",
  );

const toCurrentId = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

/** The address stops first and its files go before its record, as `changeSalePublicLink` does on stop, so a page is never reported closed while its photos are still there. */
async function stopLink(linkId: string | null) {
  if (linkId === null) {
    return;
  }

  await removeFolderFiles(publicFolder(linkId)).catch((error: unknown) => {
    logger.error('goingOnce.finish.filesFailed', {
      link: linkId.slice(0, 4),
      code: describeError(error),
    });
    throw new HttpsError(
      'internal',
      "We couldn't finish that. Try again in a moment.",
    );
  });
}

async function finish(uid: string, saleId: string) {
  const startedAt = Date.now();
  const before = await saleRef(saleId).get();
  if (!before.exists || before.get('ownerUid') !== uid) {
    throw notFound();
  }

  const oldId = toCurrentId(before.get('publicLinkId'));
  if (!planFinish(before.data(), 'finish', uid, startedAt).isOk) {
    throw new HttpsError('failed-precondition', 'Already finished.');
  }

  await stopLink(oldId);
  const now = Date.now();
  await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(saleRef(saleId));
    const plan = planFinish(current.data(), 'finish', uid, now);
    if (!current.exists || current.get('ownerUid') !== uid) {
      throw notFound();
    }
    if (!plan.isOk) {
      throw new HttpsError('failed-precondition', plan.message);
    }
    if (toCurrentId(current.get('publicLinkId')) !== oldId) {
      throw new HttpsError(
        'aborted',
        'The link just changed. Check it and try again.',
      );
    }

    if (oldId !== null) {
      transaction.delete(linkRef(oldId));
    }
    transaction.update(saleRef(saleId), {
      ...plan.fields,
      publicLinkId: null,
      publicLinkChangedAt: null,
    });
  });

  const counts = await syncSaleCopies(
    saleId,
    startedAt + SWEEP_BUDGET_MS,
  ).catch((error: unknown) => {
    logger.error('goingOnce.finish.copyFailed', {
      code: describeError(error),
    });
    return null;
  });
  logger.info('goingOnce.finish.finished', { ...counts });
  return {
    status: 'FINISHED' as const,
    contactsClearAt: now + CONTACT_CLEAR_DELAY_MS,
  };
}

async function reopen(uid: string, saleId: string) {
  const now = Date.now();
  return getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(saleRef(saleId));
    if (!current.exists || current.get('ownerUid') !== uid) {
      throw notFound();
    }

    const plan = planFinish(current.data(), 'reopen', uid, now);
    if (!plan.isOk) {
      throw new HttpsError('failed-precondition', plan.message);
    }

    transaction.update(saleRef(saleId), plan.fields);
    return { status: 'OPEN' as const, contactsClearAt: null };
  });
}

/**
 * Finishes the seller's sale or reopens it, for the seller only. A missing sale, someone else's and a co-seller's call all answer one `not-found`; a sale already in the asked state answers `failed-precondition` in words.
 * Finishing stops the public page first (its files, then the link, then the sale's fields), then sweeps the copies once more so nothing an in-flight copy wrote back stays. Reopening cancels the pending clearing of buyers' details and leaves the page off. The sale's finish fields are written only here and by `clearSaleContacts`: `firestore.rules` refuses every client write to them.
 */
export const finishSale = onCall(
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
      throw new HttpsError('unauthenticated', 'Sign in to finish this sale.');
    }

    const data = isRecord(request.data) ? request.data : {};
    const action = ACTIONS.find((choice) => choice === data.action);
    if (!isSafeId(data.saleId) || action === undefined) {
      throw new HttpsError(
        'invalid-argument',
        'Choose a sale and whether to finish or reopen it.',
      );
    }

    return action === 'finish'
      ? finish(uid, data.saleId)
      : reopen(uid, data.saleId);
  },
);
