import assert from 'node:assert/strict';

import {
  findAutoChecks,
  findAutoMarks,
  findChargeMatches,
  getMatchedKeys,
  getPaymentKey,
  getUndoneDueDays,
  isAutoBill,
  rankChargeCandidates,
  type AutoBill,
  type AutoPayment,
} from '../../src/apps/runway/engine/autoPay.ts';
import { DAY_MS } from '../../src/apps/runway/engine/dates.ts';
import { lookahead } from '../../src/apps/runway/engine/lookahead.ts';
import type { PaidPayment } from '../../src/apps/runway/engine/progress.ts';
import type { OpenMove, OpenPurchase } from '../../src/apps/runway/types.ts';

const today = Date.UTC(2026, 10, 9);
const at = (offset: number) => today + offset * DAY_MS;

const pay = (
  dueOn: number,
  low: number,
  high = low,
  paid: PaidPayment | null = null,
): AutoPayment => ({ dueOn, lowCents: low, highCents: high, paid });
const mark = (
  dueOn: number,
  amountCents: number,
  auto: PaidPayment['auto'] = null,
): PaidPayment => ({
  moveId: `paid_${dueOn}`,
  dueOn,
  amountCents,
  paidOn: dueOn,
  fromFreeCents: 0,
  cardId: null,
  auto,
});
const bill = (over: Partial<AutoBill> = {}): AutoBill => ({
  id: 'netflix',
  name: 'Netflix',
  since: at(-60),
  cardId: 'venture',
  accountId: null,
  merchantKeys: [],
  payments: [pay(at(-1), 1_599)],
  undoneDueOn: [],
  ...over,
});
const charge = (
  id: string,
  cents: number,
  on: number,
  over: Partial<OpenPurchase> = {},
): OpenPurchase =>
  ({
    id,
    date: on,
    source: 'link',
    status: 'posted',
    accountId: 'card-account',
    needsHome: true,
    expenseId: null,
    createdAt: on,
    updatedAt: on,
    amountCents: cents,
    merchant: 'NETFLIX.COM',
    bankName: null,
    merchantLogo: null,
    category: null,
    ruleId: null,
    label: null,
    note: null,
    lines: [{ envelopeId: null, cents, via: 'free' }],
    refundOfId: null,
    paidByCardId: 'venture',
    link: null,
    receiptText: null,
    costRef: null,
    billRef: null,
    notSameAs: null,
    incomeDayId: null,
    assignedBy: null,
    pairedWithId: null,
    pairKind: null,
    cardPaymentMoveId: null,
    tickedDayKey: null,
    ...over,
  }) as OpenPurchase;

// The setting counts only from Track up.
assert.equal(isAutoBill({ paysItself: true }, 'plan'), false);
assert.equal(isAutoBill({ paysItself: true }, 'track'), true);
assert.equal(isAutoBill({ paysItself: null }, 'link'), false);
assert.equal(isAutoBill({}, 'link'), false);

// Auto marks: due, unpaid, tracked, never undone; a ranged bill records the top and is an estimate.
{
  const marks = findAutoMarks({ level: 'track', today, bills: [bill()] });
  assert.deepEqual(marks, [
    {
      billId: 'netflix',
      billName: 'Netflix',
      dueOn: at(-1),
      amountCents: 1_599,
      isEstimate: false,
      cardId: 'venture',
    },
  ]);
  assert.equal(
    findAutoMarks({ level: 'plan', today, bills: [bill()] }).length,
    0,
  );
  const ranged = findAutoMarks({
    level: 'track',
    today,
    bills: [bill({ payments: [pay(at(-1), 8_000, 12_000)] })],
  });
  assert.equal(ranged[0].amountCents, 12_000, 'a range records its top');
  assert.equal(ranged[0].isEstimate, true);
  assert.equal(
    findAutoMarks({
      level: 'track',
      today,
      bills: [bill({ payments: [pay(at(2), 1_599)] })],
    }).length,
    0,
    'not before the due day',
  );
  assert.equal(
    findAutoMarks({
      level: 'track',
      today,
      bills: [
        bill({ payments: [pay(at(-1), 1_599, 1_599, mark(at(-1), 1_599))] }),
      ],
    }).length,
    0,
    'already paid',
  );
  assert.equal(
    findAutoMarks({
      level: 'track',
      today,
      bills: [bill({ payments: [pay(at(-90), 1_599)] })],
    }).length,
    0,
    'before tracking began',
  );
  assert.equal(
    findAutoMarks({
      level: 'track',
      today,
      bills: [bill({ undoneDueOn: [at(-1)] })],
    }).length,
    0,
    'an automatic mark that was taken back is never written again',
  );
  assert.equal(
    findAutoMarks({ level: 'link', today, bills: [bill({ cardId: null })] })
      .length,
    0,
    'a bank-paid bill at Link waits for its charge',
  );
  assert.equal(
    findAutoMarks({ level: 'track', today, bills: [bill({ cardId: null })] })[0]
      .cardId,
    null,
    'a bank-paid bill at Track is marked with no card',
  );
  assert.equal(
    findAutoMarks({ level: 'link', today, bills: [bill()] }).length,
    1,
    'a card-paid bill at Link is marked',
  );
}

// Undone marks are read from the moves.
{
  const move = (id: string, reverses: string | null, due: number) =>
    ({
      id,
      kind: 'billPaid',
      date: due,
      refId: 'netflix',
      reversesMoveId: reverses,
      createdAt: 1,
      payload: {},
    }) as unknown as OpenMove;
  assert.deepEqual(
    getUndoneDueDays([
      move('a', null, at(-1)),
      move('unpaid_a', 'a', at(-1)),
      move('b', null, at(-31)),
    ]),
    { netflix: [at(-1)] },
  );
}

// The due list leaves out a bill that pays itself, unless its mark was taken back.
{
  const base = {
    today,
    horizon: at(365),
    days: [],
    payments: {
      netflix: [
        {
          dueOn: at(-1),
          totalCents: 1_599,
          parts: [],
          ranged: null,
          fundedCents: 0,
          fundedDays: 0,
          heldNowCents: 0,
          heldMostCents: 0,
          paid: null,
        },
      ],
    },
    draftOf: () => null,
  };
  const bills = (extra: object) => [
    {
      id: 'netflix',
      name: 'Netflix',
      since: at(-60),
      isUndated: false,
      ...extra,
    },
  ];
  assert.equal(lookahead({ ...base, bills: bills({}) }).due.length, 1);
  assert.equal(
    lookahead({ ...base, bills: bills({ paysItself: true }) }).due.length,
    0,
    'a bill that pays itself is not to pay',
  );
  assert.equal(
    lookahead({
      ...base,
      bills: bills({ paysItself: true, undoneDueOn: [at(-1)] }),
    }).due.length,
    1,
    'a payment whose automatic mark was taken back is the person’s again',
  );
}

// Charge matches.
{
  const input = {
    level: 'link' as const,
    today,
    bills: [bill()],
    pullAccountId: null,
    matched: new Set<string>(),
  };
  const one = charge('c1', 1_599, at(-1));
  assert.deepEqual(
    findChargeMatches({ ...input, waiting: [one] }).map((m) => m.purchase.id),
    ['c1'],
    'named like the bill, on its card, exact amount, on the due day',
  );
  assert.equal(
    findChargeMatches({ ...input, level: 'track', waiting: [one] }).length,
    0,
    'matching is Link only',
  );
  assert.equal(
    findChargeMatches({ ...input, waiting: [charge('c', 1_598, at(-1))] })
      .length,
    0,
    'an exact bill needs the exact amount',
  );
  assert.equal(
    findChargeMatches({ ...input, waiting: [charge('c', 1_599, at(-5))] })
      .length,
    0,
    'more than three days from the due day',
  );
  assert.equal(
    findChargeMatches({ ...input, waiting: [charge('c', 1_599, at(2))] })
      .length,
    1,
    'three days either side counts (a day after here)',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      waiting: [charge('c', 1_599, at(-1), { paidByCardId: 'other' })],
    }).length,
    0,
    'another card',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      waiting: [charge('c', 1_599, at(-1), { merchant: 'Safeway' })],
    }).length,
    0,
    'a merchant that is not the bill',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      waiting: [charge('c', 1_599, at(-1), { status: 'pending' })],
    }).length,
    0,
    'a pending charge may still change',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      waiting: [charge('c', 1_599, at(-1), { needsHome: false })],
    }).length,
    0,
    'only a charge waiting for a home',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      waiting: [one, charge('c2', 1_599, at(0))],
    }).length,
    0,
    'two candidates for one payment is not clear',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      matched: getMatchedKeys([
        { billRef: { billId: 'netflix', dueOn: at(-1), moveId: 'm' } },
      ]),
      waiting: [one],
    }).length,
    0,
    'a payment that has a charge takes no second',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [bill({ undoneDueOn: [at(-1)] })],
      waiting: [one],
    }).length,
    0,
    'a payment the person took back is theirs',
  );
  // A range takes any amount inside it.
  const ranged = bill({ payments: [pay(at(-1), 8_000, 12_000)] });
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [ranged],
      waiting: [charge('c', 9_500, at(-1))],
    }).length,
    1,
  );
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [ranged],
      waiting: [charge('c', 12_001, at(-1))],
    }).length,
    0,
    'outside the range',
  );
  // A learned name decides, even when the bill's own name is not in the merchant.
  const learned = bill({ name: 'Streaming', merchantKeys: ['netflix com'] });
  assert.equal(
    findChargeMatches({ ...input, bills: [learned], waiting: [one] }).length,
    1,
  );
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [bill({ name: 'Streaming' })],
      waiting: [one],
    }).length,
    0,
    'nothing learned and the name does not say it',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [bill({ merchantKeys: ['hulu'] })],
      waiting: [one],
    }).length,
    0,
    'something learned that this charge does not carry',
  );
  // Two bills cannot share one charge.
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [bill(), bill({ id: 'netflix2' })],
      waiting: [one],
    }).length,
    0,
    'a charge two payments want is nobody’s',
  );
  // A bank-paid bill reads the account, or the plan's one pull account.
  const bank = bill({ cardId: null, accountId: 'checking' });
  const pulled = charge('p', 1_599, at(-1), {
    accountId: 'checking',
    paidByCardId: null,
  });
  assert.equal(
    findChargeMatches({ ...input, bills: [bank], waiting: [pulled] }).length,
    1,
  );
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [bill({ cardId: null })],
      waiting: [pulled],
    }).length,
    0,
    'no account and no pull account',
  );
  assert.equal(
    findChargeMatches({
      ...input,
      pullAccountId: 'checking',
      bills: [bill({ cardId: null })],
      waiting: [pulled],
    }).length,
    1,
    'the plan’s one pull account',
  );
  // A payment with an estimate is corrected by its charge.
  const estimated = bill({
    payments: [
      pay(
        at(-1),
        8_000,
        12_000,
        mark(at(-1), 12_000, { isEstimate: true, purchaseId: null }),
      ),
    ],
  });
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [estimated],
      waiting: [charge('c', 9_500, at(-1))],
    }).length,
    1,
  );
  // A mark the person made is left alone.
  assert.equal(
    findChargeMatches({
      ...input,
      bills: [
        bill({ payments: [pay(at(-1), 1_599, 1_599, mark(at(-1), 1_599))] }),
      ],
      waiting: [one],
    }).length,
    0,
  );
}

// The picker lists the card's charges, closest first.
{
  const payment = pay(at(-1), 8_000, 12_000);
  const list = rankChargeCandidates({
    bill: bill({ payments: [payment] }),
    payment,
    purchases: [
      charge('far', 20_000, at(-1)),
      charge('inside-late', 10_000, at(3)),
      charge('inside-on-time', 10_000, at(-1)),
      charge('just-out', 12_500, at(-1)),
      charge('too-early', 10_000, at(-8)),
      charge('too-late', 10_000, at(10)),
      charge('matched', 10_000, at(-1), {
        billRef: { billId: 'x', dueOn: at(-1), moveId: 'm' },
      }),
      charge('paired', 10_000, at(-1), { pairedWithId: 'q' }),
      charge('history', 10_000, at(-1)),
      charge('other-card', 10_000, at(-1), { paidByCardId: 'other' }),
      charge('typed', 10_000, at(-1), { source: 'manual' }),
    ],
    pullAccountId: null,
    isLinkHistory: (purchase) => purchase.id === 'history',
  }).map((purchase) => purchase.id);
  assert.deepEqual(list, ['inside-on-time', 'inside-late', 'just-out', 'far']);
}

// Questions: the amount at Track, the charge at Link.
{
  const estimate = mark(at(-1), 12_000, { isEstimate: true, purchaseId: null });
  const ranged = bill({
    payments: [pay(at(-1), 8_000, 12_000, estimate)],
  });
  const none = new Set<string>();
  const checks = (level: 'track' | 'link', b: AutoBill, snoozed = none) =>
    findAutoChecks({ level, today, bills: [b], matched: none, snoozed });
  assert.deepEqual(checks('track', ranged), [
    {
      kind: 'amount',
      billId: 'netflix',
      billName: 'Netflix',
      dueOn: at(-1),
      moveId: estimate.moveId,
    },
  ]);
  assert.equal(
    checks(
      'track',
      bill({
        payments: [
          pay(
            at(-1),
            1_599,
            1_599,
            mark(at(-1), 1_599, { isEstimate: false, purchaseId: null }),
          ),
        ],
      }),
    ).length,
    0,
    'an exact amount asks nothing at Track',
  );
  assert.equal(
    checks(
      'track',
      bill({
        payments: [
          pay(
            at(-1),
            8_000,
            12_000,
            mark(at(-1), 9_000, { isEstimate: false, purchaseId: 'c' }),
          ),
        ],
      }),
    ).length,
    0,
    'a corrected mark asks nothing',
  );
  assert.equal(
    checks('link', ranged).length,
    0,
    'under three days past due the charge may still come',
  );
  const late = bill({ payments: [pay(at(-3), 1_599)] });
  assert.deepEqual(
    checks('link', late).map((c) => c.kind),
    ['charge'],
  );
  assert.equal(
    checks('link', late, new Set([getPaymentKey('netflix', at(-3))])).length,
    0,
    'put off for a few days',
  );
  assert.equal(
    findAutoChecks({
      level: 'link',
      today,
      bills: [late],
      matched: getMatchedKeys([
        { billRef: { billId: 'netflix', dueOn: at(-3), moveId: 'm' } },
      ]),
      snoozed: none,
    }).length,
    0,
    'a payment with a charge asks nothing',
  );
  assert.equal(
    checks(
      'link',
      bill({
        payments: [
          pay(
            at(-3),
            1_599,
            1_599,
            mark(at(-3), 1_599, { isEstimate: false, purchaseId: null }),
          ),
        ],
      }),
    ).length,
    1,
    'a card mark with no charge still asks which charge it was',
  );
  assert.equal(
    checks('link', bill({ payments: [pay(at(-60), 1_599)], since: at(-90) }))
      .length,
    0,
    'a question stops being asked long after the due day',
  );
  assert.equal(checks('track', late).length, 0);
}

console.log('runway auto pay: ok');
