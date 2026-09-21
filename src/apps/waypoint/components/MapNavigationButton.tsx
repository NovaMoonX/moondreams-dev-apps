import { Button } from '@moondreamsdev/dreamer-ui/components';

import { openMapNavigation } from '@/utils/mapUrlUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

type MapNavigationButtonProps = Pick<
  TimelineEvent,
  'locationName' | 'address' | 'latitude' | 'longitude'
>;

export function MapNavigationButton({
  locationName,
  address,
  latitude,
  longitude,
}: MapNavigationButtonProps) {
  const canNavigate =
    Boolean(locationName || address) || (latitude !== null && longitude !== null);

  return (
    <Button
      type='button'
      size='sm'
      variant='secondary'
      disabled={!canNavigate}
      onClick={() => openMapNavigation({ locationName, address, latitude, longitude })}
    >
      Navigate
    </Button>
  );
}

export default MapNavigationButton;
