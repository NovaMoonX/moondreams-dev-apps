import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, Check } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import PriceTag from '@apps/going-once/components/things/PriceTag';

type TagPart = 'photos' | 'name' | 'price' | 'condition';

interface ThingTagCardProps {
  coverUrl: string | null;
  photoCount: number;
  title: string;
  /** "$45", "Free" or "Price later"; empty while there is no price. */
  priceText: string;
  conditionLabel: string;
  /** The private floor ("$30"), or '' when none. */
  floorText: string;
  isFloorAbove: boolean;
  deferred: string[];
  /** The ids of the steps already passed, whose parts can be tapped to change. */
  answered: string[];
  /** True once anything was written for the thing; nothing is said before that. */
  isSaved: boolean;
  /** A thing already saved once (opened again to finish it) says Saved, not Draft saved. */
  isDraft: boolean;
  onReopen: (id: string) => void;
}

const PART_BUTTON =
  'min-h-10 min-w-0 justify-start rounded-lg px-2 text-left text-foreground! hover:bg-foreground/10 focus-visible:outline-2';

/** The thing being written, drawn as a clean card that fills in as each question is answered, with the kraft price tag for its price. */
function ThingTagCard({
  coverUrl,
  photoCount,
  title,
  priceText,
  conditionLabel,
  floorText,
  isFloorAbove,
  deferred,
  answered,
  isSaved,
  isDraft,
  onReopen,
}: ThingTagCardProps) {
  const part = (
    id: TagPart,
    ariaLabel: string,
    className: string,
    children: ReactNode,
  ) =>
    answered.includes(id) ? (
      <Button
        type='button'
        variant='tertiary'
        size='stripped'
        aria-label={ariaLabel}
        className={join(PART_BUTTON, className)}
        onClick={() => onReopen(id)}
      >
        {children}
      </Button>
    ) : (
      <div
        className={join('flex min-h-10 min-w-0 items-center px-2', className)}
      >
        {children}
      </div>
    );

  const getNameText = () => {
    if (title !== '') return title;
    return deferred.includes('name') ? 'Name later' : 'No name yet';
  };

  const placeholder = (
    <span className='bg-muted text-muted-foreground flex size-16 flex-col items-center justify-center gap-0.5 rounded-xl'>
      <Camera className='size-5' aria-hidden='true' />
      {photoCount === 0 && deferred.includes('photos') && (
        <span className='text-[11px] leading-none'>No photo</span>
      )}
    </span>
  );
  const photoTile =
    photoCount > 0 && coverUrl !== null ? (
      <FallbackImage
        src={coverUrl}
        alt=''
        className='size-16 rounded-xl object-cover'
        fallback={placeholder}
      />
    ) : (
      placeholder
    );

  return (
    <div className='bg-card text-card-foreground border-border rounded-2xl border p-3 shadow-sm'>
      <p
        role='status'
        className='text-muted-foreground mb-1 flex h-4 items-center justify-end gap-1 px-2 text-xs'
      >
        {isSaved && (
          <>
            <Check className='size-3' aria-hidden='true' />
            {isDraft ? 'Draft saved' : 'Saved'}
          </>
        )}
      </p>
      <div className='flex items-start gap-2'>
        {part(
          'photos',
          `Photos, ${photoCount > 0 ? `${photoCount} added` : 'none yet'}, change`,
          'h-auto shrink-0 p-0.5',
          photoTile,
        )}
        <div className='min-w-0 flex-1'>
          {part(
            'name',
            `Name, ${title === '' ? 'not named yet' : title}, change`,
            'w-full',
            <span
              className={join(
                'line-clamp-2 min-w-0 font-semibold break-words',
                title === '' && 'text-muted-foreground font-normal',
              )}
            >
              {getNameText()}
            </span>,
          )}
          <div className='flex flex-wrap items-center'>
            {part(
              'price',
              `Price, ${priceText === '' ? 'none yet' : priceText}, change`,
              '',
              <PriceTag text={priceText === '' ? 'No price yet' : priceText} />,
            )}
            {conditionLabel !== '' &&
              part(
                'condition',
                `Condition, ${conditionLabel}, change`,
                'text-sm',
                conditionLabel,
              )}
            {conditionLabel === '' &&
              deferred.includes('condition') &&
              part(
                'condition',
                'Condition, later, change',
                'text-sm',
                <span className='text-muted-foreground'>Condition later</span>,
              )}
          </div>
          {floorText !== '' && (
            <p className='text-muted-foreground px-2 text-xs'>
              🔒 Lowest {floorText}
              {isFloorAbove && (
                <span className='font-medium text-(--going-once-hint)'>
                  {' '}
                  · more than the price
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThingTagCard;
