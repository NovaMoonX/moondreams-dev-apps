// Run with `npm run check:waypoint-balances`: the server's what-you-owe reading must match the app's Dues summary.
import assert from 'node:assert/strict';

import { computeBalance } from '../../functions/src/apps/waypoint/share/balances.ts';
import type { TripExpense } from '../../src/apps/waypoint/types.ts';
import { computePairSettlements } from '../../src/apps/waypoint/utils/splitCalculators.ts';

const sharedBalance = (list: TripExpense[], members: string[], uid: string) => {
  const nets = computePairSettlements(list, members)
    .filter((pair) => pair.personA === uid || pair.personB === uid)
    .map((pair) => (pair.personA === uid ? pair.netAmount : -pair.netAmount))
    .filter((net) => Math.abs(net) > 0.005);
  const cents = (amounts: number[]) =>
    Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 100);
  return {
    oweCents: cents(nets.filter((net) => net > 0)),
    owedCents: cents(nets.filter((net) => net < 0).map((net) => -net)),
  };
};
const ledgerMembers = ['a', 'b', 'c'];
const ledgerBase = {
  amountMin: null,
  amountMax: null,
  paidAmount: null,
  isPerPerson: false,
  splitAmounts: null,
  paidMemberStatus: {},
  earlyPayments: {},
  targetMemberIds: [] as string[],
  targetType: 'EVERYONE_CURRENT',
  amount: null,
  payerUid: null,
  status: 'PAID',
};
const ledger = [
  { ...ledgerBase, payerUid: 'a', amount: 100 },
  {
    ...ledgerBase,
    payerUid: 'b',
    amount: 33.35,
    targetType: 'SPECIFIC_MEMBERS',
    targetMemberIds: ['a', 'b', 'c'],
  },
  {
    ...ledgerBase,
    payerUid: 'c',
    amount: 10,
    isPerPerson: true,
    targetType: 'SPECIFIC_MEMBERS',
    targetMemberIds: ['a', 'c'],
  },
  {
    ...ledgerBase,
    payerUid: 'a',
    amount: 60,
    splitAmounts: { a: 10, b: 20, c: 30 },
    paidMemberStatus: { c: { isPaid: true } },
  },
  {
    ...ledgerBase,
    payerUid: 'b',
    amount: 45,
    earlyPayments: { c: { toUid: 'b', amount: 5, isReturned: false } },
  },
  {
    ...ledgerBase,
    status: 'EXPECTED',
    amountMin: 20,
    amountMax: 40,
    earlyPayments: {
      a: { toUid: 'c', amount: 12, isReturned: false },
      b: { toUid: 'c', amount: 3, isReturned: true },
    },
    payerUid: 'c',
  },
  { ...ledgerBase, payerUid: 'b', paidAmount: 30, status: 'PAID' },
  { ...ledgerBase, targetType: 'JUST_ME', payerUid: 'a', amount: 8 },
] as unknown as TripExpense[];
ledgerMembers.forEach((uid) => {
  const real = sharedBalance(ledger, ledgerMembers, uid);
  const ported = computeBalance(
    ledger.map((one) => ({
      ...one,
      repaidUids: Object.entries(one.paidMemberStatus)
        .filter(([, mark]) => mark.isPaid)
        .map(([key]) => key),
    })),
    ledgerMembers,
    uid,
  );
  assert.deepEqual(ported, real, `balance of ${uid}`);
});

console.log('Waypoint balances match the app.');
