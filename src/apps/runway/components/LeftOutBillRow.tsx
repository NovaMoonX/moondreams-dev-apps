import { useState } from 'react';

import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import BillShareView from '@apps/runway/components/BillShareView';
import { BillSheet } from '@apps/runway/components/BillRow';
import ItemRow from '@apps/runway/components/ItemRow';
import { PAY_SHARE_WORDS } from '@apps/runway/constants';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { useItemEmoji } from '@apps/runway/hooks/useItemEmoji';
import {
  selectBillPayments,
  selectResolvedPlan,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillFundedBy, BillVersion } from '@apps/runway/types';
import { describePaidFrom } from '@apps/runway/utils/payFrom';

interface LeftOutBillRowProps {
  billId: string;
  fundedBy: BillFundedBy;
  today: number;
  /** The income day the row is drawn on. */
  dayKey: string;
  dayOn: number;
}

/** A bill this pay puts nothing toward because the bill is set to come from another pay: it names that pay, and opens the bill with this pay's own explanation first. */
function LeftOutBillRow({
  billId,
  fundedBy,
  today,
  dayKey,
  dayOn,
}: LeftOutBillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const stance = useAppSelector(selectStance);
  const payment =
    useAppSelector((state) => selectBillPayments(state, today)[billId])?.find(
      (entry) => entry.dueOn >= dayOn,
    ) ?? null;
  const bill = useAppSelector((state) =>
    resolveCurrentOrNext(
      state.runway.versions.filter(
        (version): version is BillVersion => version.kind === 'bill',
      ),
      billId,
      today,
    ),
  )?.payload;
  const emoji = useItemEmoji(bill?.emoji ?? null, bill?.groupId ?? null);
  if (!bill) return null;
  const paidFrom = describePaidFrom(fundedBy, plan, true);
  const carrier =
    payment && payment.paid === null
      ? payment.parts.find((part) => part.cents > 0)
      : undefined;
  const detail = carrier
    ? PAY_SHARE_WORDS.leftOutCarrier(formatDateShortUTC(carrier.day.on))
    : PAY_SHARE_WORDS.leftOutDetail(paidFrom);
  return (
    <>
      <ItemRow
        name={bill.name}
        emoji={emoji}
        detail={detail}
        ariaLabel={`${bill.name}. ${detail}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <BillSheet
          billId={billId}
          bill={bill}
          payment={payment}
          planStance={stance}
          today={today}
          dayAction={{
            label: PAY_SHARE_WORDS.whyNothing,
            renderView: ({ onBack, onClose, openChange }) => (
              <BillShareView
                billId={billId}
                dayKey={dayKey}
                currentCents={0}
                mode='leftOut'
                paidFromText={
                  carrier
                    ? PAY_SHARE_WORDS.theDatePay(
                        formatDateShortUTC(carrier.day.on),
                      )
                    : paidFrom
                }
                onBack={onBack}
                onClose={onClose}
                onOpenPaidFrom={() => openChange('funding')}
              />
            ),
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default LeftOutBillRow;
