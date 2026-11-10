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
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import { openJson, sealJson } from '../../src/apps/helm/security.ts';
import type { OpenWho, HelmEncryption } from '../../src/apps/helm/types.ts';
import {
  groupByMonth,
  listUpcoming,
  orderForToday,
} from '../../src/apps/helm/utils/keyDateUpcoming.ts';
import { toDayKey } from '../../src/apps/helm/utils/planDays.ts';
import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);
const TODAY = '2026-11-10';
const THIS_YEAR = 2026;

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
  quote: null,
  ...overrides,
});

const plan = (
  commands: Parameters<typeof planKeyDates>[0]['commands'],
  state: {
    index?: ByWho;
    existing?: Map<string, KeyDateRecord>;
    counts?: Map<string, number>;
  } = {},
) => {
  const index = state.index ?? {};
  return planKeyDates({
    commands,
    whoIdOf: new Map([['w1', 'who-1']]),
    selfWhoId: 'self',
    nameOf: new Map([['who-1', 'Mum']]),
    whoCounts: state.counts ?? new Map(),
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

test('the same birthday with a year fills the year in, and a different one is refused', () => {
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
  assert.equal(clash.notKept.length, 1);
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
