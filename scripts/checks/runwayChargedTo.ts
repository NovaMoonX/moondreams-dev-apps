import assert from 'node:assert/strict';

import {
  findChargedToHints,
  type ChargedPlace,
  type ChargedToBill,
} from '../../src/apps/runway/engine/chargedTo.ts';
import { DAY_MS } from '../../src/apps/runway/engine/dates.ts';
import type { OpenPurchase } from '../../src/apps/runway/types.ts';

const today = Date.UTC(2026, 10, 9);
const at = (offset: number) => today + offset * DAY_MS;

const discover: ChargedPlace = { kind: 'card', id: 'discover' };
const venture: ChargedPlace = { kind: 'card', id: 'venture' };

const bill = (over: Partial<ChargedToBill> = {}): ChargedToBill => ({
  id: 'netflix',
  name: 'Netflix',
  merchantKeys: [],
  place: null,
  isExplicit: false,
  payments: [
    { dueOn: at(-33), lowCents: 1_599, highCents: 1_599 },
    { dueOn: at(-3), lowCents: 1_599, highCents: 1_599 },
  ],
  ...over,
});

const charge = (
  id: string,
  on: number,
  over: Partial<OpenPurchase> = {},
): OpenPurchase =>
  ({
    id,
    date: on,
    source: 'link',
    status: 'posted',
    accountId: 'card-account',
    amountCents: 1_599,
    merchant: 'NETFLIX.COM',
    bankName: null,
    paidByCardId: 'discover',
    costRef: null,
    billRef: null,
    incomeDayId: null,
    pairedWithId: null,
    ...over,
  }) as OpenPurchase;

const find = (
  bills: ChargedToBill[],
  purchases: OpenPurchase[],
  over: { isLinkHistory?: boolean; open?: boolean } = {},
) =>
  findChargedToHints({
    today,
    bills,
    purchases,
    isLinkHistory: () => over.isLinkHistory ?? false,
    isOpenPlace: () => over.open ?? true,
  });

const [one] = find([bill()], [charge('a', at(-3))]);
assert.deepEqual(one, {
  billId: 'netflix',
  place: discover,
  chargeCount: 1,
  lastChargedOn: at(-3),
});

assert.equal(
  find([bill({ place: venture, isExplicit: true })], [charge('a', at(-3))])
    .length,
  0,
  'a bill that names a card needs more than one charge elsewhere',
);
const [two] = find(
  [bill({ place: venture, isExplicit: true })],
  [charge('a', at(-3)), charge('b', at(-33))],
);
assert.equal(two.chargeCount, 2);
assert.equal(two.lastChargedOn, at(-3));
assert.equal(
  find(
    [bill({ place: venture, isExplicit: true })],
    [charge('a', at(-3)), charge('b', at(-33), { paidByCardId: 'venture' })],
  ).length,
  0,
  'the second newest charge on the bill’s own card is not agreement',
);

assert.equal(find([bill()], [charge('a', at(-90))]).length, 0, 'too old');
assert.equal(
  find([bill()], [charge('a', at(-3), { amountCents: 5_000 })]).length,
  0,
  'amount far from the payment',
);
assert.equal(
  find([bill()], [charge('a', at(-3), { amountCents: 1_700 })]).length,
  1,
  'amount inside the margin',
);
assert.equal(
  find([bill()], [charge('a', at(-18))]).length,
  0,
  'far from any payment',
);
assert.equal(
  find([bill()], [charge('a', at(-3), { merchant: 'HULU' })]).length,
  0,
  'named like another bill',
);
assert.equal(
  find([bill()], [charge('a', at(-3), { status: 'pending' })]).length,
  0,
);
assert.equal(
  find([bill()], [charge('a', at(-3))], { isLinkHistory: true }).length,
  0,
);

const matched = charge('a', at(-3), {
  paidByCardId: 'venture',
  billRef: { billId: 'netflix', dueOn: at(-3), moveId: 'm1' },
});
assert.equal(
  find(
    [bill({ place: venture, isExplicit: true })],
    [matched, charge('b', at(-40))],
  ).length,
  0,
  'a matched charge on the bill’s own card is newest',
);
assert.equal(
  find(
    [bill()],
    [
      charge('a', at(-60), {
        merchant: 'OTHER',
        billRef: { billId: 'netflix', dueOn: at(-60), moveId: 'm2' },
      }),
    ],
  ).length,
  1,
  'a matched charge counts whatever it is named',
);

assert.equal(
  find([bill()], [charge('a', at(-3))], { open: false }).length,
  0,
  'an archived card is never suggested',
);

const [account] = find(
  [bill({ place: venture })],
  [charge('a', at(-3), { paidByCardId: null, accountId: 'checking' })],
);
assert.deepEqual(account.place, { kind: 'account', id: 'checking' });
assert.equal(
  find([bill()], [charge('a', at(-3), { paidByCardId: null, accountId: null })])
    .length,
  0,
  'a charge with no place says nothing',
);

console.log('runway charged to: ok');
