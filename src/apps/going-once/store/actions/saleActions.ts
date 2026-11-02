import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

import { db, functions } from '@/lib/firebase/config';
import { ADMIN_NAME } from '@lib/app/app.constants';
import { generateUuid } from '@/utils';
import {
  MAX_BUYER_NOTE_LENGTH,
  MAX_PICKUP_AREA_LENGTH,
  MAX_SALE_NAME_LENGTH,
} from '@apps/going-once/constants';
import type { AppDispatch } from '@/store';
import { removeSale, upsertSale } from '@apps/going-once/store';
import type { Sale, SaleDetailField } from '@apps/going-once/types';

interface CreateSaleInput {
  uid: string;
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
}

const toTrimmedOrNull = (value: string | null) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * Starts a sale locally at once and saves it in the background, so a slow or offline phone never holds the sheet.
 * When the save is refused, the sale is taken back out and `onSaveFailed` gets a sentence to show.
 */
export function startSale(
  dispatch: AppDispatch,
  { uid, name, pickupArea, buyerNote }: CreateSaleInput,
  onSaveFailed: (message: string) => void,
): Sale {
  const sale: Sale = {
    id: generateUuid(),
    name: name.trim().slice(0, MAX_SALE_NAME_LENGTH),
    pickupArea:
      toTrimmedOrNull(pickupArea)?.slice(0, MAX_PICKUP_AREA_LENGTH) ?? null,
    buyerNote:
      toTrimmedOrNull(buyerNote)?.slice(0, MAX_BUYER_NOTE_LENGTH) ?? null,
    currency: 'USD',
    ownerUid: uid,
    createdBy: uid,
    members: [uid],
    createdAt: Date.now(),
    lastEditedAt: null,
  };

  dispatch(upsertSale(sale));
  setDoc(doc(db, 'apps', 'going-once', 'sales', sale.id), sale).catch(
    (error: unknown) => {
      dispatch(removeSale(sale.id));
      const isRefused =
        error instanceof FirebaseError && error.code === 'permission-denied';
      onSaveFailed(
        isRefused
          ? `We couldn't start ${sale.name}. Starting sales may be turned off for you right now: ask ${ADMIN_NAME} if you'd like it on.`
          : `We couldn't save ${sale.name}. Check your connection and start it again.`,
      );
    },
  );
  return sale;
}

/** Writes one of the sale's details and when it was edited, and nothing else. */
export function updateSaleDetail(
  saleId: string,
  field: SaleDetailField,
  value: string | null,
): Promise<void> {
  return updateDoc(doc(db, 'apps', 'going-once', 'sales', saleId), {
    [field]: value,
    lastEditedAt: Date.now(),
  });
}

const DELETE_TIMEOUT_MS = 540_000;
const DELETE_FAILED =
  "We couldn't delete this sale. Check your connection and try again.";
const SERVER_SENTENCES = [
  "The sale wasn't fully deleted. Delete it again to finish.",
];

export type DeleteSaleResult =
  { outcome: 'deleted' } | { outcome: 'failed'; reason: string };

/** Deletes a sale with its things and photos; a sale that is already gone counts as deleted. */
export async function deleteSale(saleId: string): Promise<DeleteSaleResult> {
  try {
    await httpsCallable<{ saleId: string }, { deleted: boolean }>(
      functions,
      'deleteSale',
      { timeout: DELETE_TIMEOUT_MS },
    )({ saleId });
    return { outcome: 'deleted' };
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'functions/not-found') return { outcome: 'deleted' };
    const reason = ((): string => {
      if (code === 'functions/deadline-exceeded')
        return 'Still deleting. Check again in a moment.';
      if (code === 'functions/unauthenticated')
        return 'Sign in again to delete this sale.';
      if (error instanceof Error && SERVER_SENTENCES.includes(error.message))
        return error.message;
      return DELETE_FAILED;
    })();
    return { outcome: 'failed', reason };
  }
}
