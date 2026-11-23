import {
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';

import { store } from '@/store';
import { watchWriteLanded } from '@/lib/firebase/syncWatchdog';
import { generateUuid } from '@/utils/idUtils';
import { openJson, sealJson } from '@apps/runway/security';
import {
  toBanks,
  type OpenEmailSetup,
} from '@apps/runway/store/listeners/emailListeners';
import {
  dropWrites,
  holdEmailSetup,
  settleWrites,
} from '@apps/runway/store/runwaySlice';
import type {
  EmailFilterDoc,
  EmailBank,
  EmailFilterSealed,
  EmailSetupDoc,
  EmailSetupSealed,
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
  Pick<EmailSetupDoc, 'provider' | 'stepId' | 'doneAt' | 'confirmOpenedAt'>
>;

type SetupHold = (patch: Partial<OpenEmailSetup>) => void;

/** A setup-document write shown at once and taken back on failure; `work` returns whether it wrote anything. */
async function writeSetupHeld<T extends { isWritten: boolean }>(
  work: (hold: SetupHold) => Promise<T>,
): Promise<T> {
  const token = generateUuid();
  try {
    const result = await work((patch) =>
      store.dispatch(holdEmailSetup({ token, patch })),
    );
    if (!result.isWritten) {
      store.dispatch(dropWrites(token));
      return result;
    }
    store.dispatch(settleWrites(token));
    void watchWriteLanded({
      feature: 'Runway',
      what: 'your email setup',
      hasLanded: () =>
        store
          .getState()
          .runway.emailSetupHeld.every((hold) => hold.token !== token),
    });
    return result;
  } catch (error) {
    store.dispatch(dropWrites(token));
    throw error;
  }
}

type SetupProgress = Pick<
  EmailSetupDoc,
  'provider' | 'stepId' | 'doneAt' | 'confirmOpenedAt'
>;

/** Writes the walkthrough's progress from what is stored now, so a second device never rewinds it; `decide` returns null to write nothing. */
export async function saveEmailSetup(
  uid: string,
  decide: (current: SetupProgress | null) => EmailSetupChange | null,
): Promise<void> {
  const ref = planRef(uid, 'emailSetup', 'progress');
  await writeSetupHeld(async (hold) => {
    const shown = store.getState().runway.emailSetup;
    const early = decide(shown);
    if (early !== null) hold(early);
    const isWritten = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists()
        ? (snapshot.data() as EmailSetupDoc)
        : null;
      const change = decide(current);
      if (change === null) return false;
      hold(change);
      const now = Date.now();
      transaction.set(ref, {
        id: 'progress',
        provider: current?.provider ?? null,
        stepId: current?.stepId ?? null,
        doneAt: current?.doneAt ?? null,
        confirmOpenedAt: current?.confirmOpenedAt ?? null,
        sealed: current?.sealed ?? null,
        createdAt: current?.createdAt ?? now,
        ...change,
        updatedAt: now,
      } satisfies EmailSetupDoc);
      return true;
    });
    return { isWritten };
  });
}

/** Rewrites the banks whose alerts are forwarded from what is stored now, so an edit on another device is kept; `change` returns the new list. */
export async function saveEmailBanks(
  uid: string,
  encryption: RunwayEncryption,
  change: (banks: EmailBank[]) => EmailBank[],
): Promise<boolean> {
  const ref = planRef(uid, 'emailSetup', 'progress');
  const { isWritten } = await writeSetupHeld(async (hold) => {
    const shown = store.getState().runway.emailSetup;
    if (shown !== null) hold({ banks: toBanks(change(shown.banks)) });
    const isChanged = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists()
        ? (snapshot.data() as Partial<EmailSetupDoc>)
        : null;
      const opened = current?.sealed
        ? await openJson<Partial<EmailSetupSealed>>(current.sealed, encryption)
        : null;
      const before = Array.isArray(opened?.banks) ? opened.banks : [];
      const banks = change(before);
      if (JSON.stringify(banks) === JSON.stringify(before)) return false;
      hold({ banks: toBanks(banks) });
      const now = Date.now();
      transaction.set(ref, {
        id: 'progress',
        provider: current?.provider ?? null,
        stepId: current?.stepId ?? null,
        doneAt: current?.doneAt ?? null,
        confirmOpenedAt: current?.confirmOpenedAt ?? null,
        sealed: await sealJson(
          { banks } satisfies EmailSetupSealed,
          encryption,
        ),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      } satisfies EmailSetupDoc);
      return true;
    });
    return { isWritten: isChanged };
  });
  return isWritten;
}
