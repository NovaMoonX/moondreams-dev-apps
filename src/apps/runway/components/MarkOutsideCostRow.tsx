import { useState } from 'react';
import { HandCoins } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import PaidAmountSheet from '@apps/runway/components/PaidAmountSheet';
import { COST_PAID_WORDS } from '@apps/runway/constants';
import type { CostPayment } from '@apps/runway/engine/horizon';
import { useCostPaid } from '@apps/runway/hooks/useCostPaid';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import type { HorizonCost } from '@apps/runway/types';

interface MarkOutsideCostRowProps {
  itemId: string;
  itemName: string;
  cost: HorizonCost;
  /** The payment still to mark. */
  payment: CostPayment;
}

/** "Mark Truck rental paid": a cost paid outside the plan keeps its item from finishing until it is marked, and marking moves no money. */
function MarkOutsideCostRow({
  itemId,
  itemName,
  cost,
  payment,
}: MarkOutsideCostRowProps) {
  const mask = useMaskedText();
  const [isAsking, setIsAsking] = useState(false);
  const paid = useCostPaid({ itemId, itemName, cost, payment });
  const amountPayment = isAsking ? paid.toAmountPayment() : null;

  return (
    <>
      <ActionRow
        isGrouped
        isRoomy
        icon={<HandCoins />}
        label={COST_PAID_WORDS.markOutsideRow(cost.name)}
        subtitle={mask(
          paid.needsAmount
            ? COST_PAID_WORDS.markSubRange
            : COST_PAID_WORDS.markSubOutside(itemName),
        )}
        isDisabled={!paid.isReady || paid.isBusy}
        onClick={() => {
          if (paid.needsAmount) setIsAsking(true);
          else void paid.mark();
        }}
      />
      {amountPayment && (
        <PaidAmountSheet
          payment={amountPayment}
          onMark={paid.mark}
          onClose={() => setIsAsking(false)}
        />
      )}
    </>
  );
}

export default MarkOutsideCostRow;
