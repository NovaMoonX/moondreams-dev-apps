import { useMemo } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, ListChecks } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getDayLabel, getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { CHECKLIST_CATEGORY_EMOJIS } from '@apps/waypoint/constants';
import { toggleChecklistItem } from '@apps/waypoint/store/actions/checklistActions';
import type { ChecklistItem, TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface ChecklistOverviewProps {
  trip: TripSpace;
  currentUserId: string;
  onOpen: () => void;
}

const PREVIEW_COUNT = 3;

function ChecklistOverview({ trip, currentUserId, onOpen }: ChecklistOverviewProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const items = useAppSelector((state) => (state.waypoint.checklist.tripId === trip.id ? state.waypoint.checklist.items : null));
  const open = useMemo(
    () =>
      (items ?? [])
        .filter((item) => !item.isCompleted)
        .sort((a, b) => (a.completeByDayIndex ?? Infinity) - (b.completeByDayIndex ?? Infinity) || a.createdAt - b.createdAt),
    [items],
  );
  const canEdit = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  if (open.length === 0) {
    return null;
  }

  const handleToggle = async (item: ChecklistItem, isCompleted: boolean) => {
    try {
      await dispatch(toggleChecklistItem({ tripId: trip.id, itemId: item.id, uid: currentUserId, isCompleted, isPrivate: false })).unwrap();
    } catch (error) {
      addToast({ title: 'Unable to update this item', description: getErrorMessage(error, 'Please try again.'), type: 'error' });
    }
  };

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
        {open.slice(0, PREVIEW_COUNT).map((item) => (
          <li key={item.id} className='flex items-center gap-3 py-2 pl-1.5'>
            <span className='-m-3 inline-flex p-3'>
              <Checkbox
                size={16}
                checked={false}
                aria-label={`Mark done: ${item.title}`}
                disabled={!canEdit && !item.assignedToUids.includes(currentUserId)}
                onCheckedChange={(checked) => void handleToggle(item, checked)}
              />
            </span>
            <span className='min-w-0'>
              <span className='block truncate text-sm font-medium'>{item.title}</span>
              <span className='text-muted-foreground block truncate text-xs'>
                <span aria-hidden='true'>{CHECKLIST_CATEGORY_EMOJIS[item.category] ?? CHECKLIST_CATEGORY_EMOJIS.OTHER}</span>
                {item.completeByDayIndex !== null && ` ${getDayLabel(trip.startDate, item.completeByDayIndex, dayCount)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className='flex items-center'>
        <Button type='button' variant='link' size='sm' className='ml-auto h-auto p-0 text-sm' onClick={onOpen}>
          See all {items?.length ?? open.length} <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </section>
  );
}

export default ChecklistOverview;
