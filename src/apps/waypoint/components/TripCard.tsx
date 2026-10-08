import FallbackImage from '@/components/FallbackImage';
import { Badge, Button, CopyButton } from '@moondreamsdev/dreamer-ui/components';

import { MapPin } from 'lucide-react';

import { getCityLabel } from '@/lib/cities/cityApi';
import { formatDateUTC } from '@/utils/formatUtils';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface TripCardProps {
  trip: TripSpace;
  now: number;
  onOpen: (tripId: string) => void;
  onInviteCopied: (kind: 'code' | 'link') => void;
}

function TripCard({
  trip,
  now,
  onOpen,
  onInviteCopied,
}: TripCardProps) {
  const isActive = getTripStatus(trip, now) === 'ACTIVE';

  return (
    <div className='border-border bg-card rounded-lg border p-4'>
      {trip.coverImageUrl && (
        <FallbackImage
          src={trip.coverImageUrl}
          alt={`${trip.title} cover`}
          className='mb-4 h-40 w-full rounded-md object-cover'
        />
      )}
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
        <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm'>
          <p>
            {formatDateUTC(trip.startDate)} - {formatDateUTC(trip.endDate)}
          </p>
          {trip.city && (
            <p className='flex min-w-0 items-center gap-1'>
              <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='truncate'>{getCityLabel(trip.city)}</span>
            </p>
          )}
        </div>
      </div>

      {trip.inviteCode && (
        <div className='bg-muted/50 mt-4 flex items-center justify-between gap-2 rounded-lg p-2 pl-3'>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-[10px] font-semibold tracking-wide uppercase'>
              Invite code
            </p>
            <div className='flex items-center gap-1'>
              <code className='text-foreground text-base font-semibold tracking-[0.2em]'>
                {trip.inviteCode}
              </code>
              <CopyButton
                textToCopy={trip.inviteCode}
                variant='tertiary'
                size='icon'
                className='-my-1'
                onClick={() => onInviteCopied('code')}
              />
            </div>
          </div>
          <CopyButton
            textToCopy={`${window.location.origin}/waypoint?inviteCode=${trip.inviteCode}`}
            variant='secondary'
            size='sm'
            className='shrink-0'
            onClick={() => onInviteCopied('link')}
          >
            Copy link
          </CopyButton>
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
