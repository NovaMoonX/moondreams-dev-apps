import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { MapPin } from 'lucide-react';

import { getMapNavigationUrl } from '@/utils/mapUrlUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

interface LocationLinkProps
  extends Pick<TimelineEvent, 'locationName' | 'address' | 'latitude' | 'longitude'> {
  label: string;
  className?: string;
}

export function LocationLink({
  label,
  className,
  locationName,
  address,
  latitude,
  longitude,
}: LocationLinkProps) {
  const url = getMapNavigationUrl({ locationName, address, latitude, longitude });

  if (!url) {
    return <p className={join('text-muted-foreground text-sm', className)}>{label}</p>;
  }

  return (
    <Button
      href={url}
      variant='link'
      size='sm'
      className={join(
        'text-primary h-auto min-h-0 justify-start gap-1 p-0! text-left text-sm font-normal whitespace-normal',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
      <span>{label}</span>
    </Button>
  );
}

export default LocationLink;
