import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import type { AliasBook } from '../nomos/aliases.js';
import { describeDue } from '../nomos/buildContext.js';
import type { TaskDue } from '../nomos/commands.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import type { SealedPayload } from '../../../appKeys/seal.js';

export interface HelmToolScope {
  uid: string;
  key: HelmKey;
  aliases: AliasBook;
  firestore: Firestore;
}

export interface HelmTool<Shape extends z.ZodRawShape> {
  name: string;
  description: string;
  shape: Shape;
  run: (input: z.infer<z.ZodObject<Shape>>) => Promise<unknown>;
}

const MAX_RESULTS = 10;
const MAX_SCANNED = 150;
const MAX_QUERY_CHARS = 100;

const toWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);

const searchTasksShape = {
  query: z
    .string()
    .max(MAX_QUERY_CHARS)
    .describe('Words from the task, as the person would say them.'),
  includeDone: z
    .boolean()
    .describe('true to also search tasks already marked done.'),
};

/** The tools Helm's server offers; every path is built from the scope's uid and every record leaves as an alias. */
export function buildHelmTools(scope: HelmToolScope) {
  const searchTasks: HelmTool<typeof searchTasksShape> = {
    name: 'search_tasks',
    description:
      'Finds tasks by words in their title, the newest first. Open tasks are already listed in the context; use this for one that is not there, or for tasks already done.',
    shape: searchTasksShape,
    run: async ({ query, includeDone }) => {
      const words = toWords(query);
      const statuses = includeDone ? ['open', 'done'] : ['open'];
      const found = await Promise.all(
        statuses.map(async (status) => {
          const snapshot = await scope.firestore
            .collection(`apps/helm/users/${scope.uid}/tasks`)
            .where('status', '==', status)
            .orderBy('createdAt', 'desc')
            .limit(MAX_SCANNED)
            .get();
          return snapshot.docs.flatMap((doc) => {
            const data = doc.data() as {
              status: string;
              due: TaskDue | null;
              createdAt: number;
              sealed: SealedPayload;
            };
            const title = readTitle(scope.key, data.sealed);
            const haystack = toWords(title);
            const isMatch =
              words.length > 0 &&
              words.every((word) =>
                haystack.some((entry) => entry.includes(word)),
              );
            return title && isMatch ? [{ id: doc.id, title, data }] : [];
          });
        }),
      );
      const tasks = found
        .flat()
        .sort((a, b) => b.data.createdAt - a.data.createdAt)
        .slice(0, MAX_RESULTS)
        .map(({ id, title, data }) => ({
          alias: scope.aliases.add(id),
          title,
          status: data.status,
          due: describeDue(data.due),
        }));
      return { tasks };
    },
  };
  return [searchTasks];
}

const readTitle = (key: HelmKey, sealed: SealedPayload) => {
  try {
    const opened = openForHelm(key, sealed);
    return typeof opened.title === 'string' ? opened.title : '';
  } catch {
    return '';
  }
};
