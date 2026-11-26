import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

interface FriendDayNumberProps {
  day: number;
  count: number;
}

/* The edge is a shade darker than the fill and sits on a halo, so a pastel star still
   stands apart from the pastel title tiles a cell shows when a movie has no poster. */
const STAR_COLOR =
  'fill-amber-400 stroke-amber-600 dark:fill-amber-400 dark:stroke-amber-200';

/** A cell's date number inside a star, saying friends have plans that day in place of a separate mark. */
function FriendDayNumber({ day, count }: FriendDayNumberProps) {
  const label =
    count === 1 ? '1 friend has plans' : `${count} friends have plans`;

  return (
    <span className='absolute top-0 left-0 flex size-7 items-center justify-center'>
      <Star
        aria-hidden='true'
        className='absolute inset-0 size-7 fill-white stroke-white stroke-[4] dark:fill-neutral-950 dark:stroke-neutral-950'
      />
      <Star
        aria-hidden='true'
        className={join('absolute inset-0 size-7 stroke-[1.5]', STAR_COLOR)}
      />
      <span className='relative mt-[3px] text-[10px] leading-none font-bold text-neutral-900 tabular-nums'>
        {day}
      </span>
      <span className='sr-only'>{label}</span>
    </span>
  );
}

export default FriendDayNumber;
