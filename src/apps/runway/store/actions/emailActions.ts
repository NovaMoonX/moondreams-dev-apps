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
import { sealJson } from '@apps/runway/security';
import type {
  EmailFilterDoc,
  EmailFilterSealed,
  EmailSetupDoc,
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

export type EmailSetupChange = Partial<
  Pick<EmailSetupDoc, 'provider' | 'step' | 'doneAt'>
>;

/** Writes the walkthrough's progress from what is stored now, so a second device never rewinds it; `decide` returns null to write nothing. */
export async function saveEmailSetup(
  uid: string,
  decide: (current: EmailSetupDoc | null) => EmailSetupChange | null,
): Promise<void> {
  const ref = planRef(uid, 'emailSetup', 'progress');
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? (snapshot.data() as EmailSetupDoc)
      : null;
    const change = decide(current);
    if (change === null) return;
    const now = Date.now();
    transaction.set(ref, {
      id: 'progress',
      provider: current?.provider ?? null,
      step: current?.step ?? 0,
      doneAt: current?.doneAt ?? null,
      createdAt: current?.createdAt ?? now,
      ...change,
      updatedAt: now,
    } satisfies EmailSetupDoc);
  });
}
