import assert from 'node:assert/strict';

import {
  isTwinLink as isServerTwin,
  planCombine,
  toAccountKey as toServerKey,
} from '../../functions/src/apps/runway/link/twinLinks.ts';
import { needsBankDetails } from '../../functions/src/apps/runway/link/syncRunwayLink.ts';
import {
  canCombine,
  findTwinLink,
  findTwinOf,
  toAccountKey,
} from '../../src/apps/runway/engine/twinLinks.ts';
import type { OpenLink } from '../../src/apps/runway/types.ts';

const DAY = 86_400_000;

type Row = OpenLink['providerAccounts'][number];

const row = (
  id: string,
  name: string,
  mask: string | null,
  placed: Partial<Pick<Row, 'accountId' | 'cardId' | 'isSkipped'>> = {},
): Row => ({
  providerAccountId: id,
  name,
  kind: 'depository',
  mask,
  balanceCents: null,
  accountId: placed.accountId ?? null,
  cardId: placed.cardId ?? null,
  isSkipped: placed.isSkipped ?? false,
});

const link = (
  id: string,
  rows: Row[],
  patch: Partial<OpenLink> = {},
): OpenLink => ({
  id,
  status: 'active',
  lastSyncAt: null,
  createdAt: 0,
  needsCardConsent: false,
  cardDetails: null,
  institutionName: 'Capital One',
  institutionLogo: null,
  institutionDomain: null,
  institutionCheckedAt: null,
  providerAccounts: rows,
  ...patch,
});

// Account keys: name and mask, spacing and case ignored; none without a mask; the server's copy agrees.
assert.equal(
  toAccountKey({ name: ' 360  Checking', mask: '4821' }),
  '4821|360 checking',
);
assert.equal(toAccountKey({ name: 'Checking', mask: null }), null);
assert.equal(toAccountKey({ name: 'Checking', mask: '' }), null);
[
  { name: 'Venture X', mask: '8841' },
  { name: '  360 Savings ', mask: '3302' },
  { name: 'No mask', mask: null },
].forEach((account) =>
  assert.equal(toServerKey(account), toAccountKey(account)),
);

const first = link('first', [
  row('a1', 'Venture X', '8841', { cardId: 'card-venture' }),
  row('a2', '360 Checking', '4821', { accountId: 'acct-checking' }),
  row('a3', '360 Savings', '3302', { isSkipped: true }),
]);

// A repeat sign-in is the same bank (spacing and case ignored) sharing an account; a second login at the bank is not.
const repeat = [{ name: '360 Checking', mask: '4821' }];
assert.equal(findTwinLink([first], 'capital one', repeat)?.id, 'first');
assert.equal(
  findTwinLink([first], 'Capital One', [
    { name: 'Joint Checking', mask: '7710' },
  ]),
  null,
);
assert.equal(findTwinLink([first], 'Chase', repeat), null);
assert.equal(
  findTwinLink([{ ...first, status: 'revoked' }], 'Capital One', repeat),
  null,
);
assert.equal(
  findTwinLink(
    [link('unfinished', [row('u1', '360 Checking', '4821')])],
    'Capital One',
    repeat,
  ),
  null,
);
assert.equal(
  findTwinLink([first], 'Capital One', [{ name: '360 Checking', mask: null }]),
  null,
);
assert.equal(isServerTwin(first, 'Capital One', repeat), true);
assert.equal(
  isServerTwin(first, 'Capital One', [{ name: 'Joint', mask: '7710' }]),
  false,
);

// Combining: the second sign-in left the accounts it repeats unplaced, so the first takes its placed one over.
const second = link('second', [
  row('b1', 'Venture X', '8841', { isSkipped: true }),
  row('b2', '360 Checking', '4821', { isSkipped: true }),
  row('b3', '360 Savings', '3302', { accountId: 'acct-savings' }),
]);
assert.equal(findTwinOf(first, [first, second])?.id, 'second');
assert.equal(findTwinOf(second, [first, second])?.id, 'first');
assert.equal(canCombine(first, second), true);
const plan = planCombine(first, second);
assert.ok(plan);
assert.deepEqual(plan.moves, [
  { collection: 'accounts', targetId: 'acct-savings' },
]);
assert.deepEqual(
  plan.providerAccounts.map((entry) => [
    entry.providerAccountId,
    entry.accountId,
    entry.cardId,
    entry.isSkipped,
  ]),
  [
    ['a1', null, 'card-venture', false],
    ['a2', 'acct-checking', null, false],
    ['a3', 'acct-savings', null, false],
  ],
);

// A newer sign-in that also brought in a new account keeps everything: the older one folds into it.
const wider = link('wider', [
  row('c1', 'Venture X', '8841', { isSkipped: true }),
  row('c2', '360 Checking', '4821'),
  row('c3', '360 Savings', '3302'),
  row('c4', 'Quicksilver', '1290', { cardId: 'card-quick' }),
]);
assert.equal(planCombine(first, wider), null);
const intoWider = planCombine(wider, first);
assert.ok(intoWider);
assert.deepEqual(intoWider.moves, [
  { collection: 'cards', targetId: 'card-venture' },
  { collection: 'accounts', targetId: 'acct-checking' },
]);
assert.equal(canCombine(first, wider), true);

// Each brought in its own copy of the same account: nothing can move without losing one.
const copies = link('copies', [
  row('d1', 'Venture X', '8841', { cardId: 'card-venture-copy' }),
  row('d2', '360 Checking', '4821', { isSkipped: true }),
]);
assert.equal(planCombine(first, copies), null);
assert.equal(planCombine(copies, first), null);
assert.equal(canCombine(first, copies), false);

// A placed account with no mask can't be matched, so it never moves.
const noMask = link('no-mask', [
  row('e1', 'Brokerage', null, { accountId: 'acct-brokerage' }),
]);
assert.equal(planCombine(first, noMask), null);

// Bank details: asked for once on old links, then weekly only while the bank sends no logo.
const now = 100 * DAY;
assert.equal(needsBankDetails({ institutionLogo: null }, now), true);
assert.equal(
  needsBankDetails(
    {
      institutionLogo: 'data:image/png;base64,x',
      institutionDomain: 'capitalone.com',
      institutionCheckedAt: now - 30 * DAY,
    },
    now,
  ),
  false,
);
assert.equal(
  needsBankDetails(
    {
      institutionLogo: null,
      institutionDomain: 'wealthfront.com',
      institutionCheckedAt: now - 6 * DAY,
    },
    now,
  ),
  false,
);
assert.equal(
  needsBankDetails(
    {
      institutionLogo: null,
      institutionDomain: 'wealthfront.com',
      institutionCheckedAt: now - 7 * DAY,
    },
    now,
  ),
  true,
);
assert.equal(
  needsBankDetails(
    {
      institutionLogo: null,
      institutionDomain: null,
      institutionCheckedAt: null,
    },
    now,
  ),
  true,
);

console.log('runway link twins: ok');
