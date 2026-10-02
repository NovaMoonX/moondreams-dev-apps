import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import DateRangeField, {
  type DateRangeValue,
} from '@/components/forms/DateRangeField';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';

interface CreateTripFormData {
  title: string;
  dates: DateRangeValue;
  timezone: string;
}

interface CreateTripModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    startDate: number;
    endDate: number;
    timezone: string;
  }) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

const INITIAL_DATA: CreateTripFormData = {
  title: '',
  dates: { startDate: '', endDate: '' },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function CreateTripModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: CreateTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateTripFormData>(INITIAL_DATA);

  const isFormComplete =
    formData.title.trim() !== '' &&
    fromDateInputValue(formData.dates.startDate) !== undefined &&
    fromDateInputValue(formData.dates.endDate) !== undefined;

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Trip title',
        placeholder: 'Tokyo Summer 2026',
        variant: 'outline',
      }),
      custom({
        name: 'dates',
        label: 'When is the trip?',
        renderComponent: (props) => (
          <DateRangeField
            value={props.value as DateRangeValue}
            onChange={(value) => props.onValueChange(value)}
            disabled={isSubmitting}
          />
        ),
      }),
      custom({
        name: 'timezone',
        label: '',
        renderComponent: (props) => (
          <TimezoneSelect
            pill
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
            disabled={isSubmitting}
          />
        ),
      }),
    ],
    [isSubmitting],
  );

  const handleSubmit = async (data: CreateTripFormData) => {
    const title = data.title.trim();
    const startDate = fromDateInputValue(data.dates.startDate);
    const endDate = fromDateInputValue(data.dates.endDate);

    if (!title || startDate === undefined || endDate === undefined) {
      setError('Enter a title and when the trip is.');
      return;
    }

    setError(null);

    try {
      await onSubmit({ title, startDate, endDate, timezone: data.timezone });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to create this trip.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='New trip'>
      <Form
        id='waypoint-create-trip'
        form={fields}
        initialData={INITIAL_DATA}
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
