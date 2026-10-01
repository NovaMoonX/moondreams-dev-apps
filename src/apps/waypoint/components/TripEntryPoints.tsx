import { Button } from '@moondreamsdev/dreamer-ui/components';
import { BedDouble, ListChecks, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAppSelector } from '@/store';

import type { TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

export type TripEntryTab = 'stays' | 'members' | 'checklist';

interface TripEntryPointsProps {
  trip: TripSpace;
  currentUserId: string;
  onOpen: (tab: TripEntryTab) => void;
}

function TripEntryPoints({ trip, currentUserId, onOpen }: TripEntryPointsProps) {
  const incompleteCount = useAppSelector(
    (state) => state.waypoint.checklist.items.filter((item) => !item.isCompleted).length,
  );
  const pendingCount = useAppSelector((state) =>
    isTripAdmin(trip, currentUserId)
      ? state.waypoint.pendingRequests.tripRequests.filter((request) => request.tripId === trip.id).length
      : 0,
  );

  const pills: { tab: TripEntryTab; label: string; icon: ReactNode; hasBadge: boolean; count: number }[] = [
    { tab: 'stays', label: 'Stays', icon: <BedDouble className='h-4 w-4' />, hasBadge: false, count: 0 },
    { tab: 'members', label: 'Members', icon: <Users className='h-4 w-4' />, hasBadge: pendingCount > 0, count: 0 },
    { tab: 'checklist', label: 'Checklist', icon: <ListChecks className='h-4 w-4' />, hasBadge: false, count: incompleteCount },
  ];

  return (
    <div className='flex flex-wrap gap-2'>
      {pills.map((pill) => (
        <Button
          key={pill.tab}
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => onOpen(pill.tab)}
          className='border-border bg-background! hover:bg-muted! relative h-9 gap-1.5 rounded-full border px-3.5 text-sm font-medium shadow-sm'
        >
          <span className='text-muted-foreground'>{pill.icon}</span>
          {pill.label}
          {pill.count > 0 && (
            <span className='bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold'>
              {pill.count}
            </span>
          )}
          {pill.hasBadge && (
            <span className='bg-destructive absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full' />
          )}
        </Button>
      ))}
    </div>
  );
}

export default TripEntryPoints;
