import { useState } from 'react';

import { useAppSelector } from '@/store';
import BillRow, { BillSheet } from '@apps/runway/components/BillRow';
import { PAY_SHARE_WORDS } from '@apps/runway/constants';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
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
}

/** A bill this pay puts nothing toward because the bill is set to come from another pay: it says which, and opens the bill. */
function LeftOutBillRow({ billId, fundedBy, today }: LeftOutBillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const stance = useAppSelector(selectStance);
  const payment =
    useAppSelector((state) => selectBillPayments(state, today)[billId])?.find(
      (entry) => entry.dueOn >= today,
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
  if (!bill) return null;
  const paidFrom = describePaidFrom(fundedBy, plan, true);
  return (
    <>
      <BillRow
        bill={bill}
        payment={payment}
        planStance={stance}
        detailOverride={PAY_SHARE_WORDS.leftOutDetail(paidFrom)}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <BillSheet
          billId={billId}
          bill={bill}
          payment={payment}
          planStance={stance}
          today={today}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default LeftOutBillRow;
