import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { getErrorMessage } from '@/utils/errorUtils';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { TripSpace } from '@apps/waypoint/types';

interface TripTimezoneModalProps {
  isOpen: boolean;
  trip: TripSpace;
  isSubmitting?: boolean;
  onSubmit: (timezone: string) => Promise<void> | void;
  onClose: () => void;
}

function TripTimezoneModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: TripTimezoneModalProps) {
  const [timezone, setTimezone] = useState(trip.timezone ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit(timezone);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the time zone.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Time zone'>
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          This is the default time zone for everything on this trip. Any event or stay can still
          use its own.
        </p>
        <TimezoneSelect value={timezone} onChange={setTimezone} />
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button
                type='button'
                loading={isSubmitting}
                disabled={isSubmitting || !timezone || timezone === trip.timezone}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default TripTimezoneModal;
