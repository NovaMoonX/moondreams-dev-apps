import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import PaidAmountSheet from '@apps/runway/components/PaidAmountSheet';
import { toBillAmountPayment } from '@apps/runway/hooks/paidAmountPayment';
import { useCorrectPaidAmount } from '@apps/runway/hooks/useAutoPay';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectBillPayments } from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';

interface AutoAmountSheetProps {
  billId: string;
  billName: string;
  dueOn: DateOnly;
  onClose: () => void;
}

/** Asks what a payment that paid itself at the top of its range really came to, empty, with the range as the hint. */
function AutoAmountSheet({
  billId,
  billName,
  dueOn,
  onClose,
}: AutoAmountSheetProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const payment = useAppSelector(
    (state) =>
      (selectBillPayments(state, today)[billId] ?? []).find(
        (entry) => entry.dueOn === dueOn,
      ) ?? null,
  );
  const correct = useCorrectPaidAmount();
  if (!payment) return null;
  const asked = toBillAmountPayment(billName, payment, null);

  return (
    <PaidAmountSheet
      isCorrection
      payment={{
        ...asked,
        isPaid: false,
        heldMostCents: 0,
        getHeldCents: () => 0,
      }}
      onMark={(amountCents) =>
        correct({ billId, billName, dueOn, amountCents })
      }
      onClose={onClose}
    />
  );
}

export default AutoAmountSheet;
