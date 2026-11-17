// Keeping the plan in one Google Calendar, both ways: the pure core against a fixed clock, no emulator: `npm run check:helm-calendar-sync`.
import assert from 'node:assert/strict';

import { zonedDateTimeToEpoch } from '../../functions/src/notifications/zonedTime.ts';
import {
  BUSY_TITLE,
  MAX_EVENTS,
  SKEW_MS,
  buildDesired,
  planWrites,
  readBack,
  toContentHash,
  toEventBody,
  toHabitRef,
  toMeetRef,
  toSlotRef,
  type DesiredEvent,
  type EventLink,
  type HabitInput,
  type RemoteEvent,
  type SlotInput,
  type TaskInput,
} from '../../functions/src/apps/helm/calendarSync/plan.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const ZONE = 'America/Los_Angeles';
const TODAY = '2026-11-17';
const NOW = zonedDateTimeToEpoch(TODAY, '09:00', ZONE);
const MINUTE = 60_000;
const at = (day: string, time: string) => zonedDateTimeToEpoch(day, time, ZONE);
const SUBKEY = Buffer.alloc(32, 7);
const hash = (event: DesiredEvent) => toContentHash(SUBKEY, event);
const CALENDAR = 'plan@group.calendar.google.com';

const task = (id: string, extra: Partial<TaskInput> = {}): TaskInput => ({
  id,
  title: `Task ${id}`,
  isPrivate: false,
  status: 'open',
  dueAt: null,
  durationMinutes: null,
  hasMeets: false,
  lastEditedAt: null,
  ...extra,
});

const slot = (
  slotId: string,
  taskId: string,
  extra: Partial<SlotInput> = {},
): SlotInput => ({
  dayKey: TODAY,
  slotId,
  taskId,
  startAt: at(TODAY, '14:00'),
  endAt: at(TODAY, '14:30'),
  status: 'kept',
  decidedAt: NOW - 60 * MINUTE,
  ...extra,
});

const habit = (id: string, extra: Partial<HabitInput> = {}): HabitInput => ({
  id,
  name: `Habit ${id}`,
  isPrivate: false,
  lastEditedAt: null,
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {
    w1: { start: '06:30', end: '07:00', order: 0 },
  },
  timesPerDay: null,
  startsOn: Date.parse('2026-01-01T00:00:00Z'),
  endsOn: null,
  ...extra,
});

const desire = (
  slots: SlotInput[],
  tasks: TaskInput[],
  habits: HabitInput[] = [],
  now = NOW,
) => buildDesired({ now, timeZone: ZONE, slots, tasks, habits });

const linkFor = (
  event: DesiredEvent,
  extra: Partial<EventLink> = {},
): EventLink => ({
  helmRef: event.ref,
  eventId: `ev-${event.ref}`,
  calendarId: CALENDAR,
  startAt: event.startAt,
  endAt: event.endAt,
  contentHash: hash(event),
  writtenAt: NOW - 30 * MINUTE,
  removedAt: null,
  ...extra,
});

const linksOf = (...links: EventLink[]) =>
  new Map(links.map((link) => [link.helmRef, link]));

const remoteOf = (entries: [string, RemoteEvent][]) => new Map(entries);

const readBackOf = (
  desired: DesiredEvent[],
  links: Map<string, EventLink>,
  remote: Map<string, RemoteEvent>,
  extra: { readThrough?: number | null; isReadBack?: boolean } = {},
) =>
  readBack({
    now: NOW,
    timeZone: ZONE,
    desired,
    links,
    remote,
    isReadBack: extra.isReadBack ?? true,
    readThrough: extra.readThrough === undefined ? NOW - 1 : extra.readThrough,
    hash,
  });

const writesOf = (
  desired: DesiredEvent[],
  links: Map<string, EventLink>,
  remote = new Map<string, RemoteEvent>(),
  calendarId: string | null = CALENDAR,
) =>
  planWrites({
    calendarId,
    now: NOW,
    timeZone: ZONE,
    desired,
    links,
    remote,
    hash,
  });

test('kept slots, habit windows and appointments make the desired set; suggested and set-aside slots do not', () => {
  const desired = desire(
    [
      slot('s1', 't1'),
      slot('s2', 't2', { status: 'suggested' }),
      slot('s3', 't3', { status: 'notToday' }),
      slot('s4', 't4', { startAt: null, endAt: null }),
      slot('s5', 'gone'),
    ],
    [
      task('t1'),
      task('t2'),
      task('t3'),
      task('t4'),
      task('m1', {
        hasMeets: true,
        dueAt: at(TODAY, '16:00'),
        durationMinutes: 45,
      }),
      task('m2', { hasMeets: true, dueAt: at(TODAY, '17:00'), status: 'done' }),
      task('m3', { hasMeets: true, dueAt: null }),
      task('m4', { dueAt: at(TODAY, '18:00') }),
    ],
    [habit('h1')],
  );
  const refs = desired.map((event) => event.ref);
  assert.ok(refs.includes(toSlotRef(TODAY, 's1')));
  assert.ok(
    !refs.includes(toSlotRef(TODAY, 's2')),
    'a suggested slot is not written',
  );
  assert.ok(!refs.includes(toSlotRef(TODAY, 's3')));
  assert.ok(!refs.includes(toSlotRef(TODAY, 's4')));
  assert.ok(
    !refs.includes(toSlotRef(TODAY, 's5')),
    'a slot whose task is gone is not written',
  );
  assert.deepEqual(
    refs.filter((ref) => ref.startsWith('meet:')),
    [toMeetRef('m1')],
    'only an open task with how it meets and a moment is an appointment',
  );
  const meet = desired.find((event) => event.ref === toMeetRef('m1'));
  assert.equal(meet?.endAt, at(TODAY, '16:45'));
  assert.equal(
    refs.filter((ref) => ref.startsWith('habit:h1:')).length,
    7,
    'an every-day habit has its window on each of the 7 days',
  );
  assert.ok(refs.includes(toHabitRef('h1', '2026-11-23', 'w1')));
  assert.ok(
    !refs.includes(toHabitRef('h1', '2026-11-24', 'w1')),
    'the window ends after day 7',
  );
  assert.equal(
    desired.find((event) => event.ref === toMeetRef('m1'))?.title,
    'Task m1',
  );
});

test('an appointment with a default length is an hour, and its kept slot is not written twice', () => {
  const desired = desire(
    [slot('s1', 'm1')],
    [task('m1', { hasMeets: true, dueAt: at(TODAY, '16:00') })],
  );
  assert.deepEqual(
    desired.map((event) => event.ref),
    [toMeetRef('m1')],
  );
  assert.equal(desired[0].endAt - desired[0].startAt, 60 * MINUTE);
});

test('habits: a paused, counted or not-due habit writes nothing', () => {
  const desired = desire(
    [],
    [],
    [
      habit('paused', { status: 'paused', pausedUntil: null }),
      habit('counted', { timesPerDay: 3 }),
      habit('weekdays', { cadence: { kind: 'onWeekdays', weekdays: [1] } }),
      habit('anyTime', { windowState: {} }),
    ],
  );
  assert.deepEqual(
    desired.map((event) => event.ref),
    [toHabitRef('weekdays', '2026-11-23', 'w1')],
    'Monday the 23rd is the one day in the window the weekday habit is due',
  );
});

test('a private thing is a bare Busy block; anything else carries its words, a link and the ref', () => {
  const [priv, plain] = desire(
    [
      slot('s1', 't1'),
      slot('s2', 't2', {
        startAt: at(TODAY, '15:00'),
        endAt: at(TODAY, '15:30'),
      }),
    ],
    [
      task('t1', { title: 'Pick up pills', isPrivate: true }),
      task('t2', { title: 'Write report' }),
    ],
  );
  const body = toEventBody(priv, 'Aria');
  assert.equal(body.summary, BUSY_TITLE);
  assert.equal(body.visibility, 'private');
  assert.ok(!('description' in body), 'a private event has no description');
  assert.ok(!JSON.stringify(body).includes('pills'));
  assert.equal(body.extendedProperties.private.helmRef, priv.ref);
  const open = toEventBody(plain, 'Aria');
  assert.equal(open.summary, 'Write report');
  assert.ok(
    String(open.description).includes('https://apps.moondreams.dev/helm'),
  );
  assert.ok(
    !/helm|nomos/i.test(String(open.description).replace(/https:\/\/\S+/, '')),
    'no product name in the words',
  );
  assert.equal(open.transparency, 'opaque');
  assert.deepEqual(open.reminders, { useDefault: false });
  assert.equal(open.start.dateTime, new Date(plain.startAt).toISOString());
  assert.notEqual(hash(priv), hash({ ...priv, isPrivate: false }));
  assert.equal(
    hash({ ...priv, title: 'A different private title' }),
    hash(priv),
    'a private title change shows nothing, so nothing is sent',
  );
});

test('the diff inserts, patches and deletes; a past event is never deleted', () => {
  const [a, b] = desire(
    [
      slot('s1', 't1'),
      slot('s2', 't2', {
        startAt: at(TODAY, '15:00'),
        endAt: at(TODAY, '15:30'),
      }),
    ],
    [task('t1'), task('t2')],
  );
  const fresh = writesOf([a, b], linksOf());
  assert.equal(fresh.inserts.length, 2);
  assert.equal(
    fresh.patches.length + fresh.deletes.length + fresh.drops.length,
    0,
  );

  const same = writesOf([a, b], linksOf(linkFor(a), linkFor(b)));
  assert.deepEqual(
    [
      same.inserts.length,
      same.patches.length,
      same.deletes.length,
      same.drops.length,
    ],
    [0, 0, 0, 0],
  );

  const retitled = { ...a, title: 'Renamed' };
  const patched = writesOf([retitled, b], linksOf(linkFor(a), linkFor(b)));
  assert.deepEqual(
    patched.patches.map((entry) => entry.event.ref),
    [a.ref],
  );

  const dropped = writesOf([a], linksOf(linkFor(a), linkFor(b)));
  assert.deepEqual(
    dropped.deletes.map((link) => link.helmRef),
    [b.ref],
  );

  const past = linkFor(b, {
    helmRef: toSlotRef('2026-11-16', 'old'),
    startAt: at('2026-11-16', '10:00'),
    endAt: at('2026-11-16', '10:30'),
  });
  const kept = writesOf([a], linksOf(linkFor(a), past));
  assert.equal(kept.deletes.length, 0, 'yesterday stays in the calendar');
  assert.deepEqual(
    kept.drops.map((link) => link.helmRef),
    [past.helmRef],
  );

  const earlierToday = linkFor(b, {
    helmRef: toSlotRef(TODAY, 'morning'),
    startAt: at(TODAY, '07:00'),
    endAt: at(TODAY, '07:30'),
  });
  assert.equal(
    writesOf([a], linksOf(linkFor(a), earlierToday)).deletes.length,
    1,
    'an event from earlier today is still upcoming by the start of the day',
  );
});

test('nothing is written before a calendar is chosen', () => {
  const desired = desire([slot('s1', 't1')], [task('t1')]);
  const plan = writesOf(desired, linksOf(), new Map(), null);
  assert.deepEqual(
    [plan.inserts, plan.patches, plan.deletes, plan.drops].map(
      (list) => list.length,
    ),
    [0, 0, 0, 0],
  );
});

test('at most 150 events are written, soonest first', () => {
  const tasks = Array.from({ length: 200 }, (_, index) =>
    task(`m${String(index).padStart(3, '0')}`, {
      hasMeets: true,
      dueAt: at(TODAY, '09:00') + index * 20 * MINUTE,
      durationMinutes: 10,
    }),
  );
  const desired = desire([], tasks);
  assert.equal(desired.length, MAX_EVENTS);
  assert.equal(desired[0].ref, toMeetRef('m000'));
  assert.equal(desired[MAX_EVENTS - 1].ref, toMeetRef('m149'));
});

test('read-back: a moved slot moves, with the line, and the move is not sent back', () => {
  const [event] = desire(
    [slot('s1', 't1', { decidedAt: NOW - 120 * MINUTE })],
    [task('t1', { title: 'Dentist' })],
  );
  const link = linkFor(event);
  const moved: RemoteEvent = {
    startAt: at(TODAY, '15:00'),
    endAt: at(TODAY, '15:30'),
    sourceUpdatedAt: link.writtenAt + SKEW_MS + 1,
  };
  const back = readBackOf(
    [event],
    linksOf(link),
    remoteOf([[event.ref, moved]]),
  );
  assert.deepEqual(back.changes, [
    {
      kind: 'slotMoved',
      dayKey: TODAY,
      slotId: 's1',
      startAt: moved.startAt,
      endAt: moved.endAt,
      line: 'Moved Dentist to 3:00 PM, from your calendar',
      isPrivate: false,
    },
  ]);
  const next = back.links.get(event.ref);
  assert.equal(next?.startAt, moved.startAt);
  const after = {
    ...event,
    startAt: moved.startAt as number,
    endAt: moved.endAt as number,
  };
  assert.equal(next?.contentHash, hash(after));
  const writes = writesOf(
    [after],
    linksOf(next as EventLink),
    remoteOf([[event.ref, moved]]),
  );
  assert.equal(
    writes.patches.length + writes.inserts.length + writes.deletes.length,
    0,
  );
});

test('read-back: a slot deleted in the calendar is set aside, only once the calendar was read since the write', () => {
  const [event] = desire(
    [slot('s1', 't1', { decidedAt: null })],
    [task('t1', { title: 'Write report' })],
  );
  const link = linkFor(event);
  const gone = readBackOf([event], linksOf(link), new Map());
  assert.deepEqual(gone.changes, [
    {
      kind: 'slotRemoved',
      dayKey: TODAY,
      slotId: 's1',
      line: "Removed Write report from today's plan, from your calendar",
      isPrivate: false,
    },
  ]);
  assert.equal(gone.links.get(event.ref), null, 'the link is dropped');
  const notRead = readBackOf([event], linksOf(link), new Map(), {
    readThrough: link.writtenAt,
  });
  assert.equal(
    notRead.changes.length,
    0,
    'an event not yet read back is not a deleted one',
  );
  assert.equal(
    readBackOf([event], linksOf(link), new Map(), { readThrough: null }).changes
      .length,
    0,
  );
  assert.equal(
    readBackOf([event], linksOf(link), new Map(), { isReadBack: false }).changes
      .length,
    0,
  );
});

test('read-back: a deleted appointment only gets a line, and is not made again', () => {
  const [event] = desire(
    [],
    [
      task('m1', {
        title: 'Dentist',
        hasMeets: true,
        dueAt: at(TODAY, '16:00'),
      }),
    ],
  );
  const link = linkFor(event);
  const back = readBackOf([event], linksOf(link), new Map());
  assert.deepEqual(back.changes, [
    {
      kind: 'noted',
      line: "Dentist was removed from your calendar; it's still in your tasks",
      isPrivate: false,
    },
  ]);
  const marked = back.links.get(event.ref) as EventLink;
  assert.equal(marked.removedAt, NOW);
  const plan = writesOf([event], linksOf(marked));
  assert.equal(plan.inserts.length + plan.patches.length, 0);
  assert.equal(
    readBackOf([event], linksOf(marked), new Map()).changes.length,
    0,
    'said once',
  );
  const later = writesOf([], linksOf(marked));
  assert.deepEqual(
    [later.deletes.length, later.drops.length],
    [0, 1],
    'forgotten once the plan no longer holds it',
  );
});

test('read-back: a moved appointment moves the task', () => {
  const [event] = desire(
    [],
    [
      task('m1', {
        title: 'Dentist',
        hasMeets: true,
        dueAt: at(TODAY, '16:00'),
        durationMinutes: 30,
      }),
    ],
  );
  const link = linkFor(event);
  const back = readBackOf(
    [event],
    linksOf(link),
    remoteOf([
      [
        event.ref,
        {
          startAt: at(TODAY, '17:00'),
          endAt: at(TODAY, '17:45'),
          sourceUpdatedAt: link.writtenAt + SKEW_MS + 1,
        },
      ],
    ]),
  );
  assert.deepEqual(back.changes, [
    {
      kind: 'meetMoved',
      taskId: 'm1',
      startAt: at(TODAY, '17:00'),
      endAt: at(TODAY, '17:45'),
      line: 'Moved Dentist to 5:00 PM, from your calendar',
      isPrivate: false,
    },
  ]);
});

test('read-back: a moved habit window is never applied and never fought', () => {
  const [event] = desire([], [], [habit('h1', { name: 'Walk' })]);
  const link = linkFor(event);
  const moved: RemoteEvent = {
    startAt: at(TODAY, '07:00'),
    endAt: at(TODAY, '07:30'),
    sourceUpdatedAt: link.writtenAt + SKEW_MS + 1,
  };
  const back = readBackOf(
    [event],
    linksOf(link),
    remoteOf([[event.ref, moved]]),
  );
  assert.deepEqual(back.changes, [
    {
      kind: 'noted',
      line: 'You moved Walk to 7:00 AM in your calendar; it stays at 6:30 AM here.',
      isPrivate: false,
    },
  ]);
  const next = back.links.get(event.ref) as EventLink;
  const plan = writesOf([event], linksOf(next), remoteOf([[event.ref, moved]]));
  assert.equal(
    plan.patches.length + plan.inserts.length + plan.deletes.length,
    0,
    "that day's event is left where the person put it",
  );
  assert.equal(
    readBackOf([event], linksOf(next), remoteOf([[event.ref, moved]])).changes
      .length,
    0,
    'said once',
  );
});

test('newer wins both ways', () => {
  const [event] = desire(
    [slot('s1', 't1', { decidedAt: NOW - 10 * MINUTE })],
    [task('t1', { title: 'Dentist' })],
  );
  const link = linkFor(event, { writtenAt: NOW - 60 * MINUTE });
  const editedLater = (minutesAgo: number): RemoteEvent => ({
    startAt: at(TODAY, '15:00'),
    endAt: at(TODAY, '15:30'),
    sourceUpdatedAt: NOW - minutesAgo * MINUTE,
  });

  const calendarNewer = readBackOf(
    [event],
    linksOf(link),
    remoteOf([[event.ref, editedLater(5)]]),
  );
  assert.equal(
    calendarNewer.changes.length,
    1,
    'the calendar edit is newer than the slot decision',
  );

  const planNewer = readBackOf(
    [event],
    linksOf(link),
    remoteOf([[event.ref, editedLater(30)]]),
  );
  assert.equal(
    planNewer.changes.length,
    0,
    'the slot was decided after the calendar edit',
  );
  const retimed = {
    ...event,
    startAt: at(TODAY, '13:00'),
    endAt: at(TODAY, '13:30'),
  };
  const sent = writesOf(
    [retimed],
    linksOf(link),
    remoteOf([[event.ref, editedLater(30)]]),
  );
  assert.equal(sent.patches.length, 1, 'so the plan side goes to the calendar');

  const kept = writesOf(
    [{ ...event, title: 'Renamed', changedAt: NOW - 90 * MINUTE }],
    linksOf(link),
    remoteOf([[event.ref, editedLater(30)]]),
  );
  assert.equal(
    kept.patches.length,
    0,
    "the person's newer calendar edit is not overwritten",
  );

  const ours = remoteOf([
    [
      event.ref,
      { ...editedLater(0), sourceUpdatedAt: link.writtenAt + SKEW_MS },
    ],
  ]);
  assert.equal(
    readBackOf([event], linksOf(link), ours).changes.length,
    0,
    "an update stamped at our own write is not the person's",
  );
});

test('an event the plan writes carries its ref in private extended properties', () => {
  const [event] = desire([slot('s1', 't1')], [task('t1')]);
  const body = toEventBody(event, 'Aria');
  assert.equal(body.extendedProperties.private.helmRef, event.ref);
  assert.match(event.ref, /^slot:\d{4}-\d{2}-\d{2}:s1$/);
});

const failures = tests.flatMap(([name, run]) => {
  try {
    run();
    console.log(`ok   ${name}`);
    return [];
  } catch (error) {
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
    return [name];
  }
});
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
