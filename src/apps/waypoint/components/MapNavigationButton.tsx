import { Button, type ButtonProps } from '@moondreamsdev/dreamer-ui/components';

import { openMapNavigation } from '@/utils/mapUrlUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

type MapNavigationButtonProps = Pick<
  TimelineEvent,
  'locationName' | 'address' | 'latitude' | 'longitude'
> & {
  variant?: ButtonProps['variant'];
};

export function MapNavigationButton({
  locationName,
  address,
  latitude,
  longitude,
  variant = 'secondary',
}: MapNavigationButtonProps) {
  const canNavigate =
    Boolean(locationName || address) || (latitude !== null && longitude !== null);

  if (!canNavigate) {
    return null;
  }

  return (
    <Button
      type='button'
      size='sm'
      variant={variant}
      onClick={() => openMapNavigation({ locationName, address, latitude, longitude })}
    >
      Navigate
    </Button>
  );
}

export default MapNavigationButton;
