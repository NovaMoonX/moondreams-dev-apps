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
    <article className='border-border bg-card flex flex-col overflow-hidden rounded-lg border sm:flex-row'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='aspect-video w-full object-cover sm:aspect-auto sm:w-44 sm:shrink-0'
        />
      )}
      <div className='flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='font-semibold'>{stay.name}</h3>
            <Badge variant='muted' outline>
              {STAY_TYPE_LABELS[stay.stayType ?? 'OTHER']}
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
        <div className='flex shrink-0 justify-end gap-2 sm:justify-start'>
          <MapNavigationButton
            locationName={stay.stayType === 'HOTEL' ? stay.name : null} // Only include the name for hotels
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
