import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import { PAID_FROM_WORDS } from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  selectIsDaysLoaded,
  selectIsPlanItemsLoaded,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillSealed } from '@apps/runway/types';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { describePayChoice } from '@apps/runway/utils/payFrom';

/** The sentence saying the pay a bill is set to come from can't carry its next payment, or null when it can. */
export function usePaidFromMessage(
  billId: string,
  bill: BillSealed,
  payment: BillPayment | null,
  today: number,
): string | null {
  const mask = useMaskedText();
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const isLoaded = useAppSelector(
    (state) => selectIsPlanItemsLoaded(state) && selectIsDaysLoaded(state),
  );
  const lookahead = useDeferredLookahead(today, isLoaded);
  const { fundedBy } = bill;

  if (
    (fundedBy.kind !== 'pay' && fundedBy.kind !== 'lastBefore') ||
    !payment ||
    payment.paid
  )
    return null;

  const dueOn = formatDateOrdinalUTC(payment.dueOn);
  const isUnfunded =
    payment.parts.length === 0 && payment.fundedCents < payment.totalCents;
  const payDays = new Set(payment.parts.map((part) => part.day.dayKey));
  const shortProblem =
    lookahead?.problems.find(
      (problem) =>
        problem.kind === 'short' &&
        problem.itemId === billId &&
        problem.isBill &&
        payDays.has(problem.dayKey),
    ) ?? null;
  if (isUnfunded) {
    return fundedBy.kind === 'pay'
      ? PAID_FROM_WORDS.noticeNoPay(
          describePayChoice(fundedBy, plan),
          bill.name,
          dueOn,
        )
      : PAID_FROM_WORDS.noticeNoPayAtAll(bill.name, dueOn);
  }
  if (shortProblem?.kind === 'short') {
    return mask(
      PAID_FROM_WORDS.noticeShort(
        bill.name,
        formatCentsShort(shortProblem.shortBy),
        formatDateOrdinalUTC(shortProblem.on),
      ),
    );
  }
  return null;
}
