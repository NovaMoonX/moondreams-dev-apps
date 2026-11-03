import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
import type {
  Sale,
  SaleDetailField,
  SaleLinkAction,
} from '@apps/going-once/types';

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
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    ownerUid: uid,
    createdBy: uid,
    members: [uid],
    memberJoinedAt: {},
    publicLinkId: null,
    publicLinkChangedAt: null,
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

/** Keeps the seller's time zone on a sale made before it was kept, for the push's quiet hours; the rules allow it only while the sale has none. */
export function backfillSaleTimeZone(saleId: string): Promise<void> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone
    ? updateDoc(doc(db, 'apps', 'going-once', 'sales', saleId), { timeZone })
    : Promise.resolve();
}

const DELETE_TIMEOUT_MS = 540_000;
const DELETE_FAILED =
  "We couldn't delete this sale. Check your connection and try again.";
const SERVER_SENTENCES = [
  "The sale wasn't fully deleted. Delete it again to finish.",
];

const toDeleteReason = (code: string, error: unknown) => {
  if (code === 'functions/deadline-exceeded')
    return 'Still deleting. Check again in a moment.';
  if (code === 'functions/unauthenticated')
    return 'Sign in again to delete this sale.';
  if (error instanceof Error && SERVER_SENTENCES.includes(error.message))
    return error.message;
  return DELETE_FAILED;
};

// A missing callable also answers not-found, so "already gone" is checked against the sale itself; a read refused for a missing sale counts as gone.
const isSaleGone = (saleId: string) =>
  getDoc(doc(db, 'apps', 'going-once', 'sales', saleId)).then(
    (snapshot) => !snapshot.exists(),
    (error: unknown) =>
      error instanceof FirebaseError && error.code === 'permission-denied',
  );

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
    if (code === 'functions/not-found' && (await isSaleGone(saleId)))
      return { outcome: 'deleted' };
    return { outcome: 'failed', reason: toDeleteReason(code, error) };
  }
}

const LINK_FAILED =
  "We couldn't change the public page. Check your connection and try again.";
const LINK_SERVER_SENTENCES = [
  'This sale is finished. Reopen it to turn the page on.',
  'The link just changed. Check it and try again.',
  "We couldn't finish that. Try again in a moment.",
];

const toLinkReason = (code: string, error: unknown) => {
  if (code === 'functions/unauthenticated')
    return 'Sign in again to change the public page.';
  if (code === 'functions/not-found')
    return "We couldn't find this sale. It may have been deleted.";
  if (error instanceof Error && LINK_SERVER_SENTENCES.includes(error.message))
    return error.message;
  return LINK_FAILED;
};

export type SaleLinkResult =
  | { outcome: 'done'; linkId: string | null }
  | { outcome: 'failed'; reason: string };

/** Turns the sale's public page on, gives it a new address or turns it off; only the seller's call is taken. */
export async function changeSaleLink(
  saleId: string,
  action: SaleLinkAction,
): Promise<SaleLinkResult> {
  try {
    const { data } = await httpsCallable<
      { saleId: string; action: SaleLinkAction },
      { linkId: string | null }
    >(
      functions,
      'changeSalePublicLink',
    )({ saleId, action });
    return { outcome: 'done', linkId: data.linkId };
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    return { outcome: 'failed', reason: toLinkReason(code, error) };
  }
}
