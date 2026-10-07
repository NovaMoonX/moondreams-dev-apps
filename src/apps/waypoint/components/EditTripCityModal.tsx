import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import CitySelect from '@/components/forms/CitySelect';
import ModalFooterActions from '@/components/ModalFooterActions';
import type { City } from '@/lib/cities/types';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import type { TripCity, TripSpace } from '@apps/waypoint/types';

interface EditTripCityModalProps {
  isOpen: boolean;
  trip: TripSpace;
  isSubmitting?: boolean;
  onSubmit: (city: TripCity | null) => Promise<void> | void;
  onClose: () => void;
}

const toCity = (city: TripCity | null): City | null => city && { ...city, timezone: null };

function EditTripCityModal({ isOpen, trip, isSubmitting = false, onSubmit, onClose }: EditTripCityModalProps) {
  const [city, setCity] = useState<City | null>(toCity(trip.city ?? null));
  const [error, setError] = useState<string | null>(null);
  const hasChanged = (city?.name ?? null) !== (trip.city?.name ?? null) || (city?.latitude ?? null) !== (trip.city?.latitude ?? null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit(
        city && {
          name: city.name,
          region: city.region,
          country: city.country,
          latitude: city.latitude,
          longitude: city.longitude,
        },
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the city.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='City'>
      <div className='space-y-3'>
        <CitySelect value={city} onChange={setCity} disabled={isSubmitting} />
        <p className='text-muted-foreground text-sm'>
          {city ? (
            <>
              We&apos;ll show the weather for <strong className='text-foreground'>{city.name}</strong> on every day of
              the trip.
            </>
          ) : (
            <>
              <strong className='text-foreground'>Pick the city you&apos;ll be in</strong> to see its weather on every
              day. Without one, a day only shows weather if it has a plan with a place, like a dinner or an activity.
            </>
          )}
        </p>
        {city?.timezone && trip.timezone && city.timezone !== trip.timezone && (
          <p className='text-muted-foreground text-sm'>
            Your trip&apos;s times stay in{' '}
            <strong className='text-foreground'>{formatTimezoneLabel(trip.timezone)}</strong>. Only the weather uses{' '}
            {city.name}&apos;s own time. To change the trip&apos;s time zone, use Dates &amp; time zone in the trip menu.
          </p>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button type='button' loading={isSubmitting} disabled={isSubmitting || !hasChanged} onClick={() => void handleSubmit()}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          }
        />
      </div>
    </Modal>
  );
}

export default EditTripCityModal;
