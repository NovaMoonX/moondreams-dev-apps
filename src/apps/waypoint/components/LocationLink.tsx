import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { MapPin } from 'lucide-react';

import CopyTextButton from '@/components/CopyTextButton';
import { getMapNavigationUrl } from '@/utils/mapUrlUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

interface LocationLinkProps
  extends Pick<TimelineEvent, 'locationName' | 'address' | 'latitude' | 'longitude'> {
  label: string;
  className?: string;
  /** Adds a quiet copy button for the address; for detail surfaces, not dense rows. */
  showCopy?: boolean;
}

export function LocationLink({
  label,
  className,
  showCopy = false,
  locationName,
  address,
  latitude,
  longitude,
}: LocationLinkProps) {
  const url = getMapNavigationUrl({ locationName, address, latitude, longitude });

  if (!url) {
    return <p className={join('text-muted-foreground text-sm', className)}>{label}</p>;
  }

  const copyText = address || locationName;

  const link = (
    <Button
      href={url}
      variant='link'
      size='sm'
      className={join(
        'text-primary h-auto min-h-0 items-start! justify-start gap-1 p-0! text-left text-sm font-normal whitespace-normal',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <MapPin className='mt-0.75 h-3.5 w-3.5 shrink-0' aria-hidden='true' />
      <span className='text-pretty'>{label}</span>
    </Button>
  );

  if (!showCopy || !copyText) {
    return link;
  }

  return (
    <span className='flex min-w-0 items-start gap-1'>
      {link}
      <CopyTextButton text={copyText} label='Copy address' variant='tertiary' isIconOnly className='text-muted-foreground' />
    </span>
  );
}

export default LocationLink;
