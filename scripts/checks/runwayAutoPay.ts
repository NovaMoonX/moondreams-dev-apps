import assert from 'node:assert/strict';

import {
  findAutoChecks,
  findAutoMarks,
  findBillCandidateIds,
  findChargeMatches,
  getMatchedKeys,
  getPaymentKey,
  getPaysItselfFrom,
  getUndoneDueDays,
  isAutoBill,
  isSelfPaying,
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

const paymentRows = (dueDays: number[]) =>
  dueDays.map((dueOn) => ({
    dueOn,
    totalCents: 1_599,
    parts: [],
    ranged: null,
    fundedCents: 0,
    fundedDays: 0,
    heldNowCents: 0,
    heldMostCents: 0,
    paid: null,
  }));

// A bill that starts paying itself never back-pays: the cutoff is the day the setting was turned on.
{
  const version = (createdAt: number, paysItself: boolean) => ({
    createdAt,
    payload: { paysItself },
  });
  assert.equal(
    getPaysItselfFrom([
      version(at(-40), false),
      version(at(-3) + 5_000, true),
      version(at(-3) + 5_000, true),
      version(at(-1), true),
    ]),
    at(-3),
    'the earliest version of the newest unbroken run, by the day it was written',
  );
  assert.equal(
    getPaysItselfFrom([
      version(at(-40), true),
      version(at(-20), false),
      version(at(-2), true),
    ]),
    at(-2),
    'turned off and on again starts a new run',
  );
  assert.equal(
    getPaysItselfFrom([version(at(-40), true), version(at(-2), false)]),
    null,
    'a bill whose newest version has it off has no cutoff',
  );
  const cut = bill({
    since: at(-3),
    payments: [pay(at(-5), 1_599), pay(at(-1), 1_599)],
  });
  assert.deepEqual(
    findAutoMarks({ level: 'track', today, bills: [cut] }).map((m) => m.dueOn),
    [at(-1)],
    'a payment due before the setting was turned on is not marked',
  );
  assert.deepEqual(
    findAutoChecks({
      level: 'link',
      today,
      bills: [cut],
      matched: new Set(),
      snoozed: new Set(),
    }).map((entry) => entry.dueOn),
    [],
    'nor asked about',
  );
  assert.equal(
    findChargeMatches({
      level: 'link',
      today,
      bills: [cut],
      waiting: [charge('old', 1_599, at(-5))],
      pullAccountId: null,
      matched: new Set(),
    }).length,
    0,
    'nor matched to a charge',
  );
  const due = lookahead({
    today,
    horizon: at(365),
    days: [],
    payments: { netflix: paymentRows([at(-5), at(-1)]) },
    draftOf: () => null,
    bills: [
      {
        id: 'netflix',
        name: 'Netflix',
        since: at(-60),
        isUndated: false,
        paysItself: true,
        paysItselfFrom: at(-3),
      },
    ],
  }).due;
  assert.deepEqual(
    due.map((entry) => entry.dueOn),
    [at(-5)],
    'the payment before the cutoff stays the person’s to mark',
  );
}

// At Link, an unmarked payment past the asking window goes back to the person.
{
  const due = lookahead({
    today,
    horizon: at(365),
    days: [],
    payments: { netflix: paymentRows([at(-50), at(-10)]) },
    draftOf: () => null,
    bills: [
      {
        id: 'netflix',
        name: 'Netflix',
        since: at(-90),
        isUndated: false,
        paysItself: true,
        isAtLink: true,
      },
    ],
  }).due;
  assert.deepEqual(
    due.map((entry) => entry.dueOn),
    [at(-50)],
    'the 50 day old payment is to pay; the 10 day old one is still the app’s to settle',
  );
  assert.equal(
    isSelfPaying({ paysItself: true, isAtLink: true }, at(-50), today),
    false,
  );
  assert.equal(
    isSelfPaying({ paysItself: true, isAtLink: false }, at(-50), today),
    true,
  );
}

// A charge a bill's open payment could take is held back from rules.
{
  const input = {
    level: 'link' as const,
    today,
    bills: [bill()],
    pullAccountId: null,
    matched: new Set<string>(),
  };
  assert.deepEqual(
    [
      ...findBillCandidateIds({
        ...input,
        waiting: [charge('c1', 1_599, at(-1))],
      }),
    ],
    ['c1'],
  );
  assert.equal(
    findBillCandidateIds({
      ...input,
      waiting: [charge('wrongCard', 1_599, at(-1), { paidByCardId: 'other' })],
    }).size,
    0,
    'another card is not a candidate',
  );
  assert.equal(
    findBillCandidateIds({ ...input, waiting: [charge('big', 4_000, at(-1))] })
      .size,
    0,
    'an amount outside the bill is not a candidate',
  );
  assert.equal(
    findBillCandidateIds({
      ...input,
      waiting: [charge('late', 1_599, at(-20))],
    }).size,
    0,
    'a day far from the due day is not a candidate',
  );
  assert.equal(
    findBillCandidateIds({
      ...input,
      matched: new Set([getPaymentKey('netflix', at(-1))]),
      waiting: [charge('c1', 1_599, at(-1))],
    }).size,
    0,
    'a payment that already has a charge holds nothing',
  );
}

// Only a mark the person took back counts: a correction or a match writes a later mark.
{
  const move = (
    id: string,
    reverses: string | null,
    due: number,
    createdAt: number,
  ) =>
    ({
      id,
      kind: 'billPaid',
      date: due,
      refId: 'netflix',
      reversesMoveId: reverses,
      createdAt,
      payload: {},
    }) as unknown as OpenMove;
  assert.deepEqual(
    getUndoneDueDays([
      move('m1', null, at(-1), 10),
      move('unpaid_m1', 'm1', at(-1), 20),
      move('m2', null, at(-1), 20),
    ]),
    {},
    'an undo followed by a new mark is a correction',
  );
  assert.deepEqual(
    getUndoneDueDays([
      move('m1', null, at(-1), 10),
      move('unpaid_m1', 'm1', at(-1), 20),
      move('m2', null, at(-1), 20),
      move('unpaid_m2', 'm2', at(-1), 30),
    ]),
    { netflix: [at(-1)] },
    'the newest mark taken back is the person’s',
  );
}

console.log('runway auto pay: ok');
