import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { formatDateTime } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import type { Stay } from '@apps/waypoint/types';

interface StayCardProps {
  stay: Stay;
  canEdit: boolean;
  onEdit: (stay: Stay) => void;
  onDelete: (stay: Stay) => void;
}

export function StayCard({ stay, canEdit, onEdit, onDelete }: StayCardProps) {
  return (
    <article className='border-border bg-card rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
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
        </div>
        <div className='flex shrink-0 gap-2'>
          <MapNavigationButton
            locationName={stay.name}
            address={stay.address}
            latitude={stay.latitude}
            longitude={stay.longitude}
          />
          {canEdit && (
            <>
              <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(stay)}>
                Modify
              </Button>
              <Button type='button' size='sm' variant='destructive' onClick={() => onDelete(stay)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default StayCard;
