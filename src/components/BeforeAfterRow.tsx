import type { ReactNode } from 'react';

interface BeforeAfterRowProps {
  /** What the row is about; it wraps to two lines. */
  title: string;
  /** Sits before the title (a badge or icon). */
  leading?: ReactNode;
  before: string;
  after: string;
  /** Caption over the earlier value ("Planned"). */
  beforeLabel: string;
  /** Caption over the later value ("Confirmed"). */
  afterLabel: string;
  /** A line under the values (a note, a reason). */
  detail?: ReactNode;
}

/** A row with two values side by side, the earlier one quiet and the later one in full weight. */
function BeforeAfterRow({
  title,
  leading,
  before,
  after,
  beforeLabel,
  afterLabel,
  detail,
}: BeforeAfterRowProps) {
  return (
    <li
      className='flex items-start gap-3 p-3'
      aria-label={`${title}: ${beforeLabel} ${before}, ${afterLabel} ${after}`}
    >
      {leading}
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='line-clamp-2 font-medium break-words'>{title}</p>
        <div className='flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm'>
          <p className='text-muted-foreground'>
            {beforeLabel}{' '}
            <span className='whitespace-nowrap tabular-nums'>{before}</span>
          </p>
          <p>
            {afterLabel}{' '}
            <span className='font-semibold whitespace-nowrap tabular-nums'>
              {after}
            </span>
          </p>
        </div>
        {detail}
      </div>
    </li>
  );
}

export default BeforeAfterRow;
