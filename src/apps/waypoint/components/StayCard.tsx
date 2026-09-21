import { Badge } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { formatDateTime } from '@/utils/formatUtils';
import type { Stay } from '@apps/waypoint/types';

interface StayCardProps {
  stay: Stay;
}

export function StayCard({ stay }: StayCardProps) {
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
            <p className='text-muted-foreground mt-1 text-xs'>{stay.checkInTimezone}</p>
          )}
        </div>
        <MapNavigationButton
          locationName={stay.name}
          address={stay.address}
          latitude={stay.latitude}
          longitude={stay.longitude}
        />
      </div>
    </article>
  );
}

export default StayCard;
