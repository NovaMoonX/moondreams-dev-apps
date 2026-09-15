import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';

import { fromDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import { getErrorMessage } from '@/utils/errorUtils';

interface CreateTripFormData {
  title: string;
  startDate: string;
  endDate: string;
}

interface CreateTripModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    startDate: number;
    endDate: number;
  }) => Promise<void> | void;
  onClose: () => void;
}

const { input } = FormFactories;

function CreateTripModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: CreateTripModalProps) {
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Trip title',
        placeholder: 'Tokyo Summer 2026',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'startDate',
        label: 'Estimated start date',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'endDate',
        label: 'Estimated end date',
        required: true,
        variant: 'outline',
      }),
    ],
    [],
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
      await onSubmit({ title, startDate, endDate });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to create this trip.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Create a trip'>
      <Form
        id='waypoint-create-trip'
        form={fields}
        initialData={{ title: '', startDate: '', endDate: '' }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as CreateTripFormData);
        }}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' loading={isSubmitting}>
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
