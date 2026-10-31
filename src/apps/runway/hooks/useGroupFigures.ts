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
) => ({
  name: envelope.payload.name,
  funding: envelope.payload.funding,
  startsOn: envelope.effectiveFrom,
  incomeDaysPerMonth: getIncomeDaysPerMonth(
    payLines,
    today,
    envelope.payload.funding.sourceId ?? null,
  ),
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

/** What the whole plan's income, bills and envelopes each come to in a usual month. */
export function usePlanTotals(
  today: number,
): Record<'income' | 'bills' | 'envelopes', GroupTotal> {
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const payLines = useResolvedPayLines(today);
  return {
    income: monthlyTotal(payLines, today),
    bills: monthlyTotal(bills.map(toBillMember), today),
    envelopes: monthlyTotal(
      [],
      today,
      envelopes.map((envelope) => toEnvelopeMember(envelope, today, payLines)),
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

/** Every live group with the bills and envelopes that are for it and their monthly totals, combined and for each kind alone; one with an archived group sits in none. */
export function useGroupFigures(today: number): GroupFigures[] {
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
    const envelopeMembers = memberEnvelopes.map((envelope) =>
      toEnvelopeMember(envelope, today, payLines),
    );
    return {
      id: item.id,
      name: version.payload.name,
      total: monthlyTotal(billMembers, today, envelopeMembers),
      billsTotal: monthlyTotal(billMembers, today),
      envelopesTotal: monthlyTotal([], today, envelopeMembers),
      bills: memberBills,
      envelopes: memberEnvelopes,
      names: getGroupMemberNames(billMembers, envelopeMembers, today),
    };
  });
}
