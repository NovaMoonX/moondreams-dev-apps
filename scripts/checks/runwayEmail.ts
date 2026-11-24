import assert from 'node:assert/strict';

import { getBankOwedByCard } from '../../src/apps/runway/engine/cards.ts';
import { getCashPosition } from '../../src/apps/runway/engine/cash.ts';
import {
  findEmailTwins,
  getEmailOffers,
  getTwinHeldIds,
  getTwinMergingIds,
  isAnsweredEmail,
  isSettledByPerson,
} from '../../src/apps/runway/engine/emailTwins.ts';
import { findPurchaseMatches } from '../../src/apps/runway/engine/matching.ts';
import { isOpenToPlace } from '../../src/apps/runway/engine/purchases.ts';
import type { OpenPurchase } from '../../src/apps/runway/types.ts';

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

// A charge sitting in Free to Spend that nobody chose for it can still be given an envelope or a rule from its sheet.
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

console.log('runway email: ok');
