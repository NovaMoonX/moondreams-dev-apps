import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import CitySearchField from '@/components/forms/CitySearchField';
import ModalFooterActions from '@/components/ModalFooterActions';
import type { City } from '@/lib/cities/types';
import { getErrorMessage } from '@/utils/errorUtils';
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
        <CitySearchField value={city} onChange={setCity} disabled={isSubmitting} />
        <p className='text-muted-foreground text-sm'>
          The weather for every day comes from this city. Without one, a day uses the first non-travel plan with a
          location, and a day with neither shows no weather.
        </p>
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
