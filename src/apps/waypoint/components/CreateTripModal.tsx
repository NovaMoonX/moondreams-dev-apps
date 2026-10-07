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
import CitySelect from '@/components/forms/CitySelect';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import ModalFooterActions from '@/components/ModalFooterActions';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { City } from '@/lib/cities/types';
import type { TripCity } from '@apps/waypoint/types';

interface CreateTripFormData {
  title: string;
  dates: DateRangeValue;
  timezone: string;
  city: City | null;
}

interface CreateTripModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    startDate: number;
    endDate: number;
    timezone: string;
    city: TripCity | null;
  }) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

const INITIAL_DATA: CreateTripFormData = {
  title: '',
  dates: { startDate: '', endDate: '' },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  city: null,
};

function CreateTripModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: CreateTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateTripFormData>(INITIAL_DATA);
  const [formKey, setFormKey] = useState(0);

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
        name: 'city',
        label: 'Where is it based?',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <CitySelect
              value={props.value as City | null}
              disabled={isSubmitting}
              onChange={(city) => {
                setFormData((current) => ({
                  ...current,
                  city,
                  timezone: city?.timezone ?? current.timezone,
                }));
                setFormKey((key) => key + 1);
              }}
            />
            <p className='text-muted-foreground text-xs'>
              Optional. It sets the time zone and the weather for every day.
            </p>
          </div>
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
      await onSubmit({
        title,
        startDate,
        endDate,
        timezone: data.timezone,
        city: data.city && {
          name: data.city.name,
          region: data.city.region,
          country: data.city.country,
          latitude: data.city.latitude,
          longitude: data.city.longitude,
        },
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to create this trip.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='New trip'>
      <Form
        key={formKey}
        id='waypoint-create-trip'
        form={fields}
        initialData={formData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as CreateTripFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as CreateTripFormData);
        }}
        submitButton={
          <ModalFooterActions
            cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
            }
            rightActions={
              <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isFormComplete}>
                {isSubmitting ? 'Creating…' : 'Create trip'}
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default CreateTripModal;
