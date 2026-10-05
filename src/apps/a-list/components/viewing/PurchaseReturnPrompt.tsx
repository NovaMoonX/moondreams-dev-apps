import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import { useAppSelector } from '@/store';
import { selectFeeChips } from '@apps/a-list/store/selectors';
import type { Ticket, Viewing } from '@apps/a-list/types';
import { describePurchase, getPurchaseTicketDraft } from '@apps/a-list/utils/purchase';
import {
  evaluateTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

interface PurchaseReturnPromptProps {
  viewing: Viewing;
  isSaving: boolean;
  onLater: () => void;
  onDidNotBuy: () => void;
  onSave: (ticket: Ticket) => void;
}

/** Welcomes the member back from AMC and asks only for what the API can't tell us: the fee and the tax. */
function PurchaseReturnPrompt({
  viewing,
  isSaving,
  onLater,
  onDidNotBuy,
  onSave,
}: PurchaseReturnPromptProps) {
  const feeChips = useAppSelector(selectFeeChips);
  const { purchase } = viewing;
  const [draft, setDraft] = useState<TicketDraft | null>(() =>
    purchase ? getPurchaseTicketDraft(purchase, feeChips[1] ?? 0) : null,
  );

  if (!purchase || !draft) {
    return null;
  }

  const result = evaluateTicketDraft(draft);

  return (
    <Drawer isOpen onClose={onLater} title='Did you get your tickets?'>
      <div className='space-y-4'>
        <div className='flex gap-3'>
          <span className='h-20 w-14 shrink-0 overflow-hidden rounded-xl shadow-md'>
            <PosterCover
              title={viewing.movie.title}
              posterUrl={viewing.movie.posterUrl}
            />
          </span>
          <div className='min-w-0 space-y-0.5'>
            <p className='font-semibold'>{viewing.movie.title}</p>
            <p className='text-muted-foreground text-sm'>
              {formatDate(viewing.showtimeAt)} ·{' '}
              {formatTime(viewing.showtimeAt)}
            </p>
            <p className='text-muted-foreground text-sm'>
              {describePurchase(purchase)}
            </p>
          </div>
        </div>
        <p className='text-muted-foreground text-sm'>
          The price is filled in from AMC. Add the convenience fee and the tax
          from your checkout.
        </p>
        <TicketFields draft={draft} onChange={setDraft} />
        <div className='space-y-2'>
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full'
            loading={isSaving}
            disabled={!result.isValid || isSaving}
            onClick={() => result.ticket && onSave(result.ticket)}
          >
            🎟️ Save my ticket
          </Button>
          <div className='grid grid-cols-2 gap-2'>
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              disabled={isSaving}
              onClick={onLater}
            >
              Not yet
            </Button>
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              disabled={isSaving}
              onClick={onDidNotBuy}
            >
              I didn't buy
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default PurchaseReturnPrompt;
