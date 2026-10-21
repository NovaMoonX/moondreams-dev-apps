import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import Pill from '@/components/Pill';
import TickMark from '@/components/TickMark';
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
  recipeId: string;
  care: RecipeCare | null;
  /** The recipe's name over each card when the screen cooks several. */
  caption: string | null;
}

function CookPutAway({ putAway, recipeId, care, caption }: CookPutAwayProps) {
  const entry = putAway.getEntry(recipeId);
  if (!entry || !entry.isAvailable) {
    return null;
  }

  const captionLine = caption && (
    <p className='text-muted-foreground text-xs wrap-break-word'>{caption}</p>
  );

  if (putAway.fields && putAway.openRecipeId === recipeId) {
    const { place, overNote } = putAway.fields;
    const heading = putAway.isPlaceFixed
      ? `Put some in the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`
      : 'Put some away';
    return (
      <section
        aria-label={caption ? `${caption}: ${heading}` : heading}
        className={CARD_CLASS}
      >
        <div className='px-4 pt-3.5'>
          {captionLine}
          <p className='font-medium'>{heading}</p>
        </div>
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

  if (putAway.isOpen) {
    return null;
  }

  const batches = groupSavedBatches(entry.saved);
  const getHeading = () => {
    if (entry.isAsking) return 'Putting any away?';
    return batches.length > 0 ? 'Put another away' : 'Put some away';
  };
  const heading = getHeading();
  const renderNotice = (className: string) =>
    entry.notice && (
      <p className={join('text-destructive text-sm', className)} role='alert'>
        {entry.notice}
      </p>
    );

  return (
    <>
      {batches.length > 0 && (
        <section
          aria-label={caption ? `${caption}: put away` : 'Put away'}
          className={CARD_CLASS}
        >
          {caption && <div className='px-4 pt-3'>{captionLine}</div>}
          <ul className='divide-border divide-y'>
            {batches.map((batch) => {
              const undo = putAway.getUndo(batch);
              return (
                <li
                  key={batch[0].id}
                  className='flex items-start gap-3 px-4 py-3'
                >
                  <span className='mt-0.5 flex shrink-0 text-sm'>
                    <TickMark />
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
                      variant='secondary'
                      size='sm'
                      className="relative -mr-1 h-9 shrink-0 rounded-full px-4 after:absolute after:-inset-0.5 after:content-['']"
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
      {(entry.isAsking || entry.canOffer) && (
        <section
          aria-label={caption ? `${caption}: ${heading}` : heading}
          className={join(CARD_CLASS, 'space-y-3 px-4 py-4 text-center')}
        >
          <div>
            {captionLine}
            <p className='font-medium'>{heading}</p>
          </div>
          <div className='flex flex-wrap justify-center gap-2'>
            {PLACES.map((place) => {
              const days =
                place === 'FRIDGE' ? care?.fridgeDays : care?.freezerDays;
              return (
                <Pill
                  key={place}
                  isSelected={false}
                  emoji={CONTAINER_PLACE_EMOJIS[place]}
                  onClick={() => entry.open(place)}
                >
                  {days == null
                    ? CONTAINER_PLACE_LABELS[place]
                    : `${CONTAINER_PLACE_LABELS[place]} · keeps ${formatCareDays(days)}`}
                </Pill>
              );
            })}
            {entry.isAsking && (
              <Pill isSelected={false} onClick={entry.dismiss}>
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
