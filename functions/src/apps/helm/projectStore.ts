import type {
  Firestore,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import { MAX_CONTEXT_MILESTONES } from './nomos/commands.js';
import type {
  ExistingMilestoneState,
  ExistingProject,
  ProjectRoleName,
} from './nomos/planProjects.js';

const MAX_PROJECTS_READ = 200;

/** A project as the model sees it: its name and the milestones still open, dates as YYYY-MM-DD. */
export interface ContextProject {
  name: string;
  milestones: { title: string; date: string | null }[];
}

const isRole = (value: unknown): value is ProjectRoleName =>
  value === 'key' || value === 'involved' || value === 'mentioned';

const toRoles = (value: unknown): Record<string, ProjectRoleName> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter((entry) => isRole(entry[1])),
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

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** An entry missing a field or holding a non-finite number is skipped, as the device skips it. */
const toMilestoneState = (
  value: unknown,
): Record<string, ExistingMilestoneState> =>
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

const toMilestoneTitles = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, entry]) => {
          const title = (entry as { title?: unknown } | null)?.title;
          return typeof title === 'string' ? [[id, title]] : [];
        }),
      )
    : {};

const openProjects = (
  key: HelmKey,
  docs: QueryDocumentSnapshot[],
): ExistingProject[] =>
  docs
    .flatMap((doc): [number, ExistingProject][] => {
      try {
        const words = openForHelm(key, doc.get('sealed') as SealedPayload);
        if (typeof words.name !== 'string' || words.name === '') return [];
        return [
          [
            Number(doc.get('lastEditedAt') ?? doc.get('createdAt') ?? 0),
            {
              id: doc.id,
              name: words.name,
              emoji: typeof words.emoji === 'string' ? words.emoji : null,
              whoRoles: toRoles(doc.get('whoRoles')),
              roleNotes: toNotes(words.roleNotes),
              milestoneState: toMilestoneState(doc.get('milestoneState')),
              milestoneTitles: toMilestoneTitles(words.milestones),
              sealed: words,
            },
          ],
        ];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right[0] - left[0])
    .map(([, project]) => project);

const activeQuery = (firestore: Firestore, base: string) =>
  firestore
    .collection(`${base}/projects`)
    .where('status', '==', 'active')
    .limit(MAX_PROJECTS_READ);

/** The person's active projects, most recently touched first, for the turn's transaction. */
export async function readActiveProjectsIn(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<ExistingProject[]> {
  return openProjects(
    key,
    (await transaction.get(activeQuery(firestore, base))).docs,
  );
}

/** The active projects, newest first, each with its open milestones (soonest first, undated last), for the model to point a task or a milestone at. */
export async function readContextProjects(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  max: number,
): Promise<ContextProject[]> {
  const docs = (await activeQuery(firestore, base).get()).docs;
  return openProjects(key, docs)
    .slice(0, max)
    .map((project) => ({
      name: project.name,
      milestones: Object.entries(project.milestoneState)
        .flatMap(([id, state]) =>
          state.doneAt === null && project.milestoneTitles[id]
            ? [{ title: project.milestoneTitles[id], date: state.date }]
            : [],
        )
        .sort(
          (left, right) => (left.date ?? Infinity) - (right.date ?? Infinity),
        )
        .slice(0, MAX_CONTEXT_MILESTONES)
        .map(({ title, date }) => ({
          title,
          date:
            date === null ? null : new Date(date).toISOString().slice(0, 10),
        })),
    }));
}
