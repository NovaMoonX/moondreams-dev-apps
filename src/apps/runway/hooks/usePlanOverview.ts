import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
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

const monthlyFigure = (total: MoneyRange, rest: string): FigureSegment[] =>
  total.highCents === 0 ? [WORDS.nothingYet] : [range(total), ` ${rest}`];

/** The headline each Plan view's tile shows in either mode, every figure from the selectors that view's own screen reads. */
export function usePlanOverview(today: number, mode: OverviewMode) {
  const { dial } = usePriorityDial();
  const { isHidden } = useValuesHidden();
  const totals = usePlanTotals(today, dial);
  const balances = useAppSelector(selectBalances);
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const horizonItems = useAppSelector((state) =>
    selectHorizonItems(state, today),
  );
  const dueBeforePay = useAppSelector((state) =>
    selectBillsDueBeforePay(state, today, dial),
  );
  const horizonShort = useAppSelector((state) =>
    selectHorizonShortCents(state, today, dial),
  );
  const goalsMonthly = useGoalsMonthly(today, dial);
  const saved = useGoalsSaved(today);
  // The line above the tiles already names the priority, so a tile only says "a month".
  const monthRest = WORDS.monthly;
  const isMonthly = mode === 'monthly';

  const inEnvelopesCents = envelopes
    .filter(({ version }) => isCountedAt(version.payload.priority, dial))
    .reduce(
      (sum, { item }) =>
        sum + Math.max(0, balances.assignedByItem[item.id] ?? 0),
      0,
    );

  const countedHorizon = horizonItems.filter(({ version }) =>
    isCountedAt(version.payload.priority, dial),
  );
  const setAsideCents = countedHorizon.reduce(
    (sum, { item }) => sum + Math.max(0, balances.assignedByItem[item.id] ?? 0),
    0,
  );

  const getBills = (): FigureSegment[] => {
    const monthly = monthlyFigure(totals.bills.total, monthRest);
    if (isMonthly || dueBeforePay === null || bills.length === 0)
      return monthly;
    const payDay = formatDateOrdinalUTC(dueBeforePay.payOn);
    return dueBeforePay.cents === 0
      ? [WORDS.nothingBeforePay(payDay)]
      : [money(dueBeforePay.cents), ` ${WORDS.dueBeforePay(payDay)}`];
  };
  const getEnvelopes = (): FigureSegment[] =>
    isMonthly || envelopes.length === 0
      ? monthlyFigure(totals.envelopes.total, monthRest)
      : [money(inEnvelopesCents), ` ${WORDS.inEnvelopes}`];
  const getGoals = (): FigureSegment[] =>
    isMonthly || saved.targetCents === 0
      ? monthlyFigure(goalsMonthly, monthRest)
      : [
          money(saved.savedCents),
          WORDS.savedOf,
          money(saved.targetCents),
          ` ${PRIORITY_DIAL_WORDS.savedRest.want}`,
        ];
  const getHorizon = (): FigureSegment[] => {
    if (countedHorizon.length === 0) return [WORDS.nothingYet];
    const cents = isMonthly ? horizonShort : setAsideCents;
    // A direction word beside a masked amount would still say whether anything is short.
    if (isHidden) return [money(cents), ` ${WORDS.onHorizon}`];
    if (!isMonthly) return [money(cents), ` ${WORDS.setAside}`];
    return cents > 0
      ? [money(cents), ` ${WORDS.shortInTotal}`]
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
      income: monthlyFigure(totals.income.total, WORDS.monthly),
      bills: getBills(),
      envelopes: getEnvelopes(),
      goals: getGoals(),
      horizon: getHorizon(),
      cards: getCards(),
    },
    /** The sum the dial's trimmed total stands for a month; null while the dial counts everything or the tiles show totals. */
    priority:
      dial === 'want' || !isMonthly
        ? null
        : {
            counted: PRIORITY_DIAL_WORDS.counted[dial],
            total: range(priorityTotal),
          },
  };
}
