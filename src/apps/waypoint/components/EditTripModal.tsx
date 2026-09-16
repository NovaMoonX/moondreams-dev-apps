import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import { getErrorMessage } from '@/utils/errorUtils';

import type { TripSpace } from '@apps/waypoint/types';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';

interface EditTripFormData {
  title: string;
  startDate: string;
  endDate: string;
  coverImageUrl: string;
  defaultCurrency: string;
}

interface EditTripModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const { input } = FormFactories;

function EditTripModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditTripFormData | null>(null);

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
      input({
        name: 'coverImageUrl',
        label: 'Cover photo URL',
        placeholder: 'https://example.com/trip-cover.jpg',
        variant: 'outline',
      }),
      input({
        name: 'defaultCurrency',
        label: 'Default currency',
        placeholder: 'USD',
        variant: 'outline',
      }),
    ],
    [],
  );

  if (!trip) {
    return null;
  }

  const initialData: EditTripFormData = {
    title: trip.title,
    startDate: toDateInputValue(trip.startDate),
    endDate: toDateInputValue(trip.endDate),
    coverImageUrl: trip.coverImageUrl ?? '',
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
        coverImageUrl: data.coverImageUrl.trim() || null,
        defaultCurrency: data.defaultCurrency.trim() || null,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update this trip.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Edit trip'>
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
