import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { toPushTtlSeconds } from '../../functions/src/notifications/sendPush.ts';
import { getReminderExpiresAt } from '../../functions/src/notifications/sendScheduledReminders.ts';
import {
  DEFAULT_REMINDER_USEFUL_FOR_MS,
  isReminderStillUseful,
} from '../../src/lib/notifications/reminderExpiry.ts';

const MINUTE = 60_000;

// A reminder is useful up to and including its last moment, never after.
const reminder = { scheduledFor: 1_000_000, usefulForMs: 20 * MINUTE };
assert.equal(
  isReminderStillUseful(reminder, 1_000_000 - MINUTE),
  true,
  'before its time',
);
assert.equal(
  isReminderStillUseful(reminder, 1_000_000 + 20 * MINUTE),
  true,
  'at the end of its window',
);
assert.equal(
  isReminderStillUseful(reminder, 1_000_000 + 20 * MINUTE + 1),
  false,
  'one millisecond past it',
);
assert.equal(
  isReminderStillUseful(
    { scheduledFor: 1_000_000, usefulForMs: null },
    1_000_000 + 30 * MINUTE,
  ),
  true,
  'legacy: 30 minutes',
);
assert.equal(
  isReminderStillUseful(
    { scheduledFor: 1_000_000, usefulForMs: null },
    1_000_000 + 30 * MINUTE + 1,
  ),
  false,
  'legacy: past 30 minutes',
);

// The server's fallback is the client's.
assert.equal(
  DEFAULT_REMINDER_USEFUL_FOR_MS,
  30 * MINUTE,
  'the client default is 30 minutes',
);
assert.equal(
  getReminderExpiresAt({ scheduledFor: 5 }),
  5 + DEFAULT_REMINDER_USEFUL_FOR_MS,
  'functions/src/notifications/sendScheduledReminders.ts DEFAULT_USEFUL_FOR_MS must equal src/lib/notifications/reminderExpiry.ts DEFAULT_REMINDER_USEFUL_FOR_MS',
);
assert.equal(
  getReminderExpiresAt({ scheduledFor: 5, usefulForMs: 7 }),
  12,
  'an own window wins',
);
assert.equal(
  getReminderExpiresAt({ scheduledFor: 5, usefulForMs: 'x' }),
  5 + DEFAULT_REMINDER_USEFUL_FOR_MS,
  'a malformed window falls back',
);

// FCM's TTL is whole seconds, rounded up, never zero.
assert.equal(toPushTtlSeconds(3 * 60 * 60 * 1000), 10_800);
assert.equal(toPushTtlSeconds(1500), 2, 'rounded up');
assert.equal(toPushTtlSeconds(1), 1);
assert.equal(
  toPushTtlSeconds(0),
  1,
  'an expired window still sends for one second at most',
);
assert.equal(toPushTtlSeconds(-5000), 1, 'a negative window is clamped');
assert.equal(
  toPushTtlSeconds(90 * 24 * 60 * 60 * 1000),
  2_419_200,
  "a window past FCM's four weeks is clamped",
);

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return name === 'node_modules' || name === 'lib'
      ? []
      : statSync(path).isDirectory()
        ? listFiles(path)
        : [path];
  });

const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(path, 'utf8');
const rel = (path: string) => relative(root, path);
const sourceFiles = (dir: string, extensions: string[]) =>
  listFiles(join(root, dir)).filter((path) =>
    extensions.some((extension) => path.endsWith(extension)),
  );

/** The text from each call's opening paren to its matching close, found by counting brackets. */
const getCalls = (text: string, name: string): string[] =>
  text
    .split(`${name}(`)
    .slice(1)
    .map((rest) => {
      const end = [...rest].reduce(
        (state, character, index) => {
          if (state.end !== -1) {
            return state;
          }
          const depth =
            state.depth + (character === '(' ? 1 : character === ')' ? -1 : 0);
          return { depth, end: depth < 0 ? index : -1 };
        },
        { depth: 0, end: -1 },
      ).end;
      return rest.slice(0, end === -1 ? rest.length : end);
    });

const functionFiles = sourceFiles('functions/src', ['.ts']);
const clientFiles = sourceFiles('src', ['.ts', '.tsx']);

// Every push declares how long it stays useful.
functionFiles
  .filter((path) => !path.endsWith('sendPush.ts'))
  .forEach((path) =>
    getCalls(read(path), 'sendPushToUsers').forEach((call) => {
      assert.ok(
        call.includes('usefulForMs'),
        `${rel(path)}: a sendPushToUsers call has no usefulForMs. Add one named constant next to the sender saying how long the push still matters (FCM turns it into the push's TTL).`,
      );
      assert.ok(
        call.includes('urgency'),
        `${rel(path)}: a sendPushToUsers call has no urgency. Say 'high' only for what the person must see now (a reminder, a reply), else 'normal'.`,
      );
    }),
  );

// Every scheduled reminder declares it too.
clientFiles
  .filter((path) => !path.endsWith('scheduleReminder.ts'))
  .forEach((path) =>
    getCalls(read(path), 'scheduleReminder').forEach((call) =>
      assert.ok(
        call.includes('usefulForMs'),
        `${rel(path)}: a scheduleReminder call has no usefulForMs. Add how long after scheduledFor the reminder still matters, as a named constant.`,
      ),
    ),
  );

// Only these touch the reminders collection, so only these have to know about usefulForMs.
const allowedWriters = [
  'src/lib/notifications/scheduleReminder.ts',
  'src/store/listeners/remindersListener.ts',
  'src/apps/a-list/utils/reminders.ts',
  'functions/src/notifications/sendScheduledReminders.ts',
  'functions/src/notifications/pruneReminders.ts',
  'functions/src/apps/waypoint/rescheduleTripReminders.ts',
  'functions/src/apps/waypoint/deleteTrip.ts',
];
const touchesReminders =
  /collection\(\s*(?:db\s*,\s*)?['"`]reminders['"`]|\.doc\(\s*`reminders\/|\bdoc\(\s*db\s*,\s*['"`]reminders['"`]/;
[...functionFiles, ...clientFiles]
  .filter((path) => touchesReminders.test(read(path)))
  .forEach((path) =>
    assert.ok(
      allowedWriters.includes(rel(path)),
      `${rel(path)} reads or writes the reminders collection. Schedule through src/lib/notifications/scheduleReminder.ts (it requires usefulForMs); if this file truly must touch it, add it to allowedWriters in scripts/checks/notificationExpiry.ts and make it set usefulForMs.`,
    ),
  );

// The one server-side creator sets it.
assert.ok(
  read(
    join(root, 'functions/src/apps/waypoint/rescheduleTripReminders.ts'),
  ).includes('usefulForMs'),
  'functions/src/apps/waypoint/rescheduleTripReminders.ts creates reminders and must set usefulForMs.',
);

console.log('notification expiry checks passed');
