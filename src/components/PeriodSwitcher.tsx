import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { PillGroup, type PillOption } from '@/components/PillGroup';

interface PeriodSwitcherProps<T extends string> {
  /** The period shown, already worded ("October 2026", "Oct 11 – 17"). */
  title: string;
  /** What one step is ("month", "week", "day"), for the arrows' labels. */
  unitLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  views: readonly PillOption<T>[];
  view: T;
  onViewChange: (view: T) => void;
  viewsLabel: string;
  /** Shows the Today button: the period shown doesn't hold today. */
  canJumpToToday: boolean;
  onToday: () => void;
}

/** Steps a calendar-like screen through its periods and switches between its views, with a Today button that is there only while today is out of sight. */
function PeriodSwitcher<T extends string>({
  title,
  unitLabel,
  onPrevious,
  onNext,
  views,
  view,
  onViewChange,
  viewsLabel,
  canJumpToToday,
  onToday,
}: PeriodSwitcherProps<T>) {
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex items-center justify-between gap-2 max-sm:order-2 sm:justify-start'>
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label={`Previous ${unitLabel}`}
          className='size-10 shrink-0'
          onClick={onPrevious}
        >
          <ChevronLeft className='h-5 w-5' aria-hidden='true' />
        </Button>
        <h2
          className='min-w-0 flex-1 truncate text-center text-lg font-semibold sm:min-w-44 sm:flex-none'
          aria-live='polite'
        >
          {title}
        </h2>
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label={`Next ${unitLabel}`}
          className='size-10 shrink-0'
          onClick={onNext}
        >
          <ChevronRight className='h-5 w-5' aria-hidden='true' />
        </Button>
      </div>
      <div className='flex items-center justify-between gap-2 max-sm:order-1'>
        <div className='min-w-0'>
          <PillGroup
            label={viewsLabel}
            options={views}
            value={view}
            onChange={onViewChange}
            isThin
          />
        </div>
        {canJumpToToday && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className="relative h-7 min-h-0 shrink-0 px-3 py-0 text-xs after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
            onClick={onToday}
          >
            Today
          </Button>
        )}
      </div>
    </div>
  );
}

export default PeriodSwitcher;
