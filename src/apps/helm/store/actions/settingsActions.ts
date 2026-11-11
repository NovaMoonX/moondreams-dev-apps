import {
  arrayRemove,
  arrayUnion,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { reauthenticateWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, db, functions, googleProvider } from '@lib/firebase/config';
import { store } from '@/store';
import {
  clearHelmKey,
  helmTrustStore,
} from '@apps/helm/queries/helmKeyQueries';
import { forgetOutboxSecrets } from '@apps/helm/store/actions/outboxActions';
import { clearHelm } from '@apps/helm/store/helmSlice';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import type { AssistantTone, HelmProfile, VoiceMode } from '@apps/helm/types';

/** Creates the profile on first open, with this device's zone, and leaves an existing one alone, so two tabs opening together make one. */
export async function ensureHelmProfile(uid: string) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (snapshot.exists()) return;

    const profile: HelmProfile = {
      assistantName: null,
      assistantTone: null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayStartTime: DEFAULT_DAY_START_TIME,
      dayEndTime: DEFAULT_DAY_END_TIME,
      planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
      shiftCalendarIds: [],
      busyAllDayEventRefs: [],
      calendarOfferFoldedAt: null,
      hasSeenAiNotice: false,
      voiceMode: 'cloudWhenOnline',
      isWakeWordOn: false,
      isHandsFreeOn: true,
      hasSeenVoiceNotice: false,
      selfWhoId: null,
      currentPlace: null,
      styleLearnedThroughAt: null,
      createdAt: Date.now(),
      lastEditedAt: null,
    };
    transaction.set(profileRef, profile);
  });
}

export const setVoiceMode = (uid: string, voiceMode: VoiceMode) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    voiceMode,
    lastEditedAt: Date.now(),
  });

export const setWakeWordOn = (uid: string, isWakeWordOn: boolean) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    isWakeWordOn,
    lastEditedAt: Date.now(),
  });

export const setHandsFreeOn = (uid: string, isHandsFreeOn: boolean) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    isHandsFreeOn,
    lastEditedAt: Date.now(),
  });

export const setShiftCalendarIds = (uid: string, shiftCalendarIds: string[]) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    shiftCalendarIds,
    lastEditedAt: Date.now(),
  });

/** Marks one all-day event as blocking the person's day, or lets it go again. */
export const setAllDayEventBusy = (
  uid: string,
  eventId: string,
  isBusy: boolean,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    busyAllDayEventRefs: isBusy ? arrayUnion(eventId) : arrayRemove(eventId),
    lastEditedAt: Date.now(),
  });

export const foldCalendarOffer = (uid: string) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    calendarOfferFoldedAt: Date.now(),
    lastEditedAt: Date.now(),
  });

export const setDayWindow = (
  uid: string,
  dayStartTime: string,
  dayEndTime: string,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    dayStartTime,
    dayEndTime,
    lastEditedAt: Date.now(),
  });

export const setAssistantNameAndTone = (
  uid: string,
  assistantName: string | null,
  assistantTone: AssistantTone,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    assistantName,
    assistantTone,
    lastEditedAt: Date.now(),
  });

const DELETE_TIMEOUT_MS = 310_000;
const RECENT_SIGN_IN_MS = 4 * 60 * 1000;

const deleteHelmDataCallable = httpsCallable<
  Record<string, never>,
  { grants: number; documents: number; files: number }
>(functions, 'deleteHelmData', { timeout: DELETE_TIMEOUT_MS });

/** The server is the judge of a recent sign-in; this only asks early, inside the tap, so the sign-in window is not blocked. */
async function ensureRecentSignIn(isForced: boolean) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  if (!isForced) {
    const { authTime } = await user.getIdTokenResult();
    if (Date.now() - new Date(authTime).getTime() <= RECENT_SIGN_IN_MS) return;
  }
  await reauthenticateWithPopup(user, googleProvider);
  await user.getIdToken(true);
}

const readErrorCode = (error: unknown) =>
  (error as { code?: string } | null)?.code ?? '';

const needsRecentSignIn = (error: unknown) =>
  readErrorCode(error) === 'functions/failed-precondition';

/** Makes this browser forget the person's Helm: the key and its trust entry, the saved list and drop-box key, and what the screen holds. */
export async function forgetHelmOnDevice(uid: string) {
  await helmTrustStore.forget(uid).catch(() => undefined);
  await forgetOutboxSecrets(uid).catch(() => undefined);
  clearHelmKey();
  store.dispatch(clearHelm());
}

/** Opens Helm again from its start, as a first open. */
export const reopenHelmToFirstRun = () =>
  window.location.replace(window.location.pathname);

const runDelete = () =>
  deleteHelmDataCallable({}).catch((error: unknown) => {
    if (readErrorCode(error) === 'functions/not-found') return null;
    throw error;
  });

/** Deletes everything Helm holds for the person on the server, then this browser forgets its keys. Throws when the server could not finish; a rerun finishes it. */
export async function deleteAllHelmData(uid: string) {
  await ensureRecentSignIn(false);
  try {
    await runDelete();
  } catch (error) {
    if (!needsRecentSignIn(error)) throw error;
    await ensureRecentSignIn(true);
    await runDelete();
  }
  await forgetHelmOnDevice(uid);
}
