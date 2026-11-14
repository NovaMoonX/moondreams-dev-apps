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

import { PROJECTS_LIMIT } from '@apps/helm/constants';
import type {
  OpenProject,
  Project,
  ProjectRole,
  ProjectSealed,
} from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your projects did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const isRole = (value: unknown): value is ProjectRole =>
  value === 'key' || value === 'involved' || value === 'mentioned';

const toRoles = (value: unknown): Record<string, ProjectRole> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(([, role]) => isRole(role)),
      )
    : {};

const toNotes = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

const toMilestones = (value: unknown): Record<string, { title: string }> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([, entry]) =>
            typeof (entry as { title?: unknown })?.title === 'string',
        ),
      )
    : {};

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** An entry missing a field or holding a non-finite number is skipped, so a half-written one never shows. */
const toMilestoneState = (value: unknown): Project['milestoneState'] =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, entry]) => {
          const { date, order, doneAt } = (entry ?? {}) as Record<
            string,
            unknown
          >;
          return (date === null || isNumber(date)) &&
            isNumber(order) &&
            (doneAt === null || isNumber(doneAt))
            ? [[id, { date, order, doneAt }]]
            : [];
        }),
      )
    : {};

/** A project that won't open is kept, with no name, so the surface can say so instead of dropping it. */
async function openProject(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenProject> {
  const data = entry.data() as Partial<Project>;
  const base = {
    id: entry.id,
    targetDate: data.targetDate ?? null,
    status: data.status === 'finished' ? 'finished' : 'active',
    milestoneState: toMilestoneState(data.milestoneState),
    whoRoles: toRoles(data.whoRoles),
    mediaIds: data.mediaIds ?? [],
    createdBy: data.createdBy ?? 'nomos',
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    lastEditedAt: data.lastEditedAt ?? null,
    finishedAt: data.finishedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This project has no sealed words.');
    const payload = await read<Partial<ProjectSealed>>(data.sealed);
    return {
      ...base,
      name: toText(payload.name) ?? '',
      emoji: toText(payload.emoji),
      objective: toText(payload.objective),
      milestones: toMilestones(payload.milestones),
      roleNotes: toNotes(payload.roleNotes),
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      name: '',
      emoji: null,
      objective: null,
      milestones: {},
      roleNotes: {},
      isUnreadable: true,
    };
  }
}

/** Every project the person has. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startProjectsListener(
  uid: string,
  read: SealedReader,
  onChange: (projects: OpenProject[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'projects'),
      limit(PROJECTS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openProject(entry, read)),
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
