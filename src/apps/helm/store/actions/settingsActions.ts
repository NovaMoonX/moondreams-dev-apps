import { doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import type { HelmProfile, VoiceMode } from '@apps/helm/types';

/** Creates the profile on first open, with this device's zone, and leaves an existing one alone, so two tabs opening together make one. */
export async function ensureHelmProfile(uid: string) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (snapshot.exists()) return;

    const profile: HelmProfile = {
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

export const foldCalendarOffer = (uid: string) =>
  updateDoc(doc(db, 'apps', 'helm', 'users', uid), {
    calendarOfferFoldedAt: Date.now(),
    lastEditedAt: Date.now(),
  });
