import type {
  DocumentData,
  Firestore,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import type { GoalWhy } from '../goalWhy.js';
import {
  habitsQuery,
  openLiveHabit,
  openLiveHabitDay,
  type LiveHabit,
} from '../habitStore.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import { toPersonRecord } from '../nomos/contextPeople.js';
import { OBSERVATION_TAGS, type ObservationTag } from '../nomos/said.js';
import { readPrivacy, type PrivacyClass } from '../privacy.js';

export const WINDOW_DAYS = 14;
export const MAX_OBSERVATIONS = 300;
const MAX_PROJECTS_READ = 200;

export type Read = (query: Query) => Promise<QuerySnapshot>;

export interface WindowObservation {
  id: string;
  subject: { collection: string; id: string | null };
  dayKey: string;
  at: number;
  sourceKeys: string[];
  isCare: boolean;
  privacy: PrivacyClass;
  kind: string;
  tags: ObservationTag[];
  quote: string | null;
}

export interface WindowGoal {
  id: string;
  name: string;
  kind: 'project' | 'goal';
  isPrivate: boolean;
  why: GoalWhy | null;
}

export interface WindowNote {
  dayKey: string;
  habitId: string;
  windowId: string;
  text: string;
  at: number;
}

export interface ReflectWindow {
  from: string;
  observations: WindowObservation[];
  habits: Map<string, LiveHabit>;
  goals: Map<string, WindowGoal>;
  notes: WindowNote[];
  /** Every name and alias of a person other than the person themself. */
  whoNames: string[];
}

const isTag = (tag: unknown): tag is ObservationTag =>
  OBSERVATION_TAGS.some((known) => known === tag);

const openObservation = (
  key: HelmKey,
  id: string,
  data: DocumentData,
): WindowObservation[] => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    const subject = (data.subject ?? {}) as Record<string, unknown>;
    return [
      {
        id,
        subject: {
          collection: String(subject.collection ?? ''),
          id: typeof subject.id === 'string' ? subject.id : null,
        },
        dayKey: String(data.dayKey ?? ''),
        at: Number(data.at ?? 0),
        sourceKeys: Array.isArray(data.sourceKeys)
          ? data.sourceKeys.filter(
              (entry): entry is string => typeof entry === 'string',
            )
          : [],
        isCare: data.isCare === true,
        privacy: readPrivacy(data.privacy),
        kind: String(words.kind ?? ''),
        tags: Array.isArray(words.tags) ? words.tags.filter(isTag) : [],
        quote: typeof words.quote === 'string' ? words.quote : null,
      },
    ];
  } catch {
    return [];
  }
};

const openGoal = (key: HelmKey, doc: { id: string; data: DocumentData }) => {
  try {
    const words = openForHelm(key, doc.data.sealed as SealedPayload);
    if (typeof words.name !== 'string') return [];
    const why = words.why as GoalWhy | null | undefined;
    const goal: WindowGoal = {
      id: doc.id,
      name: words.name,
      kind: doc.data.kind === 'goal' ? 'goal' : 'project',
      isPrivate: doc.data.privacy === 'private',
      why: why && typeof why.verbatim === 'string' ? why : null,
    };
    return [goal];
  } catch {
    return [];
  }
};

/** The last 14 habit days of what the person said, with what those days' notes, habits, goals and other people are, read through `read` so a transaction can hold it. What was made at or before the person's last Forget is never read. */
export async function readReflectWindow(
  read: Read,
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  profile: { timeZone: string; forgottenAt: number | null },
  dayKey: string,
): Promise<ReflectWindow> {
  const base = `apps/helm/users/${uid}`;
  const from = shiftDayKeyBy(dayKey, -(WINDOW_DAYS - 1));
  const [observationSnap, habitSnap, projectSnap, daySnap, whoSnap] =
    await Promise.all([
      read(
        firestore
          .collection(`${base}/observations`)
          .where('dayKey', '>=', from)
          .where('dayKey', '<=', dayKey)
          .orderBy('dayKey', 'desc')
          .limit(MAX_OBSERVATIONS),
      ),
      read(habitsQuery(firestore, base)),
      read(
        firestore
          .collection(`${base}/projects`)
          .where('status', 'in', ['active', 'paused'])
          .limit(MAX_PROJECTS_READ),
      ),
      read(
        firestore
          .collection(`${base}/habitDays`)
          .where('date', '>=', Date.parse(`${from}T00:00:00Z`))
          .where('date', '<=', Date.parse(`${dayKey}T00:00:00Z`)),
      ),
      read(firestore.collection(`${base}/who`)),
    ]);
  const forgottenAt = profile.forgottenAt ?? 0;
  const people = whoSnap.docs.flatMap((doc) => toPersonRecord(key, doc) ?? []);
  return {
    from,
    observations: observationSnap.docs
      .filter((doc) => Number(doc.get('createdAt') ?? 0) > forgottenAt)
      .flatMap((doc) => openObservation(key, doc.id, doc.data())),
    habits: new Map(
      habitSnap.docs.flatMap((doc) => {
        const habit = openLiveHabit(key, doc.id, doc.data(), profile.timeZone);
        return habit ? [[doc.id, habit] as [string, LiveHabit]] : [];
      }),
    ),
    goals: new Map(
      projectSnap.docs
        .flatMap((doc) => openGoal(key, { id: doc.id, data: doc.data() }))
        .map((goal): [string, WindowGoal] => [goal.id, goal]),
    ),
    notes: daySnap.docs.flatMap((doc) =>
      Object.entries(openLiveHabitDay(key, doc.data()).notes)
        .filter(([, note]) => note.at > forgottenAt)
        .flatMap(([noteKey, note]) => {
          const [habitId, windowId] = noteKey.split('/');
          return habitId && windowId
            ? [
                {
                  dayKey: doc.id,
                  habitId,
                  windowId,
                  text: note.text,
                  at: note.at,
                },
              ]
            : [];
        }),
    ),
    whoNames: people
      .filter((person) => !person.isSelf)
      .flatMap((person) => [person.words.name, ...person.words.aliases]),
  };
}
