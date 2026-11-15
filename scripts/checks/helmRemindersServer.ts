// Both habit-reminder run bodies against the Firestore emulator with a fixed clock and fake messaging: `npm run check:helm-reminders-server`.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-helm-reminders';
const PROJECT = process.env.GCLOUD_PROJECT;
if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const firestore = getFirestore();

const { zonedDateTimeToEpoch } =
  await import('../../functions/src/notifications/zonedTime.ts');
const { runHelmReminderPlanning, planPerson } =
  await import('../../functions/src/apps/helm/reminders/planHelmReminders.ts');
const { REMINDER_SEND_HOOKS, runScheduledReminders } =
  await import('../../functions/src/notifications/sendScheduledReminders.ts');
const { deleteReminderQueue } =
  await import('../../functions/src/apps/helm/reminders/reminderQueue.ts');
const { readHabit } =
  await import('../../functions/src/apps/helm/reminders/readRecords.ts');
const { HABIT_REMINDER_WORDS } =
  await import('../../functions/src/apps/helm/nomos/habitReminders.ts');
const { judgeHabitWeek } =
  await import('../../functions/src/apps/helm/nomos/habitLife.ts');
const { readDay } =
  await import('../../functions/src/apps/helm/reminders/readRecords.ts');
const { shiftDayKeyBy } =
  await import('../../functions/src/vendor/cadenceUtils.ts');

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, run: () => Promise<void>) =>
  tests.push([name, run]);

const ZONE = 'America/Los_Angeles';
const DAY = '2026-06-10';
const at = (day: string, time: string) => zonedDateTimeToEpoch(day, time, ZONE);
const MINUTE = 60_000;
const U1 = 'user-one';
const U2 = 'user-two';
const userPath = (uid: string) => `apps/helm/users/${uid}`;

const clean = async () => {
  await Promise.all(
    ['reminders', 'apps', 'users'].map((name) =>
      firestore.recursiveDelete(firestore.collection(name)),
    ),
  );
};

const profile = (extra: Record<string, unknown> = {}) => ({
  timeZone: ZONE,
  dayStartTime: '07:00',
  dayEndTime: '22:00',
  quietHours: null,
  remindersPausedAt: null,
  habitRemindersChangedAt: null,
  habitRemindersIdleAt: null,
  assistantName: 'Ada',
  zoneSpans: [],
  createdAt: 0,
  ...extra,
});

const window = (start: string, end: string, part: string) => ({
  start,
  end,
  order: 0,
  part,
  editedAt: null,
});

const habit = (extra: Record<string, unknown> = {}) => ({
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: { m: window('07:00', '10:00', 'morning') },
  timesPerDay: null,
  projectId: null,
  forWhoId: null,
  isCare: false,
  startsOn: Date.UTC(2026, 0, 1),
  endsOn: null,
  pausedUntil: null,
  pausedAt: null,
  reminder: {
    isOn: true,
    pace: 'adaptive',
    anyTimeAt: null,
    allowQuietHours: false,
    turnedOnAt: 0,
    easedAt: null,
  },
  lockScreenName: null,
  stage: 'building',
  stageAt: 0,
  stageWeek: '2026-06-01',
  rejudgeFrom: null,
  untoldSince: null,
  formedAt: null,
  history: [],
  createdAt: 0,
  sealed: { value: 'x' },
  ...extra,
});

const put = (path: string, data: Record<string, unknown>) =>
  firestore.doc(path).set(data);

const seedBusy = (uid: string, until = DAY) =>
  Promise.all(
    Array.from({ length: 5 }, (_, back) => shiftDayKeyBy(until, -back)).map(
      (key) =>
        put(`${userPath(uid)}/habitDays/${key}`, {
          date: Date.parse(`${key}T00:00:00Z`),
          isInUse: true,
          entries: {},
        }),
    ),
  );

const seedPerson = async (
  uid: string,
  habits: Record<string, Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) => {
  await put(userPath(uid), profile(extra));
  await seedBusy(uid);
  await Promise.all(
    Object.entries(habits).map(([id, data]) =>
      put(`${userPath(uid)}/habits/${id}`, habit(data)),
    ),
  );
  await put(`users/${uid}`, { fcmTokens: ['token-one'] });
};

const tick = (
  uid: string,
  habitId: string,
  windowId: string,
  time: string,
  day = DAY,
) =>
  firestore.doc(`${userPath(uid)}/habitDays/${day}`).set(
    {
      date: Date.parse(`${day}T00:00:00Z`),
      isInUse: true,
      entries: {
        [habitId]: {
          checks: {
            [windowId]: {
              status: 'done',
              at: at(day, time),
              by: 'person',
              executionId: null,
            },
          },
        },
      },
    },
    { merge: true },
  );

interface StoredReminder {
  id: string;
  appId: string;
  targetUids: string[];
  createdBy: string;
  title: string;
  body: string;
  scheduledFor: number;
  status: string;
  link: string;
  subjectRefs: string[] | null;
}

const reminders = async () =>
  (await firestore.collection('reminders').get()).docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as StoredReminder)
    .sort((first, second) => first.scheduledFor - second.scheduledFor);

const read = async (path: string) =>
  (await firestore.doc(path).get()).data() as DocumentData;

const fakeMessaging = () => {
  const calls: { title: string; body: string; tokens: string[] }[] = [];
  const messaging = {
    sendEachForMulticast: async (message: {
      tokens: string[];
      notification: { title: string; body: string };
    }) => {
      calls.push({ ...message.notification, tokens: message.tokens });
      return { responses: message.tokens.map(() => ({ success: true })) };
    },
  } as unknown as Messaging;
  return { calls, messaging };
};

const send = async (now: number) => {
  const fake = fakeMessaging();
  await runScheduledReminders(firestore, fake.messaging, now);
  return fake.calls;
};

test('a day is planned at the rollover from the queue, in fixed words, and not again', async () => {
  await seedPerson(U1, { h1: {} });
  await put('apps/helm/reminderQueue/' + U1, {
    lookAt: at(DAY, '03:00'),
    plannedAt: 0,
    plannedFor: null,
    leaseUntil: null,
    dayKey: '',
    stageWeek: null,
    slots: {},
  });
  const first = await runHelmReminderPlanning(
    firestore,
    at(DAY, '03:00') - MINUTE,
  );
  assert.equal(first.created, 1);
  const [one, ...rest] = await reminders();
  assert.equal(rest.length, 0);
  assert.equal(one.appId, 'helm');
  assert.deepEqual(one.targetUids, [U1]);
  assert.equal(one.createdBy, U1);
  assert.equal(one.title, 'Ada');
  assert.equal(one.body, 'Time for your morning habit');
  assert.equal(one.scheduledFor, at(DAY, '07:00'));
  assert.deepEqual(one.subjectRefs, ['h1/m']);
  assert.equal(one.link, '/helm?view=today');
  assert.equal(one.status, 'pending');
  const queue = await read('apps/helm/reminderQueue/' + U1);
  assert.equal(queue.dayKey, DAY);
  assert.equal(queue.leaseUntil, null);
  assert.equal(queue.plannedFor, null);
  assert.equal(queue.lookAt, at('2026-06-11', '03:00'));
  assert.deepEqual(Object.keys(queue.slots), [`${DAY}_0700`]);
  assert.equal(queue.slots[`${DAY}_0700`].reminderId, one.id);
  const second = await runHelmReminderPlanning(firestore, at(DAY, '03:05'));
  assert.equal(second.people, 0);
  assert.equal((await reminders()).length, 1);
});

test('a tick before the second cancels the reminder; without one it goes and is recorded', async () => {
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await tick(U1, 'h1', 'm', '06:50');
  const calls = await send(at(DAY, '07:00'));
  assert.equal(calls.length, 0);
  const [one] = await reminders();
  assert.equal(one.status, 'cancelled');

  await clean();
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const sent = await send(at(DAY, '07:00'));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].tokens, ['token-one']);
  assert.equal(sent[0].title, 'Ada');
  assert.equal(sent[0].body, 'Time for your morning habit');
  assert.equal((await reminders())[0].status, 'sent');
  const day = await read(`${userPath(U1)}/habitDays/${DAY}`);
  assert.ok(Math.abs(day.entries.h1.reminded.m - at(DAY, '07:00')) < 60_000);
  assert.equal(day.isInUse, true);
});

test('a reminder that was ticked in a day with no document yet records `reminded` on a new day', async () => {
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await firestore.doc(`${userPath(U1)}/habitDays/${DAY}`).delete();
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await send(at(DAY, '07:00'));
  const day = await read(`${userPath(U1)}/habitDays/${DAY}`);
  assert.equal(day.isInUse, false);
  assert.equal(day.date, Date.parse(`${DAY}T00:00:00Z`));
  assert.ok(typeof day.entries.h1.reminded.m === 'number');
});

test('a bundled reminder is reworded when one habit was done, the stored words stay', async () => {
  await seedPerson(
    U1,
    { h1: {}, h2: { windowState: { m: window('07:10', '10:00', 'morning') } } },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const [one] = await reminders();
  assert.deepEqual(one.subjectRefs, ['h1/m', 'h2/m']);
  assert.equal(one.body, 'Your morning habits are up');
  await tick(U1, 'h2', 'm', '06:55');
  const calls = await send(at(DAY, '07:00'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body, 'Time for your morning habit');
  assert.equal((await reminders())[0].body, 'Your morning habits are up');
  const day = await read(`${userPath(U1)}/habitDays/${DAY}`);
  assert.ok(typeof day.entries.h1.reminded.m === 'number');
  assert.equal(day.entries.h2.reminded, undefined);
});

test('a habit that was paused, ended or turned off since planning is dropped from the push', async () => {
  await seedPerson(
    U1,
    { h1: {}, h2: { windowState: { m: window('07:10', '10:00', 'morning') } } },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await firestore
    .doc(`${userPath(U1)}/habits/h2`)
    .update({ 'reminder.isOn': false });
  const calls = await send(at(DAY, '07:00'));
  assert.equal(calls[0].body, 'Time for your morning habit');

  await clean();
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await firestore
    .doc(userPath(U1))
    .update({ remindersPausedAt: at(DAY, '06:00') });
  assert.equal((await send(at(DAY, '07:00'))).length, 0);
  assert.equal((await reminders())[0].status, 'cancelled');
});

test('a window moved since planning no longer holds the fire time', async () => {
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await firestore.doc(`${userPath(U1)}/habits/h1`).update({
    windowState: {
      m: { ...window('08:00', '10:00', 'morning'), editedAt: at(DAY, '06:00') },
    },
  });
  assert.equal((await send(at(DAY, '07:00'))).length, 0);
  assert.equal((await reminders())[0].status, 'cancelled');
});

test('a lock screen name reaches only the push, never a stored document', async () => {
  await seedPerson(
    U1,
    {
      h1: { lockScreenName: 'Pills' },
      h2: { windowState: { m: window('07:10', '10:00', 'morning') } },
    },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const stored = JSON.stringify([
    await reminders(),
    await read('apps/helm/reminderQueue/' + U1),
  ]);
  assert.ok(!stored.includes('Pills'));
  const calls = await send(at(DAY, '07:00'));
  assert.equal(calls[0].body, 'Pills and 1 more morning habit');
  assert.ok(!JSON.stringify(await reminders()).includes('Pills'));
  assert.ok(
    !JSON.stringify(await read(`${userPath(U1)}/habitDays/${DAY}`)).includes(
      'Pills',
    ),
  );
});

test('a lock screen name alone says just that name once the others are done', async () => {
  await seedPerson(
    U1,
    {
      h1: { lockScreenName: 'Pills' },
      h2: { windowState: { m: window('07:10', '10:00', 'morning') } },
    },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await tick(U1, 'h2', 'm', '06:55');
  assert.equal((await send(at(DAY, '07:00')))[0].body, 'Pills');
});

test('a stage is judged once by the server, then skipped by the device judge', async () => {
  const weekDays = Array.from({ length: 37 }, (_, at2) =>
    shiftDayKeyBy('2026-05-04', at2),
  );
  await put(
    userPath(U1),
    profile({ habitRemindersChangedAt: at(DAY, '03:00') }),
  );
  await put(
    `${userPath(U1)}/habits/h1`,
    habit({
      startsOn: Date.UTC(2026, 4, 4),
      stageWeek: null,
      createdAt: at('2026-05-04', '08:00'),
    }),
  );
  await Promise.all(
    weekDays.map((key) =>
      put(`${userPath(U1)}/habitDays/${key}`, {
        date: Date.parse(`${key}T00:00:00Z`),
        isInUse: true,
        entries: {
          h1: {
            checks: {
              m: {
                status: 'done',
                at: at(key, '12:00'),
                by: 'person',
                executionId: null,
              },
            },
          },
        },
      }),
    ),
  );
  const planAt = at(DAY, '03:01');
  await runHelmReminderPlanning(firestore, planAt);
  const stored = await read(`${userPath(U1)}/habits/h1`);
  assert.equal(stored.stage, 'holding');
  assert.equal(stored.stageWeek, '2026-06-01');
  assert.equal(stored.untoldSince, planAt);
  assert.equal(stored.rejudgeFrom, null);
  assert.deepEqual(
    stored.history.map((event: { kind: string; stage: string; by: string }) => [
      event.kind,
      event.stage,
      event.by,
    ]),
    [['stage', 'holding', 'nomos']],
  );
  const days = Object.fromEntries(
    (await firestore.collection(`${userPath(U1)}/habitDays`).get()).docs.map(
      (doc) => [doc.id, readDay(doc.data())],
    ),
  );
  assert.equal(
    judgeHabitWeek(readHabit('h1', stored, ZONE), days, '2026-06-01', ZONE),
    null,
  );
  assert.equal((await reminders())[0].scheduledFor, at(DAY, '09:30'));
  await firestore
    .doc(userPath(U1))
    .update({ habitRemindersChangedAt: at(DAY, '03:03') });
  await runHelmReminderPlanning(firestore, at(DAY, '03:05'));
  const again = await read(`${userPath(U1)}/habits/h1`);
  assert.equal(again.history.length, 1);
  assert.equal(again.untoldSince, planAt);
});

test('a late check-in re-judges the stage once and clears its mark', async () => {
  const keys = Array.from({ length: 28 }, (_, at2) =>
    shiftDayKeyBy('2026-05-04', at2),
  );
  await put(
    userPath(U1),
    profile({ habitRemindersChangedAt: at(DAY, '03:00') }),
  );
  await put(
    `${userPath(U1)}/habits/h1`,
    habit({
      startsOn: Date.UTC(2026, 4, 4),
      stageWeek: '2026-06-01',
      rejudgeFrom: '2026-05-25',
      createdAt: at('2026-05-04', '08:00'),
    }),
  );
  await Promise.all(
    [
      ...keys,
      ...Array.from({ length: 7 }, (_, at2) =>
        shiftDayKeyBy('2026-06-01', at2),
      ),
    ].map((key) =>
      put(`${userPath(U1)}/habitDays/${key}`, {
        date: Date.parse(`${key}T00:00:00Z`),
        isInUse: true,
        entries: {
          h1: {
            checks: {
              m: {
                status: 'done',
                at: at(key, '12:00'),
                by: 'person',
                executionId: null,
              },
            },
          },
        },
      }),
    ),
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const stored = await read(`${userPath(U1)}/habits/h1`);
  assert.equal(stored.stage, 'holding');
  assert.equal(stored.rejudgeFrom, null);
  assert.equal(stored.stageWeek, '2026-06-01');
  assert.equal(stored.history.length, 1);
});

test('a pause that has come to its end is ended, for a habit and for a goal and its habits', async () => {
  const ends = Date.UTC(2026, 5, 10);
  const pausedAt = at('2026-06-03', '12:00');
  const paused = {
    kind: 'paused',
    at: pausedAt,
    by: 'person',
    pace: null,
    stage: null,
  };
  await seedPerson(
    U1,
    {
      h1: { status: 'paused', pausedAt, pausedUntil: ends, history: [paused] },
      h2: {
        status: 'paused',
        pausedAt: pausedAt + 1,
        pausedUntil: null,
        projectId: 'g1',
        history: [paused],
      },
      h3: {
        status: 'paused',
        pausedAt: pausedAt + 7,
        pausedUntil: null,
        projectId: 'g1',
        history: [paused],
      },
    },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await put(`${userPath(U1)}/projects/g1`, {
    kind: 'goal',
    status: 'paused',
    pausedAt: pausedAt + 1,
    pausedUntil: ends,
    sealed: { value: 'x' },
  });
  const planAt = at(DAY, '03:01');
  await runHelmReminderPlanning(firestore, planAt);
  const one = await read(`${userPath(U1)}/habits/h1`);
  assert.equal(one.status, 'active');
  assert.equal(one.pausedAt, null);
  assert.equal(one.pausedUntil, null);
  assert.equal(one.untoldSince, planAt);
  assert.deepEqual(
    one.history.map((event: { kind: string }) => event.kind),
    ['paused', 'resumed'],
  );
  assert.equal(one.history[1].by, 'nomos');
  assert.equal((await read(`${userPath(U1)}/habits/h2`)).status, 'active');
  assert.equal((await read(`${userPath(U1)}/habits/h3`)).status, 'paused');
  const goal = await read(`${userPath(U1)}/projects/g1`);
  assert.equal(goal.status, 'active');
  assert.equal(goal.pausedUntil, null);
  assert.deepEqual((await reminders())[0].subjectRefs, ['h1/m', 'h2/m']);
});

test('a person with only a pause that ends is looked at on that day, not before', async () => {
  const pausedAt = at('2026-06-03', '12:00');
  await seedPerson(
    U1,
    {
      h1: {
        status: 'paused',
        pausedAt,
        pausedUntil: Date.UTC(2026, 5, 12),
        reminder: null,
      },
    },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  assert.equal(
    (await read('apps/helm/reminderQueue/' + U1)).lookAt,
    at('2026-06-12', '03:00'),
  );
  assert.equal((await reminders()).length, 0);
});

test('a stamp synced hours late is still planned, and a person whose plan failed is looked at again later', async () => {
  const now = at(DAY, '12:00');
  await seedPerson(
    U1,
    { h1: { windowState: { m: window('18:00', '21:00', 'evening') } } },
    { habitRemindersChangedAt: now - 3 * 60 * MINUTE },
  );
  assert.equal((await runHelmReminderPlanning(firestore, now)).planned, 1);
  await firestore.doc('apps/helm/reminderQueue/' + U1).delete();
  await firestore.doc(userPath(U1)).update({ habitRemindersChangedAt: now });
  const broken = new Proxy(firestore, {
    get: (target, key) =>
      key === 'collection'
        ? (path: string) => {
            if (path.endsWith('/habits')) throw new Error('boom');
            return target.collection(path);
          }
        : Reflect.get(target, key).bind?.(target),
  });
  const report = await runHelmReminderPlanning(broken, now);
  assert.equal(report.failed, 1);
  const queue = await read('apps/helm/reminderQueue/' + U1);
  assert.equal(queue.lookAt, now + 15 * MINUTE);
  assert.equal(queue.leaseUntil, null);
});

test('a change stamp is answered once, a stamp far ahead is ignored, a held person is skipped', async () => {
  const now = at(DAY, '12:00');
  await seedPerson(
    U1,
    { h1: { windowState: { m: window('18:00', '21:00', 'evening') } } },
    {
      habitRemindersChangedAt: now - 2 * MINUTE,
    },
  );
  const first = await runHelmReminderPlanning(firestore, now);
  assert.equal(first.planned, 1);
  const queue = await read('apps/helm/reminderQueue/' + U1);
  assert.equal(queue.plannedFor, now - 2 * MINUTE);
  const second = await runHelmReminderPlanning(firestore, now + 5 * MINUTE);
  assert.equal(second.people, 0);
  assert.equal(second.skipped, 1);
  assert.equal(
    (await read('apps/helm/reminderQueue/' + U1)).plannedAt,
    queue.plannedAt,
  );
  await firestore
    .doc(userPath(U1))
    .update({ habitRemindersChangedAt: now + 3 * MINUTE });
  const third = await runHelmReminderPlanning(firestore, now + 6 * MINUTE);
  assert.equal(third.planned, 1);
  await firestore
    .doc(userPath(U1))
    .update({ habitRemindersChangedAt: now + 40 * MINUTE });
  assert.equal(
    (await runHelmReminderPlanning(firestore, now + 10 * MINUTE)).people,
    0,
  );

  await firestore
    .doc('apps/helm/reminderQueue/' + U1)
    .update({ leaseUntil: now + MINUTE });
  assert.equal(await planPerson(firestore, U1, now), null);
});

test('a changed reminder is cancelled in the queue and a new one made, and a sent one is left alone', async () => {
  const now = at(DAY, '03:00');
  await seedPerson(U1, { h1: {} }, { habitRemindersChangedAt: now - MINUTE });
  await runHelmReminderPlanning(firestore, now);
  const [old] = await reminders();
  await firestore.doc(`${userPath(U1)}/habits/h1`).update({
    windowState: { m: window('08:00', '10:00', 'morning') },
  });
  await firestore
    .doc(userPath(U1))
    .update({ habitRemindersChangedAt: now + MINUTE });
  await runHelmReminderPlanning(firestore, now + 2 * MINUTE);
  const all = await reminders();
  assert.equal(all.find((one) => one.id === old.id)?.status, 'cancelled');
  assert.equal(all.filter((one) => one.status === 'pending').length, 1);
  assert.equal(
    all.find((one) => one.status === 'pending')?.scheduledFor,
    at(DAY, '08:00'),
  );
  await firestore.doc(`reminders/${old.id}`).update({ status: 'sent' });
  assert.equal(await deleteReminderQueue(firestore, U1), 1);
  assert.equal(
    (await firestore.doc('apps/helm/reminderQueue/' + U1).get()).exists,
    false,
  );
  assert.equal(
    (await reminders()).filter((one) => one.status === 'pending').length,
    0,
  );
});

test('the idle rule writes one last reminder, marks the profile, keeps it through a re-plan, and sends its fixed words', async () => {
  await put(
    userPath(U1),
    profile({ habitRemindersChangedAt: at(DAY, '03:00') }),
  );
  await put(`${userPath(U1)}/habits/h1`, habit());
  await put(`users/${U1}`, { fcmTokens: ['token-one'] });
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const [last, ...none] = await reminders();
  assert.equal(none.length, 0);
  assert.equal(last.body, HABIT_REMINDER_WORDS.idle);
  assert.deepEqual(last.subjectRefs, []);
  assert.equal(
    (await read(userPath(U1))).habitRemindersIdleAt,
    at(DAY, '03:01'),
  );
  await firestore
    .doc(userPath(U1))
    .update({ habitRemindersChangedAt: at(DAY, '03:03') });
  await runHelmReminderPlanning(firestore, at(DAY, '03:05'));
  const kept = await reminders();
  assert.equal(kept.length, 1);
  assert.equal(kept[0].status, 'pending');
  const calls = await send(last.scheduledFor);
  assert.equal(calls[0].body, HABIT_REMINDER_WORDS.idle);
  await firestore.doc('users/' + U1).update({ fcmTokens: ['token-one'] });
});

test('the idle reminder is dropped when the person came back before it went', async () => {
  await put(
    userPath(U1),
    profile({ habitRemindersChangedAt: at(DAY, '03:00') }),
  );
  await put(`${userPath(U1)}/habits/h1`, habit());
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  await firestore.doc(userPath(U1)).update({ habitRemindersIdleAt: null });
  const [last] = await reminders();
  assert.equal((await send(last.scheduledFor)).length, 0);
  assert.equal((await reminders())[0].status, 'cancelled');
});

test('the sender: no hook, a null answer, a throwing hook and a forged reminder each behave', async () => {
  await put(`users/${U1}`, { fcmTokens: ['token-one'] });
  const base = {
    targetUids: [U1],
    createdBy: U1,
    title: 'Stored title',
    body: 'Stored body',
    scheduledFor: at(DAY, '07:00'),
    status: 'pending',
    channels: ['push'],
    relatedEntityPath: null,
    link: '/pinch',
    recurrence: 'none',
    inAppToast: null,
    lastSentAt: null,
    createdAt: 0,
  };
  await put('reminders/other-app', {
    ...base,
    id: 'other-app',
    appId: 'pinch',
  });
  await put('reminders/forged', {
    ...base,
    id: 'forged',
    appId: 'helm',
    subjectRefs: null,
  });
  await put('reminders/proto', { ...base, id: 'proto', appId: 'constructor' });
  const calls = await send(at(DAY, '07:00'));
  assert.deepEqual(
    calls.map((call) => call.body),
    ['Stored body', 'Stored body', 'Stored body'],
  );

  await clean();
  await put(`users/${U1}`, { fcmTokens: ['token-one'] });
  await put('reminders/boom', {
    ...base,
    id: 'boom',
    appId: 'helm',
    subjectRefs: ['a/b'],
  });
  const original = REMINDER_SEND_HOOKS.helm.prepare;
  REMINDER_SEND_HOOKS.helm.prepare = async () => {
    throw new Error('check');
  };
  const failed = await send(at(DAY, '07:00')).finally(() => {
    REMINDER_SEND_HOOKS.helm.prepare = original;
  });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].body, 'Stored body');
  assert.equal((await reminders())[0].status, 'sent');
});

test('the reminder queue is denied to every client; a target reads only its own reminder', async () => {
  await seedPerson(
    U1,
    { h1: {} },
    { habitRemindersChangedAt: at(DAY, '03:00') },
  );
  await runHelmReminderPlanning(firestore, at(DAY, '03:01'));
  const [one] = await reminders();
  const token = (uid: string) => {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'none', typ: 'JWT' })}.${part({ user_id: uid, sub: uid, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: 1, exp: 4102444800 })}.`;
  };
  const get = async (path: string, uid: string | null) =>
    (
      await fetch(
        `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
        { headers: uid ? { Authorization: `Bearer ${token(uid)}` } : {} },
      )
    ).status;
  const queue = 'apps/helm/reminderQueue/' + U1;
  assert.equal(
    await get(userPath(U1), U1),
    200,
    'the owner reads their profile',
  );
  assert.equal(await get(userPath(U1), U2), 403);
  assert.equal(await get(queue, U1), 403, 'the owner is denied the queue');
  assert.equal(await get(queue, U2), 403);
  assert.equal(await get(queue, null), 403);
  assert.equal(
    await get('apps/helm/reminderQueue', U1),
    403,
    'and cannot list it',
  );
  assert.equal(
    await get(`reminders/${one.id}`, U1),
    200,
    'the target reads its reminder',
  );
  assert.equal(await get(`reminders/${one.id}`, U2), 403);
  assert.equal(await get(`reminders/${one.id}`, null), 403);
});

const failures: string[] = [];
await clean();
await tests.reduce(async (previous, [name, run]) => {
  await previous;
  await clean();
  await run().then(
    () => console.log(`ok   ${name}`),
    (error) => {
      failures.push(name);
      console.log(
        `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
      );
    },
  );
}, Promise.resolve());
await clean();
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length === 0 ? 0 : 1);
