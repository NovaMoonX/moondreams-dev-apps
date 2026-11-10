import type {
  Firestore,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import type { ExistingProject, ProjectRoleName } from './nomos/planProjects.js';

const MAX_PROJECTS_READ = 200;

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

/** The names of the active projects, newest first, for the model to point a task at. */
export async function readContextProjects(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  max: number,
): Promise<string[]> {
  const docs = (await activeQuery(firestore, base).get()).docs;
  return openProjects(key, docs)
    .slice(0, max)
    .map((project) => project.name);
}
