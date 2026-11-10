import assert from 'node:assert/strict';

import {
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  isIndexDrifted,
  planIndexWrite,
  type ByWho,
  type IndexEntry,
} from '../../functions/src/apps/helm/keyDateIndex.ts';
import type { SetKeyDateCommand } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  planKeyDates,
  type KeyDateRecord,
} from '../../functions/src/apps/helm/nomos/planKeyDates.ts';
import { planResolve } from '../../functions/src/apps/helm/nomos/resolveQuestion.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import { openJson, sealJson } from '../../src/apps/helm/security.ts';
import type { OpenWho, HelmEncryption } from '../../src/apps/helm/types.ts';
import {
  groupByMonth,
  listUpcoming,
  orderForToday,
} from '../../src/apps/helm/utils/keyDateUpcoming.ts';
import { toDayKey } from '../../src/apps/helm/utils/planDays.ts';
import { formatMoment } from '../../src/utils/yearlyDateUtils.ts';
import {
  groupMoments,
  sortMoments,
  type WhoMoment,
} from '../../src/apps/helm/utils/moments.ts';
import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);
const TODAY = '2026-11-10';
const THIS_YEAR = 2026;
const NOW = Date.UTC(2026, 10, 10);

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const counter = () => {
  const state = { n: 0 };
  return () => {
    state.n += 1;
    return `date-${state.n}`;
  };
};

const say = (
  overrides: Partial<SetKeyDateCommand> & Pick<SetKeyDateCommand, 'date'>,
): SetKeyDateCommand => ({
  kind: 'setKeyDate',
  whoRefs: ['w1'],
  isAboutMe: false,
  keyDateId: null,
  keyKind: 'birthday',
  label: null,
  comesBack: null,
  precision: null,
  quote: null,
  ...overrides,
});

const plan = (
  commands: Parameters<typeof planKeyDates>[0]['commands'],
  state: {
    index?: ByWho;
    existing?: Map<string, KeyDateRecord>;
    counts?: Map<string, number>;
    momentCounts?: Map<string, number>;
    kept?: Map<string, { id: string; record: KeyDateRecord }>;
    questionRoom?: number;
  } = {},
) => {
  const index = state.index ?? {};
  return planKeyDates({
    commands,
    whoIdOf: new Map([['w1', 'who-1']]),
    selfWhoId: 'self',
    nameOf: new Map([['who-1', 'Mum']]),
    whoCounts: state.counts ?? new Map(),
    momentCounts: state.momentCounts ?? new Map(),
    kept: state.kept ?? new Map(),
    timeZone: 'UTC',
    questionRoom: state.questionRoom ?? 3,
    existing: state.existing ?? new Map(),
    index,
    entryCount: Object.values(index).flat().length,
    captureId: 'cap-1',
    executionId: 'exec-1',
    now: 5000,
    thisYear: THIS_YEAR,
    seal,
    newId: counter(),
    room: 50,
  });
};

test('a said birthday makes the document, the counter and the index entry', () => {
  const result = plan([say({ date: { month: 6, day: 3, year: 1960 } })]);
  assert.equal(result.creates.length, 1);
  assert.equal(result.creates[0].data.whoId, 'who-1');
  assert.equal(result.creates[0].data.shape, 'yearly');
  assert.equal(result.deltas.get('who-1'), 1);
  assert.deepEqual(result.byWho['who-1'], [
    ['date-1', 'birthday', 6, 3, 1960, null],
  ]);
  assert.equal(result.entryCount, 1);
  const words = openForHelm(
    KEY,
    result.creates[0].data.sealed as SealedPayload,
  );
  assert.equal(words.month, 6);
  assert.equal(words.captureId, 'cap-1');
});

test('no year keeps the year null', () => {
  const result = plan([say({ date: { month: 6, day: 3, year: null } })]);
  assert.equal(result.byWho['who-1'][0][4], null);
});

test('the code refuses a month alone, a day not in the month, a custom date with no name and a year out of range', () => {
  const refused = (command: SetKeyDateCommand) => {
    const result = plan([command]);
    assert.equal(result.creates.length, 0);
    assert.equal(result.notKept.length, 1);
  };
  refused(say({ date: { month: 6, day: 0, year: null } }));
  refused(say({ date: { month: 2, day: 30, year: null } }));
  refused(
    say({
      keyKind: 'custom',
      comesBack: true,
      label: '  ',
      date: { month: 6, day: 3, year: null },
    }),
  );
  refused(
    say({
      keyKind: 'custom',
      comesBack: null,
      label: 'Gotcha day',
      date: { month: 6, day: 3, year: null },
    }),
  );
  refused(say({ date: { month: 6, day: 3, year: 1800 } }));
  refused(say({ date: { month: 6, day: 3, year: THIS_YEAR + 1 } }));
});

test('the 21st yearly date for a who is refused', () => {
  const result = plan(
    [say({ keyKind: 'anniversary', date: { month: 8, day: 8, year: null } })],
    { counts: new Map([['who-1', 20]]) },
  );
  assert.equal(result.creates.length, 0);
  assert.equal(result.notKept.length, 1);
});

test('the same birthday with a year fills the year in, and a different one asks which is true', () => {
  const index: ByWho = {
    'who-1': [['d0', 'birthday', 6, 3, null, null]],
  };
  const existing = new Map<string, KeyDateRecord>([
    [
      'd0',
      {
        whoId: 'who-1',
        shape: 'yearly',
        source: 'person',
        createdAt: 1,
        sealed: {
          kind: 'birthday',
          label: null,
          month: 6,
          day: 3,
          year: null,
          precision: null,
          captureId: null,
        },
      },
    ],
  ]);
  const filled = plan([say({ date: { month: 6, day: 3, year: 1960 } })], {
    index,
    existing,
  });
  assert.equal(filled.creates.length, 0);
  assert.equal(filled.updates.length, 1);
  assert.equal(filled.effects[0].effect.previous?.['sealed.year'], null);
  assert.equal(filled.byWho['who-1'][0][4], 1960);
  assert.equal(filled.deltas.get('who-1'), 0);
  const clash = plan([say({ date: { month: 7, day: 9, year: null } })], {
    index,
    existing,
  });
  assert.equal(clash.creates.length, 0);
  assert.equal(clash.updates.length, 0);
  assert.equal(clash.notKept.length, 0);
  assert.equal(clash.questions.length, 1);
});

test('a removal drops the entry and the count, and keeps what is needed to put it back', () => {
  const index: ByWho = { 'who-1': [['d0', 'birthday', 6, 3, 1960, null]] };
  const existing = new Map<string, KeyDateRecord>([
    [
      'd0',
      {
        whoId: 'who-1',
        shape: 'yearly',
        source: 'person',
        createdAt: 1,
        sealed: {
          kind: 'birthday',
          label: null,
          month: 6,
          day: 3,
          year: 1960,
          precision: null,
          captureId: null,
        },
      },
    ],
  ]);
  const result = plan([{ kind: 'removeKeyDate', keyDateId: 'd0' }], {
    index,
    existing,
  });
  assert.deepEqual(result.deletes, ['d0']);
  assert.equal(result.deltas.get('who-1'), -1);
  assert.equal(result.entryCount, 0);
  assert.equal(result.byWho['who-1'], undefined);
  assert.equal(result.effects[0].ref.op, 'delete');
  assert.equal(result.effects[0].effect.previous?.['sealed.month'], 6);
});

test('forgetting a who removes its entries', () => {
  const index: ByWho = {
    'who-1': [['d0', 'birthday', 6, 3, null, null]],
    'who-2': [['d1', 'birthday', 7, 1, null, null]],
  };
  const [doc] = planIndexWrite(
    Object.fromEntries(Object.entries(index).filter(([id]) => id !== 'who-1')),
  ).docs;
  assert.deepEqual(Object.keys(doc.byWho), ['who-2']);
  assert.equal(doc.entryCount, 1);
});

const bigIndex = (count: number): ByWho =>
  Object.fromEntries(
    Array.from({ length: Math.ceil(count / 10) }, (_, who) => [
      `who-${who}`,
      Array.from(
        { length: Math.min(10, count - who * 10) },
        (_, n): IndexEntry => [
          `date-${who}-${n}`,
          n % 3 === 0 ? 'birthday' : n % 3 === 1 ? 'anniversary' : 'custom',
          ((who + n) % 12) + 1,
          ((who * 7 + n) % 28) + 1,
          n % 2 === 0 ? 1950 + ((who + n) % 70) : null,
          n % 3 === 2 ? 'Gotcha day' : null,
        ],
      ),
    ]),
  );

test('6,000 entries stay in one document and 6,001 split into twelve by month', () => {
  const one = planIndexWrite(bigIndex(6000));
  assert.equal(one.docs.length, 1);
  assert.equal(one.docs[0].id, 'keyDateIndex');
  const split = planIndexWrite(bigIndex(6001));
  assert.equal(split.docs.length, 12);
  assert.deepEqual(split.deleteIds, ['keyDateIndex']);
  assert.equal(
    split.docs.reduce((total, doc) => total + doc.entryCount, 0),
    6001,
  );
});

test('a planted drift is found by the counters', () => {
  assert.equal(isIndexDrifted(5, 5), false);
  assert.equal(isIndexDrifted(5, 6), true);
});

test('sealing and opening a 4,000-entry index', async () => {
  const encryption = {
    key: Buffer.alloc(32, 7).toString('hex'),
    keyId: 'helm-key-test',
    keyVersion: 1,
  } as unknown as HelmEncryption;
  const byWho = bigIndex(4000);
  const sealStart = performance.now();
  const sealed = await sealJson({ byWho }, encryption);
  const sealMs = performance.now() - sealStart;
  const openStart = performance.now();
  const opened = await openJson<{ byWho: ByWho }>(sealed, encryption);
  const openMs = performance.now() - openStart;
  assert.equal(Object.values(opened.byWho).flat().length, 4000);
  console.log(
    `     4,000 entries: seal ${sealMs.toFixed(1)} ms, open ${openMs.toFixed(1)} ms, sealed ${JSON.stringify(sealed).length} bytes`,
  );
});

const whoOf = (
  id: string,
  name: string,
  extra: Partial<OpenWho> = {},
): [string, OpenWho] => [
  id,
  {
    id,
    name,
    kind: 'person',
    tier: 'regular',
    isSelf: false,
    isUnreadable: false,
    ...extra,
  } as OpenWho,
];

test('Today shows the week: close and pet before a sooner regular, passing and organizations never', () => {
  const whoById = new Map([
    whoOf('reg', 'Regular'),
    whoOf('close', 'Close', { tier: 'close' }),
    whoOf('pet', 'Miso', { kind: 'pet' }),
    whoOf('pass', 'Passing', { tier: 'passing' }),
    whoOf('org', 'Bakery', { kind: 'organization' }),
    whoOf('self', 'Alex', { isSelf: true }),
  ]);
  const byWho: ByWho = {
    reg: [['a', 'birthday', 11, 11, null, null]],
    close: [['b', 'birthday', 11, 14, 1980, null]],
    pet: [['c', 'custom', 11, 15, 2021, 'Gotcha day']],
    pass: [['d', 'birthday', 11, 11, null, null]],
    org: [['e', 'anniversary', 11, 11, 2010, null]],
    self: [
      ['f', 'birthday', 11, 16, null, null],
      ['g', 'anniversary', 11, 16, 2015, null],
    ],
  };
  const list = (forToday: boolean, withinDays: number) =>
    listUpcoming({ byWho, whoById, todayKey: TODAY, withinDays, forToday });
  const week = orderForToday(list(true, 6));
  assert.deepEqual(
    week.map((date) => date.id),
    ['b', 'c', 'g', 'f', 'a'],
  );
  assert.equal(week.length - 3, 2, 'three shown and "+2 more this week"');
  assert.equal(HELM_COPY.keyDatesMoreThisWeek(2), '+2 more this week');
  assert.equal(list(false, 365).length, 7);
  assert.equal(
    list(true, 6).some((date) => date.id === 'd'),
    false,
  );
});

test('a day-less date is on no day list, and 29 February falls on 28 February in 2027', () => {
  const whoById = new Map([whoOf('w', 'Leap')]);
  const byWho: ByWho = {
    w: [
      ['a', 'birthday', 6, null, 2020, null],
      ['b', 'birthday', 2, 29, 2000, null],
    ],
  };
  const dates = listUpcoming({
    byWho,
    whoById,
    todayKey: TODAY,
    withinDays: 365,
    forToday: false,
  });
  assert.equal(dates.length, 1);
  assert.equal(dates[0].date, '2027-02-28');
  assert.equal(dates[0].count, 27);
});

test('"today" follows the zone: ahead of and behind UTC', () => {
  const instant = Date.UTC(2026, 10, 10, 23, 30);
  assert.equal(toDayKey(instant, 'UTC'), '2026-11-10');
  assert.equal(toDayKey(instant, 'Pacific/Auckland'), '2026-11-11');
  assert.equal(toDayKey(instant, 'America/Los_Angeles'), '2026-11-10');
  const whoById = new Map([whoOf('w', 'Dana')]);
  const byWho: ByWho = { w: [['a', 'birthday', 11, 10, null, null]] };
  const days = (zone: string) =>
    listUpcoming({
      byWho,
      whoById,
      todayKey: toDayKey(instant, zone),
      withinDays: 365,
      forToday: false,
    })[0].days;
  assert.equal(days('UTC'), 0);
  assert.equal(days('Pacific/Auckland'), 364);
  assert.equal(days('America/Los_Angeles'), 0);
});

test('Coming up groups by month and a month of 24 shows 20 then "Show 4 more"', () => {
  const whoById = new Map([whoOf('w', 'Dana')]);
  const byWho: ByWho = {
    w: [
      ...Array.from({ length: 24 }, (_, n): IndexEntry => [
        `n${n}`,
        'anniversary',
        11,
        11 + (n % 18),
        2000,
        null,
      ]),
      ['dec', 'birthday', 12, 5, null, null],
    ],
  };
  const groups = groupByMonth(
    listUpcoming({
      byWho,
      whoById,
      todayKey: TODAY,
      withinDays: 365,
      forToday: false,
    }),
  );
  assert.deepEqual(
    groups.map((group) => [group.key, group.dates.length]),
    [
      ['2026-11', 24],
      ['2026-12', 1],
    ],
  );
  assert.equal(
    HELM_COPY.comingUpShowMore(4, 'November'),
    'Show 4 more in November',
  );
});

test('nothing readable on a key date or its index holds a day, month, year or kind', async () => {
  const result = plan([
    say({
      keyKind: 'custom',
      comesBack: true,
      label: 'Gotcha day',
      date: { month: 6, day: 3, year: 2019 },
    }),
  ]);
  const doc = result.creates[0].data;
  assert.deepEqual(Object.keys(doc).sort(), [
    'createdAt',
    'createdBy',
    'executionId',
    'lastEditedAt',
    'sealed',
    'shape',
    'source',
    'whoId',
  ]);
  const readable = JSON.stringify({ ...doc, sealed: null });
  ['Gotcha', 'birthday', 'anniversary', 'custom', '2019'].forEach((word) =>
    assert.ok(!readable.includes(word), `${word} is not readable`),
  );
  const [indexDoc] = planIndexWrite(result.byWho).docs;
  const indexFields = {
    entryCount: indexDoc.entryCount,
    rebuiltAt: null,
    lastEditedAt: 5000,
    sealed: seal({ byWho: indexDoc.byWho }),
  };
  assert.deepEqual(Object.keys(indexFields).sort(), [
    'entryCount',
    'lastEditedAt',
    'rebuiltAt',
    'sealed',
  ]);
  assert.ok(!JSON.stringify(indexFields.sealed).includes('Gotcha'));
});

const momentSay = (
  precision: 'day' | 'month' | 'year' | 'decade',
  date: { month: number | null; day: number | null; year: number | null },
  overrides: Partial<SetKeyDateCommand> = {},
) =>
  say({
    keyKind: 'met',
    precision,
    date: date as SetKeyDateCommand['date'],
    ...overrides,
  });

const sealedOf = (result: ReturnType<typeof plan>) =>
  openForHelm(KEY, result.creates[0].data.sealed as SealedPayload);

test('a moment is made for each precision, with its counter, effect and no index entry', () => {
  const cases = [
    ['day', { month: 8, day: 3, year: 2024 }, 'Aug 3, 2024'],
    ['month', { month: 3, day: null, year: 2015 }, 'Mar 2015'],
    ['year', { month: null, day: null, year: 1998 }, '1998'],
    ['decade', { month: null, day: null, year: 1980 }, 'the 1980s'],
  ] as const;
  cases.forEach(([precision, date, shown]) => {
    const result = plan([momentSay(precision, date)]);
    assert.equal(result.creates.length, 1, precision);
    assert.equal(result.creates[0].data.shape, 'moment');
    assert.equal(result.momentDeltas.get('who-1'), 1);
    assert.equal(result.deltas.get('who-1') ?? 0, 0);
    assert.deepEqual(result.byWho, {});
    assert.equal(result.entryCount, 0);
    assert.equal(result.changes.length, 0);
    assert.equal(result.effects[0].ref.op, 'create');
    assert.equal(sealedOf(result).precision, precision);
    assert.equal(sealedOf(result).year, date.year);
    assert.equal(formatMoment({ ...date, precision }), shown);
  });
});

test('a moment needs its precision parts and a year in range; custom with comesBack false is a moment', () => {
  const refused = (command: SetKeyDateCommand) => {
    const result = plan([command]);
    assert.equal(result.creates.length, 0);
    assert.equal(result.notKept.length, 1);
  };
  refused(momentSay('month', { month: null, day: null, year: 2015 }));
  refused(momentSay('day', { month: 3, day: null, year: 2015 }));
  refused(momentSay('year', { month: null, day: null, year: 1800 }));
  refused(momentSay('year', { month: null, day: null, year: THIS_YEAR + 1 }));
  const custom = plan([
    momentSay(
      'decade',
      { month: null, day: null, year: 1980 },
      { keyKind: 'custom', comesBack: false, label: 'Lived in Lisbon' },
    ),
  ]);
  assert.equal(custom.creates[0].data.shape, 'moment');
  assert.equal(sealedOf(custom).label, 'Lived in Lisbon');
});

test('a who keeps at most 500 moments', () => {
  const full = plan(
    [momentSay('year', { month: null, day: null, year: 2001 })],
    { momentCounts: new Map([['who-1', 500]]) },
  );
  assert.equal(full.creates.length, 0);
  assert.equal(full.notKept.length, 1);
  const room = plan(
    [momentSay('year', { month: null, day: null, year: 2001 })],
    { momentCounts: new Map([['who-1', 499]]) },
  );
  assert.equal(room.creates.length, 1);
});

const keptRecord = (
  id: string,
  kind: 'birthday' | 'passedAway',
  parts: { month: number | null; day: number | null; year: number | null },
  precision: 'day' | null,
) => ({
  id,
  record: {
    whoId: 'who-1',
    shape: kind === 'birthday' ? ('yearly' as const) : ('moment' as const),
    source: 'person' as const,
    createdAt: 1,
    sealed: {
      kind,
      label: null,
      ...parts,
      precision,
      captureId: null,
    },
  },
});

test('a different birthday writes nothing and asks which is true, holding the new date', () => {
  const kept = keptRecord(
    'd0',
    'birthday',
    { month: 6, day: 3, year: null },
    null,
  );
  const result = plan([say({ date: { month: 6, day: 4, year: null } })], {
    index: { 'who-1': [['d0', 'birthday', 6, 3, null, null]] },
    existing: new Map([['d0', kept.record]]),
    kept: new Map([['who-1:birthday', kept]]),
  });
  assert.equal(result.creates.length, 0);
  assert.equal(result.updates.length, 0);
  assert.equal(result.effects.length, 0);
  assert.equal(result.notKept.length, 0);
  assert.equal(result.questions.length, 1);
  const question = result.questions[0].sealed as {
    kind: string;
    shape: string;
    prompt: string;
    options: { id: string; label: string }[];
    heldCommands: { kind: string; keyDateId: string; parts: unknown }[];
  };
  assert.equal(question.kind, 'whichIsTrue');
  assert.equal(question.shape, 'pickOne');
  assert.equal(question.prompt, 'Which is true now?');
  assert.deepEqual(
    question.options.map((option) => option.id),
    ['d0', 'new', 'none'],
  );
  assert.equal(question.options[0].label, "Mum's birthday · June 3");
  assert.equal(question.options[1].label, "Mum's birthday · June 4");
  assert.equal(question.heldCommands[0].kind, 'settleKeyDate');
  assert.equal(question.heldCommands[0].keyDateId, 'd0');
  assert.deepEqual(question.heldCommands[0].parts, {
    ...(question.heldCommands[0].parts as object),
    month: 6,
    day: 4,
    year: null,
    precision: null,
  });
});

test('the same birthday with a year fills it in and asks nothing', () => {
  const kept = keptRecord(
    'd0',
    'birthday',
    { month: 6, day: 3, year: null },
    null,
  );
  const result = plan([say({ date: { month: 6, day: 3, year: 1958 } })], {
    index: { 'who-1': [['d0', 'birthday', 6, 3, null, null]] },
    existing: new Map([['d0', kept.record]]),
    kept: new Map([['who-1:birthday', kept]]),
  });
  assert.equal(result.questions.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.byWho['who-1'][0][4], 1958);
});

test('a passed-away clash asks, and the same day with more detail fills in', () => {
  const kept = keptRecord(
    'm0',
    'passedAway',
    { month: null, day: null, year: 2020 },
    null,
  );
  const yearOnly = {
    ...kept,
    record: {
      ...kept.record,
      sealed: { ...kept.record.sealed, precision: 'year' as never },
    },
  };
  const state = {
    existing: new Map([['m0', yearOnly.record]]),
    kept: new Map([['who-1:passedAway', yearOnly]]),
  };
  const clash = plan(
    [
      momentSay(
        'year',
        { month: null, day: null, year: 2021 },
        { keyKind: 'passedAway' },
      ),
    ],
    state,
  );
  assert.equal(clash.creates.length, 0);
  assert.equal(clash.questions.length, 1);
  const fills = plan(
    [
      momentSay(
        'month',
        { month: 4, day: null, year: 2020 },
        { keyKind: 'passedAway' },
      ),
    ],
    state,
  );
  assert.equal(fills.questions.length, 0);
  assert.equal(fills.updates.length, 1);
  assert.equal(fills.creates.length, 0);
});

test('a clash past the question room is reported as skipped, not asked', () => {
  const kept = keptRecord(
    'd0',
    'birthday',
    { month: 6, day: 3, year: null },
    null,
  );
  const result = plan([say({ date: { month: 6, day: 4, year: null } })], {
    index: { 'who-1': [['d0', 'birthday', 6, 3, null, null]] },
    existing: new Map([['d0', kept.record]]),
    kept: new Map([['who-1:birthday', kept]]),
    questionRoom: 0,
  });
  assert.equal(result.questions.length, 0);
  assert.equal(result.notKept.length, 1);
});

const settleInput = (
  optionId: string,
  record: ReturnType<typeof keptRecord>['record'] | null,
  parts: Record<string, unknown>,
) => {
  const questions = plan([say({ date: { month: 6, day: 4, year: null } })], {
    index: { 'who-1': [['d0', 'birthday', 6, 3, null, null]] },
    existing: new Map([
      [
        'd0',
        keptRecord('d0', 'birthday', { month: 6, day: 3, year: null }, null)
          .record,
      ],
    ]),
    kept: new Map([
      [
        'who-1:birthday',
        keptRecord('d0', 'birthday', { month: 6, day: 3, year: null }, null),
      ],
    ]),
  }).questions;
  const question = {
    ...(questions[0].sealed as Record<string, unknown>),
    heldCommands: [
      {
        kind: 'settleKeyDate',
        keyDateId: 'd0',
        whoId: 'who-1',
        parts,
      },
    ],
  };
  return {
    captureId: 'cap-1',
    questionId: 'q1',
    optionId,
    by: 'tap' as const,
    now: NOW,
    timeZone: 'UTC',
    executionId: 'exec-2',
    capture: {
      status: 'needsYou',
      createdAt: 1,
      whoIds: ['who-1'],
      placeIds: [],
      executionIds: [],
      questionState: {
        q1: {
          kind: 'whichIsTrue',
          shape: 'pickOne',
          askedAt: 4000,
          answeredAt: null,
          skippedAt: null,
        },
      },
    },
    opened: { text: 'x', questions: { q1: question } },
    tasks: new Map(),
    facts: new Map(),
    keyDate: record
      ? { id: 'd0', record: { ...record, lastEditedAt: null } }
      : null,
    text: null,
    chosen: null,
    newId: counter(),
    seal,
  };
};

const birthdayRecord = keptRecord(
  'd0',
  'birthday',
  { month: 6, day: 3, year: null },
  null,
).record;
const NEW_PARTS = { month: 6, day: 4, year: null, precision: null };

test('picking the new date rewrites the parts and the index entry, with an effect Undo reverses', () => {
  const result = planResolve(settleInput('new', birthdayRecord, NEW_PARTS));
  assert.equal(result.refused, null);
  if (result.refused !== null) return;
  const { keyDateUpdate, execution } = result.plan;
  assert.equal(keyDateUpdate?.id, 'd0');
  const words = openForHelm(KEY, keyDateUpdate?.data.sealed as SealedPayload);
  assert.equal(words.day, 4);
  assert.equal(keyDateUpdate?.indexChange?.op, 'upsert');
  assert.equal(keyDateUpdate?.data.lastEditedAt, NOW);
  const effect = (execution as { sealed: SealedPayload }).sealed;
  const opened = openForHelm(KEY, effect) as {
    effects: { previous: Record<string, unknown> }[];
  };
  assert.equal(opened.effects[0].previous['sealed.day'], 3);
});

test('picking the kept date, or Neither, writes nothing but answers the question', () => {
  ['d0', 'none'].forEach((optionId) => {
    const result = planResolve(
      settleInput(optionId, birthdayRecord, NEW_PARTS),
    );
    assert.equal(result.refused, null);
    if (result.refused !== null) return;
    assert.equal(result.plan.keyDateUpdate, null);
    assert.equal(result.plan.execution, null);
    const state = result.plan.capture.questionState as Record<
      string,
      { answeredAt: number | null }
    >;
    assert.equal(state.q1.answeredAt, NOW);
  });
});

test('a date removed since the question was asked is refused as gone', () => {
  assert.equal(
    planResolve(settleInput('new', null, NEW_PARTS)).refused,
    'gone',
  );
});

test('a moment settled to a new date keeps its shape and leaves the index alone', () => {
  const record = keptRecord(
    'd0',
    'passedAway',
    { month: null, day: null, year: 2020 },
    null,
  ).record;
  const moment = {
    ...record,
    sealed: { ...record.sealed, precision: 'year' as never },
  };
  const result = planResolve(
    settleInput('new', moment, {
      month: null,
      day: null,
      year: 2021,
      precision: 'year',
    }),
  );
  assert.equal(result.refused, null);
  if (result.refused !== null) return;
  assert.equal(result.plan.keyDateUpdate?.indexChange, null);
  const words = openForHelm(
    KEY,
    result.plan.keyDateUpdate?.data.sealed as SealedPayload,
  );
  assert.equal(words.year, 2021);
  assert.equal(words.precision, 'year');
});

const momentFixture = (
  id: number,
  precision: WhoMoment['precision'],
  year: number,
  month: number | null,
  day: number | null,
): WhoMoment => ({
  id: `m${id}`,
  whoId: 'who-1',
  kind: 'met',
  label: null,
  precision,
  month,
  day,
  year,
  source: 'person',
  createdAt: id,
  captureId: null,
});

test('moments sort newest first and group by decade and year, decade-only rows last under their decade', () => {
  const sorted = sortMoments([
    momentFixture(1, 'decade', 1980, null, null),
    momentFixture(2, 'year', 1985, null, null),
    momentFixture(3, 'month', 1985, 4, null),
    momentFixture(4, 'day', 1985, 4, 20),
    momentFixture(5, 'year', 2012, null, null),
    momentFixture(6, 'day', 1989, 12, 1),
  ]);
  assert.deepEqual(
    sorted.map((moment) => moment.id),
    ['m5', 'm6', 'm4', 'm3', 'm2', 'm1'],
  );
  const groups = groupMoments(sorted);
  assert.deepEqual(
    groups.map((group) => group.decade),
    [2010, 1980],
  );
  assert.deepEqual(
    groups[1].years.map((year) => year.year),
    [1989, 1985],
  );
  assert.deepEqual(
    groups[1].sometime.map((moment) => moment.id),
    ['m1'],
  );
});

test('opening and sorting 500 moments', async () => {
  const ENCRYPTION = {
    key: Buffer.alloc(32, 7).toString('hex'),
    keyId: 'helm-key-test',
    keyVersion: 1,
  } as unknown as HelmEncryption;
  const sealedDocs = await Promise.all(
    Array.from({ length: 500 }, async (_, index) => ({
      precision: (['day', 'month', 'year', 'decade'] as const)[index % 4],
      sealed: await sealJson(
        {
          kind: 'met',
          label: null,
          month: 1 + (index % 12),
          day: 1 + (index % 28),
          year: 1900 + (index % 120),
          precision: 'day',
          captureId: null,
        },
        ENCRYPTION,
      ),
    })),
  );
  const started = performance.now();
  const opened = await Promise.all(
    sealedDocs.map((doc) =>
      openJson<Record<string, number>>(doc.sealed, ENCRYPTION),
    ),
  );
  const openedAt = performance.now();
  const sorted = sortMoments(
    opened.map((words, index) =>
      momentFixture(index, 'day', words.year, words.month, words.day),
    ),
  );
  const done = performance.now();
  console.log(
    `     500 moments: open ${(openedAt - started).toFixed(1)} ms, sort and group ${(done - openedAt).toFixed(1)} ms`,
  );
  assert.equal(sorted.length, 500);
  assert.equal(groupMoments(sorted).length > 0, true);
});

test('nothing readable on a moment holds a year, a date, a kind or a precision', () => {
  const result = plan([
    momentSay(
      'day',
      { month: 8, day: 3, year: 2024 },
      { keyKind: 'custom', comesBack: false, label: 'Lived in Lisbon' },
    ),
  ]);
  const readable = JSON.stringify(
    Object.fromEntries(
      Object.entries(result.creates[0].data).filter(
        ([key]) => key !== 'sealed',
      ),
    ),
  );
  ['Lisbon', '2024', 'custom', 'precision'].forEach((word) =>
    assert.ok(!readable.includes(word), word),
  );
  assert.deepEqual(Object.keys(result.creates[0].data).sort(), [
    'createdAt',
    'createdBy',
    'executionId',
    'lastEditedAt',
    'sealed',
    'shape',
    'source',
    'whoId',
  ]);
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
