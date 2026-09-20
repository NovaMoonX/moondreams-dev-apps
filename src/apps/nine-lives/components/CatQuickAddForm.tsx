import { useMemo, useState } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';

import { createDateInputField, fromDateInputValue } from '@/utils';
import { getBreedInitialValue, resolveBreedValue, type BreedValue } from '@apps/nine-lives/utils/breedUtils';

import BreedField from './BreedField';
import ModalFooterActions from './ModalFooterActions';

export interface CatQuickAddValues {
  name: string;
  breed: string;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean;
}

interface CatQuickAddFormProps {
  isSubmitting?: boolean;
  onSubmit: (values: CatQuickAddValues) => Promise<void> | void;
}

interface CatQuickAddFormData {
  name: string;
  breed: BreedValue;
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
}

const { checkbox, custom, input } = FormFactories;

const initialData: CatQuickAddFormData = {
  name: '',
  breed: getBreedInitialValue(),
  dateOfBirth: '',
  isDateOfBirthEstimated: false,
};

function CatQuickAddForm({ isSubmitting = false, onSubmit }: CatQuickAddFormProps) {
  const [isValid, setIsValid] = useState(false);

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
      onDataChange={(data) => {
        setIsValid(Boolean((data as CatQuickAddFormData).name.trim()));
      }}
      onSubmit={(data) => {
        void handleSubmit(data as CatQuickAddFormData);
      }}
      submitButton={
        <ModalFooterActions
          rightActions={
            <Button type='submit' loading={isSubmitting} disabled={!isValid}>
              {isSubmitting ? 'Saving…' : 'Add'}
            </Button>
          }
        />
      }
    />
  );
}

export default CatQuickAddForm;
