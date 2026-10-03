import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDate } from '@/utils/formatUtils';
import ViewingRow from '@apps/a-list/components/calendar/ViewingRow';
import type { Viewing } from '@apps/a-list/types';

interface DayPanelProps {
  /** Local midnight of the selected day. */
  day: Date;
  viewings: Viewing[];
  onAdd: () => void;
}

function DayPanel({ day, viewings, onAdd }: DayPanelProps) {
  return (
    <section className='space-y-1' aria-label='Movies on the selected day'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {formatDate(day.getTime())}
        </h3>
        <Button type='button' variant='tertiary' size='sm' onClick={onAdd}>
          + Add
        </Button>
      </div>
      {viewings.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Nothing on this day yet.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {viewings.map((viewing) => (
            <li key={viewing.id}>
              <ViewingRow viewing={viewing} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default DayPanel;
