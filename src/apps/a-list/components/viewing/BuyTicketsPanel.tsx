import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
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
  /** For a ticket bought somewhere AMC's list doesn't cover: the member enters what they paid by hand. */
  onEnterManually: () => void;
}

/** Pick an AMC showing, then head to amctheatres.com to buy it, knowing which two numbers to look for. */
function BuyTicketsPanel({
  viewing,
  now,
  isSaving,
  onPick,
  onGoBuy,
  onChooseTheater,
  onEnterManually,
}: BuyTicketsPanelProps) {
  const { theatre, purchase } = viewing;
  // Until they pick another day, the lookup follows the showing's own moment at the theater.
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const theaterPills = (
    <TheaterPills
      label='📍 Which theater?'
      value={theatre}
      onChange={(chosen) => chosen && onChooseTheater(chosen)}
    />
  );

  const manualLink = (
    <div className='flex justify-center'>
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-10'
        onClick={onEnterManually}
      >
        Already bought it somewhere else? Add what you paid
      </Button>
    </div>
  );

  if (!theatre) {
    return (
      <div className='space-y-4'>
        {theaterPills}
        {manualLink}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {theaterPills}
      <div className='space-y-2'>
        <p className='font-medium'>📅 Which day?</p>
        <Input
          type='date'
          aria-label='Day to look up showtimes for'
          value={pickedDay ?? toLocalDateInputValue(viewing.showtimeAt)}
          min={toLocalDateInputValue(now)}
          onChange={(event) => setPickedDay(event.target.value || null)}
        />
      </div>
      <ShowtimePicker
        theatre={theatre}
        dateKey={pickedDay ?? toLocalDateInputValue(viewing.showtimeAt)}
        showingAt={
          pickedDay === null ||
          pickedDay === toLocalDateInputValue(viewing.showtimeAt)
            ? viewing.showtimeAt
            : null
        }
        title={viewing.movie.title}
        now={now}
        selectedShowtimeId={purchase?.showtimeId ?? null}
        onPick={onPick}
        offersAmcFallback
        isTypedTitle={viewing.movieKey.startsWith('manual-')}
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
      {manualLink}
    </div>
  );
}

export default BuyTicketsPanel;
