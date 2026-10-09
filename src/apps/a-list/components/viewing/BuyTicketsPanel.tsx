import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ExternalLink } from 'lucide-react';

import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import ShowtimePicker from '@apps/a-list/components/viewing/ShowtimePicker';
import TheaterPills from '@apps/a-list/components/viewing/TheaterPills';
import type {
  ShowtimeOption,
  TheatreSnapshot,
  Viewing,
} from '@apps/a-list/types';
import { describePurchase } from '@apps/a-list/utils/purchase';
import { formatShowtimeForTheatre } from '@apps/a-list/utils/theatreTime';

interface BuyTicketsPanelProps {
  viewing: Viewing;
  now: number;
  isSaving: boolean;
  onPick: (option: ShowtimeOption) => void;
  onGoBuy: () => void;
  onChooseTheater: (theatre: TheatreSnapshot) => void;
}

/** Pick an AMC showing, then head to amctheatres.com to buy it, knowing which two numbers to look for. */
function BuyTicketsPanel({
  viewing,
  now,
  isSaving,
  onPick,
  onGoBuy,
  onChooseTheater,
}: BuyTicketsPanelProps) {
  const { theatre, purchase } = viewing;

  if (!theatre) {
    return (
      <TheaterPills
        label='📍 Which theater?'
        value={null}
        onChange={(chosen) => chosen && onChooseTheater(chosen)}
      />
    );
  }

  return (
    <div className='space-y-4'>
      <ShowtimePicker
        theatre={theatre}
        dateKey={toLocalDateInputValue(viewing.showtimeAt)}
        showingAt={viewing.showtimeAt}
        title={viewing.movie.title}
        now={now}
        selectedShowtimeId={purchase?.showtimeId ?? null}
        onPick={onPick}
        offersAmcFallback
      />
      {purchase && (
        <div className='space-y-3'>
          <p className='flex gap-1.5 text-sm font-medium'>
            <span className='w-5 shrink-0 text-center' aria-hidden='true'>
              🎟️
            </span>
            <span className='min-w-0'>
              You picked{' '}
              {formatShowtimeForTheatre(
                viewing.showtimeAt,
                viewing.theatre?.timeZone ?? null,
              )}{' '}
              · {describePurchase(purchase)}
            </span>
          </p>
          <div className='border-primary/30 bg-primary/5 space-y-2 rounded-2xl border p-3'>
            <p className='text-sm font-medium'>
              Two numbers to look for at checkout
            </p>
            <ul className='space-y-1.5 text-sm'>
              <li className='flex gap-2'>
                <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                  💸
                </span>
                <span>
                  <strong>The convenience fee.</strong> Members don't pay it, so
                  if you can't find it we'll use your usual one.
                </span>
              </li>
              <li className='flex gap-2'>
                <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                  🧾
                </span>
                <span>
                  <strong>The tax.</strong> It shows up just before you pay.
                </span>
              </li>
            </ul>
            <p className='text-muted-foreground text-xs'>
              Come back here afterward and we'll ask for them, with the price
              already filled in.
            </p>
          </div>
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full gap-2'
            disabled={isSaving}
            onClick={onGoBuy}
          >
            Continue to AMC <ExternalLink className='h-4 w-4' />
          </Button>
        </div>
      )}
    </div>
  );
}

export default BuyTicketsPanel;
