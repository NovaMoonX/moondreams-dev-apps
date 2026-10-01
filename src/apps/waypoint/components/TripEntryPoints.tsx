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
  const pendingCount = useAppSelector((state) =>
    isTripAdmin(trip, currentUserId)
      ? state.waypoint.pendingRequests.tripRequests.filter((request) => request.tripId === trip.id).length
      : 0,
  );

  const pills: { tab: TripEntryTab; label: string; icon: ReactNode; hasBadge: boolean }[] = [
    { tab: 'stays', label: 'Stays', icon: <BedDouble className='h-4 w-4' />, hasBadge: false },
    { tab: 'members', label: 'Members', icon: <Users className='h-4 w-4' />, hasBadge: pendingCount > 0 },
    { tab: 'checklist', label: 'Checklist', icon: <ListChecks className='h-4 w-4' />, hasBadge: false },
  ];

  return (
    <div className='flex flex-wrap gap-2'>
      {pills.map((pill) => (
        <Button
          key={pill.tab}
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => onOpen(pill.tab)}
          className='relative gap-1.5 rounded-full px-3'
        >
          {pill.icon}
          {pill.label}
          {pill.hasBadge && (
            <span className='bg-destructive absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full' />
          )}
        </Button>
      ))}
    </div>
  );
}

export default TripEntryPoints;
