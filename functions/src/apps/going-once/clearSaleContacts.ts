import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldPath,
  getFirestore,
  type CollectionReference,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  clearedSaleFields,
  isDueForClearing,
  scrubInquiry,
  scrubItem,
  type Patch,
} from './finishPlan.js';
import { saleRef } from './saleLinkStore.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Documents read and written together; well under the 500 writes a transaction takes. */
const CHUNK = 400;

/** Clears one collection a chunk at a time. Each chunk is read again inside its own transaction and only what still holds a buyer's details is written, so a rerun after a crash finishes the job and a resend that landed meanwhile is never half-overwritten. */
async function scrubCollection(
  collection: CollectionReference,
  scrub: (data: unknown, now: number) => Patch | null,
  now: number,
): Promise<number> {
  const run = async (
    after: string | null,
    cleared: number,
  ): Promise<number> => {
    const ordered = collection.orderBy(FieldPath.documentId()).limit(CHUNK);
    const query = after === null ? ordered : ordered.startAfter(after);
    const chunk = await getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(query);
      const written = snapshot.docs.flatMap((doc) => {
        const patch = scrub(doc.data(), now);
        if (patch === null) {
          return [];
        }

        transaction.update(doc.ref, patch);
        return [doc.id];
      });
      return {
        size: snapshot.size,
        last: snapshot.docs.at(-1)?.id ?? null,
        written: written.length,
      };
    });
    return chunk.size < CHUNK || chunk.last === null
      ? cleared + chunk.written
      : run(chunk.last, cleared + chunk.written);
  };
  return run(null, 0);
}

/** Clears one sale's buyer details. The sale's own marker goes last, and only if it is still finished and due, so a reopen that came meanwhile is never overwritten. */
async function clearSale(saleId: string, now: number) {
  const sale = saleRef(saleId);
  const [inquiries, things] = await Promise.all([
    scrubCollection(sale.collection('inquiries'), scrubInquiry, now),
    scrubCollection(sale.collection('items'), scrubItem, now),
  ]);
  const isMarked = await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(sale);
    if (!isDueForClearing(current.data(), now)) {
      return false;
    }

    transaction.update(sale, clearedSaleFields(now));
    return true;
  });
  return { inquiries, things, isMarked };
}

/**
 * Clears buyers' names, contacts and messages from every finished sale whose 30 days are up, once a day: each inquiry's details, and the buyer's name in each thing's hold, sale record and history. The thing, its day and every price stay.
 * Safe to run again at any point; a sale that fails is left for the next run. Logs counts and four characters of a sale id only.
 */
export const clearSaleContacts = onSchedule(
  {
    schedule: '30 4 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const now = Date.now();
    const due = await getFirestore()
      .collection('apps/going-once/sales')
      .where('contactsClearAt', '<=', now)
      .get();
    const cleared = await due.docs.reduce<Promise<number>>(
      async (previous, doc) => {
        const total = await previous;
        if (!isDueForClearing(doc.data(), now)) {
          return total;
        }

        const counts = await clearSale(doc.id, now).catch((error: unknown) => {
          logger.error('goingOnce.clear.failed', {
            sale: doc.id.slice(0, 4),
            code:
              typeof (error as { code?: unknown } | null)?.code === 'string'
                ? (error as { code: string }).code
                : 'unknown',
          });
          return null;
        });
        if (counts !== null) {
          logger.info('goingOnce.clear.cleared', {
            sale: doc.id.slice(0, 4),
            ...counts,
          });
        }
        return total + (counts?.isMarked ? 1 : 0);
      },
      Promise.resolve(0),
    );
    logger.info('goingOnce.clear.done', { due: due.size, cleared });
  },
);

export default clearSaleContacts;
