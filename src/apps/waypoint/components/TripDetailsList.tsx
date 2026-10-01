import { Button } from '@moondreamsdev/dreamer-ui/components';
import { BedDouble, ChevronRight, ListChecks, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAppSelector } from '@/store';

import { selectStays } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import type { TripEntryTab } from '@apps/waypoint/components/TripEntryPoints';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

interface TripDetailsListProps {
  trip: TripSpace;
  currentUserId: string;
  onOpen: (tab: TripEntryTab) => void;
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function TripDetailsList({ trip, currentUserId, onOpen }: TripDetailsListProps) {
  const stayCount = useAppSelector(selectStays).length;
  const checklistItems = useAppSelector((state) => state.waypoint.checklist.items);
  const pendingCount = useAppSelector((state) =>
    isTripAdmin(trip, currentUserId)
      ? state.waypoint.pendingRequests.tripRequests.filter((request) => request.tripId === trip.id).length
      : 0,
  );
  const memberCount = Object.keys(trip.members).length;
  const completedCount = checklistItems.filter((item) => item.isCompleted).length;

  const rows: { tab: TripEntryTab; label: string; summary: string; icon: ReactNode; badge: number }[] = [
    {
      tab: 'stays',
      label: 'Stays',
      summary: stayCount === 0 ? 'Nothing booked yet' : pluralize(stayCount, 'stay'),
      icon: <BedDouble className='h-5 w-5' />,
      badge: 0,
    },
    {
      tab: 'members',
      label: 'Members',
      summary: pendingCount > 0 ? `${pluralize(memberCount, 'member')} · ${pendingCount} waiting` : pluralize(memberCount, 'member'),
      icon: <Users className='h-5 w-5' />,
      badge: pendingCount,
    },
    {
      tab: 'checklist',
      label: 'Checklist',
      summary: checklistItems.length === 0 ? 'Nothing to do yet' : `${completedCount} of ${checklistItems.length} done`,
      icon: <ListChecks className='h-5 w-5' />,
      badge: checklistItems.length - completedCount,
    },
  ];

  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
        Trip details
      </h3>
      <ul className='divide-border border-border divide-y rounded-xl border'>
        {rows.map((row) => (
          <li key={row.tab}>
            <Button
              type='button'
              variant='tertiary'
              onClick={() => onOpen(row.tab)}
              className='h-auto w-full justify-start gap-3 rounded-none px-3 py-3 text-left'
            >
              <span className='text-muted-foreground relative'>
                {row.icon}
                {row.badge > 0 && (
                  <span className='bg-destructive absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full' />
                )}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>{row.label}</span>
                <span className='text-muted-foreground block text-xs'>{row.summary}</span>
              </span>
              <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TripDetailsList;
