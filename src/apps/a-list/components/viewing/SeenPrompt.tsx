import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import StarRating from '@apps/a-list/components/shared/StarRating';
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
    <Drawer isOpen onClose={onLater} title='🎬 Did you catch it?'>
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <span className='h-20 w-14 shrink-0 overflow-hidden rounded-md'>
            <PosterCover
              title={viewing.movie.title}
              posterUrl={viewing.movie.posterUrl}
              compact
            />
          </span>
          <div className='min-w-0'>
            <p className='font-semibold'>{viewing.movie.title}</p>
            <p className='text-muted-foreground text-sm'>
              {formatDate(viewing.showtimeAt)} ·{' '}
              {formatTime(viewing.showtimeAt)}
            </p>
          </div>
        </div>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-sm'>
            How was it? Stars are optional.
          </p>
          <StarRating value={rating} onChange={setRating} size='lg' />
        </div>
        <div className='grid grid-cols-3 gap-2'>
          <Button
            type='button'
            variant='tertiary'
            disabled={isSaving}
            onClick={onLater}
          >
            Later
          </Button>
          <Button
            type='button'
            variant='secondary'
            disabled={isSaving}
            onClick={onDidNotGo}
          >
            Didn't go
          </Button>
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => onSeen(rating)}
          >
            Seen it
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

export default SeenPrompt;
