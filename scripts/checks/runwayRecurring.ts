import assert from 'node:assert/strict';

import {
  findRecurringHints,
  type RecurringBill,
  type RecurringProviderAccount,
  type RecurringStreamInput,
} from '../../src/apps/runway/engine/recurring.ts';
import type { RecurringStream } from '../../src/apps/runway/types.ts';

const placed: RecurringProviderAccount = {
  linkId: 'link',
  providerAccountId: 'checking',
  name: 'Checking',
  mask: '1234',
  isPlaced: true,
  isLinkActive: true,
};
const unplaced: RecurringProviderAccount = {
  ...placed,
  providerAccountId: 'savings',
  name: 'Savings',
  isPlaced: false,
};

const bill = (over: Partial<RecurringBill> = {}): RecurringBill => ({
  id: 'netflix',
  name: 'Netflix',
  merchantKeys: [],
  amount: { lowCents: 1_599, highCents: 1_599 },
  isCardFee: false,
  ...over,
});

const stream = (over: Partial<RecurringStream> = {}): RecurringStream => ({
  streamId: 's1',
  providerAccountId: 'checking',
  description: 'NETFLIX.COM',
  merchantName: 'Netflix',
  frequency: 'monthly',
  averageCents: 1_599,
  lastCents: 1_599,
  firstOn: Date.UTC(2026, 0, 5),
  lastOn: Date.UTC(2026, 9, 5),
  nextOn: Date.UTC(2026, 10, 5),
  status: 'mature',
  isActive: true,
  category: 'ENTERTAINMENT_TV_AND_MOVIES',
  ...over,
});

const input = (
  over: Partial<RecurringStream> = {},
  providerAccount = placed,
): RecurringStreamInput => ({
  stream: stream(over),
  place: providerAccount.isPlaced ? { kind: 'account', id: 'acc' } : null,
  providerAccount,
});

const find = (
  bills: RecurringBill[],
  streams: RecurringStreamInput[],
  dismissed: (key: string) => boolean = () => false,
) => findRecurringHints({ bills, streams, dismissed });

assert.equal(find([bill()], [input()]).length, 0, 'within range says nothing');

const [fixed] = find(
  [bill()],
  [input({ lastCents: 1_799, averageCents: 1_795 })],
);
assert.equal(fixed.kind, 'amount');
assert.deepEqual(fixed.kind === 'amount' && fixed.suggested, {
  lowCents: 1_799,
  highCents: 1_799,
});
assert.equal(fixed.key, 'amount:netflix:s1:1799:1799');

const [ranged] = find(
  [bill()],
  [input({ lastCents: 1_799, averageCents: 1_699 })],
);
assert.deepEqual(ranged.kind === 'amount' && ranged.suggested, {
  lowCents: 1_699,
  highCents: 1_799,
});

const learned = find(
  [
    bill({ id: 'a', name: 'Netflix' }),
    bill({ id: 'b', name: 'Streaming', merchantKeys: ['netflix'] }),
  ],
  [input({ lastCents: 2_000 })],
);
assert.equal(learned.length, 1);
assert.equal(
  learned[0].kind === 'amount' && learned[0].billId,
  'b',
  'a learned key beats a name match',
);

assert.equal(
  find([bill({ isCardFee: true })], [input({ lastCents: 9_900 })]).length,
  0,
  'a card fee bill is left alone',
);

const ignored: Partial<RecurringStream>[] = [
  { status: 'tombstoned' },
  { status: 'early' },
  { isActive: false },
  { frequency: 'unknown' },
  { category: 'TRANSFER_OUT_ACCOUNT_TRANSFER' },
  { category: 'TRANSFER_IN_DEPOSIT' },
  { category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' },
];
ignored.forEach((over) =>
  assert.equal(
    find([], [input(over), input(over, unplaced)]).length,
    0,
    `ignored: ${JSON.stringify(over)}`,
  ),
);

const [added] = find(
  [bill()],
  [input({ streamId: 's2', merchantName: 'Hulu' })],
);
assert.equal(added.kind, 'newBill');
assert.equal(added.key, 'new:s2');

const hints = find(
  [bill()],
  [
    input({ streamId: 'p1', merchantName: 'Gym', lastCents: 3_000 }, unplaced),
    input({ streamId: 'p2', merchantName: 'Cloud', lastCents: 999 }, unplaced),
    input({ streamId: 'n1', merchantName: 'Hulu', lastCents: 800 }),
    input({ streamId: 'n2', merchantName: 'Spotify', lastCents: 1_200 }),
    input({ streamId: 'a1', lastCents: 2_500 }),
  ],
);
assert.deepEqual(
  hints.map((hint) => hint.kind),
  ['amount', 'newBill', 'newBill', 'place'],
  'order and one place hint per provider account',
);
assert.deepEqual(
  hints.flatMap((hint) =>
    hint.kind === 'newBill' ? [hint.stream.streamId] : [],
  ),
  ['n2', 'n1'],
);
const place = hints[3];
assert.equal(place.key, 'place:link:savings');
assert.deepEqual(
  place.kind === 'place' && place.streams.map(({ streamId }) => streamId),
  ['p1', 'p2'],
);

assert.equal(
  find([bill()], [input({ streamId: 's2', merchantName: 'Hulu' })], (key) =>
    key.startsWith('new:'),
  ).length,
  0,
  'a dismissed key is hidden',
);

assert.equal(
  find(
    [],
    [
      input(
        { streamId: 'x1', merchantName: 'Gym' },
        { ...unplaced, isLinkActive: false },
      ),
    ],
  ).length,
  0,
  'no place hint for an account on a link that needs attention',
);

console.log('runway recurring: ok');
