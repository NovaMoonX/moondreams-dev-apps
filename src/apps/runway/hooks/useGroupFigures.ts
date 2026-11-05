import { useAppSelector } from '@/store';
import { getMonthlyPaceCents } from '@apps/runway/engine/pace';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  getIncomeDaysPerMonth,
  monthlyTotal,
  type GroupTotal,
} from '@apps/runway/engine/groups';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectGroups,
  selectResolvedPlan,
  type ResolvedBill,
  type ResolvedEnvelope,
  type ResolvedGoal,
} from '@apps/runway/store/selectors/runwaySelectors';
import { fundingAtLevel } from '@apps/runway/engine/parts';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import type { FundingRule, MoneyRange, Priority } from '@apps/runway/types';
import { getGroupMemberNames } from '@apps/runway/utils/billText';

const toBillMember = ({ version: bill }: ResolvedBill) => ({
  name: bill.payload.name,
  amount: bill.payload.amount,
  schedule: bill.payload.timing.schedule,
  startsOn: bill.effectiveFrom,
  ending: bill.payload.ending,
});

const getEnvelopeIncomeDays = (
  payLines: Parameters<typeof getIncomeDaysPerMonth>[0],
  today: number,
  funding: FundingRule,
) => getIncomeDaysPerMonth(payLines, today, funding.sourceId ?? null);

const toEnvelopeMember = (
  { version: envelope }: ResolvedEnvelope | ResolvedGoal,
  today: number,
  payLines: Parameters<typeof getIncomeDaysPerMonth>[0],
  funding: FundingRule,
) => ({
  name: envelope.payload.name,
  funding,
  startsOn: envelope.effectiveFrom,
  incomeDaysPerMonth: getEnvelopeIncomeDays(
    payLines,
    today,
    envelope.payload.funding,
  ),
});

/** The envelopes or goals that count at `dial`, each with only its parts at or above it. */
const toCountedMembers = (
  envelopes: readonly (ResolvedEnvelope | ResolvedGoal)[],
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

/** Income days a usual month holds for the pay an envelope's rule draws on, counted as its group total counts them. */
export function useIncomeDaysPerMonth(today: number) {
  const payLines = useResolvedPayLines(today);
  return (funding: FundingRule) =>
    getEnvelopeIncomeDays(payLines, today, funding);
}

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

/** A goal adds a monthly amount only while it is active and money goes into it. */
const isFundedGoal = ({ version }: ResolvedGoal) =>
  version.payload.state !== 'paused' &&
  version.payload.funding.cadence.kind !== 'none';

/** What the goals counted at `dial` take in a usual month: a goal with a date at the pace that finishes it on time, one without at what its rule puts in. */
export function useGoalsMonthly(today: number, dial: Priority): MoneyRange {
  const goals = useAppSelector((state) => selectGoals(state, today));
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const payLines = useResolvedPayLines(today);
  const live = goals.filter(
    ({ version }) =>
      version.payload.state !== 'paused' &&
      isCountedAt(version.payload.priority, dial),
  );
  const dated = live.filter(
    ({ version }) => version.payload.targetDate !== null,
  );
  const undated = live.filter(
    (goal) => goal.version.payload.targetDate === null && isFundedGoal(goal),
  );
  const paceCents = dated.reduce(
    (sum, { item, version }) =>
      sum +
      (getMonthlyPaceCents(
        {
          targetCents: version.payload.targetCents,
          targetDate: version.payload.targetDate,
          heldCents: Math.max(0, assignedByItem[item.id] ?? 0),
        },
        today,
      ) ?? 0),
    0,
  );
  const { total } = monthlyTotal(
    [],
    today + 30 * 86_400_000,
    toCountedMembers(undated, dial, today, payLines),
  );
  return {
    lowCents: paceCents + total.lowCents,
    highCents: paceCents + total.highCents,
  };
}

export interface GroupFigures {
  id: string;
  name: string;
  /** What its bills, envelopes and active goals come to in a usual month: the one figure a heading and the group's sheet both show. */
  total: GroupTotal;
  /** The same figure for each kind alone: the Bills, Envelopes and Goals headings each show their own. */
  billsTotal: GroupTotal;
  envelopesTotal: GroupTotal;
  goalsTotal: GroupTotal;
  bills: ResolvedBill[];
  envelopes: ResolvedEnvelope[];
  goals: ResolvedGoal[];
  /** The names its monthly figure stands for. */
  names: string[];
}

/** Every live group with the bills, envelopes and goals that are for it and their monthly totals (counting only those at or above `dial`), combined and for each kind alone; one with an archived group sits in none. */
export function useGroupFigures(
  today: number,
  dial: Priority = 'want',
): GroupFigures[] {
  const groups = useAppSelector((state) => selectGroups(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const payLines = useResolvedPayLines(today);
  return groups.map(({ item, version }) => {
    const memberBills = bills.filter(
      ({ version: bill }) => bill.payload.groupId === item.id,
    );
    const memberEnvelopes = envelopes.filter(
      ({ version: envelope }) => envelope.payload.groupId === item.id,
    );
    const memberGoals = goals.filter(
      ({ version: goal }) => goal.payload.groupId === item.id,
    );
    const fundedGoals = memberGoals.filter(isFundedGoal);
    const billMembers = memberBills.map(toBillMember);
    const envelopeMembers = toCountedMembers(
      memberEnvelopes,
      'want',
      today,
      payLines,
    );
    const goalMembers = toCountedMembers(fundedGoals, 'want', today, payLines);
    const countedBills = memberBills
      .filter(({ version: bill }) => isCountedAt(bill.payload.priority, dial))
      .map(toBillMember);
    const countedEnvelopes = toCountedMembers(
      memberEnvelopes,
      dial,
      today,
      payLines,
    );
    const countedGoals = toCountedMembers(fundedGoals, dial, today, payLines);
    return {
      id: item.id,
      name: version.payload.name,
      total: monthlyTotal(countedBills, today, [
        ...countedEnvelopes,
        ...countedGoals,
      ]),
      billsTotal: monthlyTotal(countedBills, today),
      envelopesTotal: monthlyTotal([], today, countedEnvelopes),
      goalsTotal: monthlyTotal([], today, countedGoals),
      bills: memberBills,
      envelopes: memberEnvelopes,
      goals: memberGoals,
      names: getGroupMemberNames(
        billMembers,
        [...envelopeMembers, ...goalMembers],
        today,
      ),
    };
  });
}
