import { ChevronRight, CircleCheck } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SensitiveValue from '@/components/SensitiveValue';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import {
  HORIZON_WORDS,
  MAKE_BILL_WORDS,
  PRIORITY_DIAL_WORDS,
} from '@apps/runway/constants';
import { formatCentsShort } from '@/utils/moneyUtils';
import type { HorizonCost, Priority } from '@apps/runway/types';
import { describeCost } from '@apps/runway/utils/horizonText';

interface CostRowProps {
  cost: HorizonCost;
  /** Where its latest payment stands once one is marked paid, e.g. "Paid Jan 15th · $600.00" ("Paid Jan 15th" once settled, its figure saying the amount); `isSettled` when no payment is left to pay, so the row reads as done: the paid line takes the due line's place and the figure is what it came to. */
  paid?: { line: string; amountCents: number; isSettled: boolean } | null;
  /** Opens the cost to change it; the row then has a chevron. */
  onOpen?: () => void;
  /** Replaces the due line on a cost that was never paid and no longer asks for money. */
  stoppedNote?: string | null;
  /** The cost's priority when it differs from its event's; the badge sits beside the name. */
  badge?: Priority | null;
  /** The priority dial leaves the cost out: its badge and figure dim. */
  isFaded?: boolean;
}

/** One cost of an event: its name and date on the left, its figure on the right. */
function CostRow({
  cost,
  paid = null,
  onOpen,
  stoppedNote = null,
  badge = null,
  isFaded = false,
}: CostRowProps) {
  const described = describeCost(cost, paid === null);
  const { line, per } = described;
  const figure = paid?.isSettled
    ? formatCentsShort(paid.amountCents)
    : described.figure;

  const label = (
    <span className='block min-w-[6.5rem] flex-1'>
      <span className='flex items-start gap-2'>
        <span className='line-clamp-2 min-w-0 flex-1 font-medium break-words'>
          {cost.name}
        </span>
        {badge && (
          <span className={join('shrink-0', isFaded && 'opacity-45')}>
            <PriorityBadge priority={badge} />
          </span>
        )}
      </span>
      {!paid?.isSettled && (
        <span className='text-muted-foreground block text-sm break-words'>
          {stoppedNote ??
            (cost.becameBillId !== null ? MAKE_BILL_WORDS.nowABill : line)}
        </span>
      )}
      {paid && (
        <span className='text-muted-foreground block text-sm break-words'>
          <CircleCheck
            className='mr-1 inline h-3.5 w-3.5 align-[-2px]'
            aria-hidden='true'
          />
          <MaskedText>{paid.line}</MaskedText>
        </span>
      )}
    </span>
  );
  const notCounted = isFaded ? `. ${PRIORITY_DIAL_WORDS.notCounted}` : '';
  const amount = (
    <span className='block min-w-0 text-right'>
      <span
        className={join(
          'block tabular-nums',
          isFaded ? 'text-muted-foreground font-medium' : 'font-semibold',
        )}
      >
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
        className='hover:bg-muted/60 text-foreground! h-auto min-h-14 w-full justify-start gap-3 rounded-none px-3! py-2 text-left font-normal'
        aria-label={`${
          cost.becameBillId !== null
            ? MAKE_BILL_WORDS.openBill(cost.name)
            : HORIZON_WORDS.changeCost(cost.name)
        }${notCounted}`}
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
      {isFaded && (
        <span className='sr-only'>{PRIORITY_DIAL_WORDS.notCounted}</span>
      )}
    </li>
  );
}

export default CostRow;
