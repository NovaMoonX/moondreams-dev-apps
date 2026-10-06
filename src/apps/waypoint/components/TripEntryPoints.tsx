import { Button } from '@moondreamsdev/dreamer-ui/components';
import { BedDouble, Car, ListChecks, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAppSelector } from '@/store';

import type { TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

export type TripEntryTab = 'members' | 'checklist' | 'stays' | 'rentals';

interface TripEntryPointsProps {
  trip: TripSpace;
  currentUserId: string;
  onOpen: (tab: TripEntryTab) => void;
  /** On a live trip where the group sleeps and drives is a glance away, so Stays and Rentals join the row. */
  includeLogistics?: boolean;
}

function TripEntryPoints({ trip, currentUserId, onOpen, includeLogistics = false }: TripEntryPointsProps) {
  const incompleteCount = useAppSelector(
    (state) => state.waypoint.checklist.items.filter((item) => !item.isCompleted).length,
  );
  const pendingCount = useAppSelector((state) =>
    isTripAdmin(trip, currentUserId)
      ? state.waypoint.pendingRequests.tripRequests.filter((request) => request.tripId === trip.id).length
      : 0,
  );

  const pills: { tab: TripEntryTab; label: string; icon: ReactNode; count: number }[] = [
    { tab: 'members', label: 'Members', icon: <Users className='h-4 w-4' />, count: pendingCount },
    { tab: 'checklist', label: 'Checklist', icon: <ListChecks className='h-4 w-4' />, count: incompleteCount },
    ...(includeLogistics
      ? [
          { tab: 'stays' as const, label: 'Stays', icon: <BedDouble className='h-4 w-4' />, count: 0 },
          { tab: 'rentals' as const, label: 'Rentals', icon: <Car className='h-4 w-4' />, count: 0 },
        ]
      : []),
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
          className='border-primary/30 bg-background! hover:bg-secondary! text-primary h-10 gap-1.5 rounded-full border px-3.5 text-sm font-medium'
        >
          {pill.icon}
          {pill.label}
          {pill.count > 0 && (
            <span className='bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold'>
              {pill.count}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

export default TripEntryPoints;
