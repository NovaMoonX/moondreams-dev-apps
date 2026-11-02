import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useBackStep } from '@/hooks/useBackHistory';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { formatRelativeDayUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { useSingleFlight } from '@apps/going-once/hooks/useSingleFlight';
import { PAYMENT_METHOD_LABELS } from '@apps/going-once/constants';
import type { Item } from '@apps/going-once/types';
import { formatCollected } from '@apps/going-once/utils/status';
import type { StatusFigures } from '@apps/going-once/utils/statusSummary';

interface SoldConfirmationProps {
  item: Item;
  now: number;
  /** Who marked it, as a name for a sentence. */
  markedBy: string;
  sold: StatusFigures;
  footerNode: HTMLElement | null;
  onDone: () => void;
  /** Undoes the sale and leaves; answers a refusal in words. */
  onNotSold: () => Promise<string | null>;
}

/** What Mark sold recorded: the figure, how, when and by whom, the new Collected, and the one-tap way back. */
function SoldConfirmation({
  item,
  now,
  markedBy,
  sold,
  footerNode,
  onDone,
  onNotSold,
}: SoldConfirmationProps) {
  useBackStep(true, onDone);
  const [error, setError] = useState<string | null>(null);
  const { sale } = item;
  const today = fromDateInputValue(toLocalDateInputValue(now)) ?? now;

  const { isWorking: isBusy, run } = useSingleFlight();

  const undoSale = async () => {
    setError(null);
    const refusal = await run(onNotSold);
    if (refusal) setError(refusal);
  };

  return (
    <div className='space-y-5'>
      <StatusDot status='SOLD' />
      {sale !== null && (
        <div className='space-y-1'>
          <p className='text-4xl font-semibold tabular-nums'>
            {formatCentsShort(sale.priceCents)}
          </p>
          <p className='text-muted-foreground'>
            {[
              sale.method === null ? null : PAYMENT_METHOD_LABELS[sale.method],
              formatRelativeDayUTC(sale.soldOn, today),
              `by ${markedBy}`,
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </p>
        </div>
      )}
      <p className='text-sm'>
        {formatCollected(sold.collectedCents, sold.askedCents)}
      </p>
      {sale !== null && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className='h-10 px-4'
          disabled={isBusy}
          onClick={() => void undoSale()}
        >
          Not sold after all
        </Button>
      )}
      <StatusViewFooter
        footerNode={footerNode}
        lockedNote={error}
        onDone={onDone}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          onClick={onDone}
        >
          Done
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default SoldConfirmation;
