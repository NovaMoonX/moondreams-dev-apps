import { useAppSelector } from '@/store';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillSealed,
  EnvelopeSealed,
  FundingPay,
  GoalSealed,
} from '@apps/runway/types';

export type PayMember =
  | { kind: 'bill'; itemId: string; payload: BillSealed; pay: FundingPay }
  | {
      kind: 'envelope';
      itemId: string;
      payload: EnvelopeSealed;
      pay: FundingPay;
    }
  | { kind: 'goal'; itemId: string; payload: GoalSealed; pay: FundingPay };

/** Every live bill, envelope and goal whose "Comes out of" names a pay of this pay line (or of any pay line of this income source), with the pay it names. */
export function usePayMembers(
  itemId: string,
  kind: 'source' | 'payLine',
  today: number,
) {
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const sourceLines = plan.find(({ item }) => item.id === itemId)?.payLines;
  const payLineIds =
    kind === 'payLine'
      ? [itemId]
      : (sourceLines ?? []).map((line) => line.item.id);
  const isIn = (pay: FundingPay | null | undefined): pay is FundingPay =>
    pay != null && payLineIds.includes(pay.payLineId);
  const members: PayMember[] = [
    ...bills.flatMap(({ item, version }): PayMember[] => {
      const { fundedBy } = version.payload;
      return fundedBy.kind === 'pay' && isIn(fundedBy)
        ? [
            {
              kind: 'bill',
              itemId: item.id,
              payload: version.payload,
              pay: {
                payLineId: fundedBy.payLineId,
                monthDay: fundedBy.monthDay,
              },
            },
          ]
        : [];
    }),
    ...envelopes.flatMap(({ item, version }): PayMember[] =>
      isIn(version.payload.funding.pay)
        ? [
            {
              kind: 'envelope',
              itemId: item.id,
              payload: version.payload,
              pay: version.payload.funding.pay,
            },
          ]
        : [],
    ),
    ...goals.flatMap(({ item, version }): PayMember[] =>
      isIn(version.payload.funding.pay)
        ? [
            {
              kind: 'goal',
              itemId: item.id,
              payload: version.payload,
              pay: version.payload.funding.pay,
            },
          ]
        : [],
    ),
  ];
  return { members, payLineIds, plan, bills, envelopes, goals };
}
