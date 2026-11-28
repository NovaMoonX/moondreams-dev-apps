import assert from 'node:assert/strict';

import {
  findStoreOrder,
  isOpenStoreAction,
  planStoreAction,
  splitOrderLines,
  takeOffLines,
  toOrderKey,
  type StoreAction,
} from '../../src/apps/runway/engine/storeOrders.ts';
import type { OpenPurchase, StoreEmail } from '../../src/apps/runway/types.ts';

const day = 86_400_000;
const base = 20_000 * day;
const make = (
  id: string,
  amountCents: number,
  dayOffset: number,
  extra: Partial<OpenPurchase> = {},
): OpenPurchase => ({
  id,
  date: base + dayOffset * day,
  source: 'link',
  status: 'posted',
  accountId: null,
  needsHome: false,
  expenseId: null,
  createdAt: base,
  updatedAt: base,
  amountCents,
  merchant: 'Target',
  label: null,
  note: null,
  lines: [{ envelopeId: 'home', cents: amountCents, via: 'chosen' }],
  refundOfId: null,
  paidByCardId: 'card',
  link: null,
  receiptText: null,
  costRef: null,
  notSameAs: null,
  incomeDayId: null,
  assignedBy: null,
  pairedWithId: null,
  pairKind: null,
  cardPaymentMoveId: null,
  tickedDayKey: null,
  emailEventId: null,
  emailWaiting: null,
  emailWaitUntil: null,
  wasPending: null,
  category: null,
  ruleId: null,
  storeEmail: null,
  orderLog: null,
  ...extra,
});
const order = (
  kind: StoreEmail['kind'],
  orderNumber: string | null,
  isWholeOrder = false,
): StoreEmail => ({
  kind,
  orderNumber,
  isWholeOrder,
  merchant: 'Target',
});
const actionOf = (purchase: OpenPurchase): StoreAction => ({
  id: purchase.id,
  storeEmail: purchase.storeEmail as StoreEmail,
  merchant: purchase.merchant,
  date: purchase.date,
  amountCents: purchase.amountCents,
});
const live = () => true;

// Order numbers compare without case or punctuation, and too short a number tells nothing.
assert.equal(toOrderKey('112-3344 556'), '1123344556');
assert.equal(toOrderKey('ab12'), 'AB12');
assert.equal(toOrderKey('A1'), null);
assert.equal(toOrderKey('ORDER'), null);

// A refund by order number finds its order and goes back to the envelope it counted in.
{
  const bought = make('o', 5000, 0, {
    source: 'manual',
    status: null,
    storeEmail: order('order', '112-3344'),
  });
  const refund = make('r', -2000, 5, {
    source: 'email',
    needsHome: true,
    lines: [{ envelopeId: null, cents: -2000, via: 'free' }],
    storeEmail: order('refund', '1123344'),
  });
  assert.equal(isOpenStoreAction(refund), true);
  const all = [bought, refund];
  assert.equal(findStoreOrder(actionOf(refund), all)?.id, 'o');
  const plan = planStoreAction(actionOf(refund), bought, all, live);
  assert.equal(plan?.kind, 'refund');
  assert.equal(plan?.kind === 'refund' && plan.bankId, null);
  assert.deepEqual(plan?.kind === 'refund' && plan.lines, [
    { envelopeId: 'home', cents: -2000, via: 'chosen' },
  ]);
  // An envelope that is gone makes it a tie for the person to place.
  assert.equal(
    planStoreAction(actionOf(refund), bought, all, () => false)?.kind,
    'tie',
  );
  // Once answered (tied, or the person's), it is not open again.
  assert.equal(isOpenStoreAction({ ...refund, refundOfId: 'o' }), false);
  assert.equal(isOpenStoreAction({ ...refund, assignedBy: 'person' }), false);
}

// A refund without a number applies only when exactly one purchase from the store fits within 60 days.
{
  const refund = make('r', -1500, 30, {
    source: 'email',
    needsHome: true,
    storeEmail: order('refund', null),
  });
  const one = make('a', 4000, 0);
  assert.equal(findStoreOrder(actionOf(refund), [one, refund])?.id, 'a');
  const two = make('b', 2000, 10);
  assert.equal(findStoreOrder(actionOf(refund), [one, two, refund]), null);
  const old = make('c', 4000, -40);
  assert.equal(findStoreOrder(actionOf(refund), [old, refund]), null);
  const elsewhere = make('d', 4000, 0, { merchant: 'Walmart' });
  assert.equal(findStoreOrder(actionOf(refund), [elsewhere, refund]), null);
  const tooSmall = make('e', 1000, 0);
  assert.equal(findStoreOrder(actionOf(refund), [tooSmall, refund]), null);
}

// A cancellation of an order the bank has not charged comes off the order, in proportion to its lines.
{
  const bought = make('o', 6000, 0, {
    source: 'email',
    status: null,
    lines: [
      { envelopeId: 'home', cents: 4000, via: 'chosen' },
      { envelopeId: null, cents: 2000, via: 'free' },
    ],
    storeEmail: order('order', 'W-90011'),
  });
  const cancel = make('x', -3000, 1, {
    source: 'email',
    needsHome: true,
    storeEmail: order('cancel', 'W90011'),
  });
  const plan = planStoreAction(
    actionOf(cancel),
    bought,
    [bought, cancel],
    live,
  );
  assert.equal(plan?.kind, 'takeOff');
  if (plan?.kind === 'takeOff') {
    assert.equal(plan.amountCents, 3000);
    assert.deepEqual(
      plan.lines.map((line) => line.cents),
      [2000, 1000],
    );
  }
  // A whole-order cancellation with no amount takes all that is left.
  const whole: StoreAction = {
    id: 'ev',
    storeEmail: order('cancel', 'W90011', true),
    merchant: null,
    date: base,
    amountCents: null,
  };
  const wholePlan = planStoreAction(whole, bought, [bought], live);
  assert.equal(wholePlan?.kind === 'takeOff' && wholePlan.amountCents, 0);
  // Once the bank has charged it, a cancellation comes back as a refund instead.
  const charged = {
    ...bought,
    source: 'link' as const,
    status: 'posted' as const,
  };
  const bankBack = make('bb', -3000, 2, { needsHome: true });
  assert.equal(
    planStoreAction(
      actionOf(cancel),
      charged,
      [charged, cancel, bankBack],
      live,
    )?.kind,
    'refund',
  );
}

// Lines always add up after taking off, rounding included.
{
  const lines = takeOffLines(
    [
      { envelopeId: 'a', cents: 333, via: 'chosen' },
      { envelopeId: 'b', cents: 333, via: 'chosen' },
      { envelopeId: 'c', cents: 334, via: 'chosen' },
    ],
    100,
  );
  assert.equal(
    (lines ?? []).reduce((sum, line) => sum + line.cents, 0),
    900,
  );
}

// A refund larger than what is left of the order is not applied.
{
  const bought = make('o', 5000, 0, { storeEmail: order('order', '55501') });
  const earlier = make('r1', -4000, 2, {
    refundOfId: 'o',
    storeEmail: order('refund', '55501'),
  });
  const refund = make('r2', -2000, 4, {
    source: 'email',
    needsHome: true,
    storeEmail: order('refund', '55501'),
  });
  assert.equal(
    planStoreAction(actionOf(refund), bought, [bought, earlier, refund], live),
    null,
  );
}

// The same order number from another store is not this order.
{
  const bought = make('o', 5000, 0, { storeEmail: order('order', '1042') });
  const refund = make('r', -1000, 2, {
    source: 'email',
    needsHome: true,
    merchant: 'Glossier',
    storeEmail: order('refund', '1042'),
  });
  assert.equal(findStoreOrder(actionOf(refund), [bought, refund]), null);
  // A cancellation with no store named is never tied by number alone.
  assert.equal(
    findStoreOrder({ ...actionOf(refund), merchant: null }, [bought, refund]),
    null,
  );
}

// An emailed order still waiting for its bank holds a refund, and holds a cancellation while a bank charge may be it.
{
  const waiting = make('o', 5000, 0, {
    source: 'email',
    status: null,
    emailWaiting: true,
    emailWaitUntil: null,
    wasPending: null,
    storeEmail: order('order', '77001'),
  });
  const refund = make('r', -1000, 2, {
    source: 'email',
    needsHome: true,
    storeEmail: order('refund', '77001'),
  });
  assert.equal(
    planStoreAction(actionOf(refund), waiting, [waiting, refund], live),
    null,
  );
  const charge = make('b', 5000, 1, { paidByCardId: 'card', needsHome: true });
  const cancel = make('x', -1000, 2, {
    source: 'email',
    needsHome: true,
    storeEmail: order('cancel', '77001'),
  });
  assert.equal(
    planStoreAction(actionOf(cancel), waiting, [waiting, charge, cancel], live),
    null,
  );
  assert.equal(
    planStoreAction(actionOf(cancel), waiting, [waiting, cancel], live)?.kind,
    'takeOff',
  );
  // The same cancellation logged already is not taken off twice.
  const logged = {
    ...waiting,
    orderLog: [
      {
        kind: 'cancel' as const,
        cents: 1000,
        on: cancel.date,
        emailEventId: 'e1',
        purchaseId: null,
        undoneAt: null,
      },
    ],
  };
  assert.equal(
    planStoreAction(actionOf(cancel), logged, [logged, cancel], live),
    null,
  );
  // An order whose only envelope is gone takes nothing off.
  assert.equal(
    planStoreAction(actionOf(cancel), waiting, [waiting, cancel], () => false),
    null,
  );
}

// At Link, a refund email places the bank's own refund, and waits until that refund arrives.
{
  const bought = make('o', 5000, 0, { storeEmail: order('order', '88002') });
  const email = make('r', -2000, 5, {
    source: 'email',
    needsHome: true,
    lines: [],
    storeEmail: order('refund', '88002'),
  });
  assert.equal(
    planStoreAction(actionOf(email), bought, [bought, email], live),
    null,
  );
  const bank = make('b', -2000, 7, {
    needsHome: true,
    lines: [{ envelopeId: null, cents: -2000, via: 'free' }],
  });
  const plan = planStoreAction(
    actionOf(email),
    bought,
    [bought, email, bank],
    live,
  );
  assert.equal(plan?.kind, 'refund');
  assert.equal(plan?.kind === 'refund' && plan.bankId, 'b');
}

// An order that posted as several charges carries its store email on each, so a refund by number finds several and waits for the person.
{
  const charge = (id: string, cents: number) =>
    make(id, cents, 3, { storeEmail: order('order', 'A-1234-5678') });
  const refund = make('r', -1000, 8, {
    needsHome: true,
    storeEmail: order('refund', 'A-1234-5678'),
    lines: [],
  });
  assert.equal(
    findStoreOrder(actionOf(refund), [
      charge('c1', 6_000),
      charge('c2', 4_000),
      refund,
    ]),
    null,
    'two charges with the order number are never tied to one',
  );
  assert.equal(
    findStoreOrder(actionOf(refund), [charge('c1', 10_000), refund])?.id,
    'c1',
    'one charge with the number is found',
  );
}

// An order that posted as several charges shares its lines among them, each charge's lines adding up to its own amount.
{
  const orderLines = [
    { envelopeId: 'food', cents: 7_001, via: 'chosen' as const },
    { envelopeId: 'home', cents: 2_999, via: 'chosen' as const },
    { envelopeId: null, cents: 1, via: 'free' as const },
  ];
  const total = (lines: { cents: number }[]) =>
    lines.reduce((sum, line) => sum + line.cents, 0);
  const charges = [6_000, 2_500, 1_501];
  const shares = splitOrderLines(orderLines, charges);
  assert.ok(shares, 'a split is found');
  assert.deepEqual(
    shares.map(total),
    charges,
    'each charge’s lines add up to it',
  );
  assert.deepEqual(
    ['food', 'home', null].map((envelopeId) =>
      total(shares.flat().filter((line) => line.envelopeId === envelopeId)),
    ),
    [7_001, 2_999, 1],
    'together they are the order’s lines exactly',
  );
  assert.ok(
    shares.every((share) => share.every((line) => line.cents > 0)),
    'a line that takes nothing is left out',
  );
  assert.deepEqual(
    splitOrderLines(orderLines, [6_000, 2_500, 1_501]),
    shares,
    'the same answer every time',
  );
  assert.deepEqual(
    splitOrderLines(
      [{ envelopeId: 'food', cents: 5_000, via: 'chosen' }],
      [2_000, 3_000],
    )?.map(total),
    [2_000, 3_000],
    'one line splits across charges',
  );
  assert.equal(
    splitOrderLines([], [2_000, 3_000]),
    null,
    'no lines cannot cover charges',
  );
}

console.log('runwayStoreOrders: ok');
