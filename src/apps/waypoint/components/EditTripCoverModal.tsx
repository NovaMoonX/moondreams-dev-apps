import FallbackImage from '@/components/FallbackImage';
import { useRef, useState } from 'react';

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
  const coverUpload = useImageUpload(trip?.coverImageUrl ?? null, 'cover');
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const isSavingRef = useRef(false);

  if (!trip) {
    return null;
  }

  const handleSubmit = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsWaiting(true);
    setError(null);
    try {
      const coverImageFile = await coverUpload.readyFile();
      await onSubmit({
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile,
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
    } finally {
      isSavingRef.current = false;
      setIsWaiting(false);
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
          loading={coverUpload.isPreparing}
          showPreview={false}
          onSelect={(file) => void coverUpload.pick(file)}
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
          loading={isSubmitting || isWaiting}
          disabled={isSubmitting || isWaiting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting || isWaiting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

export default EditTripCoverModal;
