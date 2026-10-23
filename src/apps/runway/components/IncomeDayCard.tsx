import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import type { ComingDay } from '@apps/runway/engine/comingDays';

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  timeZone: 'UTC',
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  timeZone: 'UTC',
});

interface IncomeDayCardProps {
  day: ComingDay;
  onOpen: () => void;
}

/** One coming income day: the date, where it comes from and the take-home amount; it opens that day's draft. */
function IncomeDayCard({ day, onOpen }: IncomeDayCardProps) {
  const title = day.sourceName ?? day.payLineName;
  const detail = day.sourceName ? day.payLineName : null;

  return (
    <li className='border-border bg-card rounded-2xl border'>
      <Button
        variant='tertiary'
        className='h-auto w-full items-start justify-start gap-3 rounded-2xl p-3 text-left font-normal whitespace-normal'
        aria-label={`${formatDateUTC(day.on)}, ${[title, detail].filter(Boolean).join(', ')}, ${formatCents(day.amount.lowCents)}. Open this day`}
        onClick={onOpen}
      >
        <span
          className='border-border bg-background flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center'
          aria-hidden='true'
        >
          <span className='text-muted-foreground text-[10px] leading-3 font-semibold uppercase'>
            {monthFormatter.format(day.on)}
          </span>
          <span className='text-base leading-5 font-semibold tabular-nums'>
            {new Date(day.on).getUTCDate()}
          </span>
        </span>
        <span className='block min-h-11 min-w-0 flex-1'>
          <span className='line-clamp-2 font-medium break-words'>
            {title}
          </span>
          <span className='text-muted-foreground block text-sm'>
            {weekdayFormatter.format(day.on)}
            {detail && <span className='max-sm:hidden'> · </span>}
            {detail && <span className='max-sm:block'>{detail}</span>}
          </span>
        </span>
        <span className='flex h-11 shrink-0 items-center gap-1'>
          <span className='font-semibold whitespace-nowrap tabular-nums'>
            {formatCents(day.amount.lowCents)}
          </span>
          <ChevronRight
            className='text-muted-foreground h-4 w-4'
            aria-hidden='true'
          />
        </span>
      </Button>
    </li>
  );
}

export default IncomeDayCard;
