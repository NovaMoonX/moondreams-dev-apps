import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';

import type { TripSpace } from '@apps/waypoint/types';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';

interface EditTripFormData {
  title: string;
  startDate: string;
  endDate: string;
  coverImageFile: File | null;
  defaultCurrency: string;
}

interface EditTripModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

function EditTripModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditTripFormData | null>(null);
  const coverUpload = useImageUpload(trip?.coverImageUrl ?? null);

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Trip title',
        placeholder: 'Tokyo Summer 2026',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'startDate',
        label: 'Estimated start date',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'endDate',
        label: 'Estimated end date',
        variant: 'outline',
      }),
      custom({
        name: 'coverImageFile',
        label: 'Cover photo',
        renderComponent: () => (
          <div className='space-y-2'>
            {coverUpload.previewUrl && (
              <img
                src={coverUpload.previewUrl}
                alt='Cover preview'
                className='h-40 w-full rounded-md object-cover'
              />
            )}
            <ImageUploadField
              previewUrl={coverUpload.previewUrl}
              error={coverUpload.error}
              disabled={isSubmitting}
              hideAvatar
              onSelect={(file) => {
                coverUpload.pick(file);
                setFormData((current) => ({
                  ...(current ?? initialData),
                  coverImageFile: file,
                }));
              }}
              onRemove={() => {
                coverUpload.clear();
                setFormData((current) => ({
                  ...(current ?? initialData),
                  coverImageFile: null,
                }));
              }}
            />
          </div>
        ),
      }),
      input({
        name: 'defaultCurrency',
        label: 'Default currency',
        placeholder: 'USD',
        variant: 'outline',
      }),
    ],
    [coverUpload, isSubmitting],
  );

  if (!trip) {
    return null;
  }

  const initialData: EditTripFormData = {
    title: trip.title,
    startDate: toDateInputValue(trip.startDate),
    endDate: toDateInputValue(trip.endDate),
    coverImageFile: null,
    defaultCurrency: trip.defaultCurrency ?? '',
  };
  const currentData = formData ?? initialData;
  const isFormComplete =
    currentData.title.trim() !== '' &&
    fromDateInputValue(currentData.startDate) !== undefined &&
    fromDateInputValue(currentData.endDate) !== undefined;

  const handleSubmit = async (data: EditTripFormData) => {
    const title = data.title.trim();
    const startDate = fromDateInputValue(data.startDate);
    const endDate = fromDateInputValue(data.endDate);

    if (!title || startDate === undefined || endDate === undefined) {
      setError('Enter a title and both estimated trip dates.');
      return;
    }

    setError(null);

    try {
      await onSubmit({
        title,
        startDate,
        endDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: coverUpload.file,
        coverImageRemoved: coverUpload.previewUrl === null && Boolean(trip.coverImageUrl),
        defaultCurrency: data.defaultCurrency.trim() || null,
      });
    } catch (submitError) {
      setError(
        getStorageErrorMessage(
          submitError,
          getErrorMessage(submitError, 'Unable to update this trip.'),
        ),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip details'>
      <Form
        key={trip.id}
        id='waypoint-edit-trip'
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as EditTripFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as EditTripFormData);
        }}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button
              type='submit'
              loading={isSubmitting}
              disabled={isSubmitting || !isFormComplete}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default EditTripModal;
