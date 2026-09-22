import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { patchStayPlacePhoto } from '@apps/waypoint/store/actions/stayActions';
import EnrichedImage from '@/components/EnrichedImage';
import { formatDateTime } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import { getDisplayImage, getDisplayLink } from '@/utils/enrichmentUtils';
import type { Stay } from '@apps/waypoint/types';

interface StayCardProps {
  stay: Stay;
  canEdit: boolean;
  onEdit: (stay: Stay) => void;
}

export function StayCard({ stay, canEdit, onEdit }: StayCardProps) {
  const imageUrl = getDisplayImage(stay);
  const linkHref = getDisplayLink(stay);

  return (
    <article className='border-border bg-card overflow-hidden rounded-lg border'>
      <div className='flex items-start gap-3 p-4'>
        {imageUrl && (
          <EnrichedImage
            src={imageUrl}
            alt=''
            className='h-16 w-16 shrink-0 rounded-md object-cover'
            refreshFrom={
              stay.place
                ? {
                    place: stay.place,
                    canEdit,
                    onRefreshed: (photoUrl, photoRefreshedAt) =>
                      void patchStayPlacePhoto(stay.tripId, stay.id, photoUrl, photoRefreshedAt),
                  }
                : undefined
            }
          />
        )}
        <div className='flex flex-1 items-start justify-between gap-3'>
          <div>
            <Badge variant='base'>🏨 Stay</Badge>
            <h3 className='mt-2 font-semibold'>{stay.name}</h3>
            <p className='text-muted-foreground mt-1 text-sm'>{stay.address}</p>
            <p className='text-muted-foreground mt-2 text-sm'>
              {formatDateTime(stay.checkInAt)} – {formatDateTime(stay.checkOutAt)}
            </p>
            {stay.checkInTimezone && (
              <p className='text-muted-foreground mt-1 text-xs'>
                {formatTimezoneLabel(stay.checkInTimezone)}
              </p>
            )}
            {linkHref && (
              <a
                href={linkHref}
                target='_blank'
                rel='noreferrer'
                className='text-primary mt-1 inline-block text-xs font-medium hover:underline'
              >
                View link
              </a>
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
      </div>
    </article>
  );
}

export default StayCard;
