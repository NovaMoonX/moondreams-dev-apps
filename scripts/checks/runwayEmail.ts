import assert from 'node:assert/strict';

import { getBankOwedByCard } from '../../src/apps/runway/engine/cards.ts';
import { getCashPosition } from '../../src/apps/runway/engine/cash.ts';
import {
  findEmailJoins,
  findEmailTwins,
  findPostedOnlySides,
  getEmailWaitEnd,
  getEmailWindowEnd,
  getEmailOffers,
  getEmailWaitDays,
  getSideKey,
  getTwinHeldIds,
  getTwinMergingIds,
  isAnsweredEmail,
  isSettledByPerson,
} from '../../src/apps/runway/engine/emailTwins.ts';
import { findPurchaseMatches } from '../../src/apps/runway/engine/matching.ts';
import { isOpenToPlace } from '../../src/apps/runway/engine/purchases.ts';
import type { OpenPurchase, StoreEmail } from '../../src/apps/runway/types.ts';

// A purchase read from a bank's alert email waits for the bank's charge: one to one, same side, within -2/+7 days.
{
  const day = 86_400_000;
  const base = 20_000 * day;
  const make = (
    id: string,
    source: 'email' | 'link',
    amountCents: number,
    dayOffset: number,
    extra: Partial<OpenPurchase> = {},
  ): OpenPurchase => ({
    id,
    date: base + dayOffset * day,
    source,
    status: source === 'link' ? 'posted' : null,
    accountId: 'checking',
    needsHome: source === 'link',
    expenseId: null,
    createdAt: base,
    updatedAt: base,
    amountCents,
    merchant: 'Shell',
    label: null,
    note: null,
    lines: [{ envelopeId: null, cents: amountCents, via: 'free' }],
    refundOfId: null,
    paidByCardId: null,
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
    emailEventId: source === 'email' ? 'ev' : null,
    emailWaiting: source === 'email' ? true : null,
    emailWaitUntil: null,
    wasPending: null,
    category: null,
    ruleId: null,
    ...extra,
  });

  const one = findEmailTwins([
    make('e1', 'email', 4_000, 0),
    make('b1', 'link', 4_000, 1),
  ]);
  assert.deepEqual([...one.clear], [['e1', 'b1']], 'one to one is clear');
  assert.equal(one.ambiguous.size, 0);

  const rich = findEmailTwins([
    make('e1', 'email', 4_000, 0),
    make('e2', 'email', 4_000, 1),
    make('b1', 'link', 4_000, 1),
    make('b2', 'link', 4_000, 2),
    make('e3', 'email', 900, 0),
    make('b3', 'link', 900, 0),
  ]);
  assert.deepEqual(
    [...(rich.candidates.get('e1') ?? [])].sort(),
    ['b1', 'b2'],
    'every candidate is returned for an ambiguous email',
  );
  assert.deepEqual(getEmailOffers(rich, 'b2'), ['e1', 'e2']);
  assert.deepEqual(
    getEmailOffers(rich, 'b3'),
    [],
    'a clear twin is not offered',
  );
  assert.deepEqual(
    [...getTwinHeldIds(rich)].sort(),
    ['b1', 'b2', 'b3', 'e1', 'e2', 'e3'],
    'an email with a candidate is held too, so a rule never places both sides',
  );
  assert.deepEqual([...getTwinMergingIds(rich)], ['b3']);
  const shuffled = findEmailTwins([
    make('b3', 'link', 900, 0),
    make('b2', 'link', 4_000, 2),
    make('e2', 'email', 4_000, 1),
    make('b1', 'link', 4_000, 1),
    make('e3', 'email', 900, 0),
    make('e1', 'email', 4_000, 0),
  ]);
  assert.deepEqual(
    [...getTwinHeldIds(shuffled)].sort(),
    [...getTwinHeldIds(rich)].sort(),
    'the held set does not depend on order',
  );

  const order = {
    kind: 'order' as const,
    orderNumber: '114-0899359-3849845',
    isWholeOrder: false,
    merchant: 'Amazon',
  };
  const noSide = {
    accountId: null,
    paidByCardId: null,
    storeEmail: order,
    merchant: 'Amazon',
  };
  const virtual = findEmailTwins([
    make('o', 'email', 4_570, 0, noSide),
    make('b', 'link', 4_570, 3, {
      accountId: null,
      paidByCardId: 'virtual',
      merchant: 'Amazon',
    }),
    make('x', 'link', 4_570, 3, {
      accountId: null,
      paidByCardId: 'virtual',
      merchant: 'Target',
    }),
  ]);
  assert.deepEqual(
    [...virtual.clear],
    [['o', 'b']],
    'a store order naming no card matches the same store charge on any card',
  );
  assert.equal(
    findEmailTwins([
      make('e', 'email', 4_570, 0, {
        accountId: null,
        paidByCardId: null,
        merchant: 'Amazon',
      }),
      make('b', 'link', 4_570, 3, {
        accountId: null,
        paidByCardId: 'virtual',
        merchant: 'Amazon',
      }),
    ]).clear.size,
    0,
    'an email naming no card that is not a store order matches nothing',
  );
  const both = findEmailTwins([
    make('o', 'email', 4_570, 0, noSide),
    make('a', 'email', 4_570, 0, {
      accountId: null,
      paidByCardId: 'virtual',
      merchant: 'Amazon',
    }),
    make('b', 'link', 4_570, 1, {
      accountId: null,
      paidByCardId: 'virtual',
      merchant: 'Amazon',
    }),
  ]);
  assert.deepEqual(
    [...both.ambiguous].sort(),
    ['a', 'o'],
    'a store email and a bank alert for one charge both wait for the person',
  );

  const placedLine = [
    { envelopeId: 'env', cents: 4_000, via: 'chosen' as const },
  ];
  assert.equal(
    isAnsweredEmail(make('e', 'email', 4_000, 0, { needsHome: true })),
    false,
    'a new email waiting in Needs a home is unanswered',
  );
  assert.equal(
    isAnsweredEmail(make('e', 'email', 4_000, 0, { needsHome: false })),
    false,
    'a legacy email (free line, nobody answered) is unanswered',
  );
  assert.equal(
    isAnsweredEmail(
      make('e', 'email', 4_000, 0, {
        needsHome: false,
        lines: placedLine,
        ruleId: 'r',
        assignedBy: 'auto',
      }),
    ),
    true,
    'placed by a rule',
  );
  assert.equal(
    isAnsweredEmail(
      make('e', 'email', 4_000, 0, { needsHome: false, lines: placedLine }),
    ),
    true,
    'placed by hand in an older version',
  );
  assert.equal(
    isAnsweredEmail(
      make('e', 'email', 4_000, 0, { needsHome: false, assignedBy: 'person' }),
    ),
    true,
    'kept in Free to Spend by the person',
  );
  assert.equal(
    isSettledByPerson(make('b', 'link', 4_000, 0, { needsHome: false })),
    true,
    'a charge the person placed wins',
  );
  assert.equal(
    isSettledByPerson(make('b', 'link', 4_000, 0, { needsHome: true })),
    false,
    'a waiting charge takes the email answer',
  );
  assert.equal(
    isSettledByPerson(
      make('b', 'link', 4_000, 0, { needsHome: false, assignedBy: 'auto' }),
    ),
    false,
    'a charge a rule placed takes the email answer',
  );
  assert.equal(
    isSettledByPerson(
      make('b', 'link', 4_000, 0, {
        needsHome: false,
        assignedBy: 'auto',
        lines: [],
        billRef: { billId: 'bill', moveId: 'move' } as never,
      }),
    ),
    true,
    'a charge autopay matched to a bill keeps its own state',
  );
  assert.equal(
    isSettledByPerson(
      make('b', 'link', 4_000, 0, {
        needsHome: false,
        assignedBy: 'auto',
        pairedWithId: 'p',
      }),
    ),
    true,
    'so does a paired charge',
  );

  const twoEmails = findEmailTwins([
    make('e1', 'email', 4_000, 0),
    make('e2', 'email', 4_000, 0),
    make('b1', 'link', 4_000, 1),
  ]);
  assert.equal(twoEmails.clear.size, 0, 'two emails and one charge is unclear');
  assert.deepEqual(
    [...twoEmails.ambiguous].sort(),
    ['e1', 'e2'],
    'both emails are ambiguous',
  );

  const twoBanks = findEmailTwins([
    make('e1', 'email', 4_000, 0),
    make('b1', 'link', 4_000, 1),
    make('b2', 'link', 4_000, 2),
  ]);
  assert.equal(twoBanks.clear.size, 0, 'one email and two charges is unclear');
  assert.deepEqual([...twoBanks.ambiguous], ['e1']);

  const edge = (offset: number) =>
    findEmailTwins([
      make('e1', 'email', 4_000, 0),
      make('b1', 'link', 4_000, offset),
    ]).clear.size;
  assert.equal(edge(-2), 1, 'two days before is in');
  assert.equal(edge(7), 1, 'seven days after is in');
  assert.equal(edge(-3), 0, 'three days before is out');
  assert.equal(edge(8), 0, 'eight days after is out');

  const clearCount = (
    email: Partial<OpenPurchase>,
    bank: Partial<OpenPurchase>,
  ) =>
    findEmailTwins([
      make('e1', 'email', 4_000, 0, email),
      make('b1', 'link', 4_000, 0, bank),
    ]).clear.size;
  assert.equal(
    clearCount({ paidByCardId: 'venture' }, { paidByCardId: 'savor' }),
    0,
    'another card is not it',
  );
  assert.equal(
    clearCount({ paidByCardId: 'venture' }, { paidByCardId: 'venture' }),
    1,
    'the same card is',
  );
  assert.equal(
    clearCount({}, { accountId: 'savings' }),
    0,
    'another account is not it',
  );
  assert.equal(
    clearCount({}, { paidByCardId: 'venture' }),
    0,
    'a card charge is not an account one',
  );
  assert.equal(
    clearCount({ emailWaiting: false }, {}),
    0,
    'an email no longer waiting is not matched',
  );
  assert.equal(
    clearCount({ notSameAs: ['b1'] }, {}),
    0,
    'a charge the person said is not it is never matched again',
  );

  const typedPass = findPurchaseMatches(
    [make('b1', 'link', 4_000, 0)],
    [make('e1', 'email', 4_000, 0, { needsHome: false })],
  );
  assert.equal(typedPass.clear.size, 0, 'the typed pass never takes an email');
  assert.equal(typedPass.offers.size, 0, 'nor offers it');

  const pendingOf = (
    purchases: OpenPurchase[],
    twinnedEmailIds?: ReadonlySet<string>,
  ) =>
    getCashPosition({
      accounts: [
        {
          id: 'a',
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
          linkId: 'l',
          name: 'a',
          institution: 'Capital One',
          kind: 'checking',
          countedTowardTotal: true,
          isPullAccount: false,
          lastFour: null,
          balanceCents: 1,
          balanceOn: null,
          holds: [],
          apyBps: null,
          interestDay: null,
        },
      ],
      bankBalances: { a: 100_000 },
      balances: {
        assignedByItem: {},
        assignedToBillsCents: 0,
        assignedToHorizonCents: 0,
        assignedToCardsCents: 0,
        assignedToEnvelopesCents: 0,
      },
      goalIds: [],
      envelopeIds: [],
      purchases,
      twinnedEmailIds,
    }).pendingCents;
  const waiting = make('e1', 'email', 4_000, 0, { accountId: 'a' });
  assert.equal(
    pendingOf([waiting]),
    4_000,
    'a waiting email counts as pending',
  );
  assert.equal(
    pendingOf([waiting], new Set(['e1'])),
    0,
    'one with a clear twin is counted by the charge instead',
  );
  assert.equal(
    pendingOf([{ ...waiting, emailWaiting: false }]),
    0,
    'one no longer waiting is not counted',
  );
  assert.equal(
    pendingOf([{ ...waiting, accountId: 'elsewhere' }]),
    0,
    'nor one on an account that does not count',
  );

  const owedOf = (
    purchases: OpenPurchase[],
    twinnedEmailIds?: ReadonlySet<string>,
  ) =>
    getBankOwedByCard({
      cards: [{ id: 'venture', postedCents: 10_000 }],
      purchases,
      started: [],
      today: base,
      twinnedEmailIds,
    }).venture;
  const onCard = make('e1', 'email', 4_000, 0, { paidByCardId: 'venture' });
  assert.equal(owedOf([onCard]).heldCents, 14_000, 'a waiting email is owed');
  assert.equal(
    owedOf([onCard], new Set(['e1'])).heldCents,
    10_000,
    'its twin is counted by the bank',
  );
  assert.equal(
    owedOf([{ ...onCard, emailWaiting: false }]).heldCents,
    10_000,
    'one no longer waiting is not owed',
  );
}

{
  const open: OpenPurchase = {
    id: 'p1',
    date: 0,
    source: 'email',
    status: null,
    accountId: null,
    needsHome: false,
    expenseId: null,
    createdAt: 0,
    updatedAt: 0,
    amountCents: 2_500,
    merchant: 'Petsmart',
    label: null,
    note: null,
    lines: [{ envelopeId: null, cents: 2_500, via: 'free' }],
    refundOfId: null,
    ruleId: null,
    assignedBy: null,
    pairedWithId: null,
    incomeDayId: null,
    billRef: null,
  } as unknown as OpenPurchase;
  assert.equal(isOpenToPlace(open), true, 'an unplaced email charge is open');
  assert.equal(
    isOpenToPlace({ ...open, source: 'link' }),
    true,
    'so is an unplaced bank charge',
  );
  assert.equal(
    isOpenToPlace({ ...open, needsHome: true }),
    false,
    'one waiting is placed from Needs a home instead',
  );
  assert.equal(
    isOpenToPlace({ ...open, assignedBy: 'person' }),
    false,
    'one the person kept in Free to Spend stays kept',
  );
  assert.equal(
    isOpenToPlace({ ...open, ruleId: 'r1', assignedBy: 'auto' }),
    false,
    'one a rule placed is the rule’s',
  );
  assert.equal(
    isOpenToPlace({
      ...open,
      lines: [{ envelopeId: 'groceries', cents: 2_500, via: 'chosen' }],
    }),
    false,
    'one already in an envelope is placed',
  );
  assert.equal(
    isOpenToPlace({ ...open, source: 'manual' as OpenPurchase['source'] }),
    false,
    'one typed by hand was placed as it was typed',
  );
  assert.equal(
    isOpenToPlace({ ...open, amountCents: -2_500 }),
    false,
    'money in is not',
  );
  assert.equal(
    isOpenToPlace({ ...open, pairedWithId: 'p2' }),
    false,
    'nor a move paired with its other side',
  );
}

// A bank that shares no pending charges is learned per card and account, and an order that posts as several charges is found.
{
  const day = 86_400_000;
  const base = 20_000 * day;
  const make = (
    id: string,
    source: 'email' | 'link',
    amountCents: number,
    dayOffset: number,
    extra: Partial<OpenPurchase> = {},
  ): OpenPurchase =>
    ({
      id,
      date: base + dayOffset * day,
      source,
      status: source === 'link' ? 'posted' : null,
      accountId: null,
      paidByCardId: 'card',
      needsHome: true,
      amountCents,
      merchant: 'Target',
      label: null,
      lines: [{ envelopeId: null, cents: amountCents, via: 'free' }],
      notSameAs: null,
      pairedWithId: null,
      emailWaiting: source === 'email' ? true : null,
      emailWaitUntil: null,
      wasPending: null,
      storeEmail: null,
      ...extra,
    }) as unknown as OpenPurchase;
  const order: StoreEmail = {
    kind: 'order',
    orderNumber: null,
    isWholeOrder: false,
    merchant: 'Target',
  };

  const never = (id: string, extra: Partial<OpenPurchase> = {}) =>
    make(id, 'link', 100, 0, { wasPending: false, ...extra });
  const sides = findPostedOnlySides([
    never('p1', { paidByCardId: 'shares' }),
    never('p2', { paidByCardId: 'shares' }),
    never('p3', { paidByCardId: 'shares', wasPending: true }),
    never('p4', { paidByCardId: 'shares' }),
    never('q1', { paidByCardId: 'capital' }),
    never('q2', { paidByCardId: 'capital' }),
    never('q3', { paidByCardId: 'capital' }),
    never('f1', { paidByCardId: 'few' }),
    never('f2', { paidByCardId: 'few' }),
    never('n1', { paidByCardId: 'now' }),
    never('n2', { paidByCardId: 'now' }),
    never('n3', { paidByCardId: 'now' }),
    never('n4', { paidByCardId: 'now', status: 'pending' }),
    ...['a1', 'a2', 'a3'].map((id) =>
      never(id, { paidByCardId: null, accountId: 'chk' }),
    ),
    ...['o1', 'o2', 'o3'].map((id) =>
      never(id, { paidByCardId: 'old', wasPending: null }),
    ),
    make('m1', 'email', 100, 0, { paidByCardId: 'unseen' }),
  ]);
  assert.deepEqual(
    [...sides].sort(),
    ['account:chk', 'card:capital'],
    'posted only needs three charges that never were pending and none that was; fewer, older ones or an email prove nothing',
  );
  assert.deepEqual(
    [
      ...findPostedOnlySides(
        ['h1', 'h2', 'h3'].map((id) => never(id, { paidByCardId: 'backfill' })),
        () => true,
      ),
    ],
    [],
    'a link’s history proves nothing, so a first sync’s backfill is not posted only',
  );
  assert.equal(getSideKey(make('x', 'link', 1, 0)), 'card:card');
  assert.equal(
    getSideKey(make('x', 'link', 1, 0, { paidByCardId: null })),
    null,
  );

  const typedEmail = make('e', 'email', 100, 0, { paidByCardId: 'capital' });
  assert.equal(
    getEmailWaitDays(typedEmail, new Set()),
    5,
    'five days by default',
  );
  assert.equal(
    getEmailWaitDays(typedEmail, new Set(['card:capital'])),
    7,
    'seven for a card that posts only',
  );
  assert.equal(
    getEmailWaitDays({ ...typedEmail, storeEmail: order }, new Set()),
    30,
    'thirty for a store order, charged when it ships',
  );

  const bankOf = (id: string, cents: number, offset = 1, extra = {}) =>
    make(id, 'link', cents, offset, extra);
  const email = make('o1', 'email', 10_000, 0, { storeEmail: order });
  const split = findEmailTwins([
    email,
    bankOf('b1', 6_000),
    bankOf('b2', 4_000, 3),
    bankOf('b3', 999, 2),
  ]);
  assert.deepEqual(
    [...split.split],
    [['o1', ['b1', 'b2']]],
    'two charges that add up are the order',
  );
  assert.deepEqual(split.candidates.get('o1'), ['b1', 'b2']);
  assert.equal(split.clear.size, 0);
  assert.equal(split.ambiguous.size, 0, 'a split order is neither');
  assert.deepEqual([...getTwinHeldIds(split)].sort(), ['b1', 'b2', 'o1']);
  assert.deepEqual(
    [...getTwinMergingIds(split)].sort(),
    ['b1', 'b2'],
    'the charges of a split merge on their own, so Needs a home leaves them out',
  );
  assert.equal(
    getEmailOffers(split, 'b1').length,
    0,
    'never offered one by one',
  );

  const splitOf = (purchases: OpenPurchase[]) =>
    findEmailTwins(purchases).split.size;
  assert.equal(
    splitOf([
      email,
      bankOf('b1', 3_000),
      bankOf('b2', 3_000),
      bankOf('b3', 2_000),
      bankOf('b4', 2_000),
    ]),
    1,
    'four charges are allowed',
  );
  assert.equal(
    splitOf([
      email,
      bankOf('b1', 2_000),
      bankOf('b2', 2_000),
      bankOf('b3', 2_000),
      bankOf('b4', 2_000),
      bankOf('b5', 2_000),
    ]),
    0,
    'five charges are too many',
  );
  assert.equal(
    splitOf([
      email,
      bankOf('b1', 6_000),
      bankOf('b2', 4_000),
      bankOf('b3', 5_000),
      bankOf('b4', 5_000),
    ]),
    0,
    'two different sets are not clear',
  );
  assert.equal(
    splitOf([email, bankOf('b1', 6_000), bankOf('b2', 4_000, 31)]),
    0,
    'a charge outside the window is not in it',
  );
  assert.equal(
    splitOf([
      email,
      bankOf('b1', 6_000),
      bankOf('b2', 4_000, 1, { merchant: 'Walmart' }),
    ]),
    0,
    'charges from another store are not it',
  );
  assert.equal(
    splitOf([
      email,
      bankOf('b1', 6_000),
      bankOf('b2', 4_000, 1, { paidByCardId: 'other' }),
    ]),
    0,
    'charges on another card are not it',
  );
  assert.equal(
    splitOf([
      { ...email, notSameAs: ['b2'] },
      bankOf('b1', 6_000),
      bankOf('b2', 4_000),
    ]),
    0,
    'a charge the person said is not it is skipped',
  );
  assert.equal(
    splitOf([
      email,
      { ...email, id: 'o2' },
      bankOf('b1', 6_000),
      bankOf('b2', 4_000),
    ]),
    0,
    'two open orders the same size could each be it',
  );
  assert.equal(
    splitOf([
      email,
      make('o2', 'email', 6_000, 0, { storeEmail: order }),
      bankOf('b1', 6_000),
      bankOf('b2', 4_000),
    ]),
    0,
    'a charge another order is clearly or may be is left to that order',
  );
  assert.equal(
    splitOf([
      { ...email, storeEmail: null },
      bankOf('b1', 6_000),
      bankOf('b2', 4_000),
    ]),
    0,
    'only a store order posts as several charges',
  );
  assert.equal(
    splitOf([email, bankOf('b1', 10_000), bankOf('b2', 6_000)]),
    0,
    'an order with a single charge of its amount is not split',
  );
}

// A store order naming no card joins the bank alert email for the same purchase; an order waits 30 days, and Keep waiting widens any window.
{
  const day = 86_400_000;
  const base = 20_000 * day;
  const amazon: StoreEmail = {
    kind: 'order',
    orderNumber: '114-1',
    isWholeOrder: false,
    merchant: 'Amazon',
  };
  const make = (
    id: string,
    dayOffset: number,
    extra: Partial<OpenPurchase> = {},
  ) =>
    ({
      id,
      date: base + dayOffset * day,
      source: 'email',
      status: null,
      accountId: null,
      needsHome: true,
      amountCents: 4_599,
      merchant: 'Amazon',
      label: null,
      paidByCardId: null,
      notSameAs: null,
      pairedWithId: null,
      emailEventId: `ev-${id}`,
      emailWaiting: true,
      emailWaitUntil: null,
      storeEmail: null,
      lines: [{ envelopeId: null, cents: 4_599, via: 'free' }],
      assignedBy: null,
      ruleId: null,
      ...extra,
    }) as unknown as OpenPurchase;
  const orderOf = (
    id: string,
    dayOffset = 0,
    extra: Partial<OpenPurchase> = {},
  ) => make(id, dayOffset, { storeEmail: amazon, ...extra });
  const alertOf = (
    id: string,
    dayOffset = 3,
    extra: Partial<OpenPurchase> = {},
  ) =>
    make(id, dayOffset, {
      paidByCardId: 'chase',
      merchant: 'AMAZON MKTPL*AB12C',
      ...extra,
    });
  const joins = (list: OpenPurchase[]) => [...findEmailJoins(list)];

  assert.deepEqual(
    joins([orderOf('o'), alertOf('a')]),
    [['o', 'a']],
    'an order and its alert join',
  );
  assert.deepEqual(
    joins([alertOf('a'), orderOf('o')]),
    [['o', 'a']],
    'the input order does not matter',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 25)]),
    [['o', 'a']],
    'within the order’s 30 days',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 31)]),
    [],
    'past the order’s 30 days',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', -3)]),
    [],
    'more than two days before the order',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { amountCents: 4_600 })]),
    [],
    'a different amount',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { merchant: 'Target' })]),
    [],
    'a different store',
  );
  (
    [
      ['Target', 'TARGET OPTICAL'],
      ['Home Depot', 'HOME GOODS #12'],
      ['Uber', 'Uber Eats'],
      ['Whole Foods', 'WHOLE BODY*12'],
    ] as const
  ).forEach(([store, bank]) =>
    assert.deepEqual(
      joins([
        orderOf('o', 0, { merchant: store }),
        alertOf('a', 3, { merchant: bank }),
      ]),
      [],
      `${store} is not ${bank}`,
    ),
  );
  assert.deepEqual(
    joins([
      orderOf('o', 0, { merchant: 'Whole Foods' }),
      alertOf('a', 3, { merchant: 'WHOLE FOODS*MKT 102' }),
    ]),
    [['o', 'a']],
    'the whole store name then a processor code',
  );
  const placed = {
    needsHome: false,
    lines: [{ envelopeId: 'groceries', cents: 4_599, via: 'free' as const }],
  };
  assert.deepEqual(
    joins([orderOf('o', 0, placed), alertOf('a', 3, placed)]),
    [],
    'two emails already placed are left to the person',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, placed)]),
    [['o', 'a']],
    'one placed email still joins',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { merchant: 'Amazon' })]),
    [['o', 'a']],
    'the same store spelled the same',
  );
  assert.deepEqual(
    joins([
      orderOf('o'),
      alertOf('a'),
      alertOf('a2', 4, { paidByCardId: 'amex' }),
    ]),
    [],
    'two alerts that could be it are left apart',
  );
  assert.deepEqual(
    joins([orderOf('o'), orderOf('o2', 1), alertOf('a')]),
    [],
    'two orders that could be it are left apart',
  );
  assert.deepEqual(
    joins([orderOf('o', 0, { notSameAs: ['a'] }), alertOf('a')]),
    [],
    'kept apart on the order',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { notSameAs: ['o'] })]),
    [],
    'kept apart on the alert',
  );
  assert.deepEqual(
    joins([orderOf('o', 0, { paidByCardId: 'chase' }), alertOf('a')]),
    [],
    'an order that names its card waits for the bank charge instead',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { paidByCardId: null })]),
    [],
    'an alert must name a card or account',
  );
  assert.deepEqual(
    joins([orderOf('o'), alertOf('a', 3, { emailWaiting: false })]),
    [],
    'an alert the person stopped waiting on is not joined',
  );

  assert.equal(
    getEmailWindowEnd(orderOf('o')),
    base + 30 * day,
    'an order’s window is 30 days',
  );
  assert.equal(
    getEmailWindowEnd(alertOf('a', 0)),
    base + 7 * day,
    'an alert’s window is 7 days',
  );
  assert.equal(
    getEmailWindowEnd(alertOf('a', 0, { emailWaitUntil: base + 14 * day })),
    base + 14 * day,
    'Keep waiting widens the window',
  );
  assert.equal(
    getEmailWindowEnd(orderOf('o', 0, { emailWaitUntil: base + 7 * day })),
    base + 30 * day,
    'a shorter wait never narrows it',
  );
  assert.equal(
    getEmailWaitEnd(
      alertOf('a', 0, { emailWaitUntil: base + 30 * day }),
      new Set(),
    ),
    base + 30 * day,
    'the overdue day follows Keep waiting',
  );
  const twins = findEmailTwins([
    alertOf('a', 0, { emailWaitUntil: base + 20 * day }),
    {
      ...alertOf('b', 18),
      source: 'link',
      emailWaiting: null,
      emailWaitUntil: null,
      emailEventId: null,
    } as OpenPurchase,
  ]);
  assert.deepEqual(
    [...twins.clear],
    [['a', 'b']],
    'a charge inside the kept-waiting window pairs',
  );
}

console.log('runway email: ok');
