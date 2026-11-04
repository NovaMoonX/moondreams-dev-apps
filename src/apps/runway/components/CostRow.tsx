import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SensitiveValue from '@/components/SensitiveValue';
import { HORIZON_WORDS } from '@apps/runway/constants';
import type { HorizonCost } from '@apps/runway/types';
import { describeCost } from '@apps/runway/utils/horizonText';

interface CostRowProps {
  cost: HorizonCost;
  /** Opens the cost to change it; the row then has a chevron. */
  onOpen?: () => void;
}

/** One cost of an event: its name and date on the left, its figure on the right. */
function CostRow({ cost, onOpen }: CostRowProps) {
  const { line, figure, per } = describeCost(cost);

  const label = (
    <span className='block min-w-0 flex-1'>
      <span className='line-clamp-2 font-medium break-words'>{cost.name}</span>
      <span className='text-muted-foreground block text-sm'>{line}</span>
    </span>
  );
  const amount = (
    <span className='block shrink-0 text-right'>
      <span className='block font-semibold tabular-nums'>
        <SensitiveValue>{figure}</SensitiveValue>
      </span>
      {per && (
        <span className='text-muted-foreground block text-sm whitespace-nowrap'>
          {per}
        </span>
      )}
    </span>
  );

  return onOpen ? (
    <li>
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-muted/60 text-foreground h-auto min-h-14 w-full justify-start gap-3 rounded-none px-3! py-2 text-left font-normal'
        aria-label={HORIZON_WORDS.changeCost(cost.name)}
        onClick={onOpen}
      >
        {label}
        {amount}
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  ) : (
    <li className='flex min-h-14 items-center gap-3 px-3 py-2'>
      {label}
      {amount}
    </li>
  );
}

export default CostRow;
