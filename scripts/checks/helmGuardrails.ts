// Pause or hold off: the bar (two kinds of reason, or one deadline), who may be named, the quiet first week, the switch, the signature and the back-off.
import assert from 'node:assert/strict';

import { shiftDayKeyBy } from '@/utils/cadenceUtils';

import {
  checkDaily,
  checkOnStart,
  meetsGuardrailBar,
  readNameable,
  readStarved,
  type FreeDay,
  type GuardrailInput,
  type GuardrailThing,
} from '../../src/apps/helm/engine/guardrails.ts';
import { isEvidenceAsStrong } from '../../src/apps/helm/engine/patterns.ts';

let failures = 0;
const test = (name: string, run: () => void | Promise<void>) =>
  Promise.resolve()
    .then(run)
    .catch((error) => {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    });

const DAY = 86_400_000;
const TODAY = '2026-11-16';
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`);
const NOW = ms(TODAY) + 12 * 3_600_000;
const ago = (days: number) => NOW - days * DAY;
const recent = [ago(1), ago(2), ago(3)];

const thing = (
  id: string,
  kind: GuardrailThing['kind'],
  rank: number | null,
  more: Partial<GuardrailThing> = {},
): GuardrailThing => ({
  id,
  kind,
  name: id,
  place:
    rank === null
      ? null
      : { rank, words: null, saidAt: 0, until: null, captureId: null },
  goalId: null,
  isCare: false,
  status: 'running',
  date: null,
  createdAt: ago(60),
  activity: recent,
  dates: [],
  isStepDue: null,
  ...more,
});

const QUIET: FreeDay = { minutes: 240, busyShare: 0.2, hasCalendar: true };
const FULL: FreeDay = { minutes: 30, busyShare: 0.9, hasCalendar: true };

const input = (
  things: GuardrailThing[],
  more: Partial<GuardrailInput> = {},
): GuardrailInput => ({
  now: NOW,
  todayKey: TODAY,
  isLearningOn: true,
  things,
  tasks: [],
  freeDay: () => QUIET,
  ...more,
});

const busyFrom = (first: number, count: number) => (key: string) =>
  key >= shiftDayKeyBy(TODAY, first) &&
  key < shiftDayKeyBy(TODAY, first + count)
    ? FULL
    : QUIET;

const goals = [
  thing('g1', 'goal', 4),
  thing('g2', 'goal', 3),
  thing('g3', 'goal', 2),
];
const fourth = thing('g4', 'goal', null, { createdAt: NOW, activity: [] });
const busy = { freeDay: busyFrom(0, 3) };

const wontFit = () => {
  const deadline = thing('p', 'project', 1, { dates: [ms(TODAY) + 3 * DAY] });
  const longTasks = ['a', 'b', 'c'].map((id) => ({
    id,
    title: id,
    projectId: 'p',
    dueDay: ms(TODAY) + 2 * DAY,
    minutes: 600 as number | null,
    isLatent: false,
  }));
  return { deadline, longTasks };
};

const run = async () => {
  await test('a fourth goal in a busy stretch gives a hold with two reasons', () => {
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.ok(found);
    assert.equal(found.moment, 'onStart');
    assert.equal(found.reasons.length, 2);
    assert.equal(found.lines.reasonLine?.split('\n').length, 2);
    assert.deepEqual(found.effect.kind, 'pause');
    assert.equal(found.subject.id, 'g4');
    assert.equal(found.subject.otherId, 'g4');
  });

  await test('one reason alone gives nothing', () => {
    assert.equal(
      checkOnStart({ id: 'g4', kind: 'goal' }, input([...goals, fourth])),
      null,
    );
    assert.equal(
      checkOnStart(
        { id: 'g3', kind: 'goal' },
        input(goals, { freeDay: busyFrom(0, 3) }),
      ),
      null,
    );
    assert.equal(meetsGuardrailBar([{ kind: 'busyStretch' }]), false);
    assert.equal(meetsGuardrailBar([{ kind: 'deadlineWontFit' }]), true);
    assert.equal(
      meetsGuardrailBar([{ kind: 'busyStretch' }, { kind: 'tooManyGoals' }]),
      true,
    );
  });

  await test('health and care are never the subject or named', () => {
    const care = thing('care', 'habit', null, { isCare: true });
    assert.equal(
      checkOnStart(
        { id: 'care', kind: 'habit' },
        input([...goals, fourth, care], busy),
      ),
      null,
    );
    const names = readNameable(input([...goals, fourth, care]), {
      starvedId: null,
      leaveOut: [],
    }).map((one) => one.id);
    assert.equal(names.includes('care'), false);
  });

  await test('the first place in what matters most is never named', () => {
    const names = readNameable(input([...goals, fourth]), {
      starvedId: null,
      leaveOut: [],
    }).map((one) => one.id);
    assert.equal(names.includes('g1'), false);
    assert.deepEqual(names, ['g4', 'g3', 'g2']);
  });

  await test('the named thing is the lowest eligible', () => {
    const found = checkOnStart(
      { id: 'g1', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.equal(found?.subject.id, 'g4');
    assert.equal(found?.subject.otherId, 'g1');
  });

  await test('nothing within 14 days of a date is named', () => {
    const dated = thing('g4', 'goal', null, {
      createdAt: NOW,
      activity: [],
      date: ms(TODAY) + 5 * DAY,
    });
    const names = readNameable(input([...goals, dated]), {
      starvedId: null,
      leaveOut: [],
    }).map((one) => one.id);
    assert.equal(names.includes('g4'), false);
  });

  await test('nothing is shown in the first 7 days or with learning off', () => {
    const young = [...goals, fourth].map((one) => ({
      ...one,
      createdAt: ago(3),
    }));
    assert.equal(
      checkOnStart({ id: 'g4', kind: 'goal' }, input(young, busy)),
      null,
    );
    assert.equal(
      checkOnStart(
        { id: 'g4', kind: 'goal' },
        input([...goals, fourth], { ...busy, isLearningOn: false }),
      ),
      null,
    );
    assert.equal(
      checkDaily(input(young, { ...busy, isLearningOn: false })),
      null,
    );
  });

  await test('a deadline that will not fit is shown alone', () => {
    const { deadline, longTasks } = wontFit();
    const found = checkDaily(input([...goals, deadline], { tasks: longTasks }));
    assert.ok(found);
    assert.equal(found.kind, 'deadlineWontFit');
    assert.equal(found.moment, 'daily');
    assert.equal(found.reasons.length, 1);
    assert.notEqual(found.subject.id, 'p');
    assert.notEqual(found.subject.id, 'g1');
  });

  await test('a deadline with under half its lengths known gives nothing', () => {
    const { deadline, longTasks } = wontFit();
    const unknown = longTasks.map((task, at) => ({
      ...task,
      minutes: at === 0 ? 600 : null,
    }));
    assert.equal(
      checkDaily(input([...goals, deadline], { tasks: unknown })),
      null,
    );
  });

  await test('a task is judged only on its own date', () => {
    const task = (due: number | null) => ({
      id: 't',
      title: 't',
      projectId: null,
      dueDay: due,
      minutes: 900 as number | null,
      isLatent: false,
    });
    const found = checkOnStart(
      { id: 't', kind: 'task' },
      input(goals, { tasks: [task(ms(TODAY) + DAY)] }),
    );
    assert.equal(found?.subject.collection, 'tasks');
    assert.equal(found?.effect.kind, 'none');
    assert.equal(
      checkOnStart(
        { id: 't', kind: 'task' },
        input(goals, { tasks: [task(null)] }),
      ),
      null,
    );
  });

  await test('starved is read from the order', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const took = thing('b', 'project', 3);
    const found = readStarved(input([starved, took]));
    assert.equal(found?.starvedId, 's');
    assert.equal(found?.tookId, 'b');
    assert.equal(
      readStarved(input([thing('s', 'project', null, { activity: [] }), took])),
      null,
    );
  });

  await test('the signature ignores the stretch dates', () => {
    const things = [...goals, fourth];
    const first = checkOnStart({ id: 'g4', kind: 'goal' }, input(things, busy));
    const later = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { freeDay: busyFrom(1, 4) }),
    );
    assert.ok(first && later);
    assert.notDeepEqual(first.bucket, later.bucket);
    assert.equal(first.signature, later.signature);
  });

  await test('after a no, load evidence returns only stronger and later', () => {
    const things = [...goals, fourth];
    const shown = checkOnStart({ id: 'g4', kind: 'goal' }, input(things, busy));
    assert.ok(shown);
    const since = NOW;
    const same = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { ...busy, now: NOW }),
    );
    assert.ok(same);
    assert.equal(
      isEvidenceAsStrong(shown.evidence, same.evidence, since),
      false,
    );
    const later = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { ...busy, now: NOW + 1000 }),
    );
    assert.ok(later);
    assert.equal(
      isEvidenceAsStrong(shown.evidence, later.evidence, since),
      true,
    );
    assert.equal(
      isEvidenceAsStrong(
        { ...later.evidence, measured: 6 } as typeof later.evidence,
        { ...later.evidence, measured: 3 } as typeof later.evidence,
        since,
      ),
      false,
    );
  });
};

await run();
if (failures > 0) {
  console.error(`check:helm-guardrails: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-guardrails: ok');
