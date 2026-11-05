import { useAppSelector } from '@/store';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  CARD_WORDS,
  PLAN_OVERVIEW_WORDS as WORDS,
  PRIORITY_DIAL_WORDS,
} from '@apps/runway/constants';
import {
  useGoalsMonthly,
  usePlanTotals,
} from '@apps/runway/hooks/useGroupFigures';
import { useGoalsSaved } from '@apps/runway/hooks/useGoalsSaved';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBillsDueBeforePay,
  selectHorizonShortCents,
} from '@apps/runway/store/selectors/overviewSelectors';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { MoneyRange } from '@apps/runway/types';

export type OverviewMode = 'monthly' | 'total';

/** A tile's line: plain words and the amounts that stay masked while amounts are hidden. */
export type FigureSegment = string | { private: string };

const money = (cents: number): FigureSegment => ({
  private: formatCentsShort(cents),
});
const range = ({ lowCents, highCents }: MoneyRange): FigureSegment => ({
  private:
    lowCents === highCents
      ? formatCentsShort(highCents)
      : `${formatCentsShort(lowCents)} to ${formatCentsShort(highCents)}`,
});

const monthlyFigure = (
  total: MoneyRange,
  hasItems: boolean,
  isTrimmed: boolean,
  rest: string,
): FigureSegment[] =>
  total.highCents === 0 && !(hasItems && isTrimmed)
    ? [WORDS.nothingYet]
    : [range(total), ` ${rest}`];

/** The headline each Plan view's tile shows in either mode, every figure from the selectors that view's own screen reads. */
export function usePlanOverview(today: number, mode: OverviewMode) {
  const { dial, isTrimmed } = usePriorityDial();
  const totals = usePlanTotals(today, dial);
  const balances = useAppSelector(selectBalances);
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const horizonItems = useAppSelector((state) =>
    selectHorizonItems(state, today),
  );
  const dueBeforePay = useAppSelector((state) =>
    selectBillsDueBeforePay(state, today, dial),
  );
  const horizonShort = useAppSelector((state) =>
    selectHorizonShortCents(state, today),
  );
  const goalsMonthly = useGoalsMonthly(today, dial);
  const saved = useGoalsSaved(today);
  const monthRest = PRIORITY_DIAL_WORDS.monthRest[dial];
  const isMonthly = mode === 'monthly';

  const inEnvelopesCents = envelopes
    .filter(({ version }) => isCountedAt(version.payload.priority, dial))
    .reduce(
      (sum, { item }) =>
        sum + Math.max(0, balances.assignedByItem[item.id] ?? 0),
      0,
    );

  const getBills = (): FigureSegment[] => {
    const monthly = monthlyFigure(
      totals.bills.total,
      bills.length > 0,
      isTrimmed,
      monthRest,
    );
    if (isMonthly || dueBeforePay === null || bills.length === 0)
      return monthly;
    return dueBeforePay === 0
      ? [WORDS.nothingBeforePay]
      : [money(dueBeforePay), ` ${WORDS.dueBeforePay}`];
  };
  const getEnvelopes = (): FigureSegment[] => {
    if (isMonthly || envelopes.length === 0)
      return monthlyFigure(
        totals.envelopes.total,
        envelopes.length > 0,
        isTrimmed,
        monthRest,
      );
    return [
      money(inEnvelopesCents),
      ` ${WORDS.inEnvelopes}${isTrimmed ? `, ${PRIORITY_DIAL_WORDS.sheetSuffix[dial as 'must' | 'should']}` : ''}`,
    ];
  };
  const getGoals = (): FigureSegment[] => {
    if (isMonthly || !saved.hasTargets)
      return monthlyFigure(
        goalsMonthly,
        goals.length > 0,
        isTrimmed,
        monthRest,
      );
    return [
      money(saved.savedCents),
      WORDS.savedOf,
      money(saved.targetCents),
      ` ${PRIORITY_DIAL_WORDS.savedRest[dial]}`,
    ];
  };
  const getHorizon = (): FigureSegment[] => {
    if (horizonItems.length === 0) return [WORDS.nothingYet];
    if (!isMonthly)
      return [money(balances.assignedToHorizonCents), ` ${WORDS.setAside}`];
    return horizonShort > 0
      ? [money(horizonShort), ` ${WORDS.short}`]
      : [WORDS.nothingShort];
  };
  const getCards = (): FigureSegment[] =>
    balances.assignedToCardsCents > 0
      ? [
          money(balances.assignedToCardsCents),
          ` ${CARD_WORDS.waiting.toLowerCase()}`,
        ]
      : [CARD_WORDS.nothingToPay];

  const priorityTotal: MoneyRange = {
    lowCents:
      totals.bills.total.lowCents +
      totals.envelopes.total.lowCents +
      goalsMonthly.lowCents,
    highCents:
      totals.bills.total.highCents +
      totals.envelopes.total.highCents +
      goalsMonthly.highCents,
  };

  return {
    figures: {
      income: monthlyFigure(totals.income.total, true, false, WORDS.monthly),
      bills: getBills(),
      envelopes: getEnvelopes(),
      goals: getGoals(),
      horizon: getHorizon(),
      cards: getCards(),
    },
    /** The sum the dial's trimmed total stands for; null while the dial counts everything. */
    priority:
      dial === 'want'
        ? null
        : {
            counted: PRIORITY_DIAL_WORDS.counted[dial],
            total: range(priorityTotal),
          },
  };
}
