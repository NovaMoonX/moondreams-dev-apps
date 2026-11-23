import assert from 'node:assert/strict';

import { getBankOwedByCard } from '../../src/apps/runway/engine/cards.ts';
import { getCashPosition } from '../../src/apps/runway/engine/cash.ts';
import { findEmailTwins } from '../../src/apps/runway/engine/emailTwins.ts';
import { findPurchaseMatches } from '../../src/apps/runway/engine/matching.ts';
import {
  buildGmailFilterXml,
  getFilterFields,
} from '../../src/apps/runway/utils/emailFilterFields.ts';
import {
  dropWrites,
  holdEmailSetup,
  runwayReducer,
  setEmailSetup,
  settleWrites,
} from '../../src/apps/runway/store/runwaySlice.ts';
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

// A provider's filter is offered as the boxes its form has: Gmail joins words in one box, Outlook and iCloud take one value each.
{
  const addresses = ['alerts@chase.com', 'no-reply@amex.com'];
  const gmail = getFilterFields('gmail', addresses);
  assert.deepEqual(
    gmail.map((field) => field.label),
    ['From', 'Subject'],
  );
  assert.deepEqual(gmail[0].values, ['alerts@chase.com OR no-reply@amex.com']);
  assert.equal(gmail[1].values.length, 1);
  const outlook = getFilterFields('outlook', addresses);
  assert.deepEqual(outlook[0].values, addresses, 'one From value per address');
  assert.equal(outlook[1].label, 'Subject includes');
  assert.equal(
    getFilterFields('icloud', addresses)[1].label,
    'Subject contains',
  );
  assert.deepEqual(getFilterFields('gmail', []), [], 'no bank, no filter');
  assert.deepEqual(getFilterFields('proton', addresses), []);

  const xml = buildGmailFilterXml(
    ["o'neil&co@bank.com"],
    'runway-abc@moondreamsmail.com',
    Date.UTC(2026, 10, 4),
  );
  assert.ok(xml.includes("xmlns:apps='http://schemas.google.com/apps/2006'"));
  assert.ok(xml.includes("<category term='filter'></category>"));
  assert.ok(xml.includes("name='from' value='o&apos;neil&amp;co@bank.com'"));
  assert.ok(
    xml.includes("name='forwardTo' value='runway-abc@moondreamsmail.com'"),
  );
  assert.ok(xml.includes("name='subject' value='purchase OR charge"));
}

// A change to the setup shows at once, lets go when the listener shows it as written, and goes back when the write fails.
{
  const bank = (id: string) => ({
    id,
    name: id,
    addresses: [`${id}@bank.com`],
    addedAt: 1,
  });
  const delivered = {
    provider: 'gmail' as const,
    stepId: 'copy' as const,
    doneAt: null,
    banks: [bank('chase')],
  };
  const start = runwayReducer(undefined, setEmailSetup(delivered));
  const held = runwayReducer(
    start,
    holdEmailSetup({
      token: 't',
      patch: { banks: [bank('chase'), bank('amex')] },
    }),
  );
  assert.equal(held.emailSetup?.banks.length, 2, 'a new bank shows at once');
  assert.equal(held.emailSetup?.provider, 'gmail', 'other fields stay');
  assert.equal(
    runwayReducer(held, dropWrites('t')).emailSetup?.banks.length,
    1,
    'a failed save goes back',
  );
  const settled = runwayReducer(held, settleWrites('t'));
  assert.equal(settled.emailSetup?.banks.length, 2, 'settling alone keeps it');
  const landed = runwayReducer(
    settled,
    setEmailSetup({ ...delivered, banks: [bank('chase'), bank('amex')] }),
  );
  assert.equal(landed.emailSetupHeld.length, 0, 'it lets go once shown');
  const other = runwayReducer(
    settled,
    setEmailSetup({ ...delivered, stepId: 'bank' }),
  );
  assert.equal(other.emailSetup?.stepId, 'bank', 'another field shows through');
  assert.equal(other.emailSetup?.banks.length, 2, 'the hold keeps its field');
  const first = runwayReducer(
    undefined,
    holdEmailSetup({ token: 'p', patch: { provider: 'outlook' } }),
  );
  assert.equal(first.emailSetup?.provider, 'outlook', 'the first write shows');
}

console.log('runway email: ok');
