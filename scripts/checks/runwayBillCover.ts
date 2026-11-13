import assert from 'node:assert/strict';

import {
  BILL_COVER_DAYS,
  computeBillCover,
  getCoverThrough,
  getCoveredCents,
} from '../../src/apps/runway/engine/billCover.ts';
import { DAY_MS } from '../../src/apps/runway/engine/dates.ts';
import type { BillPayment } from '../../src/apps/runway/engine/demands.ts';
import { lookahead } from '../../src/apps/runway/engine/lookahead.ts';

const today = Date.UTC(2026, 10, 12);
const at = (offset: number) => today + offset * DAY_MS;

const payment = (
  dueOn: number,
  totalCents: number,
  over: Partial<BillPayment> = {},
): BillPayment =>
  ({
    dueOn,
    payOn: dueOn,
    totalCents,
    parts: [],
    ranged: null,
    isSavingUp: false,
    fundedCents: 0,
    fundedDays: 0,
    heldNowCents: 0,
    heldMostCents: 0,
    paid: null,
    ...over,
  }) as BillPayment;
const dated = (id: string) => ({ id, name: id, isDated: true });
const cover = (
  payments: Record<string, BillPayment[]>,
  freeToSpendCents: number,
  nextPayOn: number | null = at(14),
  bills = Object.keys(payments).map(dated),
) => computeBillCover({ today, bills, payments, nextPayOn, freeToSpendCents });

// The window is 30 days, or the next pay when that is further.
assert.equal(getCoverThrough(today, at(10)), at(BILL_COVER_DAYS));
assert.equal(getCoverThrough(today, at(45)), at(45));
assert.equal(getCoverThrough(today, null), at(BILL_COVER_DAYS));

// A bill its pays won't reach in time is covered from Free to Spend.
{
  const result = cover({ netflix: [payment(at(5), 1_599)] }, 50_000);
  assert.equal(result.coveredCents, 1_599);
  assert.equal(result.coveredByBill.netflix, 1_599);
  assert.equal(result.payments[0].shortCents, 0);
  assert.equal(getCoveredCents(result, 'netflix', at(5)), 1_599);
}

// Only the gap the pays and what is set aside leave is covered.
{
  const result = cover(
    {
      rent: [
        payment(at(20), 100_000, {
          fundedCents: 40_000,
          parts: [{ day: {} as never, cents: 50_000 }],
        }),
      ],
    },
    50_000,
  );
  assert.equal(result.coveredCents, 10_000, 'pays and set aside count first');
}

// A bill fully carried by its pays, paid, outside the window or undated takes nothing.
{
  const result = cover(
    {
      carried: [
        payment(at(5), 1_000, { parts: [{ day: {} as never, cents: 1_000 }] }),
      ],
      paid: [payment(at(5), 1_000, { paid: {} as never })],
      later: [payment(at(BILL_COVER_DAYS + 1), 1_000)],
      past: [payment(at(-1), 1_000)],
    },
    50_000,
  );
  assert.equal(result.coveredCents, 0);
  const undated = cover({ gym: [payment(at(5), 1_000)] }, 50_000, at(14), [
    { id: 'gym', name: 'gym', isDated: false },
  ]);
  assert.equal(
    undated.coveredCents,
    0,
    'a bill with no due date is not covered',
  );
}

// A pay further off than 30 days stretches the window to it.
assert.equal(
  cover({ later: [payment(at(40), 1_000)] }, 50_000, at(45)).coveredCents,
  1_000,
);

// When Free to Spend runs out, the plan's order decides: earlier bills in it first, then the earlier payment.
{
  const result = cover(
    {
      must: [payment(at(20), 3_000)],
      want: [payment(at(2), 3_000)],
    },
    4_000,
  );
  assert.deepEqual(
    result.payments.map((entry) => [
      entry.billId,
      entry.coveredCents,
      entry.shortCents,
    ]),
    [
      ['must', 3_000, 0],
      ['want', 1_000, 2_000],
    ],
  );
  const twice = cover(
    { weekly: [payment(at(9), 600), payment(at(2), 600)] },
    900,
  );
  assert.deepEqual(
    twice.payments.map((entry) => [entry.dueOn, entry.coveredCents]),
    [
      [at(2), 600],
      [at(9), 300],
    ],
    'the earlier payment of one bill first',
  );
}

// Nothing to cover with, or a negative Free to Spend, covers nothing and leaves every gap short.
{
  const result = cover({ netflix: [payment(at(5), 1_599)] }, -500);
  assert.equal(result.coveredCents, 0);
  assert.equal(result.payments[0].shortCents, 1_599);
}

// The lookahead stops warning about a payment Free to Spend covers, and warns only by what is left short.
{
  const base = {
    today,
    horizon: at(365),
    days: [],
    draftOf: () => null,
    bills: [
      { id: 'netflix', name: 'Netflix', since: at(-60), isUndated: false },
    ],
    payments: { netflix: [payment(at(5), 1_599)] },
  };
  assert.equal(lookahead(base).problems.length, 1, 'uncovered, it warns');
  const covered = cover(base.payments, 50_000);
  assert.equal(lookahead({ ...base, billCover: covered }).problems.length, 0);
  const part = cover(base.payments, 1_000);
  const [problem] = lookahead({ ...base, billCover: part }).problems;
  assert.equal(problem.kind, 'noIncome');
  assert.equal(problem.kind === 'noIncome' && problem.shortBy, 599);
}

console.log('runway bill cover: ok');
