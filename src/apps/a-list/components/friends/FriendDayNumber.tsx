import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

interface FriendDayNumberProps {
  day: number;
  count: number;
  isToday: boolean;
  hasCovers: boolean;
}

/** A cell's date number inside a star, saying friends have plans that day in place of a separate mark. */
function FriendDayNumber({
  day,
  count,
  isToday,
  hasCovers,
}: FriendDayNumberProps) {
  const label =
    count === 1 ? '1 friend has plans' : `${count} friends have plans`;

  return (
    <span className='absolute top-0.5 left-0.5 flex size-6 items-center justify-center'>
      <Star
        aria-hidden='true'
        className={join(
          'absolute size-6 stroke-[1.5]',
          isToday
            ? 'fill-primary stroke-(--a-list-release) stroke-2'
            : 'fill-(--a-list-release) stroke-(--a-list-release)',
          hasCovers && 'drop-shadow-[0_1px_1px_rgb(0_0_0/0.5)]',
        )}
      />
      <span
        className={join(
          'relative pt-px text-[10px] font-bold',
          isToday ? 'text-primary-foreground' : 'text-black',
        )}
      >
        {day}
      </span>
      <span className='sr-only'>{label}</span>
    </span>
  );
}

export default FriendDayNumber;
