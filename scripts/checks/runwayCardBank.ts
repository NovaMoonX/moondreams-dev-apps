import assert from 'node:assert/strict';

import {
  deriveBalances,
  deriveBalancesBefore,
} from '../../src/apps/runway/engine/balances.ts';
import {
  getBankDueState,
  getBankOwedByCard,
  getDueCards,
} from '../../src/apps/runway/engine/cards.ts';
import { getMoneyHistory } from '../../src/apps/runway/engine/moneyHistory.ts';
import { getBankDueByCard } from '../../src/apps/runway/store/selectors/cardStatementSelectors.ts';
import type {
  OpenCard,
  OpenCardStatement,
  OpenMove,
  OpenStartedPayment,
} from '../../src/apps/runway/types.ts';

const DAY = 86_400_000;
const d = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);

const bank = (
  id: string,
  date: number,
  amountCents: number,
  patch: {
    cardId?: string | null;
    accountId?: string | null;
    pending?: boolean;
  } = {},
) => ({
  id,
  date,
  source: 'link' as const,
  status: patch.pending ? ('pending' as const) : ('posted' as const),
  amountCents,
  accountId: patch.accountId ?? null,
  paidByCardId: patch.cardId ?? null,
});

const started = (
  id: string,
  cardId: string,
  amountCents: number,
  startedOn: number,
  createdAt = 1,
): OpenStartedPayment => ({ id, cardId, amountCents, startedOn, createdAt });

// What a card holds back at Link is the bank's: posted plus pending, less a payment that has left an account.
{
  const owed = getBankOwedByCard({
    cards: [{ id: 'chase', postedCents: 50_000 }],
    purchases: [
      bank('p1', d(2026, 11, 10), 4_000, { cardId: 'chase', pending: true }),
      bank('p2', d(2026, 11, 10), -1_000, { cardId: 'chase', pending: true }),
      bank('old', d(2026, 11, 1), 9_999, { cardId: 'chase' }),
    ],
    started: [],
    today: d(2026, 11, 15),
  });
  assert.deepEqual(
    owed.chase,
    {
      postedCents: 50_000,
      pendingCents: 3_000,
      waiting: [],
      heldCents: 53_000,
    },
    'pending charges count net of pending credits; posted ones are already in the bank figure',
  );
}

{
  const today = d(2026, 11, 15);
  const base = {
    cards: [{ id: 'chase', postedCents: 50_000 }],
    started: [started('s1', 'chase', 50_000, today)],
    today,
  };
  const waiting = getBankOwedByCard({ ...base, purchases: [] }).chase;
  assert.equal(
    waiting.heldCents,
    50_000,
    'a started payment that has not left an account changes nothing',
  );
  assert.deepEqual(waiting.waiting, [
    { payment: base.started[0], hasLeft: false },
  ]);

  const left = getBankOwedByCard({
    ...base,
    purchases: [bank('out', today + DAY, 50_000, { accountId: 'checking' })],
  }).chase;
  assert.equal(
    left.heldCents,
    0,
    'once it leaves checking the card stops holding it, so Free to Spend does not drop twice',
  );
  assert.equal(left.waiting[0].hasLeft, true);

  const landed = getBankOwedByCard({
    ...base,
    purchases: [
      bank('out', today + DAY, 50_000, { accountId: 'checking' }),
      bank('in', today + 2 * DAY, -50_000, { cardId: 'chase' }),
    ],
  }).chase;
  assert.deepEqual(
    landed.waiting,
    [],
    'once the card shows it the note is done and the bank figure stands',
  );

  const tooLate = getBankOwedByCard({
    ...base,
    purchases: [
      bank('out', today + 15 * DAY, 50_000, { accountId: 'checking' }),
    ],
  }).chase;
  assert.equal(
    tooLate.waiting[0].hasLeft,
    false,
    'money that leaves more than 14 days after the start is not this payment',
  );

  const otherAmount = getBankOwedByCard({
    ...base,
    purchases: [bank('out', today, 49_999, { accountId: 'checking' })],
  }).chase;
  assert.equal(
    otherAmount.waiting[0].hasLeft,
    false,
    'the amount must match exactly',
  );
}

{
  const today = d(2026, 11, 15);
  const owed = getBankOwedByCard({
    cards: [
      { id: 'chase', postedCents: 20_000 },
      { id: 'amex', postedCents: 20_000 },
    ],
    purchases: [bank('out', today, 20_000, { accountId: 'checking' })],
    started: [
      started('a', 'chase', 20_000, today, 1),
      started('b', 'amex', 20_000, today, 2),
    ],
    today,
  });
  assert.equal(
    owed.chase.waiting[0].hasLeft,
    true,
    'the earlier note takes the one transfer',
  );
  assert.equal(
    owed.amex.waiting[0].hasLeft,
    false,
    'one bank transfer never settles two cards',
  );
  assert.equal(owed.chase.heldCents + owed.amex.heldCents, 20_000);
}

{
  const today = d(2026, 11, 15);
  const cards = [{ id: 'chase', postedCents: 30_000 }];
  const note = started('s', 'chase', 30_000, today);
  const preferred = getBankOwedByCard({
    cards,
    purchases: [
      {
        ...bank('rent', today, 30_000, { accountId: 'checking' }),
        category: 'RENT_AND_UTILITIES_RENT',
      },
      {
        ...bank('pay', today + 8 * DAY, 30_000, { accountId: 'checking' }),
        category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      },
    ],
    started: [note, started('s2', 'chase', 30_000, today + 10 * DAY, 2)],
    today: today + 10 * DAY,
  }).chase;
  assert.deepEqual(
    preferred.waiting.map((entry) => [entry.payment.id, entry.hasLeft]),
    [
      ['s', true],
      ['s2', false],
    ],
    'an outflow the bank marks as a card payment is taken before an earlier one of the same amount, such as rent',
  );
  const expired = getBankOwedByCard({
    cards,
    purchases: [bank('out', today, 30_000, { accountId: 'checking' })],
    started: [note],
    today: today + 15 * DAY,
  }).chase;
  assert.deepEqual(
    expired,
    { postedCents: 30_000, pendingCents: 0, waiting: [], heldCents: 30_000 },
    'a note the card never shows within two weeks is no longer waited for, so it never holds Free to Spend up for good',
  );
}

// deriveBalances: at Link a card's bank figure replaces the ledger's, and only while cards count; the money history starts from what the person entered.
{
  const start = 10 * DAY;
  const moves: OpenMove[] = [
    {
      id: 'm1',
      kind: 'start',
      date: start,
      refId: null,
      reversesMoveId: null,
      createdAt: 1,
      payload: { amountCents: 100_000, holding: 'money' },
    },
  ];
  const input = {
    startDate: start,
    moves,
    records: [],
    arrivedOn: new Map<string, number>(),
    kinds: { chase: 'card' } as const,
    purchases: [],
  };
  const ledger = deriveBalances(input);
  assert.equal(ledger.reserveByCard.chase ?? 0, 0);
  const banked = deriveBalances({
    ...input,
    bankOwedByCard: { chase: 30_000 },
  });
  assert.equal(
    banked.reserveByCard.chase,
    30_000,
    'the bank figure stands for the card',
  );
  assert.equal(banked.assignedToCardsCents, 30_000);
  assert.equal(
    deriveBalancesBefore(
      { ...input, bankOwedByCard: { chase: 30_000 } },
      start + DAY,
    ).reserveByCard.chase,
    30_000,
    'an earlier day holds today’s bank figure, since the ledger’s card sum is what the bank corrects',
  );
  assert.equal(
    banked.freeToSpendCents,
    ledger.freeToSpendCents - 30_000,
    'and Free to Spend holds it back',
  );
  const off = deriveBalances({
    ...input,
    isCountingCards: false,
    bankOwedByCard: { chase: 30_000 },
  });
  assert.equal(
    off.assignedToCardsCents,
    0,
    'with cards not counted the bank figure is ignored',
  );

  const withCard = {
    ...input,
    moves: [
      ...moves,
      {
        id: 'm2',
        kind: 'start' as const,
        date: start,
        refId: 'chase',
        reversesMoveId: null,
        createdAt: 2,
        payload: { amountCents: 25_000, holding: 'card' as const },
      },
    ],
    bankOwedByCard: { chase: 9_684 },
  };
  const today = start + 20 * DAY;
  const history = getMoneyHistory({
    balances: { ...withCard, asOf: today },
    today,
    from: start,
    recentFrom: start,
    closings: [],
  });
  assert.equal(
    history[0].freeCents,
    100_000 - 25_000,
    'the starting day reads the card as the person entered it, not today’s bank figure',
  );
  assert.equal(
    history.at(-1)?.freeCents,
    100_000 - 9_684,
    'today reads the bank figure',
  );
}

// The due warning at Link: only an unpaid minimum near or past its due day.
{
  const card = {
    id: 'chase',
    issuer: 'Chase',
    name: null,
    dueDay: 14,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    linkId: 'link',
  } as unknown as OpenCard;
  const statement = (
    patch: Partial<OpenCardStatement> = {},
  ): OpenCardStatement => ({
    id: 'chase',
    asOf: 1,
    minimumCents: 3_500,
    statementCents: 41_200,
    statementOn: d(2026, 10, 24),
    dueOn: d(2026, 11, 14),
    lastPaymentCents: null,
    lastPaymentOn: null,
    ...patch,
  });
  const base = {
    card,
    statement: statement(),
    started: [] as OpenStartedPayment[],
    owedCents: 41_200,
    today: d(2026, 11, 10),
    days: 7,
    since: 0,
  };
  assert.deepEqual(getBankDueState(base), {
    card,
    dueOn: d(2026, 11, 14),
    inDays: 4,
    isPastDue: false,
    rolledFrom: null,
    waitingCents: 41_200,
  });
  assert.equal(
    getBankDueState({ ...base, today: d(2026, 11, 1) }),
    null,
    'not yet within the warning window',
  );
  assert.equal(
    getBankDueState({ ...base, today: d(2026, 11, 20) })?.isPastDue,
    true,
    'an unpaid minimum past its due day stays warned',
  );
  assert.equal(
    getBankDueState({
      ...base,
      statement: statement({
        lastPaymentCents: 3_500,
        lastPaymentOn: d(2026, 11, 2),
      }),
    }),
    null,
    'the bank shows the minimum paid, so owing the rest is not a warning',
  );
  assert.equal(
    getBankDueState({ ...base, statement: statement({ minimumCents: null }) }),
    null,
    'a minimum the bank does not share never warns',
  );
  assert.equal(
    getBankDueState({ ...base, statement: statement({ minimumCents: 0 }) }),
    null,
  );
  assert.equal(getBankDueState({ ...base, statement: null }), null);
  assert.equal(
    getBankDueState({ ...base, owedCents: 0 }),
    null,
    'nothing owed, nothing due',
  );
  assert.equal(
    getBankDueState({
      ...base,
      started: [started('s', 'chase', 3_500, d(2026, 11, 9))],
    }),
    null,
    'a payment the person started since the statement that covers the minimum quiets it',
  );
  assert.notEqual(
    getBankDueState({
      ...base,
      today: d(2026, 11, 25),
      started: [started('s', 'chase', 3_500, d(2026, 11, 9))],
    }),
    null,
    'once a started payment is no longer waited for, the unpaid minimum warns again',
  );
  assert.notEqual(
    getBankDueState({
      ...base,
      started: [started('s', 'chase', 3_000, d(2026, 11, 9))],
    }),
    null,
    'a started payment below the minimum does not',
  );
  assert.notEqual(
    getBankDueState({
      ...base,
      started: [started('s', 'chase', 3_500, d(2026, 10, 20))],
    }),
    null,
    'one started before the statement was for the one before',
  );
  assert.equal(
    getBankDueState({ ...base, since: d(2026, 11, 15) }),
    null,
    'a due day before the plan or the card began never warns',
  );

  const reserve = { chase: 41_200 };
  assert.deepEqual(
    getDueCards([card], reserve, [], base.today, 7, 0, { chase: null }),
    [],
    'a card read from the bank with no warning never falls back to Runway’s own payments',
  );
  assert.equal(
    getDueCards([card], reserve, [], base.today, 7, 0, {
      chase: getBankDueState(base),
    }).length,
    1,
  );

  // Account moves read the same bank answer over their own window: a started payment that covers the minimum takes the card off "Money to move".
  const forMoves = (payments: OpenStartedPayment[], waitedOn = base.today) =>
    getDueCards(
      [card],
      reserve,
      [],
      d(2026, 11, 1),
      20,
      0,
      getBankDueByCard({
        owed: {
          chase: {
            postedCents: 41_200,
            pendingCents: 0,
            waiting: [],
            heldCents: 41_200,
          },
        },
        cards: [card],
        runway: {
          cardStatements: [statement()],
          links: [{ id: 'link', status: 'active' }] as never,
        },
        started: payments,
        startDate: 0,
        today: d(2026, 11, 1),
        days: 20,
        waitedOn,
      }),
    );
  assert.equal(
    forMoves([]).length,
    1,
    'an unpaid minimum due inside the window is a move',
  );
  assert.deepEqual(
    forMoves([started('s', 'chase', 41_200, d(2026, 11, 9))]),
    [],
    'a started payment that covers the minimum is not a move to do',
  );
  assert.equal(
    forMoves([started('s', 'chase', 41_200, d(2026, 10, 28))], d(2026, 11, 10))
      .length,
    0,
    'still waited for on the real today, so it still covers',
  );
  assert.equal(
    forMoves([started('s', 'chase', 41_200, d(2026, 10, 28))], d(2026, 11, 12))
      .length,
    1,
    'no longer waited for on the real today, though it was when the window began',
  );
  assert.equal(
    getBankDueByCard({
      owed: {
        chase: {
          postedCents: 41_200,
          pendingCents: 0,
          waiting: [],
          heldCents: 41_200,
        },
      },
      cards: [card],
      runway: {
        cardStatements: [statement({ dueOn: d(2026, 11, 30) })],
        links: [{ id: 'link', status: 'active' }] as never,
      },
      started: [started('s', 'chase', 41_200, d(2026, 11, 2))],
      startDate: 0,
      today: d(2026, 11, 20),
      days: 14,
      waitedOn: d(2026, 11, 10),
    }).chase,
    null,
    'a window that starts later than today still judges the payment on today',
  );
}

console.log('runway card bank: ok');
