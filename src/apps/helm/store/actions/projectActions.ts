import {
  collection,
  deleteField,
  doc,
  type DocumentData,
  getCountFromServer,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
  setDoc,
  deleteDoc,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import {
  MILESTONE_TITLE_MAX,
  MILESTONES_MAX,
  PROJECT_NAME_MAX,
  PROJECT_OBJECTIVE_MAX,
  PROJECT_ROLE_NOTE_MAX,
} from '@apps/helm/constants';
import { readWhoTier } from '@apps/helm/engine/whoTier';
import { openJson, sealJson } from '@apps/helm/security';
import { keepInheritedPrivate } from '@apps/helm/store/actions/privacyActions';
import type {
  HelmEncryption,
  Project,
  ProjectRole,
  ProjectSealed,
  Sealed,
  Who,
  WhoSealed,
} from '@apps/helm/types';

const CHUNK = 200;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const projectsOf = (uid: string) => collection(userOf(uid), 'projects');
const tasksOf = (uid: string) => collection(userOf(uid), 'tasks');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

export type ProjectEditResult = 'saved' | 'offline' | 'missing' | 'unreadable';

/** The words and date a person sets when they start or change a project. */
export interface ProjectWords {
  name: string;
  emoji: string | null;
  objective: string | null;
  targetDate: number | null;
}

const toWords = (words: ProjectWords): ProjectWords => ({
  name: words.name.trim().slice(0, PROJECT_NAME_MAX),
  emoji: words.emoji,
  objective: words.objective?.trim().slice(0, PROJECT_OBJECTIVE_MAX) || null,
  targetDate: words.targetDate,
});

/** Starts a project from words typed in the app. The write is handed back unawaited so it works offline; Undo deletes it. */
export async function createProject(
  uid: string,
  encryption: HelmEncryption,
  input: ProjectWords,
) {
  const words = toWords(input);
  if (!words.name) throw new Error('A project needs a name.');
  const id = generateUuid();
  const project: Project = {
    targetDate: words.targetDate,
    status: 'active',
    milestoneState: {},
    whoRoles: {},
    mediaIds: [],
    createdBy: 'person',
    executionId: null,
    privacy: 'ordinary',
    createdAt: Date.now(),
    lastEditedAt: null,
    finishedAt: null,
    sealed: await sealJson<ProjectSealed>(
      {
        name: words.name,
        emoji: words.emoji,
        objective: words.objective,
        milestones: {},
        roleNotes: {},
        privateMark: null,
        isPrivacyCleared: false,
      },
      encryption,
    ),
  };
  const ref = doc(projectsOf(uid), id);
  return {
    id,
    written: setDoc(ref, project),
    undo: () => deleteDoc(ref),
  };
}

/** Changes a project's name, emoji, objective and date in one transaction that re-reads it, so the people's notes and anything changed on another device meanwhile are kept. Needs a connection. */
export async function updateProject(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  edit: ProjectWords,
): Promise<ProjectEditResult> {
  if (!navigator.onLine) return 'offline';
  const words = toWords(edit);
  const ref = doc(projectsOf(uid), projectId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<ProjectEditResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const opened = await openJson<ProjectSealed>(
          (snapshot.data() as Project).sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const sealed = await sealJson<ProjectSealed>(
          {
            ...opened,
            name: words.name,
            emoji: words.emoji,
            objective: words.objective,
          },
          encryption,
        );
        transaction.update(ref, {
          sealed,
          targetDate: words.targetDate,
          lastEditedAt: Date.now(),
        });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

/** Finishes or reopens a project; the earlier state is handed back so Undo can write it. */
export function setProjectStatus(
  uid: string,
  project: { id: string; status: Project['status']; finishedAt: number | null },
  status: Project['status'],
) {
  const now = Date.now();
  const written = updateDoc(doc(projectsOf(uid), project.id), {
    status,
    finishedAt: status === 'finished' ? now : null,
    lastEditedAt: now,
  });
  return {
    written,
    undo: () =>
      updateDoc(doc(projectsOf(uid), project.id), {
        status: project.status,
        finishedAt: project.finishedAt,
        lastEditedAt: Date.now(),
      }),
  };
}

export type RoleResult =
  | { kind: 'saved'; undo: () => Promise<void> }
  | { kind: 'offline' | 'missing' | 'unreadable' };

export type RoleChange =
  { role: ProjectRole; note: string | null } | { role: null };

type WhoTarget = { whoId: string } | { newName: string };

const toNote = (note: string | null) =>
  note?.trim().slice(0, PROJECT_ROLE_NOTE_MAX) || null;

const withNote = (
  notes: Record<string, string>,
  whoId: string,
  note: string | null,
) =>
  Object.fromEntries([
    ...Object.entries(notes).filter(([id]) => id !== whoId),
    ...(note ? [[whoId, note]] : []),
  ]);

/** Sets, changes or takes away one person's part in a project, in one transaction. A key or involved part raises a passing person to regular (never one the person set), and Undo puts the part, the note, the level and a person made here back. A new name makes the person in the same write. Needs a connection. */
export async function changeProjectRole(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  target: WhoTarget,
  change: RoleChange,
): Promise<RoleResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const projectRef = doc(projectsOf(uid), projectId);
  const newWhoId = 'newName' in target ? generateUuid() : null;
  const whoId = 'whoId' in target ? target.whoId : (newWhoId as string);
  const whoRef = doc(collection(userOf(uid), 'who'), whoId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<RoleResult> => {
        const [project, who] = await Promise.all([
          transaction.get(projectRef),
          newWhoId ? Promise.resolve(null) : transaction.get(whoRef),
        ]);
        if (!project.exists()) return { kind: 'missing' };
        const data = project.data() as Project;
        const opened = await openJson<ProjectSealed>(
          data.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return { kind: 'unreadable' };
        const previousRole = data.whoRoles[whoId] ?? null;
        const previousNote = opened.roleNotes[whoId] ?? null;
        const note =
          change.role === null || change.role === 'mentioned'
            ? null
            : toNote(change.note);
        const notes = withNote(opened.roleNotes, whoId, note);
        const isNoteChanged = note !== previousNote;
        const now = Date.now();
        const sealed = isNoteChanged
          ? await sealJson<ProjectSealed>(
              { ...opened, roleNotes: notes },
              encryption,
            )
          : null;
        transaction.update(projectRef, {
          [`whoRoles.${whoId}`]: change.role ?? deleteField(),
          ...(sealed ? { sealed } : {}),
          lastEditedAt: now,
        });
        const raised = await raiseWho(transaction, {
          whoRef,
          who: who?.exists() ? (who.data() as Who) : null,
          isNew: newWhoId !== null,
          name: 'newName' in target ? target.newName : null,
          role: change.role,
          encryption,
          now,
        });
        return {
          kind: 'saved',
          undo: () =>
            undoRole({
              uid,
              encryption,
              projectId,
              whoId,
              previousRole,
              previousNote,
              raised,
            }),
        };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

interface Raised {
  /** A person made with the role: Undo deletes them. */
  madeWho: boolean;
  /** The earlier level of a person the role raised: Undo writes it back. */
  tierBefore: Who['tier'] | null;
}

async function raiseWho(
  transaction: Transaction,
  input: {
    whoRef: ReturnType<typeof doc>;
    who: Who | null;
    isNew: boolean;
    name: string | null;
    role: ProjectRole | null;
    encryption: HelmEncryption;
    now: number;
  },
): Promise<Raised> {
  const { whoRef, who, isNew, name, role, encryption, now } = input;
  const hasRole = role === 'key' || role === 'involved';
  if (isNew && name) {
    const made: Who = {
      kind: 'person',
      tier: 'passing',
      tierSetBy: 'nomos',
      isSelf: false,
      placeIds: [],
      photoMediaId: null,
      mediaIds: [],
      importedFrom: null,
      importedFields: {},
      lastMentionedAt: null,
      yearlyDateCount: 0,
      momentCount: 0,
      createdBy: 'person',
      executionId: null,
      privacy: 'ordinary',
      createdAt: now,
      lastEditedAt: null,
      sealed: await sealJson<WhoSealed>(
        {
          name: name.trim(),
          aliases: [],
          kin: null,
          soundsLike: null,
          refusedAliases: null,
          relation: null,
          phone: null,
          email: null,
          notes: null,
          species: null,
          organizationKind: null,
          privateMark: null,
          isPrivacyCleared: false,
          home: null,
          homeSource: null,
          away: null,
          nearNow: null,
        },
        encryption,
      ),
    };
    transaction.set(whoRef, {
      ...made,
      tier: readWhoTier({
        tier: made.tier,
        tierSetBy: made.tierSetBy,
        mentionDayKeys: [],
        taskLinkCount: 0,
        hasRole,
      }),
    });
    return { madeWho: true, tierBefore: null };
  }
  if (!who || !hasRole) return { madeWho: false, tierBefore: null };
  const tier = readWhoTier({
    tier: who.tier,
    tierSetBy: who.tierSetBy,
    mentionDayKeys: [],
    taskLinkCount: 0,
    hasRole,
  });
  if (tier === who.tier) return { madeWho: false, tierBefore: null };
  transaction.update(whoRef, { tier, lastEditedAt: now });
  return { madeWho: false, tierBefore: who.tier };
}

async function undoRole(input: {
  uid: string;
  encryption: HelmEncryption;
  projectId: string;
  whoId: string;
  previousRole: ProjectRole | null;
  previousNote: string | null;
  raised: Raised;
}) {
  const { uid, encryption, projectId, whoId, previousRole, previousNote } =
    input;
  const projectRef = doc(projectsOf(uid), projectId);
  const whoRef = doc(collection(userOf(uid), 'who'), whoId);
  await runTransaction(db, async (transaction) => {
    const [project, who] = await Promise.all([
      transaction.get(projectRef),
      input.raised.tierBefore !== null && !input.raised.madeWho
        ? transaction.get(whoRef)
        : null,
    ]);
    if (project.exists()) {
      const opened = await openJson<ProjectSealed>(
        (project.data() as Project).sealed as Sealed,
        encryption,
      ).catch(() => null);
      const notes = opened?.roleNotes ?? {};
      const sealed =
        opened && (notes[whoId] ?? null) !== previousNote
          ? await sealJson<ProjectSealed>(
              { ...opened, roleNotes: withNote(notes, whoId, previousNote) },
              encryption,
            )
          : null;
      transaction.update(projectRef, {
        [`whoRoles.${whoId}`]: previousRole ?? deleteField(),
        ...(sealed ? { sealed } : {}),
        lastEditedAt: Date.now(),
      });
    }
    if (input.raised.madeWho) transaction.delete(whoRef);
    else if (input.raised.tierBefore !== null && who?.exists()) {
      transaction.update(whoRef, {
        tier: input.raised.tierBefore,
        lastEditedAt: Date.now(),
      });
    }
  });
}

const toChunks = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, index) =>
    ids.slice(index * CHUNK, (index + 1) * CHUNK),
  );

/** The links already cut could not all be put back after a failure, so some tasks may have lost their project. */
export class ProjectDeletePartialError extends Error {
  constructor() {
    super('Some tasks may have lost their project.');
  }
}

/** How many tasks, open or done, belong to a project and how many of them are done; needs a connection. */
export async function countProjectTasks(uid: string, projectId: string) {
  const inProject = query(tasksOf(uid), where('projectId', '==', projectId));
  const [all, done] = await Promise.all([
    getCountFromServer(inProject),
    getCountFromServer(query(inProject, where('status', '==', 'done'))),
  ]);
  return { total: all.data().count, done: done.data().count };
}

const relink = (uid: string, projectId: string, ids: string[]) =>
  toChunks(ids).reduce(
    (chain, chunk) =>
      chain.then(() =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((id) => transaction.get(doc(tasksOf(uid), id))),
          );
          snapshots
            .filter(
              (snapshot) =>
                snapshot.exists() && snapshot.data()?.projectId === null,
            )
            .forEach((snapshot) =>
              transaction.update(snapshot.ref, { projectId }),
            );
        }),
      ),
    Promise.resolve(),
  );

/** Deletes a project and sets its tasks' project to none, in transaction-sized chunks. Each chunk re-reads its tasks, so one edited meanwhile keeps its other changes; Undo puts the project back and links the same tasks again if they still have none. Needs a connection. */
export async function deleteProject(uid: string, projectId: string) {
  await keepInheritedPrivate(uid, 'project', projectId);
  const ref = doc(projectsOf(uid), projectId);
  const found = await getDocs(
    query(tasksOf(uid), where('projectId', '==', projectId)),
  );
  const chunks = toChunks(found.docs.map((entry) => entry.id));
  const outcomes = await Promise.allSettled(
    chunks.map((chunk) =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map((id) => transaction.get(doc(tasksOf(uid), id))),
        );
        return snapshots.flatMap((snapshot) => {
          if (snapshot.data()?.projectId !== projectId) return [];
          transaction.update(snapshot.ref, {
            projectId: null,
            lastEditedAt: Date.now(),
          });
          return [snapshot.id];
        });
      }),
    ),
  );
  const cut = outcomes.flatMap((outcome) =>
    outcome.status === 'fulfilled' ? outcome.value : [],
  );
  const failed = outcomes.find((outcome) => outcome.status === 'rejected');
  const abandon = async (reason: unknown): Promise<never> => {
    await relink(uid, projectId, cut).catch((error: unknown) => {
      console.error('Helm project links were not put back', error);
      throw new ProjectDeletePartialError();
    });
    throw reason;
  };
  if (failed) await abandon(failed.reason);
  const raw = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;
    transaction.delete(ref);
    return snapshot.data() as DocumentData;
  }).catch(abandon);
  if (!raw) throw new Error('This is already gone.');
  return {
    taskCount: cut.length,
    restore: async (): Promise<'restored' | 'exists'> => {
      const isBack = await runTransaction(db, async (transaction) => {
        if ((await transaction.get(ref)).exists()) return false;
        transaction.set(ref, { ...raw, lastEditedAt: Date.now() });
        return true;
      });
      if (!isBack) return 'exists';
      await relink(uid, projectId, cut);
      return 'restored';
    },
  };
}

export type MilestoneResult =
  | { kind: 'saved'; id: string; undo: () => Promise<boolean> }
  | { kind: 'offline' | 'missing' | 'unreadable' | 'full' };

type MilestoneState = Project['milestoneState'][string];

/** The words and date a person sets on a milestone; the date is date-only, UTC midnight. */
export interface MilestoneWords {
  title: string;
  date: number | null;
}

const toMilestoneTitle = (title: string) =>
  title.trim().slice(0, MILESTONE_TITLE_MAX);

const withoutKey = <T>(map: Record<string, T>, id: string) =>
  Object.fromEntries(Object.entries(map).filter(([key]) => key !== id));

/** Runs one milestone change in a transaction that re-reads the project, so a title or date changed on another device meanwhile is kept. The read comes first; `change` decides the writes. Needs a connection. */
async function changeMilestones(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  change: (input: {
    data: Project;
    opened: ProjectSealed;
    now: number;
  }) => Promise<
    | {
        fields: Record<string, unknown>;
        sealed: ProjectSealed | null;
        id: string;
        undo: () => Promise<boolean>;
      }
    | 'missing'
    | 'full'
  >,
): Promise<MilestoneResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const ref = doc(projectsOf(uid), projectId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<MilestoneResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return { kind: 'missing' };
        const data = snapshot.data() as Project;
        const opened = await openJson<ProjectSealed>(
          data.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return { kind: 'unreadable' };
        const now = Date.now();
        const outcome = await change({ data, opened, now });
        if (outcome === 'missing' || outcome === 'full') {
          return { kind: outcome };
        }
        const sealed = outcome.sealed
          ? await sealJson<ProjectSealed>(outcome.sealed, encryption)
          : null;
        transaction.update(ref, {
          ...outcome.fields,
          ...(sealed ? { sealed } : {}),
          lastEditedAt: now,
        });
        return { kind: 'saved', id: outcome.id, undo: outcome.undo };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

/** Puts a milestone back, or takes it away, only while the project is as this change left it. */
const settleMilestone = (
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  id: string,
  next: { state: MilestoneState; title: string } | null,
  isNowAllowed: (
    current: MilestoneState | undefined,
    title: string | undefined,
  ) => boolean,
) =>
  runTransaction(db, async (transaction) => {
    const ref = doc(projectsOf(uid), projectId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return false;
    const data = snapshot.data() as Project;
    const opened = await openJson<ProjectSealed>(
      data.sealed as Sealed,
      encryption,
    ).catch(() => null);
    if (!opened) return false;
    const milestones = opened.milestones ?? {};
    if (!isNowAllowed(data.milestoneState?.[id], milestones[id]?.title)) {
      return false;
    }
    const sealed = await sealJson<ProjectSealed>(
      {
        ...opened,
        milestones: next
          ? { ...milestones, [id]: { title: next.title } }
          : withoutKey(milestones, id),
      },
      encryption,
    );
    transaction.update(ref, {
      [`milestoneState.${id}`]: next ? next.state : deleteField(),
      sealed,
      lastEditedAt: Date.now(),
    });
    return true;
  });

/** Adds a milestone to a project in one transaction (both maps, one id); Undo removes it while it is unchanged. At most thirty a project. */
export function addMilestone(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  input: MilestoneWords,
) {
  const id = generateUuid();
  const title = toMilestoneTitle(input.title);
  return changeMilestones(
    uid,
    encryption,
    projectId,
    async ({ data, opened }) => {
      const states = Object.values(data.milestoneState ?? {}).filter((entry) =>
        Number.isFinite(entry?.order),
      );
      if (states.length >= MILESTONES_MAX) return 'full';
      const state: MilestoneState = {
        date: input.date,
        order: Math.max(-1, ...states.map((entry) => entry.order)) + 1,
        doneAt: null,
      };
      return {
        id,
        fields: { [`milestoneState.${id}`]: state },
        sealed: {
          ...opened,
          milestones: { ...(opened.milestones ?? {}), [id]: { title } },
        },
        undo: () =>
          settleMilestone(
            uid,
            encryption,
            projectId,
            id,
            null,
            (current, currentTitle) =>
              current?.doneAt === null &&
              current.date === input.date &&
              currentTitle === title,
          ),
      };
    },
  );
}

/** Changes a milestone's title and date. The date is a dotted-path write; a new title reseals inside the same transaction. Undo puts back what it changed, only while the milestone is as it left it. */
export function editMilestone(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  id: string,
  input: MilestoneWords,
) {
  const title = toMilestoneTitle(input.title);
  return changeMilestones(
    uid,
    encryption,
    projectId,
    async ({ data, opened }) => {
      const current = data.milestoneState?.[id];
      const before = opened.milestones?.[id];
      if (!current || !before) return 'missing';
      const isDateChanged = input.date !== current.date;
      const isTitleChanged = title !== before.title;
      return {
        id,
        fields: isDateChanged
          ? { [`milestoneState.${id}.date`]: input.date }
          : {},
        sealed: isTitleChanged
          ? {
              ...opened,
              milestones: { ...opened.milestones, [id]: { title } },
            }
          : null,
        undo: async () => {
          const undone = await changeMilestones(
            uid,
            encryption,
            projectId,
            async (live) => {
              const liveState = live.data.milestoneState?.[id];
              const liveTitle = live.opened.milestones?.[id]?.title;
              const isAsLeft =
                liveState?.date === input.date &&
                liveTitle === title &&
                liveState.doneAt === current.doneAt;
              if (!isAsLeft) return 'missing';
              return {
                id,
                fields: isDateChanged
                  ? { [`milestoneState.${id}.date`]: current.date }
                  : {},
                sealed: isTitleChanged
                  ? {
                      ...live.opened,
                      milestones: {
                        ...live.opened.milestones,
                        [id]: { title: before.title },
                      },
                    }
                  : null,
                undo: async () => false,
              };
            },
          );
          return undone.kind === 'saved';
        },
      };
    },
  );
}

/** Ticks a milestone reached or not with one dotted-path field, handed back unawaited so it works offline; Undo writes the earlier value while the milestone is still as the tick left it. */
export function setMilestoneDone(
  uid: string,
  projectId: string,
  id: string,
  previousDoneAt: number | null,
  isDone: boolean,
) {
  const ref = doc(projectsOf(uid), projectId);
  const field = `milestoneState.${id}.doneAt`;
  const doneAt = isDone ? Date.now() : null;
  return {
    written: updateDoc(ref, { [field]: doneAt }),
    undo: () =>
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists()
          ? (snapshot.data() as Project).milestoneState?.[id]
          : undefined;
        if (current?.doneAt !== doneAt) return false;
        transaction.update(ref, { [field]: previousDoneAt });
        return true;
      }),
  };
}

/** Takes a milestone out of both maps in one transaction; Undo puts back the same id, state and title if the id is still free. */
export function removeMilestone(
  uid: string,
  encryption: HelmEncryption,
  projectId: string,
  id: string,
) {
  return changeMilestones(
    uid,
    encryption,
    projectId,
    async ({ data, opened }) => {
      const state = data.milestoneState?.[id];
      const before = opened.milestones?.[id];
      if (!state || !before) return 'missing';
      return {
        id,
        fields: { [`milestoneState.${id}`]: deleteField() },
        sealed: {
          ...opened,
          milestones: withoutKey(opened.milestones ?? {}, id),
        },
        undo: () =>
          settleMilestone(
            uid,
            encryption,
            projectId,
            id,
            { state, title: before.title },
            (current) => !current,
          ),
      };
    },
  );
}

const CLEAR_CHUNK = 400;

/** What a clear did: the tasks it really cleared, and a way to bring back exactly those. */
export interface ClearedTasks {
  count: number;
  undo: () => Promise<void>;
}

const inChunks = async <T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T[]>,
) =>
  Array.from({ length: Math.ceil(ids.length / CLEAR_CHUNK) }, (_, index) =>
    ids.slice(index * CLEAR_CHUNK, (index + 1) * CLEAR_CHUNK),
  ).reduce<Promise<T[]>>(
    (chain, chunk) =>
      chain.then(async (done) => [...done, ...(await run(chunk))]),
    Promise.resolve([]),
  );

/** Hides a project's done tasks from its done list. The candidates come from the cache; each chunk re-reads its tasks in a transaction and clears only those still done, in this project and not yet cleared, so the count is what was really cleared even while another device ticks or reopens. Undo clears the mark on exactly those tasks, only where it is still this one. Needs a connection. */
export async function clearDoneTasks(
  uid: string,
  projectId: string,
  candidateIds: string[],
): Promise<ClearedTasks> {
  const now = Date.now();
  const cleared: string[] = [];
  const bringBack = (ids: string[]) =>
    inChunks(ids, (chunk) =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map((id) => transaction.get(doc(tasksOf(uid), id))),
        );
        snapshots
          .filter((snapshot) => snapshot.data()?.clearedAt === now)
          .forEach((snapshot) =>
            transaction.update(snapshot.ref, { clearedAt: null }),
          );
        return [];
      }),
    ).then(() => undefined);
  try {
    await inChunks(candidateIds, async (chunk) => {
      const made = await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map((id) => transaction.get(doc(tasksOf(uid), id))),
        );
        return snapshots.flatMap((snapshot) => {
          const task = snapshot.data();
          if (
            task?.projectId !== projectId ||
            task.status !== 'done' ||
            (task.clearedAt ?? null) !== null
          ) {
            return [];
          }
          transaction.update(snapshot.ref, { clearedAt: now });
          return [snapshot.id];
        });
      });
      cleared.push(...made);
      return made;
    });
  } catch (error) {
    await bringBack(cleared).catch(() => undefined);
    throw error;
  }
  return { count: cleared.length, undo: () => bringBack(cleared) };
}
