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
import { remindersStamp } from '@apps/helm/store/actions/markRemindersChanged';
import { forgetOutboxSecrets } from '@apps/helm/store/actions/outboxActions';
import { clearHelm } from '@apps/helm/store/helmSlice';
import { keepDeletedNote } from '@apps/helm/utils/deletedNote';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import { keepCurrentAway, MAX_ZONE_SPANS } from '@apps/helm/engine/whereabouts';
import { setWhoNearNow } from '@apps/helm/store/actions/whoActions';
import type {
  AbilityDecline,
  AssistantTone,
  HelmEncryption,
  HelmProfile,
  HelmTheme,
  PhoneLocation,
  VoiceMode,
  ZoneSpan,
} from '@apps/helm/types';

/** Creates the profile on first open, with this device's zone, and leaves an existing one alone, so two tabs opening together make one. */
export async function ensureHelmProfile(uid: string) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (snapshot.exists()) return;

    const profile: HelmProfile = {
      assistantName: null,
      assistantNameVariants: null,
      assistantTone: null,
      theme: null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayStartTime: DEFAULT_DAY_START_TIME,
      dayEndTime: DEFAULT_DAY_END_TIME,
      planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
      shiftCalendarIds: [],
      busyAllDayEventRefs: [],
      calendarOfferFoldedAt: null,
      quietHours: null,
      remindersPausedAt: null,
      habitRemindersChangedAt: null,
      habitRemindersIdleAt: null,
      hasSeenAiNotice: false,
      voiceMode: 'cloudWhenOnline',
      voiceId: null,
      voiceSpeed: null,
      isWakeWordOn: false,
      isHandsFreeOn: true,
      hasSeenVoiceNotice: null,
      selfWhoId: null,
      currentPlace: null,
      styleLearnedThroughAt: null,
      phoneLocation: 'off',
      zoneSpans: [],
      abilityOffers: [],
      conversationFreshAt: null,
      isDailyFreshOn: false,
      isLearningOn: true,
      patternsCheckedOn: null,
      reflectDueAt: null,
      forgottenAt: null,
      prunedOn: null,
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

export const setHelmVoiceId = (uid: string, voiceId: string | null) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    voiceId,
    lastEditedAt: Date.now(),
  });

export const setHelmVoiceSpeed = (uid: string, voiceSpeed: number | null) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    voiceSpeed,
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

export const setDailyFreshOn = (uid: string, isDailyFreshOn: boolean) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    isDailyFreshOn,
    lastEditedAt: Date.now(),
  });

/** Starts a new conversation from now, or puts back the moment it last started fresh (`null` for never) to take that back. */
export const setConversationFreshAt = (
  uid: string,
  conversationFreshAt: number | null,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    conversationFreshAt,
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
    ...remindersStamp(Date.now()),
    lastEditedAt: Date.now(),
  });

/** Quiet hours for habit reminders ("HH:mm" in the person's zone); null means outside Your day. */
export const setQuietHours = (
  uid: string,
  quietHours: { start: string; end: string } | null,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    quietHours,
    ...remindersStamp(Date.now()),
    lastEditedAt: Date.now(),
  });

/** "Pause all habit reminders": stamped when paused, null when they are turned back on. */
export const setRemindersPaused = (uid: string, isPaused: boolean) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    remindersPausedAt: isPaused ? Date.now() : null,
    ...remindersStamp(Date.now()),
    lastEditedAt: Date.now(),
  });

const learnAssistantNameCallable = httpsCallable<
  Record<string, never>,
  { count: number }
>(functions, 'learnHelmAssistantName');

export const setAssistantNameAndTone = (
  uid: string,
  assistantName: string | null,
  assistantTone: AssistantTone,
  isRenamed = false,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    assistantName,
    assistantTone,
    ...(isRenamed ? { assistantNameVariants: null } : {}),
    lastEditedAt: Date.now(),
  }).then(() => {
    if (!isRenamed) return;
    learnAssistantNameCallable({}).catch((error) =>
      console.error('Helm assistant name variants were not learned', error),
    );
  });

export const setHelmTheme = (uid: string, theme: HelmTheme) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    theme,
    lastEditedAt: Date.now(),
  });

export type PhoneLocationResult =
  'saved' | 'offline' | 'missing' | 'unreadable';

/** Writes how much of this phone's location may be used. Turning it down clears what was read first, so a failed clear leaves the setting as it was: City only drops the point, Off drops the reading. */
export async function setPhoneLocation(
  uid: string,
  encryption: HelmEncryption,
  next: PhoneLocation,
): Promise<PhoneLocationResult> {
  if (!navigator.onLine) return 'offline';
  const profile = store.getState().helm.profile;
  const selfWhoId = profile?.selfWhoId ?? null;
  const self = store
    .getState()
    .helm.who.items.find(
      (entry) => entry.id === selfWhoId && !entry.isUnreadable,
    );
  const nearNow = self?.nearNow ?? null;
  if (selfWhoId && nearNow && next !== 'precise') {
    const cleared = await setWhoNearNow(
      uid,
      encryption,
      selfWhoId,
      next === 'city' ? { ...nearNow, point: null } : null,
    );
    if (cleared !== 'saved') return cleared;
  }
  await updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    phoneLocation: next,
    lastEditedAt: Date.now(),
  });
  return 'saved';
}

/** Forgets the last place the phone read. */
export async function forgetNearNow(
  uid: string,
  encryption: HelmEncryption,
): Promise<PhoneLocationResult> {
  const selfWhoId = store.getState().helm.profile?.selfWhoId ?? null;
  return selfWhoId ? setWhoNearNow(uid, encryption, selfWhoId, null) : 'saved';
}

/** Stamps a Not now on a location offer so it waits 4 weeks. */
export const declineAbilityOffer = (
  uid: string,
  decline: Omit<AbilityDecline, 'declinedAt'>,
) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    abilityOffers: arrayUnion({ ...decline, declinedAt: Date.now() }),
    lastEditedAt: Date.now(),
  });

/** Adds the chosen away span's clock, dropping ended spans and keeping the newest 10. */
export const addZoneSpan = (uid: string, span: ZoneSpan, todayKey: string) =>
  runTransaction(db, async (transaction) => {
    const ref = doc(db, 'apps', 'helm', 'users', uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const current = (snapshot.data() as HelmProfile).zoneSpans ?? [];
    transaction.update(ref, {
      zoneSpans: [
        ...keepCurrentAway(current, todayKey).filter(
          (entry) => entry.awayId !== span.awayId,
        ),
        span,
      ].slice(-MAX_ZONE_SPANS),
      ...remindersStamp(Date.now()),
      lastEditedAt: Date.now(),
    });
  });

export const removeZoneSpan = (uid: string, awayId: string) =>
  runTransaction(db, async (transaction) => {
    const ref = doc(db, 'apps', 'helm', 'users', uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const current = (snapshot.data() as HelmProfile).zoneSpans ?? [];
    transaction.update(ref, {
      zoneSpans: current.filter((entry) => entry.awayId !== awayId),
      ...remindersStamp(Date.now()),
      lastEditedAt: Date.now(),
    });
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

/** Makes this browser forget the person's data here: the key and its trust entry, the saved list and drop-box key, and what the screen holds. */
export async function forgetHelmOnDevice(uid: string) {
  await helmTrustStore
    .forget(uid)
    .catch((error: unknown) => console.warn('Kept key not forgotten', error));
  await forgetOutboxSecrets(uid).catch((error: unknown) =>
    console.warn('Saved outbox not forgotten', error),
  );
  clearHelmKey();
  store.dispatch(clearHelm());
}

/** Opens the app again on Today, as a first open; a bare path would resume the last view this visit. */
export function reopenHelmToFirstRun() {
  keepDeletedNote();
  window.location.replace(`${window.location.pathname}?view=today`);
}

const signIn = { isStale: false };

/** Deletes everything the app holds for the person on the server, then this browser forgets its keys. Throws when the server could not finish; a rerun finishes it. */
export async function deleteAllHelmData(uid: string) {
  await ensureRecentSignIn(signIn.isStale);
  signIn.isStale = false;
  try {
    await deleteHelmDataCallable({});
  } catch (error) {
    if (!needsRecentSignIn(error)) throw error;
    // A sign-in window opened after a long wait is blocked, so the next tap asks for it instead.
    signIn.isStale = true;
    throw Object.assign(new Error('Sign in again.'), {
      code: 'auth/requires-recent-login',
    });
  }
  await forgetHelmOnDevice(uid);
}
