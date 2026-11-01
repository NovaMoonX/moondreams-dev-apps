import { Wallet } from 'lucide-react';

import { useAppSelector } from '@/store';
import { PAID_FROM_WORDS } from '@apps/runway/constants';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import {
  selectComingDays,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillVersion } from '@apps/runway/types';
import {
  describePaidFrom,
  getOneTimePayIds,
  hasPaysToChoose,
} from '@apps/runway/utils/payFrom';

/** A repeating bill's "Paid from · The pay on the 30th" row, opening that question of its form; undefined when there is nothing to choose between or `billId` is '' (not a bill). */
export function usePaidFromAction(billId: string, today: number) {
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const bill = useAppSelector((state) =>
    billId === ''
      ? null
      : resolveCurrentOrNext(
          state.runway.versions.filter(
            (version): version is BillVersion => version.kind === 'bill',
          ),
          billId,
          today,
        ),
  )?.payload;
  if (!bill || bill.timing.schedule.kind === 'once') return undefined;
  const { kind } = bill.fundedBy;
  const canAsk =
    kind !== 'suggested' ||
    hasPaysToChoose(
      comingDays,
      bill.timing.schedule,
      today,
      getOneTimePayIds(plan),
    );
  if (!canAsk) return undefined;
  const what =
    kind === 'chosen'
      ? PAID_FROM_WORDS.chosenRow
      : kind === 'suggested'
        ? PAID_FROM_WORDS.spreadRow
        : describePaidFrom(bill.fundedBy, plan);
  return {
    label: PAID_FROM_WORDS.row(what),
    step: 'funding',
    icon: <Wallet />,
  };
}
