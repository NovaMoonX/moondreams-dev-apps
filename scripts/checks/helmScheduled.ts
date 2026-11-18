// Scheduled actions: the pure schedule engine, what the server decides each pass, and the guarantees around them (one capture per run, no push).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  decideRun,
  settleRun,
  type RunDecision,
} from '../../functions/src/apps/helm/scheduledActions/runAction.ts';
import {
  countKept,
  planScheduledActions,
  readActionState,
  type StoredScheduled,
} from '../../functions/src/apps/helm/nomos/planScheduledActions.ts';
import {
  CHANGE_REFUSAL_WORDS,
  LATE_LIMIT_MS,
  MAX_MOVED,
  MAX_SKIPPED,
  canRunNow,
  describeScheduledOutcome,
  planScheduleChange,
  readDueRuns,
  readNextRun,
  readOccurrences,
  readCaptureKey,
  readRunBlocker,
  readSpanPause,
  toCaptureId,
  type ActionState,
} from '../../src/apps/helm/engine/scheduledActions.ts';
import { dayKeyToMs } from '../../src/utils/cadenceUtils.ts';
import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const NOW = Date.UTC(2026, 10, 16, 12, 0);
const NY = 'America/New_York';
const LISBON = 'Europe/Lisbon';
const HOUR = 3_600_000;

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const state = (over: Partial<ActionState> = {}): ActionState => ({
  status: 'active',
  endedBy: null,
  repeat: 'FREQ=DAILY;WKST=MO',
  startsOn: '2026-11-16',
  time: '09:00',
  timeZone: null,
  skipped: [],
  moved: {},
  nextRunAt: null,
  nextRunKey: null,
  lastRunDueAt: null,
  pausedFrom: null,
  pausedUntil: null,
  pausedForSpanId: null,
  ...over,
});

const withNext = (action: ActionState, zone: string, now = NOW) => {
  const run = readNextRun(action, zone, { now });
  return {
    ...action,
    nextRunAt: run?.at ?? null,
    nextRunKey: run?.key ?? null,
  };
};

const stored = (
  id: string,
  action: ActionState,
  over: Record<string, unknown> = {},
): StoredScheduled => ({
  id,
  doc: {
    ...action,
    kind: 'commands',
    allowed: ['createTask'],
    lastOutcome: null,
    lastRunAt: null,
    lastRunCaptureId: null,
    lastRunDueAt: null,
    runNowAt: null,
    lastEditedAt: null,
    ...over,
  },
  words: {
    title: 'Water the plants',
    instruction: null,
    heldCommands: [{ kind: 'createTask', title: 'Water the plants' }],
  },
});

const runOf = (decision: RunDecision) => {
  assert.equal(decision.kind, 'run');
  return decision as Extract<RunDecision, { kind: 'run' }>;
};

test('DST: 02:30 on the spring-forward day runs at 03:30', () => {
  const runs = readOccurrences(
    state({ startsOn: '2026-03-07', time: '02:30' }),
    NY,
    { fromKey: '2026-03-07', limit: 3 },
  );
  assert.equal(runs?.[1].key, '2026-03-08');
  assert.equal(runs?.[1].at, Date.UTC(2026, 2, 8, 7, 30));
  assert.equal(runs?.[1].at, zonedDateTimeToEpoch('2026-03-08', '03:30', NY));
});

test('DST: 01:30 on the fall-back day runs once', () => {
  const runs =
    readOccurrences(state({ startsOn: '2026-10-31', time: '01:30' }), NY, {
      fromKey: '2026-10-31',
      limit: 4,
    }) ?? [];
  assert.equal(runs.filter((run) => run.key === '2026-11-01').length, 1);
  assert.equal(runs.length, 4);
});

test('one rule in two zones is two instants', () => {
  const rule = state({ startsOn: '2026-11-17', time: '08:00' });
  const ny = readNextRun(rule, NY, { now: NOW });
  const lisbon = readNextRun(rule, LISBON, { now: NOW });
  assert.equal(ny?.key, lisbon?.key);
  assert.equal((ny?.at ?? 0) - (lisbon?.at ?? 0), 5 * HOUR);
  const own = readNextRun({ ...rule, timeZone: LISBON }, NY, { now: NOW });
  assert.equal(own?.at, lisbon?.at);
});

test('skip moves the next run on, and skips are capped at 100', () => {
  const action = withNext(state(), NY);
  const planned = planScheduleChange(
    action,
    { kind: 'skip', key: null },
    { homeZone: NY, now: NOW },
  );
  assert.ok('fields' in planned);
  if ('fields' in planned) {
    assert.deepEqual(planned.fields.skipped, [action.nextRunKey]);
    assert.notEqual(planned.fields.nextRunKey, action.nextRunKey);
    assert.deepEqual(
      Object.keys(planned.fields).sort(),
      ['nextRunAt', 'nextRunKey', 'skipped'],
      'only the fields an Undo must put back',
    );
  }
  const many = withNext(
    state({
      skipped: Array.from({ length: MAX_SKIPPED }, (_, index) =>
        new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
      ),
    }),
    NY,
  );
  assert.deepEqual(
    planScheduleChange(
      many,
      { kind: 'skip', key: null },
      { homeZone: NY, now: NOW },
    ),
    { refused: 'tooMany' },
  );
});

test('move: today or later, before the run after it, never onto a day that ran', () => {
  const weekly = withNext(
    state({ repeat: 'FREQ=WEEKLY;WKST=MO;BYDAY=TU', startsOn: '2026-11-17' }),
    NY,
  );
  const ctx = { homeZone: NY, now: NOW };
  const move = (day: string) =>
    planScheduleChange(
      weekly,
      { kind: 'move', key: null, day, time: null },
      ctx,
    );
  assert.ok('fields' in move('2026-11-19'));
  assert.deepEqual(move('2026-11-15'), { refused: 'past' });
  assert.deepEqual(move('2026-11-24'), { refused: 'tooLate' });
  const ran = planScheduleChange(
    {
      ...weekly,
      lastRunDueAt: zonedDateTimeToEpoch('2026-11-18', '09:00', NY),
    },
    { kind: 'move', key: null, day: '2026-11-18', time: null },
    ctx,
  );
  assert.deepEqual(ran, { refused: 'ran' });
  const crowded = {
    ...weekly,
    moved: Object.fromEntries(
      Array.from({ length: MAX_MOVED }, (_, index) => [
        `2027-01-${String(index + 1).padStart(2, '0')}`,
        { day: '2027-01-30', time: '09:00' },
      ]),
    ),
  };
  assert.deepEqual(
    planScheduleChange(
      crowded,
      { kind: 'move', key: null, day: '2026-11-19', time: null },
      ctx,
    ),
    { refused: 'tooMany' },
  );
  Object.values(CHANGE_REFUSAL_WORDS).forEach((words) =>
    assert.ok(words.length > 0),
  );
});

test('this and following from a later run splits and carries COUNT', () => {
  const weekly = withNext(
    state({
      repeat: 'FREQ=WEEKLY;WKST=MO;BYDAY=TU;COUNT=10',
      startsOn: '2026-11-17',
    }),
    NY,
  );
  const planned = planScheduleChange(
    weekly,
    { kind: 'following', fromKey: '2026-12-08', rule: null, time: '07:00' },
    { homeZone: NY, now: NOW },
  );
  assert.ok('fields' in planned && planned.created);
  if (!('fields' in planned) || !planned.created) return;
  const older = readOccurrences({ ...weekly, ...planned.fields }, NY, {
    fromKey: '2026-11-17',
    limit: 50,
  });
  const newer = readOccurrences(planned.created, NY, {
    fromKey: planned.created.startsOn,
    limit: 50,
  });
  assert.equal((older?.length ?? 0) + (newer?.length ?? 0), 10);
  assert.equal(planned.created.startsOn, '2026-12-08');
  assert.equal(planned.created.time, '07:00');
  assert.equal(
    (older?.[(older?.length ?? 1) - 1]?.key ?? '') < '2026-12-08',
    true,
  );
});

test('this and following from the next run rewrites in place', () => {
  const weekly = withNext(
    state({ repeat: 'FREQ=WEEKLY;WKST=MO;BYDAY=TU', startsOn: '2026-11-17' }),
    NY,
  );
  const planned = planScheduleChange(
    weekly,
    { kind: 'following', fromKey: null, rule: null, time: '07:00' },
    { homeZone: NY, now: NOW },
  );
  assert.ok('fields' in planned);
  if ('fields' in planned) {
    assert.equal(planned.created, null);
    assert.equal(planned.fields.time, '07:00');
  }
});

test('the 6-hour rule: late runs go ahead, older ones are skipped, a waiting one has no lateness', () => {
  const at = Date.UTC(2026, 10, 16, 10, 0);
  const runs = [{ key: '2026-11-16', day: '2026-11-16', time: '10:00', at }];
  assert.equal(
    readDueRuns(runs, at + LATE_LIMIT_MS - 1).run?.key,
    '2026-11-16',
  );
  const late = readDueRuns(runs, at + LATE_LIMIT_MS);
  assert.equal(late.run, null);
  assert.equal(late.skipped.length, 1);
  assert.equal(
    readDueRuns(runs, at + 20 * HOUR, { waitingKey: '2026-11-16' }).run?.key,
    '2026-11-16',
  );
  const two = [
    { key: '2026-11-15', day: '2026-11-15', time: '10:00', at: at - 24 * HOUR },
    ...runs,
  ];
  const caught = readDueRuns(two, at + HOUR);
  assert.equal(caught.run?.key, '2026-11-16');
  assert.equal(caught.skipped.length, 1);
});

test('each blocker has its own line and is decided before any model call', () => {
  const lines = (
    [
      'notConnected',
      'grantExpired',
      'notAllowed',
      'runFailed',
      'ruleInvalid',
    ] as const
  ).map((reason) =>
    describeScheduledOutcome({
      title: 'Mail digest',
      outcome: 'failed',
      reason,
      dueAt: NOW,
      zone: NY,
      name: 'Gmail',
    }),
  );
  assert.equal(new Set(lines).size, 5);
  assert.deepEqual(
    readRunBlocker({
      allowed: ['sendEmail'],
      permitted: ['createTask'],
      needs: [],
    }),
    { reason: 'notAllowed', name: 'sendEmail' },
  );
  assert.equal(
    readRunBlocker({
      allowed: [],
      permitted: [],
      needs: [{ name: 'Gmail', state: 'expired' }],
    })?.reason,
    'grantExpired',
  );
  assert.equal(
    readRunBlocker({
      allowed: [],
      permitted: [],
      needs: [{ name: 'Gmail', state: 'missing' }],
    })?.reason,
    'notConnected',
  );
  const action = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const blocked = decideRun({
    stored: stored('a1', action, { allowed: ['sendEmail'] }),
    homeZone: NY,
    now: action.nextRunAt! + 60_000,
    changedAt: null,
  });
  assert.equal(blocked.kind, 'patch');
  if (blocked.kind === 'patch') {
    assert.equal(blocked.patch.lastOutcome, 'failed');
    assert.equal(blocked.patch.lastFailReason, 'notAllowed');
    assert.equal(
      blocked.patch.lastRunCaptureId,
      toCaptureId('a1', action.nextRunKey!),
    );
  }
});

test('the capture id is the original day: the same across retry, move and time change', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const key = base.nextRunKey!;
  const dueAt = base.nextRunAt!;
  const first = runOf(
    decideRun({
      stored: stored('a1', base),
      homeZone: NY,
      now: dueAt + 60_000,
      changedAt: null,
    }),
  );
  const retry = runOf(
    decideRun({
      stored: stored('a1', base),
      homeZone: NY,
      now: dueAt + 120_000,
      changedAt: null,
    }),
  );
  assert.equal(first.captureId, toCaptureId('a1', key));
  assert.equal(retry.captureId, first.captureId);
  const moved = { ...base, moved: { [key]: { day: key, time: '08:30' } } };
  const movedRun = runOf(
    decideRun({
      stored: stored('a1', withNext(moved, NY, NOW - 24 * HOUR)),
      homeZone: NY,
      now: dueAt + 31 * 60_000,
      changedAt: null,
    }),
  );
  assert.equal(movedRun.captureId, first.captureId);
  assert.equal(movedRun.dueAt, dueAt + 30 * 60_000);
  const retimed = withNext({ ...base, time: '08:10' }, NY, NOW - 24 * HOUR);
  const retimedRun = runOf(
    decideRun({
      stored: stored('a1', retimed),
      homeZone: NY,
      now: retimed.nextRunAt! + 1000,
      changedAt: null,
    }),
  );
  assert.equal(retimedRun.captureId, first.captureId);
});

test('a run advances to the next one; a finished rule ends the action', () => {
  const base = withNext(
    state({ repeat: 'FREQ=DAILY;WKST=MO;COUNT=1', time: '08:00' }),
    NY,
    NOW - 24 * HOUR,
  );
  const decision = runOf(
    decideRun({
      stored: stored('a1', base),
      homeZone: NY,
      now: base.nextRunAt! + 1000,
      changedAt: null,
    }),
  );
  const patch = settleRun(
    decision,
    {
      status: 'sorted',
      executionId: 'e1',
      releasedIds: [],
      hasAnswer: false,
      spoken: null,
      abilityOffer: null,
    },
    NOW,
  );
  assert.equal(patch?.lastOutcome, 'done');
  assert.equal(patch?.status, 'ended');
  assert.equal(patch?.endedBy, 'finished');
  assert.equal(patch?.nextRunAt, null);
  const ended = [
    stored('a1', { ...base, status: 'ended', endedBy: 'finished' }),
    stored('a2', base),
  ];
  assert.equal(countKept(new Map(ended.map((entry) => [entry.id, entry]))), 1);
});

test('over the limits a run waits for the next open, with no lateness', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const dueAt = base.nextRunAt!;
  const decision = runOf(
    decideRun({
      stored: stored('a1', base),
      homeZone: NY,
      now: dueAt + 1000,
      changedAt: null,
    }),
  );
  const waiting = settleRun(decision, { held: 'dailyLimit' }, dueAt + 1000);
  assert.equal(waiting?.lastOutcome, 'waiting');
  assert.equal(waiting?.nextRunKey, base.nextRunKey);
  const again = (changedAt: number | null, now: number) =>
    decideRun({
      stored: stored('a1', base, { ...waiting }),
      homeZone: NY,
      now,
      changedAt,
    });
  assert.equal(again(null, dueAt + 10 * HOUR).kind, 'none');
  assert.equal(again(dueAt, dueAt + 10 * HOUR).kind, 'none');
  const opened = runOf(again(dueAt + 9 * HOUR, dueAt + 10 * HOUR));
  assert.equal(opened.key, base.nextRunKey);
});

test('a run that is over 6 hours late is skipped with one line, and the rest wait', () => {
  const base = withNext(
    state({ time: '08:00', startsOn: '2026-11-01' }),
    NY,
    NOW - 72 * HOUR,
  );
  const decision = decideRun({
    stored: stored('a1', base),
    homeZone: NY,
    now: NOW,
    changedAt: null,
  });
  assert.equal(decision.kind, 'patch');
  if (decision.kind === 'patch') {
    assert.equal(decision.patch.lastOutcome, 'skipped');
    assert.ok((decision.patch.nextRunAt as number) > NOW);
  }
});

test('an unreadable stored rule fails as ruleInvalid and is not run', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const decision = decideRun({
    stored: stored('a1', { ...base, repeat: 'FREQ=NEVER' }),
    homeZone: NY,
    now: base.nextRunAt! + 1000,
    changedAt: null,
  });
  assert.equal(decision.kind, 'patch');
  if (decision.kind === 'patch') {
    assert.equal(decision.patch.lastFailReason, 'ruleInvalid');
    assert.equal(decision.patch.nextRunAt, null);
  }
});

test('Run it now: only after a failed run and before the next one, and it never moves the next run', () => {
  const input = {
    status: 'active',
    lastOutcome: 'failed',
    nextRunAt: NOW + HOUR,
    now: NOW,
  } as const;
  assert.equal(canRunNow(input), true);
  assert.equal(canRunNow({ ...input, lastOutcome: 'done' }), false);
  assert.equal(canRunNow({ ...input, nextRunAt: NOW - 1 }), false);
  assert.equal(canRunNow({ ...input, status: 'paused' }), false);
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const key = base.nextRunKey!;
  const decision = runOf(
    decideRun({
      stored: stored(
        'a1',
        { ...base, nextRunAt: NOW + HOUR },
        {
          lastOutcome: 'failed',
          lastRunCaptureId: toCaptureId('a1', key),
          lastRunDueAt: base.nextRunAt,
          runNowAt: NOW - 1000,
        },
      ),
      homeZone: NY,
      now: NOW,
      changedAt: NOW - 1000,
    }),
  );
  assert.equal(decision.isNow, true);
  assert.equal(
    decision.captureId,
    `${toCaptureId('a1', key)}_now${NOW - 1000}`,
  );
  const patch = settleRun(
    decision,
    {
      status: 'sorted',
      executionId: 'e1',
      releasedIds: [],
      hasAnswer: false,
      spoken: null,
      abilityOffer: null,
    },
    NOW,
  );
  assert.equal(patch?.lastOutcome, 'done');
  assert.equal('nextRunAt' in (patch ?? {}), false);
  assert.equal(patch?.runNowAt, null);
});

test('Pause what runs at home by a span: runs inside it wait, and a time zone span never moves an action', () => {
  const weekly = withNext(
    state({
      repeat: 'FREQ=WEEKLY;WKST=MO;BYDAY=TU',
      startsOn: '2026-11-17',
      time: '08:00',
    }),
    NY,
  );
  const span = { fromDay: '2026-11-24', toDay: '2026-12-01' };
  const pause = readSpanPause(weekly, NY, span, NOW);
  assert.ok(pause && 'pausedFrom' in pause);
  const paused = { ...weekly, ...pause };
  const days = (
    readOccurrences(paused, NY, { fromKey: '2026-11-17', limit: 6 }) ?? []
  ).map((run) => run.key);
  assert.equal(days.includes('2026-11-24'), false);
  assert.equal(days.includes('2026-12-01'), false);
  assert.equal(days.includes('2026-11-17'), true);
  assert.equal(days.includes('2026-12-08'), true);
  assert.equal(
    readSpanPause(
      weekly,
      NY,
      { fromDay: '2026-11-25', toDay: '2026-11-27' },
      NOW,
    ),
    null,
  );
  const home = readNextRun(weekly, NY, { now: NOW });
  assert.equal(home?.at, zonedDateTimeToEpoch('2026-11-17', '08:00', NY));
  const resumed = planScheduleChange(
    { ...paused, status: 'paused' },
    { kind: 'resume' },
    { homeZone: NY, now: NOW },
  );
  assert.ok('fields' in resumed && resumed.fields.pausedFrom === null);
});

test('pausing and ending leave the rule and the time alone', () => {
  const action = withNext(state(), NY);
  const pause = planScheduleChange(
    action,
    { kind: 'pause' },
    { homeZone: NY, now: NOW },
  );
  const end = planScheduleChange(
    action,
    { kind: 'end' },
    { homeZone: NY, now: NOW },
  );
  assert.ok(
    'fields' in pause &&
      !('repeat' in pause.fields) &&
      !('timeZone' in pause.fields),
  );
  assert.ok('fields' in end && end.fields.endedBy === 'person');
  assert.deepEqual(
    planScheduleChange(
      { ...action, status: 'ended' },
      { kind: 'pause' },
      { homeZone: NY, now: NOW },
    ),
    { refused: 'ended' },
  );
  assert.equal(readActionState({ status: 'paused' }).status, 'paused');
});

test('every read of the live actions names their status, so ended ones never crowd them out', () => {
  const dir = join(ROOT, 'functions/src/apps/helm/scheduledActions');
  const store = readFileSync(join(dir, 'actionStore.ts'), 'utf8');
  assert.match(store, /\.where\('status', 'in', \['active', 'paused'\]\)/);
  const runner = readFileSync(join(dir, 'runHelmScheduledActions.ts'), 'utf8');
  assert.equal(/scheduledActions`\)\s*\.limit/.test(runner), false);
  assert.equal((runner.match(/actionsQuery\(/g) ?? []).length, 2);
});

test('a move whose original day has passed still runs on its new day, even after a later skip', () => {
  const fridays = state({
    repeat: 'FREQ=WEEKLY;WKST=MO;BYDAY=FR',
    startsOn: '2026-11-13',
    time: '08:00',
    moved: { '2026-11-20': { day: '2026-11-25', time: '08:00' } },
    skipped: ['2026-11-27'],
  });
  const now = Date.UTC(2026, 10, 22, 15, 0);
  const next = readNextRun(fridays, NY, { now });
  assert.equal(next?.key, '2026-11-20');
  assert.equal(next?.day, '2026-11-25');
});

test('a run that goes prunes the skips and moves behind it and keeps the ones ahead', () => {
  const base = withNext(
    state({
      time: '08:00',
      startsOn: '2026-11-01',
      skipped: ['2026-11-03', '2026-11-30'],
      moved: { '2026-11-04': { day: '2026-11-04', time: '10:00' } },
    }),
    NY,
    NOW - 24 * HOUR,
  );
  const at = base.nextRunAt! + 1000;
  const decision = runOf(
    decideRun({
      stored: stored('a1', base),
      homeZone: NY,
      now: at,
      changedAt: null,
    }),
  );
  assert.equal(
    'skipped' in (settleRun(decision, { held: 'limit' }, at) ?? {}),
    false,
  );
  const done = settleRun(
    decision,
    {
      status: 'sorted',
      executionId: 'e1',
      releasedIds: [],
      hasAnswer: false,
      spoken: null,
      abilityOffer: null,
    },
    at,
  );
  assert.deepEqual(done?.skipped, ['2026-11-30']);
  assert.deepEqual(done?.moved, {});
});

test('the home zone decides whether a run is due: a stored time from another zone neither runs early nor hides', () => {
  const stale = (storedZone: string, now: number) =>
    decideRun({
      stored: stored('a1', {
        ...state({ time: '08:00', startsOn: '2026-11-17' }),
        nextRunKey: '2026-11-17',
        nextRunAt: zonedDateTimeToEpoch('2026-11-17', '08:00', storedZone),
      }),
      homeZone: LISBON,
      now,
      changedAt: null,
    });
  const lisbonRuns = runOf(
    stale(NY, zonedDateTimeToEpoch('2026-11-17', '08:30', LISBON)),
  );
  assert.equal(lisbonRuns.key, '2026-11-17');
  assert.equal(
    lisbonRuns.dueAt,
    zonedDateTimeToEpoch('2026-11-17', '08:00', LISBON),
  );
  const early = stale(
    'Asia/Tokyo',
    zonedDateTimeToEpoch('2026-11-17', '07:00', LISBON),
  );
  assert.equal(early.kind, 'patch');
  if (early.kind === 'patch') {
    assert.equal(
      early.patch.nextRunAt,
      zonedDateTimeToEpoch('2026-11-17', '08:00', LISBON),
    );
  }
});

test('a held task list that builds nothing fails the run before any capture is made', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const action = stored('a1', base);
  const decision = decideRun({
    stored: {
      ...action,
      words: {
        title: 'Plan',
        instruction: null,
        heldCommands: [{ kind: 'createTask', title: null }],
      },
    },
    homeZone: NY,
    now: base.nextRunAt! + 1000,
    changedAt: null,
  });
  assert.equal(decision.kind, 'patch');
  if (decision.kind === 'patch') {
    assert.equal(decision.patch.lastFailReason, 'runFailed');
    assert.equal(decision.patch.lastOutcome, 'failed');
  }
});

test('a second Run it now after a failure makes its own capture', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const key = base.nextRunKey!;
  const again = (runNowAt: number) =>
    runOf(
      decideRun({
        stored: stored(
          'a1',
          { ...base, nextRunAt: NOW + HOUR },
          {
            lastOutcome: 'failed',
            lastRunCaptureId: `${toCaptureId('a1', key)}_now${NOW - 5000}`,
            lastRunDueAt: base.nextRunAt,
            runNowAt,
          },
        ),
        homeZone: NY,
        now: NOW,
        changedAt: null,
      }),
    ).captureId;
  assert.notEqual(again(NOW - 1000), again(NOW - 2000));
  assert.equal(readCaptureKey(again(NOW - 1000)), key);
});

test('a waiting run that was paused away is closed, not run late', () => {
  const base = withNext(state({ time: '08:00' }), NY, NOW - 24 * HOUR);
  const captureId = toCaptureId('a1', base.nextRunKey!);
  const paused = decideRun({
    stored: stored(
      'a1',
      { ...base, status: 'paused' },
      { lastOutcome: 'waiting', lastRunCaptureId: captureId },
    ),
    homeZone: NY,
    now: base.nextRunAt! + HOUR,
    changedAt: null,
  });
  assert.equal(paused.kind, 'patch');
  if (paused.kind === 'patch') {
    assert.equal(paused.closes, captureId);
    assert.equal(paused.patch.lastOutcome, 'skipped');
  }
});

test('a span pause refuses an action that already waits out a separate stretch, and joins one it touches', () => {
  const daily = withNext(state({ time: '08:00' }), NY);
  const stretch = (from: string, to: string) => ({
    pausedFrom: dayKeyToMs(from),
    pausedUntil: dayKeyToMs(to),
  });
  const held = { ...daily, ...stretch('2026-12-01', '2026-12-03') };
  assert.deepEqual(
    readSpanPause(
      held,
      NY,
      { fromDay: '2026-12-20', toDay: '2026-12-25' },
      NOW,
    ),
    { clash: true },
  );
  assert.deepEqual(
    readSpanPause(
      held,
      NY,
      { fromDay: '2026-12-04', toDay: '2026-12-06' },
      NOW,
    ),
    stretch('2026-12-01', '2026-12-06'),
  );
});

test('Change on a paused action with no run named targets its next run instead of refusing', () => {
  const paused = {
    ...state({ time: '08:00' }),
    status: 'paused' as const,
    nextRunAt: null,
    nextRunKey: null,
  };
  const result = planScheduleChange(
    paused,
    { kind: 'following', fromKey: null, rule: null, time: '09:00' },
    { homeZone: NY, now: NOW },
  );
  assert.ok('fields' in result);
  assert.equal(result.fields.nextRunAt, null);
  assert.equal(result.fields.time, '09:00');
});

test('no outcome ever sends a push: the scheduled-actions code never touches reminders or messaging', () => {
  const dir = join(ROOT, 'functions/src/apps/helm/scheduledActions');
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
  files.forEach((name) => {
    const text = readFileSync(join(dir, name), 'utf8');
    assert.equal(
      /messaging|sendPush|sendEachForMulticast|collection\(['"`]reminders|doc\(`reminders/i.test(
        text,
      ),
      false,
      name,
    );
  });
  const engine = readFileSync(
    join(ROOT, 'src/apps/helm/engine/scheduledActions.ts'),
    'utf8',
  );
  assert.equal(/push|messaging/i.test(engine), false);
});

test('an action the server makes inside a marked time-away span waits it out, and one outside does not', () => {
  const plan = (pauseSpans: { id: string; from: number; to: number }[]) =>
    planScheduledActions({
      commands: [
        {
          kind: 'scheduleAction',
          title: 'Plan the day',
          repeat: {
            freq: 'daily',
            interval: 1,
            weekdays: [],
            monthBy: null,
            nth: null,
            endsKind: 'never',
            until: null,
            count: null,
          },
          startsOn: null,
          time: '08:00',
          times: ['08:00'],
          instruction: 'Plan my day',
          held: [],
          allowedKinds: [],
          quote: 'every day at 8',
        },
      ],
      stored: new Map(),
      homeZone: NY,
      now: NOW,
      captureId: 'capture-1',
      newId: () => 'made-1',
      pauseSpans,
      seal: (fields) => fields as never,
      room: 5,
    }).creates[0]?.doc;
  const inside = plan([
    { id: 'away-1', from: Date.UTC(2026, 10, 17), to: Date.UTC(2026, 10, 20) },
  ]);
  assert.equal(inside?.pausedFrom, Date.UTC(2026, 10, 17));
  assert.equal(inside?.pausedUntil, Date.UTC(2026, 10, 20));
  const outside = plan([]);
  assert.equal(outside?.pausedFrom ?? null, null);
  assert.equal(outside?.pausedUntil ?? null, null);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
