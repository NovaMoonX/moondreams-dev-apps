import { useMemo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, ListChecks } from 'lucide-react';

import { useAppSelector } from '@/store';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CATEGORY_EMOJIS,
  CHECKLIST_CATEGORY_VERBS,
} from '@apps/waypoint/constants';
import { selectPersonalChecklistItems } from '@apps/waypoint/store/selectors';
import type { ChecklistCategory, TripSpace } from '@apps/waypoint/types';

interface ChecklistOverviewProps {
  trip: TripSpace;
  /** A category opens the checklist already filtered to it; `ALL` opens it unfiltered. */
  onOpen: (category: ChecklistCategory | 'ALL') => void;
}

function ChecklistOverview({ trip, onOpen }: ChecklistOverviewProps) {
  const sharedItems = useAppSelector((state) => (state.waypoint.checklist.tripId === trip.id ? state.waypoint.checklist.items : null));
  const personalItems = useAppSelector(selectPersonalChecklistItems);
  const open = useMemo(
    () => [...(sharedItems ?? []), ...personalItems.filter((item) => item.tripId === trip.id)].filter((item) => !item.isCompleted),
    [sharedItems, personalItems, trip.id],
  );
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const rows = CHECKLIST_CATEGORIES.flatMap((category) => {
    const inCategory = open.filter((item) => item.category === category);
    const due = inCategory.flatMap((item) => (item.completeByDayIndex === null ? [] : [item.completeByDayIndex]));
    return inCategory.length === 0 ? [] : [{ category, count: inCategory.length, nextDue: due.length > 0 ? Math.min(...due) : null }];
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className='bg-secondary/70 mt-5 space-y-3 rounded-2xl p-4'>
      <div className='flex items-start gap-3'>
        <span className='bg-secondary text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
          <ListChecks className='h-4 w-4' aria-hidden='true' />
        </span>
        <div className='min-w-0'>
          <h3 className='font-semibold'>Before the road</h3>
          <p className='text-muted-foreground text-sm'>
            {open.length} {open.length === 1 ? 'thing' : 'things'} left to do.
          </p>
        </div>
      </div>
      <ul className='divide-border divide-y'>
        {rows.map(({ category, count, nextDue }) => (
          <li key={category}>
            <Button
              type='button'
              variant='tertiary'
              className='h-auto min-h-11 w-full justify-start gap-3 px-0! py-2 text-left'
              onClick={() => onOpen(category)}
            >
              <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                {CHECKLIST_CATEGORY_EMOJIS[category]}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>
                  {CHECKLIST_CATEGORY_VERBS[category]} {count} {count === 1 ? 'thing' : 'things'}
                </span>
                {nextDue !== null && (
                  <span className='text-muted-foreground block text-xs'>
                    Next due {getDayLabel(trip.startDate, nextDue, dayCount)}
                  </span>
                )}
              </span>
              <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
            </Button>
          </li>
        ))}
      </ul>
      <div className='flex items-center'>
        <Button type='button' variant='link' size='sm' className='ml-auto h-auto p-0 text-sm' onClick={() => onOpen('ALL')}>
          See the whole checklist <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </section>
  );
}

export default ChecklistOverview;
