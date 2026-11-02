import { useAppSelector } from '@/store';
import {
  getIncomeDaysPerMonth,
  monthlyTotal,
  type GroupTotal,
} from '@apps/runway/engine/groups';
import {
  selectBills,
  selectEnvelopes,
  selectGroups,
  selectResolvedPlan,
  type ResolvedBill,
  type ResolvedEnvelope,
} from '@apps/runway/store/selectors/runwaySelectors';
import { fundingAtLevel } from '@apps/runway/engine/parts';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { FundingRule, Priority } from '@apps/runway/types';
import { getGroupMemberNames } from '@apps/runway/utils/billText';

const toBillMember = ({ version: bill }: ResolvedBill) => ({
  name: bill.payload.name,
  amount: bill.payload.amount,
  schedule: bill.payload.timing.schedule,
  startsOn: bill.effectiveFrom,
  ending: bill.payload.ending,
});

const toEnvelopeMember = (
  { version: envelope }: ResolvedEnvelope,
  today: number,
  payLines: Parameters<typeof getIncomeDaysPerMonth>[0],
  funding: FundingRule,
) => ({
  name: envelope.payload.name,
  funding,
  startsOn: envelope.effectiveFrom,
  incomeDaysPerMonth: getIncomeDaysPerMonth(
    payLines,
    today,
    envelope.payload.funding.sourceId ?? null,
  ),
});

/** The envelopes that count at `dial`, each with only its parts at or above it. */
const toCountedMembers = (
  envelopes: readonly ResolvedEnvelope[],
  dial: Priority,
  today: number,
  payLines: Parameters<typeof getIncomeDaysPerMonth>[0],
) =>
  envelopes.flatMap((envelope) => {
    const funding = fundingAtLevel(envelope.version.payload, dial);
    return funding
      ? [toEnvelopeMember(envelope, today, payLines, funding)]
      : [];
  });

const useResolvedPayLines = (today: number) => {
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  return plan.flatMap(({ item: source, payLines: lines }) =>
    lines.map(({ version }) => ({
      sourceId: source.id,
      schedule: version.payload.schedule,
      amount: version.payload.amount,
      startsOn: version.effectiveFrom,
      ending: version.payload.ending,
    })),
  );
};

/** What the whole plan's income, bills and envelopes each come to in a usual month, counting only the bills and envelopes at or above `dial`. */
export function usePlanTotals(
  today: number,
  dial: Priority = 'want',
): Record<'income' | 'bills' | 'envelopes', GroupTotal> {
  const bills = useAppSelector((state) => selectBills(state, today)).filter(
    ({ version }) => isCountedAt(version.payload.priority, dial),
  );
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const payLines = useResolvedPayLines(today);
  // A month from today, so items starting later this month or early next one still count late in a month.
  const usualMonth = today + 30 * 86_400_000;
  return {
    income: monthlyTotal(payLines, usualMonth),
    bills: monthlyTotal(bills.map(toBillMember), usualMonth),
    envelopes: monthlyTotal(
      [],
      usualMonth,
      toCountedMembers(envelopes, dial, today, payLines),
    ),
  };
}

export interface GroupFigures {
  id: string;
  name: string;
  /** What its bills and envelopes come to in a usual month: the one figure a heading and the group's sheet both show. */
  total: GroupTotal;
  /** The same figure for its bills alone and its envelopes alone: the Bills and Envelopes headings each show their own. */
  billsTotal: GroupTotal;
  envelopesTotal: GroupTotal;
  bills: ResolvedBill[];
  envelopes: ResolvedEnvelope[];
  /** The names its monthly figure stands for. */
  names: string[];
}

/** Every live group with the bills and envelopes that are for it and their monthly totals (counting only those at or above `dial`), combined and for each kind alone; one with an archived group sits in none. */
export function useGroupFigures(
  today: number,
  dial: Priority = 'want',
): GroupFigures[] {
  const groups = useAppSelector((state) => selectGroups(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const payLines = useResolvedPayLines(today);
  return groups.map(({ item, version }) => {
    const memberBills = bills.filter(
      ({ version: bill }) => bill.payload.groupId === item.id,
    );
    const memberEnvelopes = envelopes.filter(
      ({ version: envelope }) => envelope.payload.groupId === item.id,
    );
    const billMembers = memberBills.map(toBillMember);
    const envelopeMembers = toCountedMembers(
      memberEnvelopes,
      'want',
      today,
      payLines,
    );
    const countedBills = memberBills
      .filter(({ version: bill }) => isCountedAt(bill.payload.priority, dial))
      .map(toBillMember);
    const countedEnvelopes = toCountedMembers(
      memberEnvelopes,
      dial,
      today,
      payLines,
    );
    return {
      id: item.id,
      name: version.payload.name,
      total: monthlyTotal(countedBills, today, countedEnvelopes),
      billsTotal: monthlyTotal(countedBills, today),
      envelopesTotal: monthlyTotal([], today, countedEnvelopes),
      bills: memberBills,
      envelopes: memberEnvelopes,
      names: getGroupMemberNames(billMembers, envelopeMembers, today),
    };
  });
}
