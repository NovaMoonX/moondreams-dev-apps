import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

interface FriendDayNumberProps {
  day: number;
  count: number;
}

/* The edge is a shade darker than the fill and sits on a halo, so a pastel star still
   stands apart from the pastel title tiles a cell shows when a movie has no poster. */
const STAR_COLOR =
  'fill-violet-200 stroke-violet-500 dark:fill-violet-300 dark:stroke-violet-100';

/** A cell's date number inside a star, saying friends have plans that day in place of a separate mark. */
function FriendDayNumber({ day, count }: FriendDayNumberProps) {
  const label =
    count === 1 ? '1 friend has plans' : `${count} friends have plans`;

  return (
    <span className='absolute top-0 left-0 flex size-6 items-center justify-center'>
      <Star
        aria-hidden='true'
        className='absolute inset-0 size-6 fill-white stroke-white stroke-[4] dark:fill-neutral-950 dark:stroke-neutral-950'
      />
      <Star
        aria-hidden='true'
        className={join('absolute inset-0 size-6 stroke-[1.5]', STAR_COLOR)}
      />
      <span aria-hidden='true' className='relative mt-0.5 text-[10px] leading-none font-bold text-neutral-900 tabular-nums'>
        {day}
      </span>
      <span className='sr-only'>{`${day}, ${label}`}</span>
    </span>
  );
}

export default FriendDayNumber;
