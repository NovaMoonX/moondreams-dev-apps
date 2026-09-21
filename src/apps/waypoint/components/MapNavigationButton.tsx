import { Button } from '@moondreamsdev/dreamer-ui/components';

import { openMapNavigation } from '@apps/waypoint/utils/mapUrlHelpers';

interface MapNavigationButtonProps {
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

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
