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

export interface GroupFigures {
  id: string;
  name: string;
  /** What its bills and envelopes come to in a usual month: the one figure a heading and the group's sheet both show. */
  total: GroupTotal;
  bills: ResolvedBill[];
  envelopes: ResolvedEnvelope[];
  /** The names its monthly figure stands for. */
  names: string[];
}

/** Every live group with the bills and envelopes that are for it and their combined monthly total; one with an archived group sits in none. */
export function useGroupFigures(today: number): GroupFigures[] {
  const groups = useAppSelector((state) => selectGroups(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const incomeDaysPerMonth = getIncomeDaysPerMonth(
    plan.flatMap(({ payLines }) =>
      payLines.map(({ version }) => ({
        schedule: version.payload.schedule,
        startsOn: version.effectiveFrom,
        ending: version.payload.ending,
      })),
    ),
    today,
  );
  return groups.map(({ item, version }) => {
    const memberBills = bills.filter(
      ({ version: bill }) => bill.payload.groupId === item.id,
    );
    const memberEnvelopes = envelopes.filter(
      ({ version: envelope }) => envelope.payload.groupId === item.id,
    );
    const billMembers = memberBills.map(({ version: bill }) => ({
      name: bill.payload.name,
      amount: bill.payload.amount,
      schedule: bill.payload.timing.schedule,
      startsOn: bill.effectiveFrom,
      ending: bill.payload.ending,
    }));
    const envelopeMembers = memberEnvelopes.map(({ version: envelope }) => ({
      name: envelope.payload.name,
      funding: envelope.payload.funding,
      startsOn: envelope.effectiveFrom,
    }));
    return {
      id: item.id,
      name: version.payload.name,
      total: monthlyTotal(
        billMembers,
        today,
        envelopeMembers,
        incomeDaysPerMonth,
      ),
      bills: memberBills,
      envelopes: memberEnvelopes,
      names: getGroupMemberNames(
        billMembers,
        envelopeMembers,
        today,
        incomeDaysPerMonth,
      ),
    };
  });
}
