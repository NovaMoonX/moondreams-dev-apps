import {
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { SPEND_WORDS } from '@apps/runway/constants';
import { sealJson } from '@apps/runway/security';
import type {
  DateOnly,
  EmailFilterDoc,
  EmailFilterSealed,
  RunwayEncryption,
} from '@apps/runway/types';

export type EmailFilterSuggestion = EmailFilterSealed & { label: string };

const rotateCallable = httpsCallable<
  Record<string, never>,
  { address: string }
>(functions, 'rotateRunwayEmailAddress');

const suggestCallable = httpsCallable<
  { eventId: string },
  { suggestions: EmailFilterSuggestion[] }
>(functions, 'suggestRunwayEmailFilter');

const addPurchaseCallable = httpsCallable<
  { eventId: string },
  { purchaseId: string }
>(functions, 'addRunwayEmailPurchase');

const planRef = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

/** Gives the person a new forwarding address; the old one stops working at once. Resolves with the new address. */
export async function rotateEmailAddress(): Promise<string> {
  const response = await rotateCallable({});
  return response.data.address;
}

/** Filters Functions suggest for one email, each with a short name; empty when unsure. */
export async function suggestEmailFilters(
  eventId: string,
): Promise<EmailFilterSuggestion[]> {
  const response = await suggestCallable({ eventId });
  return response.data.suggestions;
}

/** Makes a purchase from an email Runway didn't take as one, at the person's word. Resolves with the new purchase's id. */
export async function addEmailPurchase(eventId: string): Promise<string> {
  const response = await addPurchaseCallable({ eventId });
  return response.data.purchaseId;
}

/** Saves a filter: a later email matching every condition it sets is dropped before anything reads it. Resolves with its id. */
export async function createEmailFilter(
  uid: string,
  encryption: RunwayEncryption,
  sealed: EmailFilterSealed,
): Promise<string> {
  const id = generateUuid();
  await setDoc(planRef(uid, 'emailFilters', id), {
    id,
    createdAt: Date.now(),
    sealed: await sealJson(sealed, encryption),
  } satisfies EmailFilterDoc);
  return id;
}

export async function deleteEmailFilter(
  uid: string,
  filterId: string,
): Promise<void> {
  await deleteDoc(planRef(uid, 'emailFilters', filterId));
}

export async function deleteEmailEvent(
  uid: string,
  eventId: string,
): Promise<void> {
  await deleteDoc(planRef(uid, 'emailEvents', eventId));
}

/** Says whether an emailed purchase is still waiting for its bank; one that isn't stays a purchase and counts as before below Link. */
export async function setEmailWaiting(
  uid: string,
  purchaseId: string,
  isWaiting: boolean,
): Promise<void> {
  await updateDoc(planRef(uid, 'purchases', purchaseId), {
    emailWaiting: isWaiting,
    updatedAt: Date.now(),
  });
}

/** Widens how long a waiting emailed purchase waits for its bank's charge, to the day given; null goes back to its usual wait. */
/** Sets how long an emailed purchase keeps waiting for its bank; with `expected`, only while it still holds that day, so an Undo never overwrites a later choice. */
export async function setEmailWaitUntil(
  uid: string,
  purchaseId: string,
  until: DateOnly | null,
  expected?: DateOnly | null,
): Promise<void> {
  const ref = planRef(uid, 'purchases', purchaseId);
  if (expected === undefined) {
    await updateDoc(ref, { emailWaitUntil: until, updatedAt: Date.now() });
    return;
  }
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    if ((current.data()?.emailWaitUntil ?? null) !== expected) {
      throw new Error(SPEND_WORDS.changedElsewhere);
    }
    transaction.update(ref, { emailWaitUntil: until, updatedAt: Date.now() });
  });
}
