import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import type { HelmProfile } from '@apps/helm/types';

/** A profile written before a field existed reads that field as its default, never as missing. */
const toProfile = (data: Partial<HelmProfile>): HelmProfile => ({
  assistantName: data.assistantName ?? null,
  assistantTone: data.assistantTone ?? null,
  theme: data.theme ?? null,
  timeZone: data.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  dayStartTime: data.dayStartTime ?? DEFAULT_DAY_START_TIME,
  dayEndTime: data.dayEndTime ?? DEFAULT_DAY_END_TIME,
  planFillPercent: data.planFillPercent ?? DEFAULT_PLAN_FILL_PERCENT,
  shiftCalendarIds: data.shiftCalendarIds ?? [],
  busyAllDayEventRefs: data.busyAllDayEventRefs ?? [],
  calendarOfferFoldedAt: data.calendarOfferFoldedAt ?? null,
  hasSeenAiNotice: data.hasSeenAiNotice ?? false,
  voiceMode: data.voiceMode ?? 'cloudWhenOnline',
  voiceId: data.voiceId ?? null,
  voiceSpeed: data.voiceSpeed ?? null,
  isWakeWordOn: data.isWakeWordOn ?? false,
  isHandsFreeOn: data.isHandsFreeOn ?? true,
  hasSeenVoiceNotice: data.hasSeenVoiceNotice ?? null,
  selfWhoId: data.selfWhoId ?? null,
  currentPlace: data.currentPlace ?? null,
  styleLearnedThroughAt: data.styleLearnedThroughAt ?? null,
  conversationFreshAt: data.conversationFreshAt ?? null,
  isDailyFreshOn: data.isDailyFreshOn ?? false,
  createdAt: data.createdAt ?? 0,
  lastEditedAt: data.lastEditedAt ?? null,
});

export function startProfileListener(
  uid: string,
  /** `isFromServer` is false for a snapshot the device answered from its own copy. */
  onChange: (profile: HelmProfile | null, isFromServer: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'helm', 'users', uid),
    // The first snapshot on a first open is the missing profile, just before it is made.
    (snapshot) =>
      onChange(
        snapshot.exists()
          ? toProfile(snapshot.data() as Partial<HelmProfile>)
          : null,
        !snapshot.metadata.fromCache,
      ),
    onError,
  );
}
