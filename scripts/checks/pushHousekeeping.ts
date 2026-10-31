import { deepEqual as sameShape } from 'node:assert';
import assert from 'node:assert/strict';

import { FieldValue } from 'firebase-admin/firestore';

import {
  FINISHED_STATUSES,
  PRUNE_AFTER_MS,
  PRUNE_BATCH_SIZE,
  getPruneCutoff,
  isPrunable,
  pruneFinishedReminders,
} from '../../functions/src/notifications/pruneReminders.ts';

import {
  DEAD_TOKEN_CODES,
  getDeadTokens,
  sendPushToUsers,
} from '../../functions/src/notifications/sendPush.ts';

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
FINISHED_STATUSES.forEach((status) => {
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
});
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

// Which device tokens are dropped
assert.deepEqual(
  DEAD_TOKEN_CODES,
  [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ],
  'a token is dropped for the two codes that mean it will never work again',
);
const devices = [
  { uid: 'alex', token: 'a1' },
  { uid: 'alex', token: 'a2' },
  { uid: 'jamie', token: 'j1' },
  { uid: 'jamie', token: 'j2' },
  { uid: 'jamie', token: 'j3' },
];
const failure = (code: string) => ({
  success: false,
  error: { code } as never,
});
const ok = { success: true } as const;
assert.deepEqual(
  getDeadTokens(devices, [
    ok,
    failure('messaging/registration-token-not-registered'),
    failure('messaging/invalid-registration-token'),
    failure('messaging/internal-error'),
    failure('messaging/server-unavailable'),
  ]),
  [devices[1], devices[2]],
  'only the tokens FCM reports as gone are dropped, each with the person it belongs to',
);
assert.deepEqual(
  getDeadTokens(devices, [ok, ok, ok, ok, ok]),
  [],
  'a push that reached every device drops none',
);
assert.deepEqual(
  getDeadTokens(devices, [
    failure('messaging/third-party-auth-error'),
    failure('messaging/quota-exceeded'),
    failure('messaging/invalid-argument'),
    { success: false },
    ok,
  ]),
  [],
  'a busy or misconfigured service never costs anyone a working device',
);
assert.deepEqual(
  getDeadTokens(devices, [
    failure('messaging/registration-token-not-registered'),
  ]),
  [devices[0]],
  'fewer answers than tokens never reads past them',
);

// What a send does with them
const pushed = async (
  tokensByUid: Record<string, string[] | undefined>,
  codes: (string | null)[],
) => {
  const updates: { path: string; data: Record<string, unknown> }[] = [];
  const batches: string[][] = [];
  const firestore = {
    doc: (path: string) => ({
      get: async () => ({
        data: () => {
          const tokens = tokensByUid[path.split('/')[1]];
          return tokens === undefined ? undefined : { fcmTokens: tokens };
        },
      }),
      update: async (data: Record<string, unknown>) => {
        updates.push({ path, data });
      },
    }),
  };
  const messaging = {
    sendEachForMulticast: async (message: { tokens: string[] }) => {
      batches.push(message.tokens);
      return {
        responses: codes.map((code) =>
          code === null ? { success: true } : failure(code),
        ),
      };
    },
  };
  const count = await sendPushToUsers(
    firestore as never,
    messaging as never,
    Object.keys(tokensByUid),
    { title: 't', body: 'b', url: 'https://apps.moondreams.dev/pinch', usefulForMs: 60_000 },
  );
  return { count, sent: batches.at(-1) ?? [], updates };
};
const gone = 'messaging/registration-token-not-registered';
const run = await pushed({ alex: ['a1', 'a2'], jamie: ['j1'] }, [
  null,
  gone,
  gone,
]);
assert.equal(run.count, 3, 'it still reports the devices it addressed');
assert.deepEqual(
  run.sent,
  ['a1', 'a2', 'j1'],
  'every token of every person is addressed',
);
assert.deepEqual(
  run.updates.map((update) => update.path),
  ['users/alex', 'users/jamie'],
  'each person with a dead token is cleaned up, and only they',
);
sameShape(
  run.updates[0].data.fcmTokens,
  FieldValue.arrayRemove('a2'),
  'the dead token is removed with arrayRemove, never by rewriting the list',
);
sameShape(run.updates[1].data.fcmTokens, FieldValue.arrayRemove('j1'));
assert.throws(
  () => sameShape(run.updates[0].data.fcmTokens, FieldValue.arrayRemove('a1')),
  'a removal of another token does not match, so the comparison is not vacuous',
);
const two = await pushed({ alex: ['a1', 'a2', 'a3'] }, [gone, null, gone]);
sameShape(
  two.updates[0].data.fcmTokens,
  FieldValue.arrayRemove('a1', 'a3'),
  'two dead tokens of one person go in one removal',
);
assert.equal(two.updates.length, 1);
const clean = await pushed({ alex: ['a1'] }, [null]);
assert.deepEqual(
  clean.updates,
  [],
  'a push that reached everyone writes nothing',
);
const nobody = await pushed({ alex: undefined }, []);
assert.equal(nobody.count, 0, 'a person with no devices sends nothing');
assert.deepEqual(nobody.sent, []);

console.log('pushHousekeeping: all checks passed');
