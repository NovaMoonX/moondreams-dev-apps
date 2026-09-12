import { useMemo } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';

import { CAT_BREEDS, CUSTOM_BREED_OPTION } from '@apps/nine-lives/constants/presetOptions';
import { fromDateInputValue } from '@/utils';

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
  breedPreset: string;
  customBreed: string;
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
}

const { checkbox, input, select } = FormFactories;
type FormInputFactoryField = Parameters<typeof input>[0];

function createDateInputField(field: Omit<FormInputFactoryField, 'type'>) {
  return input({ ...field, type: 'date' } as unknown as FormInputFactoryField);
}

const breedOptions = [
  ...CAT_BREEDS.map((option) => ({ label: option, value: option })),
  { label: 'Custom breed', value: CUSTOM_BREED_OPTION },
];

const initialData: CatQuickAddFormData = {
  name: '',
  breedPreset: CAT_BREEDS[0],
  customBreed: '',
  dateOfBirth: '',
  isDateOfBirthEstimated: false,
};

function resolveBreed(data: CatQuickAddFormData) {
  const chosenBreed = data.breedPreset === CUSTOM_BREED_OPTION ? data.customBreed : data.breedPreset;
  return chosenBreed.trim() || CAT_BREEDS[0];
}

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
      select({
        name: 'breedPreset',
        label: 'Breed',
        options: breedOptions,
        searchable: true,
      }),
      input({
        name: 'customBreed',
        label: 'Custom breed',
        placeholder: 'Enter a breed if it is not listed',
        description: 'Use this when the preset list does not match your cat.',
        variant: 'outline',
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
      breed: resolveBreed(data),
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
