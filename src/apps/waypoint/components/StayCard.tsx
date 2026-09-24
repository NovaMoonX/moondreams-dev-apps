import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import StayNotesButton from '@apps/waypoint/components/StayNotesButton';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatDateTime } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { STAY_TYPE_LABELS } from '@apps/waypoint/constants';
import type { Stay } from '@apps/waypoint/types';

interface StayCardProps {
  stay: Stay;
  canEdit: boolean;
  onEdit: (stay: Stay) => void;
}

export function StayCard({ stay, canEdit, onEdit }: StayCardProps) {
  const imageUrl = getDisplayImage(stay);

  return (
    <article className='border-border bg-card flex overflow-hidden rounded-lg border'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='w-28 shrink-0 object-cover sm:w-44'
        />
      )}
      <div className='flex min-w-0 flex-1 items-start justify-between gap-3 p-4'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='font-semibold'>{stay.name}</h3>
            <Badge variant='muted' outline>
              {STAY_TYPE_LABELS[stay.stayType]}
            </Badge>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>{stay.address}</p>
          <p className='text-muted-foreground mt-2 text-sm'>
            {formatDateTime(stay.checkInAt)} - {formatDateTime(stay.checkOutAt)}
          </p>
          {stay.checkInTimezone && (
            <p className='text-muted-foreground mt-1 text-xs'>
              {formatTimezoneLabel(stay.checkInTimezone)}
            </p>
          )}
          {(stay.linkUrl || stay.notes) && (
            <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1'>
              <StayNotesButton stay={stay} />
              {stay.linkUrl && <ExternalLinkText href={stay.linkUrl} />}
            </div>
          )}
        </div>
        <div className='flex shrink-0 gap-2'>
          <MapNavigationButton
            locationName={stay.name}
            address={stay.address}
            latitude={stay.latitude}
            longitude={stay.longitude}
          />
          {canEdit && (
            <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(stay)}>
              Modify
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default StayCard;
