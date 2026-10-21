import { memo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  getStockFlag,
  getStockSummaryParts,
  type StockView,
} from '@apps/pinch/utils/packages';

interface PantryRowProps {
  view: StockView;
  name: string;
  /** What it is, by the part of the shop it comes from, in the row's chip. */
  emoji: string;
  /** The person's window for "due soon". */
  soonDays: number;
  onOpen: (ingredientId: string) => void;
}

/** One ingredient and what is on hand of it: how many packages, how much in all and the one date that matters, so five cartons read as one line that opens them. */
function PantryRow({ view, name, emoji, soonDays, onOpen }: PantryRowProps) {
  const parts = getStockSummaryParts(view);
  const flag = getStockFlag(view, undefined, soonDays);

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(view.ingredientId)}
      className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      <span
        className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
        aria-hidden='true'
      >
        {emoji}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block font-medium wrap-break-word'>
          {name}
        </span>
        <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal'>
          {parts.map((part) => (
            <span key={part} className='whitespace-nowrap'>
              {part}
            </span>
          ))}
          {flag !== null &&
            (flag.state === 'LATER' ? (
              <span className='whitespace-nowrap'>{flag.label}</span>
            ) : (
              <EatByBadge state={flag.state} label={flag.label} />
            ))}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default memo(PantryRow);
