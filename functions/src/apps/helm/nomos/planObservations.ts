import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import {
  hasHealthWord,
  readDerivedPrivacy,
  type PrivacyClass,
} from '../privacy.js';
import type { sealForHelm } from '../helmKey.js';
import { HABIT_DAY_ROLLOVER, habitDayKey } from './habitDay.js';
import { maskOthersHealth } from './said.js';
import {
  isWithin48h,
  type ActSubject,
  type ObservationRead,
} from './actNow.js';
import type { HabitCommand, NomosCommand, TaskDue } from './commands.js';

export interface PlannedObservation {
  id: string;
  data: Record<string, unknown>;
}

const dueAt = (due: TaskDue | null) =>
  due === null ? null : due.kind === 'day' ? due.date : due.at;

/** What each concrete thing in a turn touches, for deciding whether a remark acts. */
export const readTurnSubjects = (
  turn: {
    commands: NomosCommand[];
    habitCommands: HabitCommand[];
    hasPlanDay: boolean;
    hasHome: boolean;
    extras: number;
  },
  now: number,
): ActSubject[] => [
  ...turn.commands.map((command) => ({
    isWithin48h:
      command.kind === 'createTask' || command.kind === 'updateTask'
        ? isWithin48h(dueAt(command.due), now)
        : true,
    isCare: false,
  })),
  ...turn.habitCommands.map((command) => ({
    isWithin48h: command.kind === 'checkIn',
    isCare:
      (command.kind === 'createHabit' && command.isCare) ||
      (command.kind === 'setCare' && command.isCare),
  })),
  ...(turn.hasPlanDay || turn.hasHome
    ? [{ isWithin48h: true, isCare: false }]
    : []),
  ...Array.from({ length: turn.extras }, () => ({
    isWithin48h: false,
    isCare: false,
  })),
];

/** The first 03:00 after `now` in the person's zone: when the night's reflection can first read what was just said. */
export const nextReflectionAt = (now: number, timeZone: string) =>
  zonedDateTimeToEpoch(
    shiftDayKeyBy(habitDayKey(now, timeZone), 1),
    HABIT_DAY_ROLLOVER,
    timeZone,
  );

interface SubjectFacts {
  isCare: boolean;
  privacy: PrivacyClass;
}

const readSubject = async (
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  subject: ObservationRead['subject'],
): Promise<SubjectFacts | null> => {
  if (subject.id === null || subject.collection === 'day') return null;
  const snapshot = await transaction.get(
    firestore.doc(`${base}/${subject.collection}/${subject.id}`),
  );
  if (!snapshot.exists) return null;
  const isCare =
    snapshot.get('isCare') === true || snapshot.get('privateMark') === 'care';
  return {
    isCare,
    privacy:
      isCare || snapshot.get('privacy') === 'private' ? 'private' : 'ordinary',
  };
};

/** The observations a turn writes: each read against its subject for care and privacy, its quote cleared of another person's health, and the instant the night's reflection first has something to read. Nothing is written when learning is off. */
export async function planObservations(input: {
  transaction: Transaction;
  firestore: Firestore;
  base: string;
  observations: ObservationRead[];
  isLearningOn: boolean;
  captureId: string;
  isCapturePrivate: boolean;
  whoNames: string[];
  now: number;
  at: number;
  timeZone: string;
  reflectDueAt: number | null;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => ReturnType<typeof sealForHelm>;
}): Promise<{
  writes: PlannedObservation[];
  reflectDueAt: number | null;
}> {
  const kept = input.isLearningOn ? input.observations : [];
  const facts = await Promise.all(
    kept.map((one) =>
      readSubject(input.transaction, input.firestore, input.base, one.subject),
    ),
  );
  const dayKey = habitDayKey(input.at, input.timeZone);
  const writes = kept.map((one, index): PlannedObservation => {
    const found = facts[index];
    const subject = found ? one.subject : { collection: 'day', id: null };
    const subjectKey = `${subject.collection}/${subject.id}`;
    return {
      id: input.newId(),
      data: {
        subject,
        dayKey,
        at: input.at,
        source: 'turn',
        sourceKeys: [`captures/${input.captureId}`],
        isCare: found?.isCare ?? false,
        writtenBy: 'turn',
        createdAt: input.now,
        privacy: readDerivedPrivacy(
          [`captures/${input.captureId}`, subjectKey, `words/${index}`],
          (key) =>
            key.startsWith('captures/')
              ? input.isCapturePrivate
                ? 'private'
                : 'ordinary'
              : key.startsWith('words/')
                ? hasHealthWord(one.quote)
                  ? 'private'
                  : 'ordinary'
                : found?.privacy,
        ),
        sealed: input.seal({
          kind: one.kind,
          tags: one.tags,
          quote: maskOthersHealth(one.quote, input.whoNames),
        }),
      },
    };
  });
  return {
    writes,
    reflectDueAt:
      writes.length > 0 && input.reflectDueAt === null
        ? nextReflectionAt(input.now, input.timeZone)
        : null,
  };
}
