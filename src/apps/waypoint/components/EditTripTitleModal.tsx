import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

import { getErrorMessage } from '@/utils/errorUtils';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import type { TripSpace } from '@apps/waypoint/types';

interface EditTripTitleModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

function EditTripTitleModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripTitleModalProps) {
  const [title, setTitle] = useState(trip?.title ?? '');
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return null;
  }

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Trip title is required.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title: trimmed,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: null,
        coverImageRemoved: false,
        defaultCurrency: trip.defaultCurrency,
        timezone: trip.timezone,
        keepOriginalDates: false,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the title.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip title'>
      <div className='space-y-2'>
        <Label htmlFor={`trip-title-${trip.id}`}>Title</Label>
        <Input
          id={`trip-title-${trip.id}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder='Tokyo Summer 2026'
          variant='outline'
        />
      </div>
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
      <div className='mt-4 flex justify-end gap-2'>
        <Button type='button' variant='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button
          type='button'
          loading={isSubmitting}
          disabled={isSubmitting || !title.trim()}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

export default EditTripTitleModal;
