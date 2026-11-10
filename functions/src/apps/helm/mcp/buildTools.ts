import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import {
  createSyncedBook,
  type AliasBook,
  type SyncedBook,
} from '../nomos/aliases.js';
import { describeDue } from '../nomos/buildContext.js';
import type { TaskDue } from '../nomos/commands.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import type { ConnectionGrant } from '../../../vendor/connectionsContract.js';
import {
  connectorLabel,
  parseDay,
  readRecentCopies,
  readSyncedEvents,
  toKnownZone,
  toSyncedView,
  type SyncedCopy,
} from '../syncedCopies.js';

export interface HelmToolScope {
  uid: string;
  key: HelmKey;
  aliases: AliasBook;
  synced?: SyncedBook;
  timeZone?: string;
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
const MAX_CALENDAR_DAYS = 14;
const MAX_CALENDAR_EVENTS = 40;

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

const getCalendarShape = {
  from: z
    .string()
    .max(10)
    .describe(
      "The first day to look at, as YYYY-MM-DD in the person's time zone.",
    ),
  days: z
    .number()
    .int()
    .min(1)
    .max(MAX_CALENDAR_DAYS)
    .describe(`How many days to look at, 1 to ${MAX_CALENDAR_DAYS}.`),
};

const searchSyncedShape = {
  query: z
    .string()
    .max(MAX_QUERY_CHARS)
    .describe('Words from the record, as the person would say them.'),
};

const connectionStatusShape = {
  alias: z
    .string()
    .max(10)
    .describe('The alias of a connection from list_connections, such as c1.'),
};

const toIso = (at: number | null) =>
  at === null ? null : new Date(at).toISOString();

/** The tools the server offers a model; every path is built from the scope's uid and every record leaves as an alias. */
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

  const synced = scope.synced ?? createSyncedBook();
  const timeZone = toKnownZone(scope.timeZone ?? 'UTC');
  const toResult = (copy: SyncedCopy) => ({
    alias: synced.add(copy),
    ...toSyncedView(copy, timeZone),
  });

  const getCalendar: HelmTool<typeof getCalendarShape> = {
    name: 'get_calendar',
    description:
      "Lists the events the person's connected calendars and apps hold for a range of days, soonest first. Today and tomorrow are already in the context.",
    shape: getCalendarShape,
    run: async ({ from, days }) => {
      const firstDay = parseDay(from);
      if (firstDay === null) {
        return { events: [], note: 'from must be a day like 2026-11-10.' };
      }
      const events = await readSyncedEvents(
        scope.firestore,
        scope.uid,
        scope.key,
        {
          firstDay,
          days: Math.min(days, MAX_CALENDAR_DAYS),
          timeZone,
          limit: MAX_CALENDAR_EVENTS,
        },
      );
      return { events: events.map(toResult) };
    },
  };

  const searchSynced: HelmTool<typeof searchSyncedShape> = {
    name: 'search_synced',
    description:
      "Finds records the person's connected apps and calendars share, by words in their title: events, tasks, plans and more. Upcoming ones come first; a record marked noLongerUpdated is a kept copy from a connection that has ended.",
    shape: searchSyncedShape,
    run: async ({ query }) => {
      const words = toWords(query);
      const now = Date.now();
      const copies = await readRecentCopies(
        scope.firestore,
        scope.uid,
        scope.key,
      );
      const anchorOf = (copy: SyncedCopy) => copy.startAt ?? copy.dueAt;
      const found = copies
        .filter((copy) => {
          const haystack = toWords(`${copy.title} ${copy.subtitle ?? ''}`);
          return (
            words.length > 0 &&
            words.every((word) =>
              haystack.some((entry) => entry.includes(word)),
            )
          );
        })
        .sort((a, b) => {
          const [x, y] = [anchorOf(a), anchorOf(b)];
          const isUpcoming = (at: number | null) => at !== null && at >= now;
          if (isUpcoming(x) !== isUpcoming(y)) return isUpcoming(x) ? -1 : 1;
          if (x === null || y === null) return x === null ? 1 : -1;
          return isUpcoming(x) ? x - y : y - x;
        })
        .slice(0, MAX_RESULTS);
      return {
        records: found.map((copy) => ({
          ...toResult(copy),
          noLongerUpdated: copy.isEnded,
        })),
      };
    },
  };

  const readConnections = async () => {
    const snapshot = await scope.firestore
      .collection(`connections/${scope.uid}/grants`)
      .where('readerAppId', '==', 'helm')
      .get();
    const { SOURCE_ADAPTERS } =
      await import('../../../connections/registry.js');
    const grants = snapshot.docs
      .filter((doc) => doc.get('status') !== 'ended')
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return Promise.all(
      grants.map(async (doc, index) => {
        const grant = doc.data() as ConnectionGrant;
        const labels = new Map(
          (SOURCE_ADAPTERS[grant.connectorId]?.manifest.categories ?? []).map(
            (category) => [category.id, category.label],
          ),
        );
        const account =
          grant.accountId === 'site'
            ? null
            : ((
                await scope.firestore
                  .doc(`connections/${scope.uid}/accounts/${grant.accountId}`)
                  .get()
              ).data() as { label: string | null; email: string } | undefined);
        return {
          alias: `c${index + 1}`,
          app: connectorLabel(grant.connectorId),
          account: account ? (account.label ?? account.email) : null,
          status: grant.status,
          lastSyncAt: toIso(grant.lastSyncAt),
          categories: Object.entries(grant.categories).map(([id, entry]) => ({
            label: labels.get(id) ?? id,
            isOn: entry.isOn,
            lastOkAt: toIso(grant.categoryState[id]?.lastOkAt ?? null),
            count: grant.categoryState[id]?.count ?? 0,
            hasError: !!grant.categoryState[id]?.lastError,
          })),
        };
      }),
    );
  };

  const listConnections: HelmTool<Record<string, never>> = {
    name: 'list_connections',
    description:
      "Lists the apps and accounts the person has connected: each one's alias, name, account label and the categories switched on.",
    shape: {},
    run: async () => {
      const connections = await readConnections();
      return {
        connections: connections.map(
          ({ alias, app, account, status, categories }) => ({
            alias,
            app,
            account,
            status,
            categories: categories
              .filter((category) => category.isOn)
              .map((category) => category.label),
          }),
        ),
      };
    },
  };

  const connectionStatus: HelmTool<typeof connectionStatusShape> = {
    name: 'connection_status',
    description:
      "Says when one connection last updated and whether it is working, with each category's last update and count. Use an alias from list_connections.",
    shape: connectionStatusShape,
    run: async ({ alias }) => {
      const found = (await readConnections()).find(
        (connection) => connection.alias === alias,
      );
      return found ? { connection: found } : { connection: null };
    },
  };

  return [
    searchTasks,
    getCalendar,
    searchSynced,
    listConnections,
    connectionStatus,
  ];
}

const readTitle = (key: HelmKey, sealed: SealedPayload) => {
  try {
    const opened = openForHelm(key, sealed);
    return typeof opened.title === 'string' ? opened.title : '';
  } catch {
    return '';
  }
};
