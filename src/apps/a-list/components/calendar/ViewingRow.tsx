import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import type { Viewing } from '@apps/a-list/types';

interface ViewingRowProps {
  viewing: Viewing;
}

function ViewingRow({ viewing }: ViewingRowProps) {
  return (
    <div className='flex items-center gap-3 py-2.5'>
      <span className='h-14 w-10 shrink-0 overflow-hidden rounded'>
        <PosterCover
          title={viewing.movie.title}
          posterUrl={viewing.movie.posterUrl}
          compact
        />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium'>{viewing.movie.title}</p>
        <p className='text-muted-foreground text-xs'>
          {formatTime(viewing.showtimeAt)}
        </p>
      </div>
      <Badge
        variant={viewing.status === 'SEEN' ? 'success' : 'muted'}
        size='xs'
      >
        {viewing.status === 'SEEN' ? 'Seen' : 'Planned'}
      </Badge>
    </div>
  );
}

export default ViewingRow;
