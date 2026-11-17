import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { dayKeyToMs, shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import { openAimsView } from '../dayPlan/dayAimsStore.js';
import type { GoalWhy } from '../goalWhy.js';
import {
  habitsQuery,
  openLiveHabit,
  openLiveHabitDay,
  type LiveHabit,
} from '../habitStore.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import { toPersonRecord, toPrivateMark } from '../nomos/contextPeople.js';
import {
  OBSERVATION_TAGS,
  STRUGGLING_TAGS,
  type ObservationTag,
} from '../nomos/said.js';
import {
  isPrivateInEffect,
  readPrivacy,
  readPrivacyFacts,
  type PrivacyClass,
} from '../privacy.js';

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

const MAX_TASKS_READ = 200;
const NOON = 12 * 60 * 60_000;

/** The reasons the person gave in the last 14 days' wind-downs, as observations about the day. A reason on a private or care task is never read: the task's own class decides, so only the aim's task id is opened from the day, never a word of it. */
async function readWindDowns(
  read: Read,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  range: { from: string; to: string; forgottenAt: number },
): Promise<WindowObservation[]> {
  const days = await read(
    firestore
      .collection(`${base}/dayAims`)
      .where('date', '>=', dayKeyToMs(range.from))
      .where('date', '<=', dayKeyToMs(range.to)),
  );
  const reasons = days.docs.flatMap((doc) => {
    const view = openAimsView(key, doc.data());
    return view.aims.flatMap((aim) => {
      const reason = view.windDown[aim.aimId]?.reason ?? null;
      const tag = STRUGGLING_TAGS.find((known) => known === reason);
      return tag
        ? [{ dayKey: doc.id, aimId: aim.aimId, taskId: aim.taskId, tag }]
        : [];
    });
  });
  const taskIds = [...new Set(reasons.map((entry) => entry.taskId))].slice(
    0,
    MAX_TASKS_READ,
  );
  // getAll reads by id; a transaction `read` only takes queries.
  const tasks =
    taskIds.length === 0
      ? []
      : await firestore.getAll(
          ...taskIds.map((id) => firestore.doc(`${base}/tasks/${id}`)),
        );
  const projectIds = [
    ...new Set(
      tasks.flatMap((task) => {
        const id: unknown = task.get('projectId');
        return typeof id === 'string' ? [id] : [];
      }),
    ),
  ];
  const projects =
    projectIds.length === 0
      ? []
      : await firestore.getAll(
          ...projectIds.map((id) => firestore.doc(`${base}/projects/${id}`)),
        );
  const toFacts = (snap: DocumentSnapshot) => {
    try {
      const words = openForHelm(key, snap.get('sealed') as SealedPayload);
      return readPrivacyFacts({
        privateMark: toPrivateMark(words.privateMark),
        isCare: snap.get('isCare') === true || words.isCare === true,
      });
    } catch {
      return null;
    }
  };
  const privateProjects = new Set(
    projects.flatMap((project) =>
      project.exists &&
      (project.get('privacy') === 'private' ||
        isPrivateInEffect(
          toFacts(project) ?? readPrivacyFacts({ isCare: true }),
        ))
        ? [project.id]
        : [],
    ),
  );
  const isShareable = new Set(
    tasks.flatMap((task) => {
      if (!task.exists || task.get('privacy') === 'private') return [];
      if (privateProjects.has(String(task.get('projectId') ?? ''))) return [];
      const facts = toFacts(task);
      return facts && !isPrivateInEffect(facts) ? [task.id] : [];
    }),
  );
  return reasons
    .filter(
      (entry) =>
        isShareable.has(entry.taskId) &&
        dayKeyToMs(entry.dayKey) + NOON > range.forgottenAt,
    )
    .map((entry): WindowObservation => ({
      id: `wd_${entry.dayKey}_${entry.aimId}`,
      subject: { collection: 'day', id: null },
      dayKey: entry.dayKey,
      at: dayKeyToMs(entry.dayKey) + NOON,
      sourceKeys: [],
      isCare: false,
      privacy: 'ordinary',
      kind: 'windDown',
      tags: [entry.tag],
      quote: null,
    }));
}

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
  const windDowns = await readWindDowns(read, firestore, base, key, {
    from,
    to: dayKey,
    forgottenAt,
  });
  const people = whoSnap.docs.flatMap((doc) => toPersonRecord(key, doc) ?? []);
  return {
    from,
    observations: [
      ...observationSnap.docs
        .filter((doc) => Number(doc.get('createdAt') ?? 0) > forgottenAt)
        .flatMap((doc) => openObservation(key, doc.id, doc.data())),
      ...windDowns,
    ].slice(0, MAX_OBSERVATIONS),
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
