import { useMemo } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';

import { fromDateInputValue } from '@/utils';
import { getBreedInitialValue, resolveBreedValue, type BreedValue } from '@apps/nine-lives/utils/breedUtils';

import BreedField from './BreedField';

export interface CatQuickAddValues {
  name: string;
  breed: string;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean;
}

interface CatQuickAddFormProps {
  isSubmitting?: boolean;
  onSubmit: (values: CatQuickAddValues) => Promise<void> | void;
  onCancel?: () => void;
}

interface CatQuickAddFormData {
  name: string;
  breed: BreedValue;
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
}

const { checkbox, custom, input } = FormFactories;
type FormInputFactoryField = Parameters<typeof input>[0];

function createDateInputField(field: Omit<FormInputFactoryField, 'type'>) {
  return input({ ...field, type: 'date' } as unknown as FormInputFactoryField);
}

const initialData: CatQuickAddFormData = {
  name: '',
  breed: getBreedInitialValue(),
  dateOfBirth: '',
  isDateOfBirthEstimated: false,
};

function CatQuickAddForm({ isSubmitting = false, onSubmit, onCancel }: CatQuickAddFormProps) {
  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Name',
        placeholder: 'Mochi',
        required: true,
        variant: 'outline',
      }),
      custom({
        name: 'breed',
        label: 'Breed',
        renderComponent: (props) => (
          <BreedField
            value={props.value as BreedValue}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
      }),
      createDateInputField({
        name: 'dateOfBirth',
        label: 'Date of birth',
        variant: 'outline',
      }),
      checkbox({
        name: 'isDateOfBirthEstimated',
        label: 'Date of birth is estimated',
        text: "I'm estimating this date",
      }),
    ],
    [],
  );

  const handleSubmit = async (data: CatQuickAddFormData) => {
    const trimmedName = data.name.trim();

    if (!trimmedName) {
      return;
    }

    await onSubmit({
      name: trimmedName,
      breed: resolveBreedValue(data.breed),
      dateOfBirth: fromDateInputValue(data.dateOfBirth) ?? 0,
      isDateOfBirthEstimated: data.isDateOfBirthEstimated,
    });
  };

  return (
    <Form
      id='nine-lives-cat-quick-add'
      form={fields}
      initialData={initialData}
      columns={1}
      spacing='normal'
      onSubmit={(data) => {
        void handleSubmit(data as CatQuickAddFormData);
      }}
      submitButton={
        <div className='flex justify-end gap-2'>
          {onCancel && (
            <Button type='button' variant='secondary' onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type='submit' loading={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Add cat'}
          </Button>
        </div>
      }
    />
  );
}

export default CatQuickAddForm;
