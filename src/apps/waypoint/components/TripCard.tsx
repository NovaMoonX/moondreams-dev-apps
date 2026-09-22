import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDate } from '@/utils/formatUtils';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface TripCardProps {
  trip: TripSpace;
  currentUserId: string;
  now: number;
  onOpen: (tripId: string) => void;
  onEdit: (trip: TripSpace) => void;
  onToggleArchived: (trip: TripSpace) => void;
  onCopyInviteLink: (inviteCode: string) => void;
}

function TripCard({
  trip,
  currentUserId,
  now,
  onOpen,
  onEdit,
  onToggleArchived,
  onCopyInviteLink,
}: TripCardProps) {
  const canEdit = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const canArchive = hasTripRole(trip, currentUserId, 'ADMIN');
  const isActive = getTripStatus(trip, now) === 'ACTIVE';

  return (
    <div className='border-border bg-card rounded-lg border p-4'>
      {trip.coverImageUrl && (
        <img
          src={trip.coverImageUrl}
          alt={`${trip.title} cover`}
          className='mb-4 h-40 w-full rounded-md object-cover'
        />
      )}
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2'>
            <h2 className='text-lg font-semibold'>{trip.title}</h2>
            {isActive && (
              <Badge variant='success' use='status'>
                Active
              </Badge>
            )}
            {trip.isArchived && <Badge variant='muted'>Archived</Badge>}
          </div>
          <p className='text-muted-foreground mt-2 text-sm'>
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </p>
        </div>
        <div className='flex shrink-0 gap-2'>
          {canEdit && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => onEdit(trip)}
            >
              Edit
            </Button>
          )}
          {canArchive && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => onToggleArchived(trip)}
            >
              {trip.isArchived ? 'Unarchive' : 'Archive'}
            </Button>
          )}
        </div>
      </div>

      {trip.inviteCode && (
        <div className='mt-4 flex items-center justify-between gap-3'>
          <code className='text-muted-foreground text-sm'>
            Invite: {trip.inviteCode}
          </code>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => onCopyInviteLink(trip.inviteCode as string)}
          >
            Copy invite link
          </Button>
        </div>
      )}

      <Button
        type='button'
        className='mt-4 w-full'
        onClick={() => onOpen(trip.id)}
      >
        Open trip
      </Button>
    </div>
  );
}

export default TripCard;
