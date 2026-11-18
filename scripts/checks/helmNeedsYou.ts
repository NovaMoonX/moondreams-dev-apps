// Fails when another app's task copy asks for the person on a day it should not: finished, paid, automatic, from an ended trip, or not yet due.
import assert from 'node:assert/strict';

import {
  needsYouOnDay,
  toPersonDay,
  type NeedsYouTask,
} from '../../src/apps/helm/engine/needsYou.ts';
import { isTaskForToday } from '../../src/apps/helm/utils/synced.ts';
import type { SyncedRecord } from '../../src/apps/helm/types.ts';
import { createWaypointAdapter } from '../../functions/src/apps/waypoint/share/adapter.ts';

const DAY = 86_400_000;
const today = Date.UTC(2026, 10, 18);
const bill = (
  dueDay: number | null,
  extra: NeedsYouTask['extra'] = {},
): NeedsYouTask => ({
  kind: 'task',
  dueAt: dueDay === null ? null : today + dueDay * DAY,
  extra,
});

assert.equal(needsYouOnDay(bill(0), today), true, 'a bill due today asks');
assert.equal(
  needsYouOnDay(bill(-3), today),
  true,
  'an unpaid overdue bill asks',
);
assert.equal(needsYouOnDay(bill(5), today), false, 'a bill due later does not');
assert.equal(
  needsYouOnDay(bill(0, { isAutomatic: true }), today),
  false,
  'an autopay bill never asks',
);
assert.equal(
  needsYouOnDay(bill(-2, { isAutomatic: true }), today),
  false,
  'an overdue autopay bill never asks',
);
assert.equal(
  needsYouOnDay(bill(null, { isDone: true }), today),
  false,
  'a paid bill never asks',
);
assert.equal(
  needsYouOnDay(bill(0, { isDone: true }), today),
  false,
  'a done to-do due today never asks',
);
assert.equal(
  needsYouOnDay(bill(null), today),
  true,
  'an open task with no day is a list the person keeps',
);
assert.equal(
  needsYouOnDay({ ...bill(0), kind: 'event' }, today),
  false,
  'only tasks',
);

const record = (dueAt: number | null): SyncedRecord =>
  ({
    kind: 'task',
    dueAt,
    sealed: { extra: {} },
  }) as unknown as SyncedRecord;
// 23:30 on Nov 17 in Los Angeles is already Nov 18 in UTC: a bill due Nov 18 is not due yet there.
const lateEvening = Date.UTC(2026, 10, 18, 7, 30);
assert.equal(toPersonDay(lateEvening, 'America/Los_Angeles'), today - DAY);
assert.equal(
  isTaskForToday(record(today), lateEvening, 'America/Los_Angeles'),
  false,
  'a date-only due day is compared as a day in the person zone, not as an instant',
);
assert.equal(isTaskForToday(record(today), lateEvening, 'UTC'), true);
assert.equal(
  isTaskForToday(record(today - DAY), lateEvening, 'America/Los_Angeles'),
  true,
);

const ended = Date.UTC(2026, 10, 10);
const live = Date.UTC(2026, 11, 20);
const tripDoc = (id: string, end: number) => ({
  id,
  data: () => ({
    title: id,
    startDate: end - 3 * DAY,
    endDate: end,
    isArchived: false,
    members: {},
  }),
  get: (field: string) =>
    ({
      title: id,
      startDate: end - 3 * DAY,
      endDate: end,
      isArchived: false,
    })[field],
  ref: {
    collection: () => ({
      where: () => ({
        select: () => ({
          limit: () => ({
            get: async () => ({
              size: 1,
              docs: [
                {
                  id: `${id}-todo`,
                  get: (field: string) =>
                    ({ title: 'Pack', isCompleted: false })[field] ?? null,
                },
              ],
            }),
          }),
        }),
      }),
    }),
  },
});
const trips = [tripDoc('ended', ended), tripDoc('ahead', live)];
const firestore = {
  collection: (path: string) =>
    path.startsWith('apps/waypoint/trips')
      ? {
          where: () => ({
            select: () => ({
              limit: () => ({
                get: async () => ({ size: trips.length, docs: trips }),
              }),
            }),
          }),
        }
      : {
          select: () => ({
            limit: () => ({
              get: async () => ({ size: 0, docs: [] }),
            }),
          }),
        },
};
const adapter = createWaypointAdapter({
  firestore: () => firestore as never,
  canOpen: async () => true,
  now: () => Date.UTC(2026, 10, 18),
});
const read = await adapter.syncPage(
  { uid: 'u', accountId: 'site', grant: {} as never },
  {
    category: 'myTasks',
    cursor: null,
    windowStart: Date.UTC(2026, 9, 18),
    resumeState: null,
  } as never,
);
assert.deepEqual(
  read.records.map((one) => one.subtitle),
  ['ahead'],
  "an ended trip's to-dos are never sent",
);

console.log('helm needs-you checks passed');
