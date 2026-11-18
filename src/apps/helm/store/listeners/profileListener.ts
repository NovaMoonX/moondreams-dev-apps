import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '@apps/helm/constants';
import type { HelmProfile } from '@apps/helm/types';

const readPreview = (
  stored: HelmProfile['personalityPreview'] | undefined,
): HelmProfile['personalityPreview'] =>
  stored &&
  typeof stored.hash === 'string' &&
  Array.isArray(stored.replies) &&
  stored.replies.every((reply) => typeof reply === 'string')
    ? { hash: stored.hash, replies: stored.replies, at: Number(stored.at) || 0 }
    : null;

/** A profile written before a field existed reads that field as its default, never as missing. */
const toProfile = (data: Partial<HelmProfile>): HelmProfile => ({
  assistantName: data.assistantName ?? null,
  assistantNameVariants: data.assistantNameVariants ?? null,
  assistantTone: data.assistantTone ?? null,
  personality: data.personality ?? null,
  personalitySetAt: data.personalitySetAt ?? null,
  personalityPreview: readPreview(data.personalityPreview),
  theme: data.theme ?? null,
  timeZone: data.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  dayStartTime: data.dayStartTime ?? DEFAULT_DAY_START_TIME,
  dayEndTime: data.dayEndTime ?? DEFAULT_DAY_END_TIME,
  planFillPercent: data.planFillPercent ?? DEFAULT_PLAN_FILL_PERCENT,
  dayAimsChangedAt: data.dayAimsChangedAt ?? null,
  shiftCalendarIds: data.shiftCalendarIds ?? [],
  busyAllDayEventRefs: data.busyAllDayEventRefs ?? [],
  calendarOfferFoldedAt: data.calendarOfferFoldedAt ?? null,
  quietHours: data.quietHours ?? null,
  remindersPausedAt: data.remindersPausedAt ?? null,
  habitRemindersChangedAt: data.habitRemindersChangedAt ?? null,
  habitRemindersIdleAt: data.habitRemindersIdleAt ?? null,
  hasSeenAiNotice: data.hasSeenAiNotice ?? false,
  voiceMode: data.voiceMode ?? 'cloudWhenOnline',
  voiceId: data.voiceId ?? null,
  voiceSpeed: data.voiceSpeed ?? null,
  whisperHeld: data.whisperHeld ?? null,
  isWakeWordOn: data.isWakeWordOn ?? false,
  isHandsFreeOn: data.isHandsFreeOn ?? true,
  hasSeenVoiceNotice: data.hasSeenVoiceNotice ?? null,
  selfWhoId: data.selfWhoId ?? null,
  currentPlace: data.currentPlace ?? null,
  styleLearnedThroughAt: data.styleLearnedThroughAt ?? null,
  phoneLocation: data.phoneLocation ?? 'off',
  zoneSpans: data.zoneSpans ?? [],
  abilityOffers: data.abilityOffers ?? [],
  conversationFreshAt: data.conversationFreshAt ?? null,
  isDailyFreshOn: data.isDailyFreshOn ?? false,
  isLearningOn: data.isLearningOn !== false,
  patternsCheckedOn: data.patternsCheckedOn ?? null,
  reflectDueAt: data.reflectDueAt ?? null,
  relateDueAt: data.relateDueAt ?? null,
  scheduledActionsChangedAt: data.scheduledActionsChangedAt ?? null,
  forgottenAt: data.forgottenAt ?? null,
  prunedOn: data.prunedOn ?? null,
  outsideSeenAt: data.outsideSeenAt ?? null,
  bringInToldAt: data.bringInToldAt ?? null,
  researchDepth:
    data.researchDepth === 'light' || data.researchDepth === 'thorough'
      ? data.researchDepth
      : null,
  researchAllowance:
    data.researchAllowance && typeof data.researchAllowance.month === 'string'
      ? {
          month: data.researchAllowance.month,
          leftCents: Number(data.researchAllowance.leftCents) || 0,
        }
      : null,
  calendarSync:
    data.calendarSync && typeof data.calendarSync.calendarId === 'string'
      ? {
          accountId: String(data.calendarSync.accountId ?? ''),
          calendarId: data.calendarSync.calendarId,
          calendarName: String(data.calendarSync.calendarName ?? ''),
          isMadeByHelm: data.calendarSync.isMadeByHelm === true,
          wasAlreadyRead: data.calendarSync.wasAlreadyRead === true,
          startedAt: Number(data.calendarSync.startedAt) || 0,
          lastWrittenAt:
            typeof data.calendarSync.lastWrittenAt === 'number'
              ? data.calendarSync.lastWrittenAt
              : null,
          lastError:
            typeof data.calendarSync.lastError === 'string'
              ? data.calendarSync.lastError
              : null,
        }
      : null,
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
