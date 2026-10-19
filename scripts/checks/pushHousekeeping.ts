import assert from 'node:assert/strict';

import {
  FINISHED_STATUSES,
  PRUNE_AFTER_MS,
  PRUNE_BATCH_SIZE,
  getPruneCutoff,
  isPrunable,
  pruneFinishedReminders,
} from '../../functions/src/notifications/pruneReminders.ts';

const NOW = Date.UTC(2026, 9, 19, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const old = NOW - PRUNE_AFTER_MS - 1;

// Which reminders are pruned
assert.equal(
  PRUNE_AFTER_MS,
  14 * DAY,
  'finished reminders are kept for two weeks',
);
assert.deepEqual(
  FINISHED_STATUSES,
  ['sent', 'cancelled', 'expired'],
  'sent, cancelled and expired are the finished states',
);
for (const status of FINISHED_STATUSES) {
  assert.equal(
    isPrunable({ status, scheduledFor: old }, NOW),
    true,
    `a ${status} reminder due before the cutoff is pruned`,
  );
  assert.equal(
    isPrunable({ status, scheduledFor: getPruneCutoff(NOW) }, NOW),
    false,
    `a ${status} reminder due exactly at the cutoff is kept`,
  );
  assert.equal(
    isPrunable({ status, scheduledFor: NOW - DAY }, NOW),
    false,
    `a ${status} reminder from yesterday is kept, so every open page has seen it change`,
  );
}
assert.equal(
  isPrunable({ status: 'pending', scheduledFor: old }, NOW),
  false,
  'a reminder still pending is never pruned, however old (the sender settles it)',
);
assert.equal(
  isPrunable({ status: 'pending', scheduledFor: NOW + 300 * DAY }, NOW),
  false,
  'a yearly reminder rolled forward stays',
);
assert.equal(
  isPrunable({ status: 'sent' }, NOW),
  false,
  'one with no time is kept',
);
assert.equal(
  isPrunable({ status: 'sent', scheduledFor: String(old) }, NOW),
  false,
  'one whose time is not a number is kept',
);
assert.equal(
  isPrunable({ scheduledFor: old }, NOW),
  false,
  'one with no status is kept',
);

// What a run asks for and deletes
interface Call {
  where: unknown[][];
  limit: number | null;
  deleted: string[];
  commits: number;
}
const fakeFirestore = (
  docs: { id: string; data: Record<string, unknown> }[],
) => {
  const call: Call = { where: [], limit: null, deleted: [], commits: 0 };
  const query = {
    where: (...args: unknown[]) => {
      call.where.push(args);
      return query;
    },
    limit: (count: number) => {
      call.limit = count;
      return query;
    },
    get: async () => ({
      docs: docs.map((entry) => ({
        ref: { id: entry.id },
        data: () => entry.data,
      })),
    }),
  };
  const firestore = {
    collection: (name: string) => {
      assert.equal(name, 'reminders');
      return query;
    },
    batch: () => ({
      delete: (ref: { id: string }) => call.deleted.push(ref.id),
      commit: async () => {
        call.commits += 1;
      },
    }),
  };
  return { firestore: firestore as never, call };
};

const sentLongAgo = { status: 'sent', scheduledFor: old };
const first = fakeFirestore([
  { id: 'a', data: sentLongAgo },
  { id: 'b', data: { status: 'cancelled', scheduledFor: old } },
]);
assert.equal(await pruneFinishedReminders(first.firestore, NOW), 2);
assert.deepEqual(
  first.call.where,
  [
    ['status', 'in', FINISHED_STATUSES],
    ['scheduledFor', '<', getPruneCutoff(NOW)],
  ],
  'the run asks for finished reminders due before the cutoff',
);
assert.equal(
  first.call.limit,
  PRUNE_BATCH_SIZE,
  'one run reads and deletes a bounded batch',
);
assert.deepEqual(first.call.deleted, ['a', 'b']);
assert.equal(first.call.commits, 1, 'the deletes go in one batch');
assert.equal(PRUNE_BATCH_SIZE, 200);

const mixed = fakeFirestore([
  { id: 'a', data: sentLongAgo },
  { id: 'pending', data: { status: 'pending', scheduledFor: old } },
]);
assert.equal(await pruneFinishedReminders(mixed.firestore, NOW), 1);
assert.deepEqual(
  mixed.call.deleted,
  ['a'],
  'a document the query should not have returned is still not deleted',
);

const none = fakeFirestore([]);
assert.equal(await pruneFinishedReminders(none.firestore, NOW), 0);
assert.equal(none.call.commits, 0, 'nothing to prune writes nothing');

console.log('pushHousekeeping: all checks passed');
