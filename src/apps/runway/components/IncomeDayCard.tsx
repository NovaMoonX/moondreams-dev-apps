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
}

/** One coming income day: the date, where it comes from and the take-home amount. */
function IncomeDayCard({ day }: IncomeDayCardProps) {
  const title = day.sourceName ?? day.payLineName;
  const detail = day.sourceName ? day.payLineName : null;

  return (
    <li
      className='border-border bg-card flex items-start gap-3 rounded-2xl border p-3'
      aria-label={`${formatDateUTC(day.on)}, ${title}, ${formatCents(day.amount.lowCents)}`}
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
      <div className='min-h-11 min-w-0 flex-1'>
        <p className='line-clamp-2 font-medium break-words'>{title}</p>
        <p className='text-muted-foreground text-sm'>
          {weekdayFormatter.format(day.on)}
          {detail && <span className='max-sm:hidden'> · </span>}
          {detail && <span className='max-sm:block'>{detail}</span>}
        </p>
      </div>
      <p className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
        {formatCents(day.amount.lowCents)}
      </p>
    </li>
  );
}

export default IncomeDayCard;
