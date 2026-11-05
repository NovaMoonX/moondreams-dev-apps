import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { withoutSpending } from '@apps/runway/engine/closings';
import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths, DAY_MS } from '@apps/runway/engine/dates';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import {
  getMoneyHistory,
  getMoneyProjection,
  MONEY_RANGE_DAYS,
  type MoneyRange,
} from '@apps/runway/engine/moneyHistory';
import { closingsQueryOptions } from '@apps/runway/queries/closingQueries';
import { selectBalanceInputs } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectClosingBase,
  selectRecentFrom,
} from '@apps/runway/store/selectors/historySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectBillPayments,
  selectEnvelopes,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';
import { isTrackingLevel } from '@apps/runway/engine/level';

const RANGES = ['1m', '6m', '1y'] as const;

/** Where the money stood over `range` and where the plan takes it over the next year (or to its last income day, when that comes sooner), with the ranges the history is long enough to tell apart. */
export function useMoneySeries(
  range: MoneyRange,
  today: DateOnly,
  lookahead: Lookahead | null,
) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const balances = useAppSelector(selectBalanceInputs);
  const recentFrom = useAppSelector(selectRecentFrom);
  const base = useAppSelector(selectClosingBase);
  const dirtyFrom = useAppSelector(
    (state) => state.runway.plan?.dirtyFrom ?? null,
  );
  const isTrack = useAppSelector((state) =>
    isTrackingLevel(selectLevel(state)),
  );
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const envelopeIds = useMemo(
    () => new Set(envelopes.map(({ item }) => item.id)),
    [envelopes],
  );
  const startDate = balances.startDate;
  const spanDays =
    startDate === null ? 0 : Math.round((today - startDate) / DAY_MS);
  const ranges: MoneyRange[] = [
    ...RANGES.filter((entry) => spanDays > MONEY_RANGE_DAYS[entry]),
    'all',
  ];
  const shown = ranges.includes(range) ? range : 'all';
  const from =
    shown === 'all' || startDate === null
      ? (startDate ?? today)
      : Math.max(startDate, today - MONEY_RANGE_DAYS[shown] * DAY_MS);
  const needsClosings =
    uid !== null && base !== null && recentFrom !== null && from < recentFrom;
  const closings = useQuery({
    ...closingsQueryOptions({
      uid: uid ?? '',
      throughMonth: base?.month ?? '',
      dirtyFrom,
    }),
    enabled: needsClosings,
  });
  const isClosingsReady =
    !needsClosings || closings.isSuccess || closings.isError;

  const history = useMemo(() => {
    if (recentFrom === null || !isClosingsReady || startDate === null)
      return null;
    const read = (closings.data ?? []).filter(
      (state) => state.startDate === startDate,
    );
    return getMoneyHistory({
      balances,
      today,
      from: closings.isError ? Math.max(from, recentFrom) : from,
      recentFrom,
      closings: isTrack ? read : read.map(withoutSpending),
    });
  }, [
    balances,
    today,
    from,
    recentFrom,
    isClosingsReady,
    closings.data,
    closings.isError,
    startDate,
    isTrack,
  ]);

  const now = history?.at(-1) ?? null;
  const yearOut = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const until = Math.min(yearOut, lookahead?.incomeEndsOn ?? yearOut);
  const ahead = useMemo(
    () =>
      now === null || lookahead === null
        ? []
        : getMoneyProjection({
            today,
            now,
            steps: lookahead.steps,
            payments,
            billsSince: Math.max(startDate ?? 0, recentFrom ?? 0),
            until,
            spentItemIds: envelopeIds,
          }),
    [
      now,
      lookahead,
      payments,
      today,
      startDate,
      recentFrom,
      envelopeIds,
      until,
    ],
  );

  const isPartial = needsClosings && closings.isError;
  const endsOn = until < yearOut && ahead.length > 0 ? until : null;
  const result = {
    history,
    ahead,
    endsOn,
    ranges,
    range: shown,
    spanDays,
    isPartial,
  };
  return result;
}
