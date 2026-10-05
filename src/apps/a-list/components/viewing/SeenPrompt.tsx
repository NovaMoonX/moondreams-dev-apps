import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import StarRating from '@/components/StarRating';
import type { Viewing } from '@apps/a-list/types';

interface SeenPromptProps {
  viewing: Viewing;
  isSaving: boolean;
  onLater: () => void;
  onDidNotGo: () => void;
  onSeen: (rating: number | null) => void;
}

function SeenPrompt({
  viewing,
  isSaving,
  onLater,
  onDidNotGo,
  onSeen,
}: SeenPromptProps) {
  const [rating, setRating] = useState<number | null>(null);

  return (
    <Drawer isOpen onClose={onLater} title='Did you catch it?'>
      <div className='space-y-5 text-center'>
        <div className='space-y-3'>
          <span className='mx-auto block h-40 w-28 overflow-hidden rounded-2xl shadow-lg'>
            <PosterCover
              title={viewing.movie.title}
              posterUrl={viewing.movie.posterUrl}
            />
          </span>
          <div>
            <p className='text-lg font-semibold'>{viewing.movie.title}</p>
            <p className='text-muted-foreground text-sm'>
              {formatDate(viewing.showtimeAt)} ·{' '}
              {formatTime(viewing.showtimeAt)}
            </p>
          </div>
        </div>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-sm'>
            How was it? Tap or slide for half stars. They're optional.
          </p>
          <div className='flex justify-center'>
            <StarRating value={rating} onChange={setRating} size='lg' />
          </div>
        </div>
        <div className='space-y-2'>
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => onSeen(rating)}
          >
            🍿 Yes, I saw it
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
              onClick={onDidNotGo}
            >
              I didn't go
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default SeenPrompt;
