import FallbackImage from '@/components/FallbackImage';
import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import PhotoPicker from '@/components/forms/PhotoPicker';
import { useImageUpload } from '@/hooks/useImageUpload';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import type { TripSpace } from '@apps/waypoint/types';

interface EditTripCoverModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

function EditTripCoverModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripCoverModalProps) {
  const coverUpload = useImageUpload(trip?.coverImageUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return null;
  }

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit({
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: coverUpload.file,
        coverImageRemoved: coverUpload.previewUrl === null && Boolean(trip.coverImageUrl),
        defaultCurrency: trip.defaultCurrency,
        timezone: trip.timezone,
        keepOriginalDates: false,
      });
    } catch (submitError) {
      setError(
        getStorageErrorMessage(
          submitError,
          getErrorMessage(submitError, 'Unable to update the cover photo.'),
        ),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Cover photo'>
      <div className='space-y-2'>
        {coverUpload.previewUrl && (
          <FallbackImage
            src={coverUpload.previewUrl}
            alt='Cover preview'
            className='h-40 w-full rounded-md object-cover'
          />
        )}
        <PhotoPicker
          photoUrl={coverUpload.previewUrl}
          error={coverUpload.error}
          disabled={isSubmitting}
          showPreview={false}
          onSelect={(file) => coverUpload.pick(file)}
          onRemove={() => coverUpload.clear()}
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
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

export default EditTripCoverModal;
