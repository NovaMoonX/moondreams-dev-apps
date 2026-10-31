import { useMemo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, ListChecks } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CATEGORY_EMOJIS,
  CHECKLIST_CATEGORY_VERBS,
} from '@apps/waypoint/constants';
import { selectPersonalChecklistItems } from '@apps/waypoint/store/selectors';
import type { ChecklistCategory, TripSpace } from '@apps/waypoint/types';
import {
  getChecklistSummary,
  getDueInfo,
} from '@apps/waypoint/utils/checklistDue';

interface ChecklistOverviewProps {
  trip: TripSpace;
  /** A category opens the checklist already filtered to it. */
  onOpen: (category: ChecklistCategory) => void;
  currentUserId: string;
}

function ChecklistOverview({
  trip,
  onOpen,
  currentUserId,
}: ChecklistOverviewProps) {
  const sharedItems = useAppSelector((state) =>
    state.waypoint.checklist.tripId === trip.id
      ? state.waypoint.checklist.items
      : null,
  );
  const personalItems = useAppSelector(selectPersonalChecklistItems);
  const open = useMemo(
    () =>
      [
        ...(sharedItems ?? []),
        ...personalItems.filter((item) => item.tripId === trip.id),
      ].filter((item) => !item.isCompleted),
    [sharedItems, personalItems, trip.id],
  );

  const now = useNow();
  const privateIds = new Set(personalItems.map((item) => item.id));
  const summary = getChecklistSummary(
    open,
    currentUserId,
    trip.startDate,
    now,
    (item) => privateIds.has(item.id),
  );
  const rows = CHECKLIST_CATEGORIES.flatMap((category) => {
    const inCategory = open
      .filter((item) => item.category === category)
      .sort(
        (a, b) =>
          (a.completeByDayIndex ?? Infinity) -
            (b.completeByDayIndex ?? Infinity) || a.createdAt - b.createdAt,
      );
    return inCategory.length === 0
      ? []
      : [{ category, count: inCategory.length, next: inCategory[0] }];
  }).sort(
    (a, b) =>
      (a.next.completeByDayIndex ?? Infinity) -
      (b.next.completeByDayIndex ?? Infinity),
  );

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
          <p className='text-muted-foreground text-sm'>{summary}</p>
        </div>
      </div>
      <ul className='divide-border divide-y'>
        {rows.map(({ category, count, next }) => {
          const nextDue = getDueInfo(
            trip.startDate,
            next.completeByDayIndex,
            now,
          );
          return (
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
                    {CHECKLIST_CATEGORY_VERBS[category]} {count}{' '}
                    {count === 1 ? 'thing' : 'things'}
                  </span>
                  <span className='text-muted-foreground flex gap-1 text-xs'>
                    <span className='min-w-0 truncate'>Next: {next.title}</span>
                    {nextDue && (
                      <span className='shrink-0 whitespace-nowrap'>
                        · {nextDue.label}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ChecklistOverview;
