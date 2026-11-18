import type {
  DocumentData,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { habitsQuery, openLiveHabit, type LiveHabit } from './habitStore.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import { habitDayKey, readHabitStatusOn } from './nomos/habitDay.js';
import type {
  ContextImportance,
  ContextImportanceEntry,
} from './nomos/buildContext.js';
import {
  nearestDate,
  readImportanceOrder,
  readPlace,
  type ImportanceItem,
  type OrderRow,
} from './nomos/importanceOrder.js';

const PROJECTS_READ = 200;
const DAY_MS = 86_400_000;

/** A project, goal or habit as the order reads it, with what a write needs to reseal it. */
export interface ImportanceRecord {
  item: ImportanceItem;
  collection: 'projects' | 'habits';
  emoji: string | null;
  isPrivate: boolean;
  /** The sealed words as they are, to be sealed again with a new place. */
  words: Record<string, unknown>;
  lastEditedAt: number | null;
}

const isCareMark = (mark: unknown) => mark === 'health' || mark === 'care';

const toDate = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toProjectRecord = (
  key: HelmKey,
  id: string,
  data: DocumentData,
): ImportanceRecord[] => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    if (typeof words.name !== 'string' || words.name === '') return [];
    const milestones =
      typeof data.milestoneState === 'object' && data.milestoneState !== null
        ? Object.values(data.milestoneState as Record<string, unknown>)
        : [];
    return [
      {
        item: {
          id,
          kind: data.kind === 'goal' ? 'goal' : 'project',
          name: words.name,
          place: readPlace(words.importance),
          goalId: null,
          isCare: isCareMark(words.privateMark),
          status: data.status === 'paused' ? 'paused' : 'running',
          date: nearestDate([
            toDate(data.targetDate),
            ...milestones.map((state) => {
              const entry = (state ?? {}) as Record<string, unknown>;
              return entry.doneAt === null ? toDate(entry.date) : null;
            }),
          ]),
        },
        collection: 'projects',
        emoji: typeof words.emoji === 'string' ? words.emoji : null,
        isPrivate: data.privacy === 'private',
        words,
        lastEditedAt: toDate(data.lastEditedAt),
      },
    ];
  } catch {
    return [];
  }
};

const toHabitRecord = (
  habit: LiveHabit,
  goalId: string | null,
  dayKey: string,
  words: Record<string, unknown>,
): ImportanceRecord => {
  const status = readHabitStatusOn(habit, dayKey);
  return {
    item: {
      id: habit.id,
      kind: 'habit',
      name: habit.name,
      place: habit.importance,
      goalId,
      isCare: habit.isCare || isCareMark(habit.privateMark),
      status:
        status === 'active'
          ? 'running'
          : status === 'paused'
            ? 'paused'
            : 'out',
      date: null,
    },
    collection: 'habits',
    emoji: habit.emoji,
    isPrivate:
      habit.privacy === 'private' ||
      habit.isCare ||
      isCareMark(habit.privateMark),
    words,
    lastEditedAt: habit.lastEditedAt,
  };
};

const projectsQuery = (firestore: Firestore, base: string) =>
  firestore
    .collection(`${base}/projects`)
    .where('status', 'in', ['active', 'paused'])
    .limit(PROJECTS_READ);

const toRecords = (
  key: HelmKey,
  at: number,
  timeZone: string,
  projects: QuerySnapshot,
  habits: QuerySnapshot,
): ImportanceRecord[] => {
  const dayKey = habitDayKey(at, timeZone);
  return [
    ...projects.docs.flatMap((doc) => toProjectRecord(key, doc.id, doc.data())),
    ...habits.docs.flatMap((doc) => {
      const habit = openLiveHabit(key, doc.id, doc.data(), timeZone);
      if (!habit) return [];
      const goal = doc.get('projectId');
      return [
        toHabitRecord(
          habit,
          typeof goal === 'string' ? goal : null,
          dayKey,
          openForHelm(key, doc.get('sealed') as SealedPayload),
        ),
      ];
    }),
  ];
};

/** Every project, goal and habit the order reads, read in the turn's transaction so a placing lands on what is there now. */
export async function readImportanceRecordsIn(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  at: number,
  timeZone: string,
): Promise<ImportanceRecord[]> {
  const [projects, habits] = await Promise.all([
    transaction.get(projectsQuery(firestore, base) as Query),
    transaction.get(habitsQuery(firestore, base) as Query),
  ]);
  return toRecords(key, at, timeZone, projects, habits);
}

/** The same, read outside a transaction, for the context the model is shown. */
export async function readImportanceRecords(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  at: number,
  timeZone: string,
): Promise<ImportanceRecord[]> {
  const [projects, habits] = await Promise.all([
    projectsQuery(firestore, base).get(),
    habitsQuery(firestore, base).get(),
  ]);
  return toRecords(key, at, timeZone, projects, habits);
}

/** Today as date-only UTC midnight in the person's zone. */
export const importanceToday = (at: number, timeZone: string) =>
  Date.parse(`${habitDayKey(at, timeZone)}T00:00:00Z`) ||
  Math.floor(at / DAY_MS) * DAY_MS;

const toIso = (at: number | null) =>
  at === null ? null : new Date(at).toISOString().slice(0, 10);

/** The order as the model is shown it: the person's words for each place, with names left for the caller to mask. */
export function toContextImportance(
  records: readonly ImportanceRecord[],
  today: number,
): ContextImportance {
  const byId = new Map(records.map((record) => [record.item.id, record]));
  const order = readImportanceOrder(
    records.map((record) => record.item),
    today,
  );
  const entry = (
    id: string,
    row: OrderRow | null,
  ): ContextImportanceEntry[] => {
    const record = byId.get(id);
    return record
      ? [
          {
            id,
            kind: record.item.kind,
            name: record.item.name,
            words: row?.isInherited ? null : (row?.place?.words ?? null),
            until: toIso(row?.place?.until ?? null),
            date: row?.group === 'notSaid' ? toIso(row.date) : null,
            position: row?.position ?? null,
            isPrivate: record.isPrivate,
          },
        ]
      : [];
  };
  const rows = (list: OrderRow[]) => list.flatMap((row) => entry(row.id, row));
  return {
    inOrder: rows(order.inOrder),
    canWait: rows(order.canWait),
    notSaid: rows(order.notSaid),
    alwaysKept: order.alwaysKept.flatMap((id) => entry(id, null)),
  };
}
