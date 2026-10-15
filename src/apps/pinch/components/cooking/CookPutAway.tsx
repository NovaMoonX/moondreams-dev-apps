import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import Pill from '@/components/Pill';
import ContainerFields from '@apps/pinch/components/containers/ContainerFields';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import type { usePutAway } from '@apps/pinch/hooks/usePutAway';
import type { ContainerPlace, RecipeCare } from '@apps/pinch/types';
import {
  getEatByPhrase,
  getSavedHeadline,
  groupSavedBatches,
} from '@apps/pinch/utils/containers';
import { formatCareDays } from '@apps/pinch/utils/recipeCare';

const CARD_CLASS = 'bg-muted/50 border-border w-full rounded-2xl border';

const PLACES: ContainerPlace[] = ['FRIDGE', 'FREEZER'];

interface CookPutAwayProps {
  putAway: ReturnType<typeof usePutAway>;
  care: RecipeCare | null;
}

function CookPutAway({ putAway, care }: CookPutAwayProps) {
  if (!putAway.isAvailable) {
    return null;
  }

  if (putAway.fields) {
    const { place, overNote } = putAway.fields;
    const heading = putAway.isPlaceFixed
      ? `Put some in the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`
      : 'Put some away';
    return (
      <section aria-label={heading} className={CARD_CLASS}>
        <p className='px-4 pt-3.5 font-medium'>{heading}</p>
        <ContainerFields
          draft={putAway.fields}
          isPlaceFixed={putAway.isPlaceFixed}
          layout='rows'
        />
        {(overNote || putAway.error) && (
          <div className='border-border space-y-1 border-t px-4 py-3'>
            {overNote && (
              <p className='text-muted-foreground text-xs'>{overNote}</p>
            )}
            {putAway.error && (
              <p className='text-destructive text-sm' role='alert'>
                {putAway.error}
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  const batches = groupSavedBatches(putAway.saved);
  const getHeading = () => {
    if (putAway.isAsking) return 'Putting any away?';
    return batches.length > 0 ? 'Put another away' : 'Put some away';
  };
  const heading = getHeading();
  const renderNotice = (className: string) =>
    putAway.notice && (
      <p className={join('text-destructive text-sm', className)} role='alert'>
        {putAway.notice}
      </p>
    );

  return (
    <>
      {batches.length > 0 && (
        <section aria-label='Put away' className={CARD_CLASS}>
          <ul className='divide-border divide-y'>
            {batches.map((batch) => {
              const undo = putAway.getUndo(batch);
              return (
                <li
                  key={batch[0].id}
                  className='flex items-start gap-3 px-4 py-3'
                >
                  <span
                    className='bg-accent text-accent-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full'
                    aria-hidden='true'
                  >
                    <Check className='h-3.5 w-3.5' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block text-sm font-medium text-balance'>
                      {getSavedHeadline(batch)}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      Eat by {getEatByPhrase(batch[0].eatBy)}
                    </span>
                    {undo?.isOffline && (
                      <span className='text-muted-foreground block text-xs'>
                        Saved on this phone. It syncs when you're online.
                      </span>
                    )}
                  </span>
                  {undo?.state === null && (
                    <Button
                      type='button'
                      variant='tertiary'
                      size='sm'
                      className="relative -my-1.5 -mr-2 h-8 shrink-0 px-2 underline after:absolute after:-inset-1 after:content-['']"
                      onClick={() => void putAway.undo(batch)}
                    >
                      Undo
                    </Button>
                  )}
                  {undo?.state === 'PENDING' && (
                    <span className='text-muted-foreground shrink-0 text-xs'>
                      Undoing…
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {renderNotice('px-4 pb-3')}
        </section>
      )}
      {(putAway.isAsking || putAway.canOffer) && (
        <section
          aria-label={heading}
          className={join(CARD_CLASS, 'space-y-3 px-4 py-4 text-center')}
        >
          <p className='font-medium'>{heading}</p>
          <div className='flex flex-wrap justify-center gap-2'>
            {PLACES.map((place) => {
              const days =
                place === 'FRIDGE' ? care?.fridgeDays : care?.freezerDays;
              return (
                <Pill
                  key={place}
                  isSelected={false}
                  emoji={CONTAINER_PLACE_EMOJIS[place]}
                  onClick={() => putAway.open(place)}
                >
                  {days == null
                    ? CONTAINER_PLACE_LABELS[place]
                    : `${CONTAINER_PLACE_LABELS[place]} · keeps ${formatCareDays(days)}`}
                </Pill>
              );
            })}
            {putAway.isAsking && (
              <Pill isSelected={false} onClick={putAway.dismiss}>
                Not this time
              </Pill>
            )}
          </div>
          {batches.length === 0 && renderNotice('')}
        </section>
      )}
    </>
  );
}

export default CookPutAway;
