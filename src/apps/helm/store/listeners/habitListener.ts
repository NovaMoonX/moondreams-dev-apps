import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type { Cadence } from '@/utils/cadenceUtils';
import { HABITS_LIMIT } from '@apps/helm/constants';
import type {
  Habit,
  HabitSealed,
  HabitStage,
  HabitStatus,
  OpenHabit,
  ReminderPace,
} from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your habits did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const STATUSES: HabitStatus[] = ['active', 'paused', 'ended', 'retired'];
const STAGES: HabitStage[] = ['building', 'holding', 'formed', 'buildingAgain'];
const PACES: ReminderPace[] = ['adaptive', 'start', 'late'];

const readStatus = (value: unknown): HabitStatus =>
  STATUSES.find((status) => status === value) ?? 'active';

const readStage = (value: unknown, forWhoId: string | null) => {
  if (forWhoId !== null) return null;
  return STAGES.find((stage) => stage === value) ?? 'building';
};

const readCadence = (value: unknown): Cadence => {
  const cadence = value as Cadence | null | undefined;
  if (cadence?.kind === 'onWeekdays' && Array.isArray(cadence.weekdays))
    return cadence;
  if (cadence?.kind === 'timesPerWeek' && typeof cadence.count === 'number')
    return cadence;
  if (
    cadence?.kind === 'everyNDays' &&
    typeof cadence.days === 'number' &&
    typeof cadence.anchor === 'number'
  )
    return cadence;
  return { kind: 'everyDay' };
};

const readReminder = (
  value: Habit['reminder'] | undefined,
  isCare: boolean,
): Habit['reminder'] => {
  if (!value) return null;
  const pace = PACES.find((entry) => entry === value.pace);
  return {
    isOn: value.isOn ?? false,
    pace:
      pace && !(isCare && pace === 'adaptive')
        ? pace
        : isCare
          ? 'start'
          : 'adaptive',
    anyTimeAt: value.anyTimeAt ?? null,
    allowQuietHours: value.allowQuietHours ?? false,
    turnedOnAt: value.turnedOnAt ?? 0,
    easedAt: value.easedAt ?? null,
  };
};

const readWindowState = (value: Habit['windowState'] | undefined) =>
  Object.fromEntries(
    Object.entries(value ?? {}).map(([id, window]) => [
      id,
      {
        start: window.start,
        end: window.end,
        part: window.part ?? null,
        order: window.order ?? 0,
        editedAt: window.editedAt ?? null,
      },
    ]),
  );

/** A habit that won't open is kept, with no name, so the surface can say so instead of dropping it. */
async function openHabit(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenHabit> {
  const data = entry.data() as Partial<Habit>;
  const forWhoId = data.forWhoId ?? null;
  const isCare = data.isCare ?? forWhoId !== null;
  const createdAt = data.createdAt ?? 0;
  const base = {
    id: entry.id,
    status: readStatus(data.status),
    cadence: readCadence(data.cadence),
    windowState: readWindowState(data.windowState),
    timesPerDay: data.timesPerDay ?? null,
    projectId: data.projectId ?? null,
    forWhoId,
    isCare,
    startsOn: data.startsOn ?? createdAt,
    endsOn: data.endsOn ?? null,
    pausedUntil: data.pausedUntil ?? null,
    reminder: readReminder(data.reminder, isCare),
    lockScreenName: data.lockScreenName ?? null,
    stage: readStage(data.stage, forWhoId),
    stageAt: data.stageAt ?? createdAt,
    stageWeek: data.stageWeek ?? null,
    rejudgeFrom: data.rejudgeFrom ?? null,
    careAskedAt: data.careAskedAt ?? null,
    untoldSince: data.untoldSince ?? null,
    formedAt: data.formedAt ?? null,
    formedSummary: data.formedSummary ?? null,
    history: data.history ?? [],
    createdBy: data.createdBy ?? 'nomos',
    sourceCaptureId: data.sourceCaptureId ?? null,
    executionId: data.executionId ?? null,
    createdAt,
    lastEditedAt: data.lastEditedAt ?? null,
    pausedAt: data.pausedAt ?? null,
    endedAt: data.endedAt ?? null,
    retiredAt: data.retiredAt ?? null,
    privacy: readPrivacy(data.privacy),
  } as const;
  try {
    if (!data.sealed) throw new Error('This habit has no sealed words.');
    const payload = await read<Partial<HabitSealed>>(data.sealed);
    return {
      ...base,
      name: toText(payload.name) ?? '',
      emoji: toText(payload.emoji),
      notes: toText(payload.notes),
      medicine: payload.medicine
        ? {
            name: toText(payload.medicine.name) ?? '',
            dose: toText(payload.medicine.dose),
          }
        : null,
      windows: payload.windows ?? {},
      importance: payload.importance ?? null,
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      name: '',
      emoji: null,
      notes: null,
      medicine: null,
      windows: {},
      importance: null,
      privateMark: null,
      isPrivacyCleared: false,
      isUnreadable: true,
    };
  }
}

/** Every habit the person has. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startHabitsListener(
  uid: string,
  read: SealedReader,
  onChange: (habits: OpenHabit[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'habits'),
      limit(HABITS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openHabit(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
