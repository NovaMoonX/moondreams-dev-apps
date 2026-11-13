import assert from 'node:assert/strict';

import {
  getCalendarCents,
  isOnFundingPay,
  scopeToSource,
} from '../../src/apps/runway/engine/calendar.ts';
import { getIncomeDaysPerMonth } from '../../src/apps/runway/engine/groups.ts';
import type { Schedule } from '../../src/apps/runway/types.ts';
import { describeChange } from '../../src/apps/runway/utils/changeText.ts';
import { describeFunding } from '../../src/apps/runway/utils/fundingText.ts';

{
  const day = (line: string, y: number, m: number, d: number) => ({
    dayKey: `${line}_${String(y)}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`,
    on: Date.UTC(y, m, d),
    sourceId: 'work',
  });
  const payDays = [
    day('semi', 2026, 10, 15),
    day('semi', 2026, 10, 30),
    day('semi', 2026, 11, 15),
    day('semi', 2026, 11, 31),
    day('side', 2026, 10, 20),
  ];
  assert.deepEqual(
    scopeToSource({ pay: { payLineId: 'semi', monthDay: 30 } }, payDays).map(
      (entry) => entry.on,
    ),
    [Date.UTC(2026, 10, 30)],
    'a rule from the pay on the 30th counts only that pay, not the 31st of a longer month',
  );
  assert.equal(
    isOnFundingPay(day('semi', 2027, 1, 28), {
      payLineId: 'semi',
      monthDay: 30,
    }),
    true,
    'the pay on the 30th lands on February 28th',
  );
  assert.deepEqual(
    scopeToSource({ pay: { payLineId: 'semi', monthDay: null } }, payDays)
      .length,
    4,
    'a pay line with no day named counts every one of its pays',
  );
  assert.deepEqual(
    scopeToSource({ sourceId: null, pay: null }, payDays).length,
    5,
    'a rule with no pay counts every pay',
  );
  const monthly = getCalendarCents(
    {
      amount: { kind: 'exact', cents: 30_000 },
      cadence: { kind: 'calendar', period: 'monthly', startsOn: null },
      pay: { payLineId: 'semi', monthDay: 15 },
    },
    payDays,
  );
  assert.deepEqual(
    payDays.map((entry) => monthly?.get(entry.dayKey) ?? 0),
    [30_000, 0, 30_000, 0, 0],
    'a monthly envelope from the pay on the 15th takes the whole month from that pay',
  );
}

{
  const pay = { payLineId: 'work', monthDay: 30 };
  const rule = {
    amount: { kind: 'exact', cents: 5_000 },
    cadence: { kind: 'everyIncomeDay' },
  } as const;
  assert.equal(
    describeFunding({ ...rule, pay }, [], 'envelope', []),
    '$50.00 every income day from the pay on the 30th',
  );
  assert.equal(
    describeFunding(
      { ...rule, pay: { payLineId: 'gone', monthDay: null } },
      [],
      'envelope',
      [],
    ),
    '$50.00 every income day from a pay that is no longer in the plan',
  );
  assert.equal(
    describeFunding({ ...rule, pay }),
    '$50.00 every income day',
    'without the plan the row stays as it was',
  );
  const envelope = (funding: object) =>
    ({
      name: 'Groceries',
      emoji: null,
      priority: 'must',
      orderIndex: 1,
      funding,
      groupId: null,
    }) as never;
  const namer = () => 'the pay on the 30th';
  assert.equal(
    describeChange(
      envelope(rule),
      envelope({ ...rule, pay }),
      () => '',
      undefined,
      namer,
    ),
    'Comes out of every pay to the pay on the 30th',
  );
  assert.equal(
    describeChange(
      envelope({ ...rule, pay }),
      envelope({ ...rule, pay: null }),
      () => '',
      undefined,
      namer,
    ),
    'Comes out of the pay on the 30th to every pay',
  );
  assert.equal(
    describeChange(envelope(rule), envelope({ ...rule, pay: null }), () => ''),
    '',
    'an unset pay and none are the same',
  );
}

{
  const utc = (year: number, month: number, day: number) =>
    Date.UTC(year, month - 1, day);
  const line = (kind: Schedule['kind'], payLineId: string) => ({
    sourceId: 'job-a',
    payLineId,
    schedule: { kind, anchor: utc(2026, 1, 1), monthDays: [] } as Schedule,
    startsOn: utc(2026, 1, 1),
    ending: { onDate: null, afterCount: null },
  });
  const lines = [line('twiceMonthly', 'work'), line('weekly', 'side')];
  const nov = utc(2026, 11, 14);
  assert.equal(
    getIncomeDaysPerMonth(lines, nov, null, {
      payLineId: 'work',
      monthDay: 15,
    }),
    1,
    'a rule tied to the pay on the 15th counts one income day a month, not every pay',
  );
  assert.equal(
    getIncomeDaysPerMonth(lines, nov, null, {
      payLineId: 'work',
      monthDay: null,
    }),
    2,
    'a rule tied to one pay line with no day counts only that line',
  );
}

console.log('runway funding pay: ok');
