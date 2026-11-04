import type { ReactNode } from 'react';

import SensitiveValue from '@/components/SensitiveValue';
import type { HorizonCost } from '@apps/runway/types';
import { describeCost } from '@apps/runway/utils/horizonText';

interface CostRowProps {
  cost: HorizonCost;
  /** A control at the row's end, such as Remove while the item is being made. */
  action?: ReactNode;
}

/** One cost of an event: its name and date on the left, its figure on the right. */
function CostRow({ cost, action }: CostRowProps) {
  const { line, figure } = describeCost(cost);

  return (
    <li className='flex min-h-14 items-center gap-3 px-3 py-2'>
      <span className='block min-w-0 flex-1'>
        <span className='block font-medium break-words'>{cost.name}</span>
        <span className='text-muted-foreground block text-sm'>{line}</span>
      </span>
      <span className='block shrink-0 text-right font-semibold tabular-nums'>
        <SensitiveValue>{figure}</SensitiveValue>
      </span>
      {action}
    </li>
  );
}

export default CostRow;
