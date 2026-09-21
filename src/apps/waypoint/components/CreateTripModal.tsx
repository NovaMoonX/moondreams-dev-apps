import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';

interface CreateTripFormData {
  title: string;
  startDate: string;
  endDate: string;
  coverImageFile: File | null;
}

interface CreateTripModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    startDate: number;
    endDate: number;
    coverImageFile: File | null;
  }) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

function CreateTripModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: CreateTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateTripFormData>({
    title: '',
    startDate: '',
    endDate: '',
    coverImageFile: null,
  });
  const coverUpload = useImageUpload();

  const isFormComplete =
    formData.title.trim() !== '' &&
    fromDateInputValue(formData.startDate) !== undefined &&
    fromDateInputValue(formData.endDate) !== undefined;

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
                setFormData((current) => ({ ...current, coverImageFile: file }));
              }}
              onRemove={() => {
                coverUpload.clear();
                setFormData((current) => ({ ...current, coverImageFile: null }));
              }}
            />
          </div>
        ),
      }),
    ],
    [coverUpload, isSubmitting],
  );

  const handleSubmit = async (data: CreateTripFormData) => {
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
        coverImageFile: coverUpload.file,
      });
    } catch (submitError) {
      setError(
        getStorageErrorMessage(
          submitError,
          getErrorMessage(submitError, 'Unable to create this trip.'),
        ),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='New trip'>
      <Form
        id='waypoint-create-trip'
        form={fields}
        initialData={{
          title: '',
          startDate: '',
          endDate: '',
          coverImageFile: null,
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as CreateTripFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as CreateTripFormData);
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
              {isSubmitting ? 'Creating…' : 'Create trip'}
            </Button>
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default CreateTripModal;
